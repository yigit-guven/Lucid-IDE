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

                // 5. Present QuickPick to select model
                const lastModelKey = 'lucid.scm.lastSelectedModel';
                const defaultModel = context.globalState.get<string>(lastModelKey);

                const quickPickItems = models.map(model => ({
                    label: model,
                    description: model === defaultModel ? '(last used)' : ''
                }));

                if (defaultModel) {
                    quickPickItems.sort((a, b) => {
                        if (a.label === defaultModel) return -1;
                        if (b.label === defaultModel) return 1;
                        return 0;
                    });
                }

                const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
                    placeHolder: 'Select Ollama model to generate commit message'
                });

                if (!selectedItem) {
                    return;
                }

                const selectedModel = selectedItem.label;
                await context.globalState.update(lastModelKey, selectedModel);

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

                    const prompt = `You are an expert developer. Generate a clean Git commit message based on the following diff. 
The commit message must consist of a short, descriptive title (first line, maximum 70 characters), followed by a blank line, and then a detailed description (optional bullet points listing the changes).
Do NOT include any markdown code blocks, quotes, or conversational text (such as "Here is the commit message:"). Output ONLY the raw commit message.

Git diff (${isStaged ? 'staged' : 'unstaged'} changes):
${diff}`;

                    const response = await fetch('http://127.0.0.1:11434/api/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: selectedModel,
                            prompt: prompt,
                            stream: false
                        }),
                        signal: controller.signal
                    });

                    if (!response.ok) {
                        throw new Error(`Ollama response error: ${response.statusText}`);
                    }

                    const data = await response.json() as OllamaGenerateResponse;
                    let message = data.response.trim();

                    // Strip markdown formatting if any
                    if (message.startsWith('```')) {
                        const lines = message.split('\n');
                        if (lines[0].startsWith('```')) {
                            lines.shift();
                        }
                        if (lines.length > 0 && lines[lines.length - 1].startsWith('```')) {
                            lines.pop();
                        }
                        message = lines.join('\n').trim();
                    }

                    if (message.startsWith('"') && message.endsWith('"')) {
                        message = message.substring(1, message.length - 1).trim();
                    } else if (message.startsWith("'") && message.endsWith("'")) {
                        message = message.substring(1, message.length - 1).trim();
                    }

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
    const selected = await vscode.window.showQuickPick(items, {
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
