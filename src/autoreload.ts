import * as vscode from 'vscode';

const AUTORELOAD_CELL = `%load_ext autoreload\n%autoreload 2`;

/** Check if any cell in the notebook already has autoreload enabled. */
function hasAutoreload(notebook: vscode.NotebookDocument): boolean {
  for (const cell of notebook.getCells()) {
    if (cell.kind !== vscode.NotebookCellKind.Code) { continue; }
    const text = cell.document.getText();
    if (text.includes('%autoreload')) { return true; }
  }
  return false;
}

/** Insert a code cell at the top of the notebook with autoreload magic. */
async function injectAutoreload(notebook: vscode.NotebookDocument): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  const cell = new vscode.NotebookCellData(
    vscode.NotebookCellKind.Code, AUTORELOAD_CELL, 'python'
  );
  edit.set(notebook.uri, [vscode.NotebookEdit.insertCells(0, [cell])]);
  await vscode.workspace.applyEdit(edit);
}

/** Prompt the user to add autoreload if missing. Call when a notebook opens. */
export async function checkAutoreload(notebook: vscode.NotebookDocument): Promise<void> {
  if (notebook.notebookType !== 'jupyter-notebook') { return; }
  if (hasAutoreload(notebook)) { return; }

  const choice = await vscode.window.showInformationMessage(
    'Recommended: Add %autoreload at top cell so edits to .py files take effect without restarting the kernel?',
    'Add cell',
    'Dismiss'
  );

  if (choice === 'Add cell') {
    await injectAutoreload(notebook);
  }
}
