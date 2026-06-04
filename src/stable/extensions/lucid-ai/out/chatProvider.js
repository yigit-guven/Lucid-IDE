"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatViewProvider = void 0;
const vscode = require("vscode");
class ChatViewProvider {
    _extensionUri;
    static viewType = 'lucid.chatView';
    _view;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView, context, _token) {
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
                case 'installOllama': {
                    await this.installAndStartOllama();
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
                    }
                    else {
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
    clearChat() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'clearChat' });
        }
    }
    focusInput() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'focusInput' });
        }
    }
    async installAndStartOllama() {
        if (!this._view)
            return;
        const webview = this._view.webview;
        const localAppData = process.env.LOCALAPPDATA || '';
        const ollamaPath = require('path').join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
        const fs = require('fs');
        const { spawn } = require('child_process');
        const sendProgress = (percent, statusText) => {
            webview.postMessage({
                command: 'installProgress',
                percent,
                statusText
            });
        };
        const sendError = (errMessage) => {
            webview.postMessage({
                command: 'installError',
                error: errMessage
            });
        };
        // 1. Check if already installed
        if (fs.existsSync(ollamaPath)) {
            sendProgress(50, 'Ollama is installed. Starting Ollama...');
            try {
                const child = spawn(ollamaPath, [], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
                for (let i = 0; i < 5; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    try {
                        const check = await fetch('http://127.0.0.1:11434/api/tags');
                        if (check.ok) {
                            sendProgress(100, 'Ollama started successfully!');
                            await this.checkOllamaStatus();
                            return;
                        }
                    }
                    catch (e) {
                        // ignore
                    }
                }
                sendError('Ollama started, but connection timed out. Try reconnecting.');
            }
            catch (e) {
                sendError('Failed to start Ollama: ' + e.message);
            }
            return;
        }
        // 2. Download Installer (with Redirect Following)
        sendProgress(10, 'Downloading Ollama installer...');
        const tempDir = require('os').tmpdir();
        const installerPath = require('path').join(tempDir, 'OllamaSetup.exe');
        // Delete existing installer if any
        try {
            if (fs.existsSync(installerPath)) {
                fs.unlinkSync(installerPath);
            }
        }
        catch (e) { }
        const downloadFile = (url, destPath, onProgress, onEnd, onError, redirectCount = 0) => {
            if (redirectCount > 5) {
                onError('Too many redirects');
                return;
            }
            const https = require('https');
            const http = require('http');
            const urlLib = require('url');
            const parsedUrl = urlLib.parse(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            const request = client.get(url, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    let redirectUrl = response.headers.location;
                    if (!redirectUrl.startsWith('http')) {
                        redirectUrl = parsedUrl.protocol + '//' + parsedUrl.host + redirectUrl;
                    }
                    downloadFile(redirectUrl, destPath, onProgress, onEnd, onError, redirectCount + 1);
                    return;
                }
                if (response.statusCode !== 200) {
                    onError(`Failed to download (HTTP Status: ${response.statusCode})`);
                    return;
                }
                const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                let downloadedSize = 0;
                const file = fs.createWriteStream(destPath);
                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    file.write(chunk);
                    if (totalSize > 0) {
                        const percent = Math.round((downloadedSize / totalSize) * 60) + 10; // 10% to 70%
                        onProgress(percent, `Downloading: ${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB`);
                    }
                });
                response.on('end', () => {
                    file.end();
                    onEnd();
                });
                file.on('error', (err) => {
                    file.end();
                    onError('File write error: ' + err.message);
                });
            });
            request.on('error', (err) => {
                onError('Download network error: ' + err.message);
            });
        };
        try {
            downloadFile('https://ollama.com/download/OllamaSetup.exe', installerPath, sendProgress, () => {
                sendProgress(75, 'Installing Ollama silently...');
                const installProcess = spawn(installerPath, ['/silent', '/nocloseapplications', '/norestart'], {
                    detached: true,
                    stdio: 'ignore'
                });
                installProcess.on('close', async (code) => {
                    sendProgress(90, 'Starting Ollama service...');
                    try {
                        fs.unlinkSync(installerPath);
                    }
                    catch (e) { }
                    if (fs.existsSync(ollamaPath)) {
                        try {
                            const child = spawn(ollamaPath, [], {
                                detached: true,
                                stdio: 'ignore'
                            });
                            child.unref();
                            for (let i = 0; i < 10; i++) {
                                await new Promise(r => setTimeout(r, 1000));
                                try {
                                    const check = await fetch('http://127.0.0.1:11434/api/tags');
                                    if (check.ok) {
                                        sendProgress(100, 'Ollama installed and started!');
                                        await this.checkOllamaStatus();
                                        return;
                                    }
                                }
                                catch (e) {
                                    // retry
                                }
                            }
                            sendError('Installation completed, but Ollama timed out on start. Try launching it manually.');
                        }
                        catch (e) {
                            sendError('Installed but failed to start: ' + e.message);
                        }
                    }
                    else {
                        sendError('Installation finished, but executable not found at: ' + ollamaPath);
                    }
                });
                installProcess.on('error', (err) => {
                    sendError('Installer execution failed: ' + err.message);
                });
            }, sendError);
        }
        catch (e) {
            sendError('Installation failed: ' + e.message);
        }
    }
    async checkOllamaStatus() {
        if (!this._view)
            return;
        try {
            const response = await fetch('http://127.0.0.1:11434/api/tags');
            if (response.ok) {
                const data = await response.json();
                const models = data.models.map((m) => ({
                    name: m.name,
                    size: m.size,
                    details: m.details
                }));
                this._view.webview.postMessage({
                    command: 'statusUpdate',
                    connected: true,
                    models: models
                });
            }
            else {
                this._view.webview.postMessage({
                    command: 'statusUpdate',
                    connected: false,
                    models: []
                });
            }
        }
        catch (e) {
            this._view.webview.postMessage({
                command: 'statusUpdate',
                connected: false,
                models: []
            });
        }
    }
    async pullModel(modelName) {
        if (!this._view)
            return;
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
                if (done)
                    break;
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
                        }
                        catch (err) {
                            // JSON parsing error
                        }
                    }
                }
            }
        }
        catch (e) {
            this._view.webview.postMessage({
                command: 'pullError',
                model: modelName,
                error: e.message || 'Unknown network error'
            });
        }
    }
    async deleteModel(modelName) {
        if (!this._view)
            return;
        try {
            const response = await fetch('http://127.0.0.1:11434/api/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName })
            });
            if (response.ok) {
                vscode.window.showInformationMessage(`Model ${modelName} deleted successfully.`);
                this.checkOllamaStatus();
            }
            else {
                vscode.window.showErrorMessage(`Failed to delete model ${modelName}.`);
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`Error deleting model: ${e.message}`);
        }
    }
    async handleChatRequest(model, messages) {
        if (!this._view)
            return;
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
                if (done)
                    break;
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
                        }
                        catch (err) {
                            // JSON parsing error
                        }
                    }
                }
            }
        }
        catch (e) {
            this._view.webview.postMessage({
                command: 'chatError',
                error: e.message || 'Connection to Ollama was lost'
            });
        }
    }
    _getHtmlForWebview(webview) {
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
                                <p>This IDE connects to a local instance of <strong>Ollama</strong> to run AI models on your own machine.</p>
                                <div class="setup-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    <button class="btn btn-primary" id="installBtn" style="flex: 1; white-space: nowrap;">Install & Start Ollama</button>
                                    <button class="btn btn-secondary" id="reconnectBtn">Reconnect</button>
                                </div>
                                <div class="install-progress-container" id="installProgressContainer" style="display: none; margin-top: 15px; width: 100%;">
                                    <div class="progress-bar-bg" style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
                                        <div class="progress-bar-fill" id="installProgressBar" style="width: 0%; height: 100%; background: var(--brand-primary); transition: width 0.3s;"></div>
                                    </div>
                                    <p id="installStatusText" style="font-size: 10px; opacity: 0.8; text-align: center; margin: 0; word-break: break-word;">Initializing installation...</p>
                                </div>
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
exports.ChatViewProvider = ChatViewProvider;
//# sourceMappingURL=chatProvider.js.map