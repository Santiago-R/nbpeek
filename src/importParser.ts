/**
 * Parse Python import statements from cell text.
 * Returns an array of imported symbols with their positions.
 */

export interface ImportedSymbol {
  /** The symbol name (e.g. "myfunc") */
  name: string;
  /** The module path (e.g. "mypackage.mymodule") */
  module: string;
  /** Line number within the cell (0-based) — points to the `from` line */
  line: number;
  /** Column offset of the symbol name within the line */
  column: number;
}

const FROM_IMPORT_RE = /^from\s+([\w.]+)\s+import\s+(.+)$/;

/**
 * Collapse multi-line parenthesized imports into single lines.
 * "from x import (\n  a,\n  b\n)" becomes "from x import a, b" on the first line,
 * with subsequent lines blanked out to preserve line numbering.
 * Comments are stripped per-line before collapsing to avoid losing names.
 */
function normalizeImports(lines: string[]): string[] {
  const out = [...lines];
  for (let i = 0; i < out.length; i++) {
    const trimmed = out[i].trim();
    if (!/^from\s+[\w.]+\s+import\s*\(/.test(trimmed)) { continue; }
    if (trimmed.includes(')')) { continue; } // single-line parens, already fine

    // Accumulate until closing paren, stripping comments per line
    let combined = stripInlineComment(trimmed);
    let j = i + 1;
    while (j < out.length) {
      const stripped = stripInlineComment(out[j]);
      combined += ' ' + stripped.trim();
      out[j] = '';
      if (stripped.includes(')')) { break; }
      j++;
    }
    out[i] = combined.replace(/[()]/g, '').replace(/\s+/g, ' ');
  }
  return out;
}

/** Remove trailing # comments from a line (outside of strings). */
function stripInlineComment(line: string): string {
  return line.replace(/#.*$/, '');
}

export function parseImports(cellText: string): ImportedSymbol[] {
  const results: ImportedSymbol[] = [];
  const originalLines = cellText.split('\n');
  const lines = normalizeImports(originalLines);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    const match = FROM_IMPORT_RE.exec(line);
    if (!match) { continue; }

    const module = match[1];
    const namesStr = match[2];

    const cleaned = namesStr.replace(/[()]/g, '').trim();
    const withoutComment = cleaned.replace(/#.*$/, '').trim();
    const names = withoutComment.split(',').map(n => n.trim()).filter(n => n.length > 0);

    for (const name of names) {
      const actualName = name.split(/\s+as\s+/)[0].trim();
      if (!actualName || actualName === '*') { continue; }

      // Find the symbol's real position in the original (un-normalized) text
      const pos = findSymbolPosition(originalLines, lineIdx, actualName);

      results.push({
        name: actualName,
        module,
        line: pos.line,
        column: pos.column,
      });
    }
  }

  return results;
}

/** Locate a symbol name in the original lines, starting from importLine downward. */
function findSymbolPosition(
  lines: string[], importLine: number, name: string
): { line: number; column: number } {
  for (let i = importLine; i < lines.length; i++) {
    const importIdx = i === importLine ? lines[i].indexOf('import') : 0;
    const col = lines[i].indexOf(name, importIdx);
    if (col >= 0) { return { line: i, column: col }; }
  }
  return { line: importLine, column: 0 };
}
