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
    const symbols = parseImports(text);

    // Group symbols by line so we get one CodeLens per import line
    const lineMap = new Map<number, typeof symbols>();
    for (const sym of symbols) {
      const arr = lineMap.get(sym.line) ?? [];
      arr.push(sym);
      lineMap.set(sym.line, arr);
    }

    for (const [line, syms] of lineMap) {
      const range = new vscode.Range(line, 0, line, 0);

      for (const sym of syms) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: `⬡ Show ${sym.name}`,
            command: 'nbpeek.peekImport',
            arguments: [document.uri, sym.line, sym.column, sym.name],
          })
        );
      }
    }

    return lenses;
  }
}
