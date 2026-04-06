import * as vscode from 'vscode';
import { parseImports } from './importParser';
import { parseExportDirective } from './exportCommand';

/**
 * Provides "⬡ Show Source" CodeLens buttons above each `from X import Y` line
 * in notebook cells.
 */
export class ImportCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  refresh(): void {
    this._onDidChange.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    // Only act on notebook cell documents
    if (document.uri.scheme !== 'vscode-notebook-cell') {
      return [];
    }

    const text = document.getText();
    const lenses: vscode.CodeLens[] = [];

    // Export directive: #| export module
    const exportModule = parseExportDirective(text);
    if (exportModule) {
      lenses.push(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: `⬡ Export to ${exportModule}.py`,
          command: 'nbpeek.exportCell',
          arguments: [document.uri],
        })
      );
    }

    // Import peek lenses
    for (const sym of parseImports(text)) {
      lenses.push(
        new vscode.CodeLens(new vscode.Range(sym.line, 0, sym.line, 0), {
          title: `⬡ Show ${sym.name}`,
          command: 'nbpeek.peekImport',
          arguments: [document.uri, sym.line, sym.column, sym.name],
        })
      );
    }

    return lenses;
  }
}
