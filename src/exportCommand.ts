import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { getPython } from './python';

interface DefinitionInfo {
  name: string;
  kind: string;
  start: number; // 0-based line
  end: number;   // 0-based exclusive
}

const FIND_DEFS_PY = `
import ast, json, sys
source = sys.stdin.read()
tree = ast.parse(source)
defs = []
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        start = min(d.lineno for d in node.decorator_list) if node.decorator_list else node.lineno
        kind = "class" if isinstance(node, ast.ClassDef) else "function"
        defs.append({"name": node.name, "start": start - 1, "end": node.end_lineno, "kind": kind})
    elif isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name):
                defs.append({"name": t.id, "start": node.lineno - 1, "end": node.end_lineno, "kind": "assignment"})
    elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
        defs.append({"name": node.target.id, "start": node.lineno - 1, "end": node.end_lineno, "kind": "assignment"})
    elif isinstance(node, (ast.Import, ast.ImportFrom)):
        line = ast.get_source_segment(source, node) or ast.unparse(node)
        defs.append({"name": line, "start": node.lineno - 1, "end": node.end_lineno, "kind": "import"})
print(json.dumps(defs))
`.trim();

async function findDefinitions(code: string): Promise<DefinitionInfo[]> {
  const python = await getPython();
  return new Promise((resolve) => {
    const proc = execFile(python, ['-c', FIND_DEFS_PY], { timeout: 5000 }, (err: Error | null, stdout: string) => {
      if (err) { resolve([]); return; }
      try { resolve(JSON.parse(stdout)); } catch { resolve([]); }
    });
    proc.stdin?.write(code);
    proc.stdin?.end();
  });
}

function resolveCell(cellUri?: vscode.Uri): { cell: vscode.NotebookCell; notebook: vscode.NotebookDocument } | undefined {
  const uri = cellUri ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri || uri.scheme !== 'vscode-notebook-cell') { return; }
  for (const nb of vscode.workspace.notebookDocuments) {
    const cell = nb.getCells().find(c => c.document.uri.toString() === uri.toString());
    if (cell) { return { cell, notebook: nb }; }
  }
}

export async function exportCell(cellUri?: vscode.Uri): Promise<void> {
  const resolved = resolveCell(cellUri);
  if (!resolved) {
    vscode.window.showWarningMessage('nbpeek: Click inside a notebook cell first.');
    return;
  }
  const { cell, notebook } = resolved;

  const text = cell.document.getText();
  const defs = await findDefinitions(text);
  const importDefs = defs.filter(d => d.kind === 'import');
  const codeDefs = defs.filter(d => d.kind !== 'import');
  if (defs.length === 0) {
    vscode.window.showWarningMessage('nbpeek: No exportable definitions found.');
    return;
  }

  // Step 1: Select definitions and imports to include in the target module
  const items = [
    ...codeDefs.map(d => ({
      label: d.name,
      description: d.kind,
      picked: d.kind !== 'assignment',
      def: d,
    })),
    ...importDefs.map(d => ({
      label: d.name,
      description: 'import (added to target, kept in notebook)',
      picked: true,
      def: d,
    })),
  ];
  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'Select definitions to export',
  });
  if (!selected?.length) { return; }

  // Step 2: Select target module
  const wsFolder = vscode.workspace.getWorkspaceFolder(notebook.uri);
  if (!wsFolder) {
    vscode.window.showWarningMessage('nbpeek: Notebook must be in a workspace.');
    return;
  }
  const target = await pickTargetModule(wsFolder);
  if (!target) { return; }

  // Extract selected code and write to target
  const lines = text.split('\n');
  const selectedImports = selected.filter(s => s.def.kind === 'import').map(s => s.def);
  const selectedDefs = selected.filter(s => s.def.kind !== 'import').map(s => s.def);
  const importBlock = selectedImports
    .map(d => lines.slice(d.start, d.end).join('\n'))
    .join('\n');
  const defBlock = selectedDefs
    .map(d => lines.slice(d.start, d.end).join('\n'))
    .join('\n\n');
  const exportedCode = [importBlock, defBlock].filter(Boolean).join('\n\n');

  const targetUri = vscode.Uri.file(target.filePath);
  let existing = '';
  try {
    existing = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf-8');
  } catch { /* new file */ }

  try { await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target.filePath))); } catch { /* exists */ }

  const separator = existing ? (existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n') : '';
  await vscode.workspace.fs.writeFile(
    targetUri,
    Buffer.from(existing + separator + exportedCode + '\n', 'utf-8')
  );

  // Replace cell: remove exported definitions but keep imports in the notebook
  const exportedLines = new Set<number>();
  for (const d of selectedDefs) {
    for (let i = d.start; i < d.end; i++) { exportedLines.add(i); }
  }

  // Only rewrite the cell if definitions were exported (imports-only leaves cell unchanged)
  if (selectedDefs.length > 0) {
    const importStmt = `from ${target.modulePath} import ${selectedDefs.map(d => d.name).join(', ')}`;
    const remaining = lines.filter((_, i) => !exportedLines.has(i)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const newContent = remaining ? `${importStmt}\n${remaining}` : importStmt;

    const edit = new vscode.WorkspaceEdit();
    edit.replace(cell.document.uri, cell.document.validateRange(
      new vscode.Range(0, 0, cell.document.lineCount, 0)
    ), newContent);
    await vscode.workspace.applyEdit(edit);
  }

  vscode.window.showInformationMessage(
    `Exported to ${path.basename(target.filePath)}`
  );
}

async function pickTargetModule(
  wsFolder: vscode.WorkspaceFolder
): Promise<{ modulePath: string; filePath: string } | undefined> {
  const wsRoot = wsFolder.uri.fsPath;
  const pyFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(wsFolder, '**/*.py'),
    '**/__pycache__/**'
  );

  type PickItem = vscode.QuickPickItem & { filePath?: string; modulePath?: string };
  const fileItems: PickItem[] = pyFiles
    .sort((a, b) => a.fsPath.localeCompare(b.fsPath))
    .map(uri => {
      const rel = path.relative(wsRoot, uri.fsPath);
      const mod = rel.replace(/\.py$/, '').replace(/[\\/]/g, '.').replace(/\.__init__$/, '');
      return { label: mod, description: rel, filePath: uri.fsPath, modulePath: mod };
    });

  const pick = await vscode.window.showQuickPick<PickItem>(
    [{ label: '$(new-file) New file...' }, ...fileItems],
    { title: 'Export to which module?', placeHolder: 'Select a .py file or create a new one' }
  );
  if (!pick) { return; }
  if (pick.filePath && pick.modulePath) {
    return { filePath: pick.filePath, modulePath: pick.modulePath };
  }

  // New file
  const input = await vscode.window.showInputBox({
    prompt: 'Module path (e.g. mypackage.utils)',
    validateInput: v => /^\w+(\.\w+)*$/.test(v) ? null : 'Enter a valid dotted Python module name',
  });
  if (!input) { return; }

  const filePath = path.join(wsRoot, input.replace(/\./g, path.sep) + '.py');
  const normalizedTarget = path.resolve(filePath).toLowerCase();
  const normalizedRoot = (path.resolve(wsRoot) + path.sep).toLowerCase();
  if (!normalizedTarget.startsWith(normalizedRoot)) {
    vscode.window.showWarningMessage('nbpeek: Target must be within the workspace.');
    return;
  }
  return { filePath, modulePath: input };
}
