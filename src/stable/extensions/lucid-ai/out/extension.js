"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const chatProvider_1 = require("./chatProvider");
const commitGenerator_1 = require("./commitGenerator");
let providerInstance = null;
let extensionContext = null;
function activate(context) {
    extensionContext = context;
    const provider = new chatProvider_1.ChatViewProvider(context);
    providerInstance = provider;
    const closeOllamaOnClose = context.globalState.get('ai.settings.closeOllamaOnClose', true);
    if (closeOllamaOnClose) {
        provider.startOllamaSilently();
    }
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(chatProvider_1.ChatViewProvider.viewType, provider, {
        webviewOptions: {
            retainContextWhenHidden: true
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('lucid.chat.clear', () => {
        provider.clearChat();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('lucid.chat.focus', () => {
        provider.focusInput();
    }));
    (0, commitGenerator_1.registerCommitGenerator)(context);
}
function deactivate() {
    if (extensionContext) {
        const closeOllamaOnClose = extensionContext.globalState.get('ai.settings.closeOllamaOnClose', true);
        if (closeOllamaOnClose) {
            const { execSync } = require('child_process');
            try {
                execSync('taskkill /IM ollama.exe /F');
            }
            catch (e) { }
        }
    }
}
//# sourceMappingURL=extension.js.map