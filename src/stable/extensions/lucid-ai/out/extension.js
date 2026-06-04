"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const chatProvider_1 = require("./chatProvider");
const commitGenerator_1 = require("./commitGenerator");
function activate(context) {
    const provider = new chatProvider_1.ChatViewProvider(context.extensionUri);
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
function deactivate() { }
//# sourceMappingURL=extension.js.map