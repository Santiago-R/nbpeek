import * as vscode from 'vscode';
import { ImportCodeLensProvider } from './codeLensProvider';
import { peekImport, peekedFilesByCell } from './peekCommand';
import { checkAutoreload } from './autoreload';
import { exportCell } from './exportCommand';

export function activate(context: vscode.ExtensionContext): void {
  const codeLensProvider = new ImportCodeLensProvider();

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
      (cellUri?: vscode.Uri) => exportCell(cellUri)
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

  // Retry CodeLens resolution once Pylance is ready.
  // On startup, provideCodeLenses runs before Pylance has indexed, so
  // executeDefinitionProvider returns nothing. We refresh when Pylance
  // starts emitting diagnostics (the first reliable signal it's ready).
  let pylanceReady = false;
  const diagListener = vscode.languages.onDidChangeDiagnostics((e) => {
    if (pylanceReady) { return; }
    if (e.uris.some(u => u.fsPath.endsWith('.py') || u.scheme === 'vscode-notebook-cell')) {
      pylanceReady = true;
      codeLensProvider.refresh();
      diagListener.dispose();
    }
  });
  context.subscriptions.push(diagListener);

  // Check autoreload on already-open notebooks
  for (const nb of vscode.workspace.notebookDocuments) {
    checkAutoreload(nb).catch(() => {});
  }

  // Check autoreload when a notebook is opened
  context.subscriptions.push(
    vscode.workspace.onDidOpenNotebookDocument((nb) => checkAutoreload(nb).catch(() => {}))
  );

  // Auto-save peeked .py files when user switches away
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((_editor) => {
      for (const fileSet of peekedFilesByCell.values()) {
        for (const uriStr of fileSet) {
          const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriStr);
          if (doc?.isDirty) { doc.save(); }
        }
      }
    })
  );

  // Auto-save peeked .py files when the cell that peeked into them is executed
  context.subscriptions.push(
    vscode.workspace.onDidChangeNotebookDocument((e) => {
      for (const change of e.cellChanges) {
        if (change.executionSummary === undefined) { continue; }
        const cellUri = change.cell.document.uri.toString();
        const fileSet = peekedFilesByCell.get(cellUri);
        if (!fileSet) { continue; }
        for (const uriStr of fileSet) {
          const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriStr);
          if (doc?.isDirty) { doc.save(); }
        }
      }
    })
  );
}

export function deactivate(): void {}
