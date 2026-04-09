import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { parseImports } from './importParser';
import { getPython } from './python';

const HAS_DEFINITION = /^(async\s+)?def\s+|^class\s+/m;

let stdlibModules: Set<string> | undefined;

async function getStdlibModules(): Promise<Set<string>> {
  if (stdlibModules) { return stdlibModules; }
  const python = await getPython();
  return new Promise((resolve) => {
    execFile(python, ['-c', 'import sys; print("\\n".join(sorted(sys.stdlib_module_names)))'],
      { timeout: 5000 },
      (err: Error | null, stdout: string) => {
        if (err || !stdout.trim()) {
          stdlibModules = new Set();
        } else {
          stdlibModules = new Set(stdout.trim().split('\n'));
        }
        resolve(stdlibModules);
      }
    );
  });
}

export class ImportCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  // Cache: module name → whether it resolves to a workspace file.
  // Cleared on refresh (cell text change) so edits are picked up.
  private _localModuleCache = new Map<string, boolean>();

  refresh(): void {
    this._localModuleCache.clear();
    this._onDidChange.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (document.uri.scheme !== 'vscode-notebook-cell') {
      return [];
    }

    const text = document.getText();
    const lenses: vscode.CodeLens[] = [];

    // Export button for cells with top-level definitions
    if (HAS_DEFINITION.test(text)) {
      lenses.push(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: '⬡ Export',
          command: 'nbpeek.exportCell',
          arguments: [document.uri],
        })
      );
    }

    // Import peek lenses — only shown for symbols that resolve to workspace files.
    // Each module is resolved once and cached until the cell text changes.
    const symbols = parseImports(text);
    const stdlib = await getStdlibModules();

    for (const sym of symbols) {
      if (token.isCancellationRequested) { break; }

      // Skip standard library modules
      const topLevel = sym.module.split('.')[0];
      if (stdlib.has(topLevel)) { continue; }

      if (!this._localModuleCache.has(sym.module)) {
        const pos = new vscode.Position(sym.line, sym.column);
        const defs = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeDefinitionProvider', document.uri, pos
        );
        // Only cache if Pylance returned results. Empty/undefined means it may
        // still be indexing — leave uncached so the next refresh retries.
        if (defs?.length) {
          // Show peek for .py files not inside site-packages/dist-packages.
          // This covers workspace modules and editable installs (`pip install -e`).
          const isLocal = defs.some(d =>
            d.uri.scheme === 'file'
            && d.uri.fsPath.endsWith('.py')
            && !/[/\\](site|dist)-packages[/\\]/.test(d.uri.fsPath)
          );
          this._localModuleCache.set(sym.module, isLocal);
        }
      }

      if (!this._localModuleCache.get(sym.module)) { continue; }

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
