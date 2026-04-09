# nbpeek

A VS Code extension for notebook-driven Python development. Edit module code inline from your notebook, and export notebook definitions to modules when they're ready, all without leaving the notebook, while building a package of `.py` files as the single source of truth.

## Usage

### Peek: interact with module code from the notebook

1. A `⬡ Show my_function` button appears above import lines.
2. On click, an inline editor opens showing the function's source from the actual `.py` file.
3. Changes are saved to the `.py` file automatically.
4. The notebook cell stays untouched — it still just has the import.

### Export: move notebook code into modules

When a cell contains top-level `def` or `class` definitions, an `⬡ Export` button appears:

1. Click `⬡ Export` (or run **nbpeek: Export Definitions** from the command palette for any cell).
2. A multi-select picker shows all definitions in the cell. Functions and classes are pre-selected; assignments are available but unchecked.
3. Choose a target `.py` file from the workspace, or create a new module.
4. Selected definitions are appended to the target file. The cell is updated with an import statement, and any remaining code stays in the cell.

This closes the notebook development loop: prototype in the notebook, then promote to a module with a few clicks, then continue to iterate and edit module  code from the notebook. Module and notebook code stay clean and require no upkeep.

### Autoreload

When you open a notebook, nbpeek recommends the automatic addition of `%load_ext autoreload` / `%autoreload 2` as the first cell so that edits to `.py` files take effect immediately without restarting the kernel.

### Auto-save

Files edited through the peek widget are saved automatically:

- When you switch to a different editor.
- When you execute the cell that peeked into the file.

## Requirements

- [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) (includes Pylance for symbol resolution)
- [Jupyter extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter)

## Motivation

The developer community is split:

- **nbdev enthusiasts** are all for ergonomics. They want all the relevant tools at arm's reach, not to go wandering around a large codebase for simple experiments and optimizations.
- **nbdev opponents** are all for tidiness and purity. Screwdrivers belong in the screwdriver drawer, nuts and bolts should be neatly classified by size. Damn newbs come with their all-purpose trays (Jupyter notebooks) and make a mess of a nice workshop.

But wait! Software is more flexible than physical workshops!

**nbpeek** is inspired by `nbdev` but takes a less disruptive approach that will satisfy your purist colleagues. Notebook-based package development ergonomics are maintained, while the codebase keeps a structure that follows conventional best practices. Package `.py` files as the single source of truth, with notebooks containing imports, experiments, visualizations... There are no magic comments or automatic export workflows.

**nbpeek** gives you two tools: editable windows into your codebase (peek), and simple promotion of notebook code into modules (export). Together, these close the loop on full notebook-driven development without deviating from a conventional repository structure.

## Architecture Roadmap

### Peek Definition (v0, current)

The simplest viable implementation leverages VS Code's built-in Peek Definition widget:

- **CodeLens provider** detects `from X import Y` statements in notebook cells and places a `⬡ Show` button above each imported symbol. Cells with top-level `def` or `class` definitions get an `⬡ Export` button.
- On click, the cursor is positioned on the imported symbol and `editor.action.peekDefinition` is triggered.
- VS Code opens its native inline editor, backed by the real `.py` file, with full Pylance support (autocomplete, type checking, go-to-definition inside the peek).
- Edits in the peek widget write directly to the `.py` file.

**Limitations of v0:**

- Peek is ephemeral (dismisses on outside click or Escape).
- No custom styling.
- One peek at a time per editor.
- User must click per function, no "expand all" option.

### Future: Custom Renderer (v1)

A custom notebook renderer with embedded Monaco editors, enabling:

- Persistent, collapsible inline views with custom styling.
- Multiple expanded functions visible simultaneously.

### Future: VS Code API Proposal (v2)

A public `ZoneWidget` API for persistent embedded editors — the ideal solution, requiring upstream VS Code support.

## Development Notes

### Key VS Code APIs

- `vscode.languages.registerCodeLensProvider` — attach `⬡ Show` and `⬡ Export` buttons to cells.
- `vscode.commands.executeCommand('editor.action.peekDefinition')` — open the inline editor.
- `vscode.executeDefinitionProvider` — resolve symbol locations for auto-save tracking.
- `vscode.NotebookDocument` / `vscode.NotebookCell` — access notebook cell contents.
- `vscode.workspace.onDidChangeNotebookDocument` — detect cell execution for auto-save.
- `vscode.window.showQuickPick` — definition and target file selection for export.

### Import Detection Strategy

Parse cell text for `from module import name1, name2` patterns, including multi-line parenthesized forms. Uses regex with a normalization pass that collapses multi-line imports.

### Export Detection Strategy

The `⬡ Export` CodeLens appears on cells matching `/^(async\s+)?def\s+|^class\s+/m` (top-level definitions). On click, Python's `ast` module extracts all top-level definitions with their exact line ranges, supporting decorated functions/classes. The user selects which definitions to export via a multi-select QuickPick.

### Symbol Resolution

Rely on VS Code's built-in definition provider (`vscode.executeDefinitionProvider`). This delegates to Pylance, which already handles:

- Relative imports
- Package imports
- `__init__.py` re-exports
- Installed packages (though peeking into those is less useful)

### Activation

Activate on notebook open (`onNotebook:jupyter-notebook`). Register CodeLens provider for `python` language in notebook cell context.

## Getting Started

```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
# Open a Jupyter notebook with a Python kernel
```

## License

MIT
