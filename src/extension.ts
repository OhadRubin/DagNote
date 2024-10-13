import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('dagNoteEditor.open', () => {
            const panel = vscode.window.createWebviewPanel(
                'dagNoteEditor',
                'DAG Note Editor',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'out'))]
                }
            );

            panel.webview.html = getWebviewContent(panel.webview, context);

            panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'saveToFile':
                            await saveDAGToFile(message.data);
                            return;
                        case 'loadFromFile':
                            await loadDAGFromFile(panel);
                            return;
                        case 'exportToDot':
                            await exportToDot(message.data);
                            return;
                    }
                },
                undefined,
                context.subscriptions
            );
        })
    );
}

function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'out', 'bundle.js'))
    );

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DAG Note Editor</title>
        </head>
        <body>
            <div id="root"></div>
            <script src="${scriptUri}"></script>
        </body>
        </html>
    `;
}

async function saveDAGToFile(data: string) {
    const uri = await vscode.window.showSaveDialog({
        filters: { 'JSON Files': ['json'] }
    });
    if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
        vscode.window.showInformationMessage('DAG saved successfully.');
    }
}

async function loadDAGFromFile(panel: vscode.WebviewPanel) {
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON Files': ['json'] }
    });
    if (uris && uris[0]) {
        const data = await vscode.workspace.fs.readFile(uris[0]);
        const content = Buffer.from(data).toString('utf8');
        panel.webview.postMessage({ command: 'loadState', state: content });
        vscode.window.showInformationMessage('DAG loaded successfully.');
    }
}

async function exportToDot(data: string) {
    const uri = await vscode.window.showSaveDialog({
        filters: { 'DOT Files': ['dot'] }
    });
    if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
        vscode.window.showInformationMessage('DOT file exported successfully.');
    }
}

export function deactivate() {}
