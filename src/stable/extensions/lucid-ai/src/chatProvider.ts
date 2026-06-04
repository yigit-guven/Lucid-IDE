import * as vscode from 'vscode';

const DEFAULT_SYSTEM_PROMPT = `You are the built-in AI assistant for Lucid IDE, a professional coding assistant just like Google Antigravity. You are pair programming with the user.

=== YOUR CAPABILITIES & WIDGETS ===
1. **Running Terminal Commands**:
   - To run a terminal command, output the command inside a <run_command>your command here</run_command> tag.
   - Example: <run_command>npm install</run_command>

2. **Writing Workspace Files**:
   - To create a new file or completely overwrite a file, output a <write_file path="path/to/file">content</write_file> tag.
   - Example:
     <write_file path="src/index.js">
     console.log("Hello World");
     </write_file>

3. **Modifying/Patching Files**:
   - To modify an existing file, use the <patch_file> tag with exact <search> and <replace> blocks.
   - Make sure the search block matches the target file content EXACTLY, including whitespace and indentation.
   - Example:
     <patch_file path="src/index.js">
     <search>
     console.log("Hello World");
     </search>
     <replace>
     console.log("Hello Lucid");
     </replace>
     </patch_file>

4. **Asking Multiple-Choice Questions**:
   - If you need clarification or want to offer choices, output an <ask_question> tag with options.
   - Example:
     <ask_question question="Which database would you prefer to use?">
       <option>MongoDB</option>
       <option>PostgreSQL</option>
     </ask_question>

=== SLASH COMMANDS & RECOMMENDATIONS ===
You support and should recommend slash commands to the user when appropriate:
- \`/goal\`: Recommend this when the user wants to run a long-running task (e.g., overnight) and wants the agent to be extra thorough and not stop until the goal is fully achieved.
- \`/schedule\`: Recommend this when the user wants to run an instruction on a recurring schedule or set a one-time timer.
- \`/grill-me\`: Recommend this when the user wants to align on a plan through an interactive interview to resolve design decisions.
- \`/clear\`: Can be used to clear the chat history.

Explain to the user how they can use these slash commands. When recommending them, suggest them clearly in your response (e.g. "You can use the \`/goal\` command to...").

=== RULES & GUIDELINES ===
- Act as a highly capable, autonomous developer agent. Proactively suggest file modifications, commands, and questions using these structured XML tags.
- Always use the precise XML tag syntax shown above.
- Make edits and run commands when requested. Do not just talk about them; provide the tags to execute them.

=== LIVE PROJECT CONTEXT ===
{workspaceContext}
=== END CONTEXT ===`;

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
                case 'generateCommit': {
                    this.generateCommitMessage();
                    break;
                }
                case 'saveChat': {
                    await this.saveChat(data.name, data.model, data.messages, data.id);
                    break;
                }
                case 'loadChat': {
                    await this.loadChat(data.id);
                    break;
                }
                case 'deleteChat': {
                    await this.deleteChat(data.id);
                    break;
                }
                case 'renameChat': {
                    await this.renameChat(data.id, data.name);
                    break;
                }
                case 'listChats': {
                    this.sendChatList();
                    break;
                }
                case 'requestRenameChat': {
                    const newName = await vscode.window.showInputBox({
                        prompt: 'Enter new name for the chat session',
                        value: data.name
                    });
                    if (newName !== undefined && newName.trim() !== '') {
                        await this.renameChat(data.id, newName.trim());
                    }
                    break;
                }
                case 'requestDeleteChat': {
                    const confirm = await vscode.window.showWarningMessage(`Are you sure you want to delete the chat "${data.name}"?`, { modal: true }, 'Delete');
                    if (confirm === 'Delete') {
                        await this.deleteChat(data.id);
                    }
                    break;
                }
                case 'requestDeleteModel': {
                    const confirm = await vscode.window.showWarningMessage(`Are you sure you want to delete the model "${data.model}"?`, { modal: true }, 'Delete');
                    if (confirm === 'Delete') {
                        // Forward to deleteModel handler
                        this.deleteModel(data.model);
                    }
                    break;
                }
                case 'getSettings': {
                    const systemPrompt = this._context.globalState.get<string>('ai.settings.systemPrompt', DEFAULT_SYSTEM_PROMPT);
                    const temperature = this._context.globalState.get<number>('ai.settings.temperature', 0.2);
                    const hostUrl = this._context.globalState.get<string>('ai.settings.hostUrl', 'http://127.0.0.1:11434');
                    const allowCommands = this._context.globalState.get<boolean>('ai.settings.allowCommands', false);
                    const allowWrite = this._context.globalState.get<boolean>('ai.settings.allowWrite', false);
                    const allowRead = this._context.globalState.get<boolean>('ai.settings.allowRead', true);
                    const closeOllamaOnClose = this._context.globalState.get<boolean>('ai.settings.closeOllamaOnClose', true);
                    webviewView.webview.postMessage({
                        command: 'settingsUpdate',
                        settings: { systemPrompt, temperature, hostUrl, allowCommands, allowWrite, allowRead, closeOllamaOnClose }
                    });
                    break;
                }
                case 'updateSettings': {
                    const s = data.settings;
                    await this._context.globalState.update('ai.settings.systemPrompt', s.systemPrompt);
                    await this._context.globalState.update('ai.settings.temperature', s.temperature);
                    await this._context.globalState.update('ai.settings.hostUrl', s.hostUrl);
                    await this._context.globalState.update('ai.settings.allowCommands', s.allowCommands);
                    await this._context.globalState.update('ai.settings.allowWrite', s.allowWrite);
                    await this._context.globalState.update('ai.settings.allowRead', s.allowRead);
                    await this._context.globalState.update('ai.settings.closeOllamaOnClose', s.closeOllamaOnClose);
                    vscode.window.showInformationMessage('Lucid AI settings updated.');
                    break;
                }
                case 'writeFile': {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        vscode.window.showErrorMessage('No workspace open to write file.');
                        break;
                    }
                    const path = require('path');
                    const fs = require('fs');
                    const fullPath = path.join(workspaceFolders[0].uri.fsPath, data.path);
                    try {
                        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                        fs.writeFileSync(fullPath, data.content, 'utf8');
                        vscode.window.showInformationMessage(`Successfully created/updated: ${data.path}`);
                        webviewView.webview.postMessage({ command: 'toolExecuted', tool: 'writeFile', path: data.path, success: true });
                    } catch (e: any) {
                        vscode.window.showErrorMessage(`Failed to write file ${data.path}: ${e.message}`);
                        webviewView.webview.postMessage({ command: 'toolExecuted', tool: 'writeFile', path: data.path, success: false, error: e.message });
                    }
                    break;
                }
                case 'patchFile': {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        vscode.window.showErrorMessage('No workspace open to patch file.');
                        break;
                    }
                    const path = require('path');
                    const fs = require('fs');
                    const fullPath = path.join(workspaceFolders[0].uri.fsPath, data.path);
                    try {
                        if (!fs.existsSync(fullPath)) {
                            throw new Error(`File does not exist: ${data.path}`);
                        }
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const normalizedContent = content.replace(/\r\n/g, '\n');
                        const normalizedSearch = data.search.replace(/\r\n/g, '\n');
                        const normalizedReplace = data.replace.replace(/\r\n/g, '\n');
                        
                        if (!normalizedContent.includes(normalizedSearch)) {
                            throw new Error(`Could not find the target search block in the file.`);
                        }
                        
                        const patched = normalizedContent.replace(normalizedSearch, normalizedReplace);
                        const finalContent = content.includes('\r\n') ? patched.replace(/\n/g, '\r\n') : patched;
                        fs.writeFileSync(fullPath, finalContent, 'utf8');
                        
                        const doc = await vscode.workspace.openTextDocument(fullPath);
                        await vscode.window.showTextDocument(doc);
                        
                        vscode.window.showInformationMessage(`Successfully applied patch to: ${data.path}`);
                        webviewView.webview.postMessage({ command: 'toolExecuted', tool: 'patchFile', path: data.path, success: true });
                    } catch (e: any) {
                        vscode.window.showErrorMessage(`Failed to patch file ${data.path}: ${e.message}`);
                        webviewView.webview.postMessage({ command: 'toolExecuted', tool: 'patchFile', path: data.path, success: false, error: e.message });
                    }
                    break;
                }
                case 'readFile': {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        webviewView.webview.postMessage({ command: 'fileReadResult', path: data.path, success: false, error: 'No workspace open' });
                        break;
                    }
                    const path = require('path');
                    const fs = require('fs');
                    const fullPath = path.join(workspaceFolders[0].uri.fsPath, data.path);
                    try {
                        if (!fs.existsSync(fullPath)) {
                            throw new Error('File not found');
                        }
                        const content = fs.readFileSync(fullPath, 'utf8');
                        webviewView.webview.postMessage({ command: 'fileReadResult', path: data.path, success: true, content });
                    } catch (e: any) {
                        webviewView.webview.postMessage({ command: 'fileReadResult', path: data.path, success: false, error: e.message });
                    }
                    break;
                }
                case 'getFileContent': {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        webviewView.webview.postMessage({ command: 'fileContentResponse', path: data.path, content: '', exists: false, cardId: data.cardId });
                        break;
                    }
                    const path = require('path');
                    const fs = require('fs');
                    const fullPath = path.join(workspaceFolders[0].uri.fsPath, data.path);
                    try {
                        if (fs.existsSync(fullPath)) {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            webviewView.webview.postMessage({ command: 'fileContentResponse', path: data.path, content, exists: true, cardId: data.cardId });
                        } else {
                            webviewView.webview.postMessage({ command: 'fileContentResponse', path: data.path, content: '', exists: false, cardId: data.cardId });
                        }
                    } catch (e: any) {
                        webviewView.webview.postMessage({ command: 'fileContentResponse', path: data.path, content: '', exists: false, cardId: data.cardId });
                    }
                    break;
                }
                case 'stopOllama': {
                    await this.stopOllama();
                    await this.checkOllamaStatus();
                    break;
                }
                case 'startOllama': {
                    this.installAndStartOllama();
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

    public async startOllamaSilently() {
        const path = require('path');
        const fs = require('fs');
        const defaultInstallDir = path.join(this._context.extensionUri.fsPath, 'ollama');
        const targetDir = this._context.globalState.get<string>('ollamaInstallPath') || defaultInstallDir;
        const ollamaExePath = path.join(targetDir, 'ollama.exe');
        const systemOllamaExe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
        
        let exeToStart = '';
        let runDir = '';
        
        if (fs.existsSync(ollamaExePath)) {
            exeToStart = ollamaExePath;
            runDir = targetDir;
        } else if (fs.existsSync(systemOllamaExe)) {
            exeToStart = systemOllamaExe;
            runDir = path.dirname(systemOllamaExe);
        }
        
        if (exeToStart) {
            try {
                const response = await fetch('http://127.0.0.1:11434/api/tags');
                if (response.ok) {
                    return; // Already running
                }
            } catch (e) {
                // Not running
            }
            
            const { spawn } = require('child_process');
            const modelsDir = path.join(runDir, 'models');
            try {
                if (!fs.existsSync(modelsDir)) {
                    fs.mkdirSync(modelsDir, { recursive: true });
                }
            } catch (e) {}
            
            try {
                const child = spawn(exeToStart, ['serve'], {
                    detached: true,
                    stdio: 'ignore',
                    env: {
                        ...process.env,
                        OLLAMA_MODELS: modelsDir
                    }
                });
                child.unref();
            } catch (e) {}
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

        // 1. Check if already installed (local portable OR system-wide)
        const systemOllamaExe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
        if (fs.existsSync(ollamaExePath)) {
            sendProgress(50, 'Ollama found (portable). Starting...');
            await this.startOllamaProcess(ollamaExePath, targetDir, sendProgress, sendError);
            return;
        }
        if (fs.existsSync(systemOllamaExe)) {
            sendProgress(50, 'Ollama found (system install). Starting...');
            await this.startOllamaProcess(systemOllamaExe, path.dirname(systemOllamaExe), sendProgress, sendError);
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
        
        // Check local portable install AND system-wide install
        const systemOllamaPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
        const localInstalled = fs.existsSync(path.join(savedPath, 'ollama.exe')) || fs.existsSync(systemOllamaPath);

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

    private async stopOllama() {
        const { exec } = require('child_process');
        return new Promise<void>((resolve) => {
            exec('taskkill /IM ollama.exe /F', (err: any, stdout: any, stderr: any) => {
                resolve();
            });
        });
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

    private getSavedChats(): any[] {
        return this._context.globalState.get<any[]>('savedChats', []);
    }

    private async saveChat(name: string, model: string, messages: any[], id?: string) {
        if (!this._view || messages.length === 0) return;
        const chats = this.getSavedChats();
        const autoName = name || (messages.find((m: any) => m.role === 'user')?.content?.slice(0, 50) ?? 'Untitled chat');
        
        let existingChatIdx = -1;
        if (id) {
            existingChatIdx = chats.findIndex((c: any) => c.id === id);
        }
        
        if (existingChatIdx !== -1) {
            // Update in-place
            chats[existingChatIdx].messages = messages;
            chats[existingChatIdx].model = model;
            chats[existingChatIdx].savedAt = Date.now();
            if (name) chats[existingChatIdx].name = name;
            // Move to top
            const updatedChat = chats.splice(existingChatIdx, 1)[0];
            chats.unshift(updatedChat);
            await this._context.globalState.update('savedChats', chats);
            this.sendChatList();
            this._view.webview.postMessage({ command: 'chatSaved', name: chats[0].name, id: chats[0].id });
        } else {
            // Create new
            const newId = id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            chats.unshift({ id: newId, name: autoName, model, savedAt: Date.now(), messages });
            // Keep max 50 chats
            if (chats.length > 50) chats.splice(50);
            await this._context.globalState.update('savedChats', chats);
            this.sendChatList();
            this._view.webview.postMessage({ command: 'chatSaved', name: autoName, id: newId });
        }
    }

    private async loadChat(id: string) {
        if (!this._view) return;
        const chats = this.getSavedChats();
        const chat = chats.find((c: any) => c.id === id);
        if (chat) {
            this._view.webview.postMessage({ command: 'chatLoaded', chat });
        }
    }

    private async deleteChat(id: string) {
        const chats = this.getSavedChats().filter((c: any) => c.id !== id);
        await this._context.globalState.update('savedChats', chats);
        this.sendChatList();
    }

    private async renameChat(id: string, name: string) {
        if (!name.trim()) return;
        const chats = this.getSavedChats();
        const chat = chats.find((c: any) => c.id === id);
        if (chat) {
            chat.name = name.trim();
            await this._context.globalState.update('savedChats', chats);
            this.sendChatList();
        }
    }

    private sendChatList() {
        if (!this._view) return;
        const chats = this.getSavedChats().map((c: any) => ({
            id: c.id,
            name: c.name,
            model: c.model,
            savedAt: c.savedAt,
            messageCount: c.messages?.length ?? 0
        }));
        this._view.webview.postMessage({ command: 'chatList', chats });
    }

    private async generateCommitMessage() {
        if (!this._view) return;
        const webview = this._view.webview;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            webview.postMessage({ command: 'assistantMessage', content: 'No workspace open — cannot read git diff.' });
            return;
        }
        const cwd = workspaceFolders[0].uri.fsPath;
        try {
            const { execSync } = require('child_process');
            const excludeArgs = `-- ':!*/out/*.js' ':!*/out/*.js.map' ':!*.js.map'`;
            const status = execSync(`git status --short ${excludeArgs}`, { cwd, encoding: 'utf8', timeout: 3000 }).trim();
            if (!status) {
                webview.postMessage({ command: 'assistantMessage', content: '✅ No changes detected — working tree is clean.' });
                return;
            }
            let diff = execSync(`git diff ${excludeArgs}`, { cwd, encoding: 'utf8', timeout: 3000 });
            if (!diff.trim()) {
                diff = execSync(`git diff --cached ${excludeArgs}`, { cwd, encoding: 'utf8', timeout: 3000 });
            }

            // Parse changed files to determine commit type
            const changedFiles = status.split('\n').map((l: string) => l.trim()).filter(Boolean);
            const isFixOnly = changedFiles.every((l: string) => /fix|bug|patch|error|crash/i.test(l));
            const hasSrc = changedFiles.some((l: string) => /\.(ts|js|py|go|rs|java|c|cpp)$/.test(l));
            const hasDocs = changedFiles.some((l: string) => /\.(md|txt|rst)$/.test(l));
            const hasStyle = changedFiles.some((l: string) => /\.(css|scss|sass|less)$/.test(l));
            const hasConfig = changedFiles.some((l: string) => /\.(json|yaml|yml|toml|ini|env)$/.test(l));

            let type = 'chore';
            if (hasSrc && !isFixOnly) type = 'feat';
            if (isFixOnly) type = 'fix';
            if (hasDocs && !hasSrc) type = 'docs';
            if (hasStyle && !hasSrc) type = 'style';
            if (hasConfig && !hasSrc) type = 'chore';

            // Build file summary
            const fileSummary = changedFiles.slice(0, 5).map((l: string) => `  - ${l}`).join('\n');
            const moreFiles = changedFiles.length > 5 ? `\n  - ...and ${changedFiles.length - 5} more` : '';

            const title = `${type}: update ${workspaceFolders[0].name} source files`;
            const body = `Changed files:\n${fileSummary}${moreFiles}`;
            const escapedTitle = title.replace(/"/g, '\\"');
            const escapedBody = body.replace(/"/g, '\\"');

            const message = `Here is a commit based on your actual changes:\n\n**${title}**\n\n${body}\n\nRun this to commit everything:\n\`\`\`bash\ngit add -A\ngit commit -m "${escapedTitle}" -m "${escapedBody}"\n\`\`\`\n\nOr stage only source files:\n\`\`\`bash\ngit add -- ':!*/out/*.js' ':!*/out/*.js.map'\ngit commit -m "${escapedTitle}" -m "${escapedBody}"\n\`\`\``;

            webview.postMessage({ command: 'assistantMessage', content: message });
        } catch (e: any) {
            webview.postMessage({ command: 'assistantMessage', content: `Could not read git diff: ${e.message}` });
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

                // Gather git context — exclude compiled output to keep context human-readable
                try {
                    const { execSync } = require('child_process');
                    // Exclude out/ directory and source maps from both status and diff
                    const excludeArgs = `-- ':!*/out/*.js' ':!*/out/*.js.map' ':!*.js.map'`;
                    const status = execSync(`git status --short ${excludeArgs}`, { cwd, encoding: 'utf8', timeout: 2000 });
                    if (status.trim()) {
                        workspaceContext += `\nGit Status (Modified Source Files):\n${status}\n`;
                        let diff = execSync(`git diff ${excludeArgs}`, { cwd, encoding: 'utf8', timeout: 2000 });
                        if (!diff.trim()) {
                            diff = execSync(`git diff --cached ${excludeArgs}`, { cwd, encoding: 'utf8', timeout: 2000 });
                        }
                        if (diff.trim()) {
                            const maxDiffLen = 8000;
                            const truncatedDiff = diff.length > maxDiffLen ? diff.substring(0, maxDiffLen) + '\n[Diff truncated — showing first 8000 chars of source changes]' : diff;
                            workspaceContext += `\nGit Diff (source files only):\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n`;
                        }
                    } else {
                        workspaceContext += `\nGit Status: Working tree is clean (no uncommitted changes).\n`;
                    }

                    // Unpushed commits (commits not yet on remote)
                    try {
                        const unpushed = execSync(`git log --oneline --not --remotes`, { cwd, encoding: 'utf8', timeout: 2000 });
                        if (unpushed.trim()) {
                            workspaceContext += `\nUnpushed Commits (not yet on remote):\n${unpushed}\n`;
                        }
                    } catch (_) { /* no remote configured */ }
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

            // Load settings
            const rawSystemPrompt = this._context.globalState.get<string>('ai.settings.systemPrompt', DEFAULT_SYSTEM_PROMPT);
            const systemPromptContent = rawSystemPrompt.replace('{workspaceContext}', workspaceContext);

            // Inject context directly into the last user message so small models can't miss it
            const lastUserIdx = [...messages].map((m, i) => m.role === 'user' ? i : -1).filter(i => i !== -1).at(-1) ?? -1;
            const finalMessages = messages.map((m, i) => {
                if (i === lastUserIdx) {
                    return { ...m, content: `[Context about my project]\n${workspaceContext}\n[End Context]\n\n${m.content}` };
                }
                return m;
            });

            const messagesForApi = [
                { role: 'system', content: systemPromptContent },
                ...finalMessages
            ];

            const temp = this._context.globalState.get<number>('ai.settings.temperature', 0.2);
            const hostUrl = this._context.globalState.get<string>('ai.settings.hostUrl', 'http://127.0.0.1:11434');

            const response = await fetch(`${hostUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: messagesForApi,
                    stream: true,
                    options: {
                        temperature: temp
                    }
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
                        <div class="status-bar-actions">
                            <button class="icon-btn" id="newChatBtn" title="New Chat" style="opacity:0.7;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                            <button class="icon-btn" id="chatsHistoryBtn" title="Chat History" style="opacity:0.7;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            </button>
                            <button class="icon-btn" id="settingsBtn" title="AI Settings" style="opacity:0.7;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                            </button>
                            <div class="active-model-container">
                                <button class="model-select-btn" id="modelSelectBtn" disabled>
                                    <span class="active-model-name">No Model Selected</span>
                                    <span class="chevron-down"></span>
                                </button>
                            </div>
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

                    <!-- Chats History Drawer -->
                    <div class="model-drawer" id="chatsDrawer">
                        <div class="drawer-header">
                            <h3>Chat History</h3>
                            <button class="close-drawer-btn" id="closeChatsDrawerBtn">&times;</button>
                        </div>
                        <div class="chats-drawer-actions">
                            <button class="btn btn-secondary" id="saveCurrentChatBtn">
                                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                Save Current Chat
                            </button>
                        </div>
                        <div class="models-list" id="chatsList">
                            <!-- Populated dynamically -->
                        </div>
                    </div>

                    <!-- Settings Drawer -->
                    <div class="model-drawer" id="settingsDrawer">
                        <div class="drawer-header">
                            <h3>AI Settings</h3>
                            <button class="close-drawer-btn" id="closeSettingsDrawerBtn">&times;</button>
                        </div>
                        <div class="settings-content">
                            
                            <div class="form-group">
                                <label class="form-label">System Prompt</label>
                                <textarea id="settingsSystemPrompt" class="form-textarea" rows="8"></textarea>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group flex-1">
                                    <label class="form-label">Temperature</label>
                                    <input type="number" id="settingsTemperature" class="form-input" min="0" max="1" step="0.1">
                                </div>
                                <div class="form-group flex-2">
                                    <label class="form-label">Ollama Host URL</label>
                                    <input type="text" id="settingsHostUrl" class="form-input">
                                </div>
                            </div>
                            
                            <hr class="form-divider">
                            
                            <label class="form-section-header">Ollama Service Control</label>
                            <div class="permission-item">
                                <div class="permission-info">
                                    <div class="permission-title">Service Process</div>
                                    <div class="permission-desc" id="ollamaServiceDesc">Start or stop the background Ollama service.</div>
                                </div>
                                <button class="btn btn-sm" id="toggleOllamaServiceBtn" style="padding: 4px 8px; font-size: 10px; font-weight: 600; min-width: 100px;"></button>
                            </div>
                            <div class="permission-item">
                                <div class="permission-info">
                                    <div class="permission-title">Manage Service Lifetime</div>
                                    <div class="permission-desc">Start Ollama on launch and close it on exit.</div>
                                </div>
                                <input type="checkbox" id="settingsCloseOllamaOnClose">
                            </div>

                            <hr class="form-divider">
                            
                            <label class="form-section-header">Autopilot Permissions</label>
                            
                            <div class="permission-item">
                                <div class="permission-info">
                                    <div class="permission-title">Run Terminal Commands</div>
                                    <div class="permission-desc">Allow running terminal commands / scripts automatically.</div>
                                </div>
                                <input type="checkbox" id="settingsAllowCommands">
                            </div>
                            
                            <div class="permission-item">
                                <div class="permission-info">
                                    <div class="permission-title">Modify Workspace Files</div>
                                    <div class="permission-desc">Allow creating and patching files automatically.</div>
                                </div>
                                <input type="checkbox" id="settingsAllowWrite">
                            </div>
                            
                            <div class="permission-item">
                                <div class="permission-info">
                                    <div class="permission-title">Read Workspace Files</div>
                                    <div class="permission-desc">Allow scanning project workspace files.</div>
                                </div>
                                <input type="checkbox" id="settingsAllowRead">
                            </div>
                            
                            <div class="settings-footer">
                                <button class="btn btn-secondary" id="resetSettingsBtn">Reset</button>
                                <button class="btn btn-primary" id="saveSettingsBtn">Save Settings</button>
                            </div>
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
                                <div class="setup-form" id="setupForm">
                                    <div class="form-group">
                                        <label class="form-label">Ollama Version</label>
                                        <select id="ollamaVersionSelect" class="form-select">
                                            <option value="latest">Latest Release (Recommended)</option>
                                            <option value="0.5.4">v0.5.4</option>
                                            <option value="0.4.4">v0.4.4</option>
                                            <option value="0.3.14">v0.3.14</option>
                                            <option value="0.2.1">v0.2.1</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Install Directory</label>
                                        <div class="install-dir-row">
                                            <input type="text" id="installDirInput" class="form-input" readonly>
                                            <button class="btn btn-secondary" id="browseDirBtn">Browse...</button>
                                        </div>
                                        <span class="form-help-text">Default: inside Lucid IDE folders (portable mode).</span>
                                    </div>
                                </div>

                                <div class="setup-actions">
                                    <button class="btn btn-primary" id="installBtn">Install & Start Ollama</button>
                                    <button class="btn btn-secondary" id="reconnectBtn">Reconnect</button>
                                </div>
                                <div class="install-progress-container" id="installProgressContainer">
                                    <div class="progress-bar-bg">
                                        <div class="progress-bar-fill" id="installProgressBar"></div>
                                    </div>
                                    <div class="progress-status-row">
                                        <p id="installStatusText" class="progress-status-text">Initializing installation...</p>
                                        <button class="btn btn-sm btn-danger" id="cancelInstallBtn">Cancel</button>
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
                    <div class="input-panel" style="position: relative;">
                        <div id="slashMenu" class="slash-menu" style="display:none;"></div>
                        <div id="pendingChangesPanel" class="pending-changes-panel" style="display:none;">
                            <div class="pc-header">
                                <span class="pc-title">⚡ Pending Actions (<span id="pcTotalCount">0</span>)</span>
                                <div class="pc-global-actions">
                                    <button class="pc-btn pc-btn-success" id="pcAcceptAllBtn">Accept All</button>
                                    <button class="pc-btn pc-btn-danger" id="pcRefuseAllBtn">Refuse All</button>
                                </div>
                            </div>
                            <div class="pc-tabs">
                                <button class="pc-tab active" data-tab="overview">Overview</button>
                                <button class="pc-tab" data-tab="terminals" id="pcTabTerminals" style="display:none;">Terminals (<span id="pcCountTerminals">0</span>)</button>
                                <button class="pc-tab" data-tab="files" id="pcTabFiles" style="display:none;">Files (<span id="pcCountFiles">0</span>)</button>
                                <button class="pc-tab" data-tab="browser" id="pcTabBrowser" style="display:none;">Browser</button>
                            </div>
                            <div class="pc-content">
                                <div class="pc-panel active" id="pcPanelOverview">
                                    <div class="pc-list" id="pcOverviewList"></div>
                                </div>
                                <div class="pc-panel" id="pcPanelTerminals" style="display:none;">
                                    <div class="pc-list" id="pcTerminalsList"></div>
                                </div>
                                <div class="pc-panel" id="pcPanelFiles" style="display:none;">
                                    <div class="pc-list" id="pcFilesList"></div>
                                </div>
                                <div class="pc-panel" id="pcPanelBrowser" style="display:none;">
                                    <div class="pc-list" id="pcBrowserList">
                                        <div style="padding: 10px; font-size: 11px; opacity: 0.6; text-align: center;">No active web preview</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="input-toolbar" id="inputToolbar" style="display:none; padding: 4px 10px 0; gap: 6px; display: flex; flex-wrap: wrap;">
                        </div>
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
