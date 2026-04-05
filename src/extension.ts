import * as vscode from 'vscode';
import { ImportCodeLensProvider } from './codeLensProvider';
import { peekImport } from './peekCommand';
import { checkAutoreload } from './autoreload';
import { exportCell } from './exportCommand';

let codeLensProvider: ImportCodeLensProvider;

export function activate(context: vscode.ExtensionContext): void {
  codeLensProvider = new ImportCodeLensProvider();

  // Register CodeLens for Python cells in notebooks
  const selector: vscode.DocumentSelector = {
    language: 'python',
    scheme: 'vscode-notebook-cell',
  };

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider)
  );

  // Register the peek command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'nbpeek.peekImport',
      (cellUri: vscode.Uri, line: number, column: number, symbolName: string) =>
        peekImport(cellUri, line, column, symbolName)
    )
  );

  // Register the export command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'nbpeek.exportCell',
      (cellUri: vscode.Uri) => exportCell(cellUri)
    )
  );

  // Refresh CodeLenses when notebook cells change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.scheme === 'vscode-notebook-cell') {
        codeLensProvider.refresh();
      }
    })
  );

  // Check autoreload on already-open notebooks
  for (const nb of vscode.workspace.notebookDocuments) {
    checkAutoreload(nb).catch(() => {});
  }

  // Check autoreload when a notebook is opened
  context.subscriptions.push(
    vscode.workspace.onDidOpenNotebookDocument((nb) => checkAutoreload(nb).catch(() => {}))
  );

  // Save dirty .py files when user switches away
  // (e.g., closing peek widget or clicking back to a notebook cell to run it)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((_editor) => {
      for (const doc of vscode.workspace.textDocuments) {
        if (doc.isDirty && doc.fileName.endsWith('.py')) {
          doc.save();
        }
      }
    })
  );
}

export function deactivate(): void {}
