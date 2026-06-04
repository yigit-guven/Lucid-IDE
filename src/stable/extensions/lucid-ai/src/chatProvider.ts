import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lucid.chatView';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _activeDownloadRequest: any = null;
    private _activeExtractProcess: any = null;
    private _tempZipPath: string | null = null;
    private _isInstalling = false;

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._extensionUri = _context.extensionUri;
    }

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
                case 'installOllama': {
                    await this.installAndStartOllama(data.installPath, data.version);
                    break;
                }
                case 'cancelInstall': {
                    this.cancelInstall();
                    break;
                }
                case 'selectInstallDir': {
                    const uri = await vscode.window.showOpenDialog({
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        openLabel: 'Select Ollama Installation Folder'
                    });
                    if (uri && uri[0]) {
                        const selectedPath = uri[0].fsPath;
                        await this._context.globalState.update('ollamaInstallPath', selectedPath);
                        webviewView.webview.postMessage({
                            command: 'installDirSelected',
                            path: selectedPath
                        });
                    }
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
                case 'runInTerminal': {
                    const terminal = vscode.window.activeTerminal || vscode.window.createTerminal('AI Terminal');
                    terminal.show();
                    terminal.sendText(data.code);
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

    private cancelInstall() {
        this._isInstalling = false;
        
        if (this._activeDownloadRequest) {
            try {
                this._activeDownloadRequest.destroy();
            } catch(e) {}
            this._activeDownloadRequest = null;
        }
        
        if (this._activeExtractProcess) {
            try {
                this._activeExtractProcess.kill();
            } catch(e) {}
            this._activeExtractProcess = null;
        }

        if (this._tempZipPath) {
            try {
                const fs = require('fs');
                if (fs.existsSync(this._tempZipPath)) {
                    fs.unlinkSync(this._tempZipPath);
                }
            } catch(e) {}
        }

        if (this._view) {
            this._view.webview.postMessage({
                command: 'installCancelled',
                statusText: 'Installation cancelled by user.'
            });
        }
    }

    private async startOllamaProcess(
        ollamaExePath: string,
        targetDir: string,
        sendProgress: (percent: number, statusText: string) => void,
        sendError: (errMessage: string) => void
    ) {
        const { spawn } = require('child_process');
        const path = require('path');
        const fs = require('fs');
        
        const modelsDir = path.join(targetDir, 'models');
        
        try {
            if (!fs.existsSync(modelsDir)) {
                fs.mkdirSync(modelsDir, { recursive: true });
            }
        } catch(e) {}

        try {
            const childEnv = {
                ...process.env,
                OLLAMA_MODELS: modelsDir
            };

            const child = spawn(ollamaExePath, ['serve'], {
                detached: true,
                stdio: 'ignore',
                env: childEnv
            });
            child.unref();
            
            for (let i = 0; i < 15; i++) {
                if (!this._isInstalling) return;
                await new Promise(r => setTimeout(r, 1000));
                try {
                    const check = await fetch('http://127.0.0.1:11434/api/tags');
                    if (check.ok) {
                        sendProgress(100, 'Ollama started successfully!');
                        this._isInstalling = false;
                        await this.checkOllamaStatus();
                        return;
                    }
                } catch (e) {
                    // retry
                }
            }
            sendError('Ollama process started, but connection timed out. Try reconnecting.');
        } catch (e: any) {
            sendError('Failed to start Ollama process: ' + e.message);
        }
    }

    private async installAndStartOllama(installPath?: string, version?: string) {
        if (!this._view) return;
        const webview = this._view.webview;
        this._isInstalling = true;
        
        const fs = require('fs');
        const path = require('path');
        const { spawn } = require('child_process');
        
        const defaultInstallDir = path.join(this._context.extensionUri.fsPath, 'ollama');
        const targetDir = installPath || this._context.globalState.get<string>('ollamaInstallPath') || defaultInstallDir;
        
        await this._context.globalState.update('ollamaInstallPath', targetDir);

        const ollamaExePath = path.join(targetDir, 'ollama.exe');
        
        const sendProgress = (percent: number, statusText: string) => {
            if (!this._isInstalling) return;
            webview.postMessage({
                command: 'installProgress',
                percent,
                statusText
            });
        };

        const sendError = (errMessage: string) => {
            webview.postMessage({
                command: 'installError',
                error: errMessage
            });
            this._isInstalling = false;
        };

        // Ensure target directory exists
        try {
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
        } catch (e: any) {
            sendError('Failed to create installation directory: ' + e.message);
            return;
        }

        // 1. Check if already installed
        if (fs.existsSync(ollamaExePath)) {
            sendProgress(50, 'Ollama is already installed locally. Starting Ollama...');
            await this.startOllamaProcess(ollamaExePath, targetDir, sendProgress, sendError);
            return;
        }

        // 2. Prepare ZIP download URL
        let downloadUrl = 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip';
        if (version && version !== 'latest') {
            const cleanVersion = version.startsWith('v') ? version : 'v' + version;
            downloadUrl = `https://github.com/ollama/ollama/releases/download/${cleanVersion}/ollama-windows-amd64.zip`;
        }

        sendProgress(10, 'Downloading Ollama portable zip...');
        const tempZipPath = path.join(targetDir, 'ollama_temp.zip');
        this._tempZipPath = tempZipPath;
        
        try { if (fs.existsSync(tempZipPath)) { fs.unlinkSync(tempZipPath); } } catch(e) {}

        const downloadFile = (url: string, destPath: string, onProgress: (percent: number, statusText: string) => void, onEnd: () => void, onError: (errMessage: string) => void, redirectCount = 0) => {
            if (!this._isInstalling) return;
            if (redirectCount > 5) {
                onError('Too many redirects');
                return;
            }

            const https = require('https');
            const http = require('http');
            const urlLib = require('url');

            const parsedUrl = urlLib.parse(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;

            const request = client.get(url, (response: any) => {
                if (!this._isInstalling) {
                    try { response.destroy(); } catch(e) {}
                    return;
                }

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

                this._activeDownloadRequest = request;

                response.on('data', (chunk: any) => {
                    if (!this._isInstalling) {
                        try { file.end(); } catch(e) {}
                        try { response.destroy(); } catch(e) {}
                        return;
                    }
                    downloadedSize += chunk.length;
                    file.write(chunk);
                    if (totalSize > 0) {
                        const percent = Math.round((downloadedSize / totalSize) * 60) + 10; // 10% to 70%
                        onProgress(percent, `Downloading: ${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB`);
                    }
                });

                response.on('end', () => {
                    file.end();
                    this._activeDownloadRequest = null;
                    if (this._isInstalling) {
                        onEnd();
                    }
                });

                file.on('error', (err: any) => {
                    file.end();
                    this._activeDownloadRequest = null;
                    onError('File write error: ' + err.message);
                });
            });

            this._activeDownloadRequest = request;

            request.on('error', (err: any) => {
                this._activeDownloadRequest = null;
                onError('Download network error: ' + err.message);
            });
        };

        try {
            downloadFile(
                downloadUrl,
                tempZipPath,
                sendProgress,
                () => {
                    if (!this._isInstalling) return;
                    sendProgress(75, 'Extracting Ollama files (portable)...');
                    
                    const psCommand = `Expand-Archive -Path '${tempZipPath}' -DestinationPath '${targetDir}' -Force`;
                    const extractProcess = spawn('powershell.exe', [
                        '-NoProfile',
                        '-NonInteractive',
                        '-Command',
                        psCommand
                    ]);
                    
                    this._activeExtractProcess = extractProcess;

                    extractProcess.on('close', async (code: number) => {
                        this._activeExtractProcess = null;
                        if (!this._isInstalling) return;

                        try { fs.unlinkSync(tempZipPath); } catch(e) {}
                        
                        if (code !== 0) {
                            sendError(`Extraction failed with code ${code}. Powershell was unable to extract the zip file.`);
                            return;
                        }

                        if (fs.existsSync(ollamaExePath)) {
                            sendProgress(90, 'Starting local Ollama process...');
                            await this.startOllamaProcess(ollamaExePath, targetDir, sendProgress, sendError);
                        } else {
                            sendError('Extraction completed, but ollama.exe was not found at: ' + ollamaExePath);
                        }
                    });

                    extractProcess.on('error', (err: any) => {
                        this._activeExtractProcess = null;
                        sendError('Failed to run extractor process: ' + err.message);
                    });
                },
                sendError
            );
        } catch (e: any) {
            sendError('Installation failed: ' + e.message);
        }
    }

    private async checkOllamaStatus() {
        if (!this._view) return;
        
        const path = require('path');
        const fs = require('fs');
        const defaultInstallDir = path.join(this._context.extensionUri.fsPath, 'ollama');
        const savedPath = this._context.globalState.get<string>('ollamaInstallPath') || defaultInstallDir;
        const localInstalled = fs.existsSync(path.join(savedPath, 'ollama.exe'));

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
                    models: models,
                    localInstalled: localInstalled,
                    defaultPath: savedPath
                });
            } else {
                this._view.webview.postMessage({
                    command: 'statusUpdate',
                    connected: false,
                    models: [],
                    localInstalled: localInstalled,
                    defaultPath: savedPath
                });
            }
        } catch (e) {
            this._view.webview.postMessage({
                command: 'statusUpdate',
                connected: false,
                models: [],
                localInstalled: localInstalled,
                defaultPath: savedPath
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
            // Gather workspace context
            let workspaceContext = '';
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const cwd = workspaceFolders[0].uri.fsPath;
                workspaceContext += `Active Project/Workspace: ${workspaceFolders[0].name}\nWorkspace Path: ${cwd}\n`;

                // Gather git context
                try {
                    const { execSync } = require('child_process');
                    const status = execSync('git status --short', { cwd, encoding: 'utf8', timeout: 2000 });
                    if (status.trim()) {
                        workspaceContext += `\nGit Status (Modified Files):\n${status}\n`;
                        let diff = execSync('git diff', { cwd, encoding: 'utf8', timeout: 2000 });
                        if (!diff.trim()) {
                            diff = execSync('git diff --cached', { cwd, encoding: 'utf8', timeout: 2000 });
                        }
                        if (diff.trim()) {
                            const maxDiffLen = 5000;
                            const truncatedDiff = diff.length > maxDiffLen ? diff.substring(0, maxDiffLen) + '\n[Diff truncated due to size limit...]' : diff;
                            workspaceContext += `\nGit Diff:\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n`;
                        }
                    } else {
                        workspaceContext += `\nGit Status: No changes detected.\n`;
                    }
                } catch (e) {
                    // Not a git repository or git command failed
                }
            } else {
                workspaceContext += `Active Workspace: None (single file mode)\n`;
            }

            // Gather editor context
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const doc = activeEditor.document;
                workspaceContext += `Currently Open File: ${doc.fileName}\nLanguage: ${doc.languageId}\n`;
                
                const selection = activeEditor.selection;
                if (!selection.isEmpty) {
                    const selectedText = doc.getText(selection);
                    workspaceContext += `Selected code in active file:\n\`\`\`${doc.languageId}\n${selectedText}\n\`\`\`\n`;
                }
            }

            // Create system prompt
            const systemPromptContent = `You are the built-in AI assistant for Lucid IDE (a modern developer tool). You are pair programming with the user.
Here is the context about the user's environment to help you answer:
${workspaceContext}
Please utilize this context to help answer user queries about their files, code, and project. Answer in a helpful, concise manner.`;

            const messagesWithContext = [
                { role: 'system', content: systemPromptContent },
                ...messages
            ];

            const response = await fetch('http://127.0.0.1:11434/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: messagesWithContext,
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
                                <p>This IDE connects to a local instance of <strong>Ollama</strong> to run AI models on your own machine.</p>
                                
                                <!-- Customization Form -->
                                <div class="setup-form" id="setupForm" style="margin-top: 12px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
                                    <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
                                        <label style="font-size: 9px; font-weight: 600; opacity: 0.8; letter-spacing: 0.5px;">OLLAMA VERSION</label>
                                        <select id="ollamaVersionSelect" style="background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-settings-textInputBorder, var(--glass-border)); padding: 4px 6px; border-radius: 4px; font-size: 11px; outline: none; font-family: inherit;">
                                            <option value="latest">Latest Release (Recommended)</option>
                                            <option value="0.5.4">v0.5.4</option>
                                            <option value="0.4.4">v0.4.4</option>
                                            <option value="0.3.14">v0.3.14</option>
                                            <option value="0.2.1">v0.2.1</option>
                                        </select>
                                    </div>
                                    <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
                                        <label style="font-size: 9px; font-weight: 600; opacity: 0.8; letter-spacing: 0.5px;">INSTALL DIRECTORY</label>
                                        <div style="display: flex; gap: 4px; align-items: center;">
                                            <input type="text" id="installDirInput" style="flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-settings-textInputBorder, var(--glass-border)); padding: 4px 6px; border-radius: 4px; font-size: 11px; outline: none; font-family: inherit;" readonly>
                                            <button class="btn btn-secondary" id="browseDirBtn" style="padding: 4px 8px; font-size: 11px; white-space: nowrap;">Browse...</button>
                                        </div>
                                        <span style="font-size: 9px; opacity: 0.6; line-height: 1.2;">Default: inside Lucid IDE folders (portable mode).</span>
                                    </div>
                                </div>

                                <div class="setup-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    <button class="btn btn-primary" id="installBtn" style="flex: 1; white-space: nowrap;">Install & Start Ollama</button>
                                    <button class="btn btn-secondary" id="reconnectBtn">Reconnect</button>
                                </div>
                                <div class="install-progress-container" id="installProgressContainer" style="display: none; margin-top: 15px; width: 100%;">
                                    <div class="progress-bar-bg" style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
                                        <div class="progress-bar-fill" id="installProgressBar" style="width: 0%; height: 100%; background: var(--brand-primary); transition: width 0.3s;"></div>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; gap: 8px;">
                                        <p id="installStatusText" style="font-size: 10px; opacity: 0.8; margin: 0; word-break: break-all; flex: 1; line-height: 1.2;">Initializing installation...</p>
                                        <button class="btn btn-sm btn-danger" id="cancelInstallBtn" style="padding: 2px 6px; font-size: 9px; white-space: nowrap;">Cancel</button>
                                    </div>
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
