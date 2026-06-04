import * as vscode from 'vscode';

interface OllamaModelResponse {
    models: {
        name: string;
    }[];
}

interface OllamaGenerateResponse {
    response: string;
}

export function registerCommitGenerator(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('lucid.scm.generateCommit', async (uri?: any) => {
            try {
                // 1. Get Git extension and API
                const gitExtension = vscode.extensions.getExtension<any>('vscode.git');
                if (!gitExtension) {
                    vscode.window.showErrorMessage('Git extension is not available.');
                    return;
                }
                
                const git = gitExtension.exports.getAPI(1);
                if (!git) {
                    vscode.window.showErrorMessage('Git API is not available.');
                    return;
                }

                // 2. Resolve target repository
                const repository = await getRepository(git, uri);
                if (!repository) {
                    return;
                }

                // 3. Get repository diff (cached/staged first, fallback to working tree)
                let diff = await repository.diff(true);
                let isStaged = true;
                if (!diff || diff.trim() === '') {
                    diff = await repository.diff(false);
                    isStaged = false;
                }

                if (!diff || diff.trim() === '') {
                    vscode.window.showWarningMessage('No changes detected in SCM to generate a commit message.');
                    return;
                }

                // 4. Fetch local Ollama models
                const models = await getOllamaModels();
                if (models.length === 0) {
                    vscode.window.showErrorMessage('No local Ollama models found. Please make sure Ollama is running and you have downloaded at least one model.');
                    return;
                }

                // 5. Model Selection (skip prompt if we have a valid saved model)
                const lastModelKey = 'lucid.scm.lastSelectedModel';
                let selectedModel = context.globalState.get<string>(lastModelKey);

                if (!selectedModel || !models.includes(selectedModel)) {
                    const quickPickItems = models.map(model => ({ label: model }));
                    const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
                        placeHolder: 'Select Ollama model for generating commit messages (will be saved)'
                    });
                    if (!selectedItem) return;
                    selectedModel = selectedItem.label;
                    await context.globalState.update(lastModelKey, selectedModel);
                }

                // Protect against massive diffs breaking context limits
                const MAX_DIFF = 12000;
                let safeDiff = diff;
                if (diff.length > MAX_DIFF) {
                    safeDiff = diff.substring(0, MAX_DIFF) + '\n\n... (Diff truncated due to extreme length)';
                }

                // 6. Generate message using local AI model
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Generating commit message using ${selectedModel}...`,
                    cancellable: true
                }, async (progress, token) => {
                    const controller = new AbortController();
                    token.onCancellationRequested(() => {
                        controller.abort();
                    });

                    const prompt = `You are an expert developer. Generate EXACTLY ONE clean, conventional Git commit message based on the following diff.

Example output:
feat(auth): add login functionality

- Added email and password fields
- Integrated login API endpoint
- Fixed session persistence

Rules:
1. Generate EXACTLY ONE commit message. Do not generate multiple options.
2. Format MUST be: type(scope): short description
3. The first line must be under 72 characters.
4. Leave one blank line after the title.
5. Provide a concise bulleted list of what actually changed.
6. Output ONLY the raw commit message, NO markdown formatting (\`\`\`), NO quotes, NO conversational text.
7. CRITICAL: Lines starting with '+' were ADDED. Lines starting with '-' were DELETED.

Git diff (${isStaged ? 'staged' : 'unstaged'} changes):
${safeDiff}`;

                    repository.inputBox.value = 'Thinking...';
                    
                    const response = await fetch('http://127.0.0.1:11434/api/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: selectedModel,
                            prompt: prompt,
                            stream: true,
                            options: {
                                num_predict: 250,
                                temperature: 0.2
                            }
                        }),
                        signal: controller.signal
                    });

                    if (!response.ok) {
                        throw new Error(`Ollama response error: ${response.statusText}`);
                    }

                    let message = '';
                    if (response.body) {
                        repository.inputBox.value = '';
                        const decoder = new TextDecoder();
                        // Support both Node.js streams and Web Streams
                        for await (const chunk of response.body as any) {
                            const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
                            const lines = text.split('\n');
                            for (const line of lines) {
                                if (!line.trim()) continue;
                                try {
                                    const parsed = JSON.parse(line);
                                    if (parsed.response) {
                                        message += parsed.response;
                                        repository.inputBox.value = message;
                                    }
                                } catch (e) {
                                    // Ignore partial JSON chunks
                                }
                            }
                        }
                    }

                    message = message.trim();

                    // Strip markdown formatting if the model hallucinated it
                    if (message.startsWith('```')) {
                        const lines = message.split('\n');
                        if (lines[0].startsWith('```')) lines.shift();
                        if (lines.length > 0 && lines[lines.length - 1].startsWith('```')) lines.pop();
                        message = lines.join('\n').trim();
                    }
                    if (message.startsWith('"') && message.endsWith('"')) message = message.substring(1, message.length - 1).trim();
                    if (message.startsWith("'") && message.endsWith("'")) message = message.substring(1, message.length - 1).trim();

                    repository.inputBox.value = message;
                });

            } catch (err: any) {
                if (err.name === 'AbortError') {
                    vscode.window.showInformationMessage('Commit message generation cancelled.');
                } else {
                    vscode.window.showErrorMessage(`Failed to generate commit message: ${err.message || err}`);
                }
            }
        })
    );
}

async function getRepository(git: any, uri?: any): Promise<any> {
    if (git.repositories.length === 0) {
        return undefined;
    }
    if (git.repositories.length === 1) {
        return git.repositories[0];
    }
    if (uri) {
        const targetUri = uri.rootUri || uri;
        const found = git.repositories.find((r: any) => r.rootUri.toString() === targetUri.toString());
        if (found) {
            return found;
        }
    }
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const docUri = activeEditor.document.uri;
        const found = git.repositories.find((r: any) => docUri.fsPath.startsWith(r.rootUri.fsPath));
        if (found) {
            return found;
        }
    }
    const items = git.repositories.map((r: any) => ({
        label: vscode.workspace.asRelativePath(r.rootUri),
        repository: r
    }));
    const selected = await vscode.window.showQuickPick<{ label: string; repository: any }>(items, {
        placeHolder: 'Select SCM repository'
    });
    return selected ? selected.repository : undefined;
}

async function getOllamaModels(): Promise<string[]> {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/tags');
        if (response.ok) {
            const data = await response.json() as OllamaModelResponse;
            return data.models.map((m: any) => m.name);
        }
    } catch (e) {
        // Failed to connect
    }
    return [];
}
