import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';

const EXPORT_RE = /^#\|\s*export\s+([\w.]+)\s*$/;

const FIND_NAMES_PY = `
import ast, json, sys
tree = ast.parse(sys.stdin.read())
names = []
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        names.append(node.name)
    elif isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name):
                names.append(t.id)
    elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
        names.append(node.target.id)
print(json.dumps(names))
`.trim();

/** Parse `#| export module` from the first line. Returns module name or null. */
export function parseExportDirective(text: string): string | null {
  const firstLine = text.split('\n')[0].trim();
  const m = EXPORT_RE.exec(firstLine);
  return m ? m[1] : null;
}

/** Find all top-level defined names using Python's ast module. */
async function findDefinedNames(code: string): Promise<string[]> {
  const python = await getPython();
  if (!python) {
    vscode.window.showWarningMessage('nbpeek: Could not find Python interpreter.');
    return [];
  }
  return new Promise((resolve) => {
    const proc = execFile(python, ['-c', FIND_NAMES_PY], { timeout: 5000 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      try { resolve(JSON.parse(stdout)); } catch { resolve([]); }
    });
    proc.stdin?.write(code);
    proc.stdin?.end();
  });
}

/** Get the Python path from the active interpreter or fall back to 'python'. */
async function getPython(): Promise<string | undefined> {
  try {
    const ext = vscode.extensions.getExtension('ms-python.python');
    if (ext) {
      if (!ext.isActive) { await ext.activate(); }
      const api = ext.exports;
      const envPath = api?.environments?.getActiveEnvironmentPath?.();
      if (envPath?.path) { return envPath.path; }
    }
  } catch { /* ignore */ }
  return 'python';
}

/** Export cell code to a .py file and replace the cell with an import. */
export async function exportCell(cellUri: vscode.Uri): Promise<void> {
  // Resolve the notebook containing this cell
  const notebook = vscode.workspace.notebookDocuments.find(nb =>
    nb.getCells().some(c => c.document.uri.toString() === cellUri.toString())
  );
  if (!notebook) { return; }

  const cell = notebook.getCells().find(
    c => c.document.uri.toString() === cellUri.toString()
  );
  if (!cell) { return; }

  const text = cell.document.getText();
  const moduleName = parseExportDirective(text);
  if (!moduleName) { return; }

  // Validate module name — no path traversal or absolute paths
  if (moduleName.startsWith('.') || path.isAbsolute(moduleName)) {
    vscode.window.showWarningMessage('nbpeek: Module name must be a simple dotted name (e.g. "mypackage.utils").');
    return;
  }

  // Strip the directive line to get the code to export
  const codeLines = text.split('\n').slice(1);
  const code = codeLines.join('\n').trimEnd();

  if (!code) {
    vscode.window.showWarningMessage('nbpeek: No code to export.');
    return;
  }

  // Resolve target .py file relative to the workspace root
  const wsFolder = vscode.workspace.getWorkspaceFolder(notebook.uri);
  if (!wsFolder) {
    vscode.window.showWarningMessage('nbpeek: Notebook must be in a workspace to export.');
    return;
  }
  const wsRoot = wsFolder.uri.fsPath;
  const targetPath = path.resolve(wsRoot, moduleName.replace(/\./g, '/') + '.py');
  const targetUri = vscode.Uri.file(targetPath);

  // Verify target stays within the workspace
  if (!targetPath.startsWith(wsRoot)) {
    vscode.window.showWarningMessage('nbpeek: Export target must be within the workspace.');
    return;
  }

  // Read existing file content (if any)
  let existing = '';
  try {
    const bytes = await vscode.workspace.fs.readFile(targetUri);
    existing = Buffer.from(bytes).toString('utf-8');
  } catch { /* file doesn't exist yet */ }

  // Check for duplicate — see if this exact code block is already in the file
  if (existing && existing.includes(code.trim())) {
    vscode.window.showWarningMessage('nbpeek: This code already exists in ' + path.basename(targetPath) + '.');
    return;
  }

  // Build import statement from defined names
  const names = await findDefinedNames(code);
  if (names.length === 0) {
    vscode.window.showWarningMessage('nbpeek: No importable names found (def, class, or assignment).');
    return;
  }
  const replacement = `from ${moduleName} import ${names.join(', ')}`;

  // Confirm before writing
  const label = names.length > 0
    ? `Export ${names.join(', ')} to ${path.basename(targetPath)}?`
    : `Export code to ${path.basename(targetPath)}?`;
  const choice = await vscode.window.showInformationMessage(label, 'Export', 'Cancel');
  if (choice !== 'Export') { return; }

  // Ensure parent directories exist
  const targetDir = vscode.Uri.file(path.dirname(targetPath));
  try { await vscode.workspace.fs.createDirectory(targetDir); } catch { /* already exists */ }

  // Append code to the file
  const separator = existing && !existing.endsWith('\n\n') ? '\n\n' : existing ? '\n' : '';
  const newContent = existing + separator + code + '\n';
  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(newContent, 'utf-8'));

  // Replace cell content with import
  const edit = new vscode.WorkspaceEdit();
  const fullRange = cell.document.validateRange(
    new vscode.Range(0, 0, cell.document.lineCount, 0)
  );
  edit.replace(cell.document.uri, fullRange, replacement);
  await vscode.workspace.applyEdit(edit);

  vscode.window.showInformationMessage(`Exported to ${path.basename(targetPath)}`);
}
