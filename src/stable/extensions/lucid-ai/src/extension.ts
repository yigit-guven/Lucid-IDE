import * as vscode from 'vscode';
import { ChatViewProvider } from './chatProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lucid.chat.clear', () => {
            provider.clearChat();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lucid.chat.focus', () => {
            provider.focusInput();
        })
    );
}

export function deactivate() {}
