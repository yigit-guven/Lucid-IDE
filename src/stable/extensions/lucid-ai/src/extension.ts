import * as vscode from 'vscode';
import { ChatViewProvider } from './chatProvider';
import { registerCommitGenerator } from './commitGenerator';

let providerInstance: ChatViewProvider | null = null;
let extensionContext: vscode.ExtensionContext | null = null;

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    const provider = new ChatViewProvider(context);
    providerInstance = provider;

    const closeOllamaOnClose = context.globalState.get<boolean>('ai.settings.closeOllamaOnClose', true);
    if (closeOllamaOnClose) {
        provider.startOllamaSilently();
    }

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

    registerCommitGenerator(context);
}

export function deactivate() {
    if (extensionContext) {
        const closeOllamaOnClose = extensionContext.globalState.get<boolean>('ai.settings.closeOllamaOnClose', true);
        if (closeOllamaOnClose) {
            const { execSync } = require('child_process');
            try {
                execSync('taskkill /IM ollama.exe /F');
            } catch (e) {}
        }
    }
}
