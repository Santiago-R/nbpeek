import * as vscode from 'vscode';

export async function getPython(): Promise<string> {
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
