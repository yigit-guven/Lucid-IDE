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

                // Parse the diff into clean English so tiny models (1B) don't get confused by diff syntax
                const lines = safeDiff.split('\n');
                let parsedDiff = '';
                for (const line of lines) {
                    if (line.startsWith('+++ b/')) {
                        parsedDiff += `\nFile changed: ${line.substring(6)}\n`;
                    } else if (line.startsWith('+') && !line.startsWith('+++')) {
                        parsedDiff += `[ADDED] ${line.substring(1).trim()}\n`;
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                        parsedDiff += `[REMOVED] ${line.substring(1).trim()}\n`;
                    }
                }
                parsedDiff = parsedDiff.trim();
                if (!parsedDiff) parsedDiff = safeDiff; // Fallback

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

                    const systemPrompt = `You are a commit message generator.
Write a single, concise commit message summarizing the code changes.
Output ONLY the message itself. No markdown, no quotes, no explanations, no lists.`;

                    const userPrompt = `Code changes:\n${parsedDiff}`;

                    repository.inputBox.value = 'Thinking...';
                    
                    const response = await fetch('http://127.0.0.1:11434/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: selectedModel,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userPrompt }
                            ],
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
                                    if (parsed.message && parsed.message.content) {
                                        message += parsed.message.content;
                                        
                                        // Bulletproof fix for 1B models: Kill the connection the millisecond it tries to write a second line
                                        if (message.includes('\n')) {
                                            message = message.split('\n')[0].trim();
                                            repository.inputBox.value = message;
                                            controller.abort();
                                            break;
                                        }
                                        
                                        repository.inputBox.value = message;
                                    }
                                } catch (e) {
                                    // Ignore partial JSON chunks
                                }
                            }
                        }
                    } catch (e: any) {
                        // Ignore abort errors which we trigger intentionally
                        if (e.name !== 'AbortError' && !e.message?.includes('aborted')) {
                            throw e;
                        }
                    }

                    message = message.trim();

                    // Strip markdown formatting if the model hallucinated it
                    if (message.startsWith('```')) {
                        message = message.replace(/```.*/g, '');
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
