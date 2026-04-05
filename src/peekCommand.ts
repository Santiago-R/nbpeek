import * as vscode from 'vscode';

/** Map of cell URI → set of .py file URIs peeked from that cell. */
export const peekedFilesByCell = new Map<string, Set<string>>();

/**
 * Positions the cursor on the given symbol in the cell editor,
 * then triggers Peek Definition.
 */
export async function peekImport(
  cellUri: vscode.Uri,
  line: number,
  column: number,
  symbolName: string
): Promise<void> {
  // Find the visible editor for this notebook cell
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === cellUri.toString()
  );

  if (!editor) {
    vscode.window.showWarningMessage(
      `nbpeek: Could not find editor for cell. Try clicking inside the cell first.`
    );
    return;
  }

  // Place cursor on the symbol name
  const pos = new vscode.Position(line, column);
  editor.selection = new vscode.Selection(pos, pos.translate(0, symbolName.length));
  editor.revealRange(new vscode.Range(pos, pos));

  // Resolve the definition to track the target file for auto-save
  const defs = await vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeDefinitionProvider', cellUri, pos
  );
  if (defs) {
    for (const def of defs) {
      if (def.uri.fsPath.endsWith('.py')) {
        const cellKey = cellUri.toString();
        if (!peekedFilesByCell.has(cellKey)) {
          peekedFilesByCell.set(cellKey, new Set());
        }
        peekedFilesByCell.get(cellKey)!.add(def.uri.toString());
      }
    }
  }

  // Trigger peek definition — this uses Pylance's definition provider
  await vscode.commands.executeCommand('editor.action.peekDefinition', cellUri, pos);
}
