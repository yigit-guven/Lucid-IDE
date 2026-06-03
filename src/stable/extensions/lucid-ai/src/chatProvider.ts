import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lucid.chatView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'openExternal': {
                    await vscode.env.openExternal(vscode.Uri.parse(data.url));
                    break;
                }
                case 'checkStatus': {
                    await this.checkOllamaStatus();
                    break;
                }
                case 'pullModel': {
                    await this.pullModel(data.model);
                    break;
                }
                case 'deleteModel': {
                    await this.deleteModel(data.model);
                    break;
                }
                case 'sendMessage': {
                    await this.handleChatRequest(data.model, data.messages);
                    break;
                }
                case 'insertCode': {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        editor.edit(editBuilder => {
                            editBuilder.insert(editor.selection.active, data.code);
                        });
                    } else {
                        vscode.window.showInformationMessage('No active editor found to insert code.');
                    }
                    break;
                }
                case 'copyCode': {
                    await vscode.env.clipboard.writeText(data.code);
                    vscode.window.showInformationMessage('Code copied to clipboard.');
                    break;
                }
            }
        });

        // Check status on load
        this.checkOllamaStatus();
    }

    public clearChat() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'clearChat' });
        }
    }

    public focusInput() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'focusInput' });
        }
    }

    private async checkOllamaStatus() {
        if (!this._view) return;
        try {
            const response = await fetch('http://127.0.0.1:11434/api/tags');
            if (response.ok) {
                const data = await response.json() as { models: any[] };
                const models = data.models.map((m: any) => ({
                    name: m.name,
                    size: m.size,
                    details: m.details
                }));
                this._view.webview.postMessage({
                    command: 'statusUpdate',
                    connected: true,
                    models: models
                });
            } else {
                this._view.webview.postMessage({
                    command: 'statusUpdate',
                    connected: false,
                    models: []
                });
            }
        } catch (e) {
            this._view.webview.postMessage({
                command: 'statusUpdate',
                connected: false,
                models: []
            });
        }
    }

    private async pullModel(modelName: string) {
        if (!this._view) return;
        try {
            const response = await fetch('http://127.0.0.1:11434/api/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName, stream: true })
            });

            if (!response.ok || !response.body) {
                throw new Error('Failed to start pull stream');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.status === 'success') {
                                this._view.webview.postMessage({
                                    command: 'pullSuccess',
                                    model: modelName
                                });
                                this.checkOllamaStatus(); // Refresh models
                                return;
                            }
                            
                            const completed = parsed.completed || 0;
                            const total = parsed.total || 0;
                            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                            
                            this._view.webview.postMessage({
                                command: 'pullProgress',
                                model: modelName,
                                status: parsed.status,
                                percent: percent,
                                completed: completed,
                                total: total
                            });
                        } catch (err) {
                            // JSON parsing error
                        }
                    }
                }
            }
        } catch (e: any) {
            this._view.webview.postMessage({
                command: 'pullError',
                model: modelName,
                error: e.message || 'Unknown network error'
            });
        }
    }

    private async deleteModel(modelName: string) {
        if (!this._view) return;
        try {
            const response = await fetch('http://127.0.0.1:11434/api/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName })
            });

            if (response.ok) {
                vscode.window.showInformationMessage(`Model ${modelName} deleted successfully.`);
                this.checkOllamaStatus();
            } else {
                vscode.window.showErrorMessage(`Failed to delete model ${modelName}.`);
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Error deleting model: ${e.message}`);
        }
    }

    private async handleChatRequest(model: string, messages: any[]) {
        if (!this._view) return;
        try {
            const response = await fetch('http://127.0.0.1:11434/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    stream: true
                })
            });

            if (!response.ok || !response.body) {
                throw new Error('Failed to connect to chat API');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.message && parsed.message.content) {
                                this._view.webview.postMessage({
                                    command: 'chatChunk',
                                    text: parsed.message.content
                                });
                            }
                            if (parsed.done) {
                                this._view.webview.postMessage({
                                    command: 'chatDone'
                                });
                                return;
                            }
                        } catch (err) {
                            // JSON parsing error
                        }
                    }
                }
            }
        } catch (e: any) {
            this._view.webview.postMessage({
                command: 'chatError',
                error: e.message || 'Connection to Ollama was lost'
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css'));
        const scriptMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js'));
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'logo.svg'));

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMainUri}" rel="stylesheet">
                <title>AI Chat</title>
            </head>
            <body>
                <div class="app-container">
                    <!-- Top Connection & Model Status -->
                    <div class="status-bar">
                        <div class="status-indicator" id="statusIndicator">
                            <span class="status-dot"></span>
                            <span class="status-text">Checking Ollama...</span>
                        </div>
                        <div class="active-model-container">
                            <button class="model-select-btn" id="modelSelectBtn" disabled>
                                <span class="active-model-name">No Model Selected</span>
                                <span class="chevron-down"></span>
                            </button>
                        </div>
                    </div>

                    <!-- Model Selector Drawer -->
                    <div class="model-drawer" id="modelDrawer">
                        <div class="drawer-header">
                            <h3>Model Management</h3>
                            <button class="close-drawer-btn" id="closeDrawerBtn">&times;</button>
                        </div>
                        <div class="models-list" id="modelsList">
                            <!-- Populated dynamically -->
                        </div>
                    </div>

                    <!-- Chat Messages Area -->
                    <div class="chat-area" id="chatArea">
                        <div class="chat-welcome" id="chatWelcome">
                            <img src="${logoUri}" class="welcome-logo-img" alt="Lucid IDE Logo">
                            <h2>AI Chat</h2>
                            <p>Your local code assistant. All data stays on your machine, powered by open-source models.</p>
                            
                            <div class="setup-notice" id="setupNotice">
                                <h3>Local AI Setup Needed</h3>
                                <p>This IDE connects to a local instance of <strong>Ollama</strong>.</p>
                                <ol>
                                    <li>Install <a href="https://ollama.com" target="_blank">Ollama</a> on your system.</li>
                                    <li>Launch the Ollama application.</li>
                                    <li>Once running, click <strong>Reconnect</strong> below.</li>
                                </ol>
                                <button class="btn btn-primary" id="reconnectBtn">Reconnect</button>
                            </div>

                            <div class="quick-start-notice" id="quickStartNotice" style="display:none;">
                                <p>To start chatting, select or download a model from the model list.</p>
                                <button class="btn btn-secondary" id="openManagerBtn">Manage Models</button>
                            </div>
                        </div>
                        <div class="messages-container" id="messagesContainer"></div>
                    </div>

                    <!-- Input Box -->
                    <div class="input-panel">
                        <div class="input-container">
                            <textarea id="promptInput" placeholder="Ask anything about coding..." rows="1" disabled></textarea>
                            <button id="sendBtn" class="send-btn" disabled>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <script src="${scriptMainUri}"></script>
            </body>
            </html>`;
    }
}
