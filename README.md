# nbpeek

A VS Code extension for editing Python module code directly from Jupyter notebooks. Write `from mymodule import myfunc`, click a button, and edit `myfunc` inline. Changes write to the `.py` file.

## Usage

1. Open a Jupyter notebook in VS Code.
2. Write an import like `from mymodule import myfunc` in a code cell.
3. A `⬡ Show myfunc` button appears above the import line.
4. Click it — an inline editor opens showing the function's source code from the actual `.py` file.
5. Edit directly. Changes are saved to the `.py` file automatically when you switch away or run the cell.
6. The notebook cell stays untouched — it still just has the import.

Multi-line parenthesized imports are supported:

```python
from mymodule import (
    func_a,
    func_b,
)
```

### Autoreload

When you open a notebook, nbpeek offers to add `%load_ext autoreload` / `%autoreload 2` as the first cell so that edits to `.py` files take effect immediately without restarting the kernel.

### Auto-save

Files edited through the peek widget are saved automatically:

- When you switch to a different editor.
- When you execute the cell that peeked into the file.

## Requirements

- [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) (includes Pylance for symbol resolution)
- [Jupyter extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter)

## Motivation

The `nbdev` community is split:

- **nbdev enthusiasts** are all for ergonomics. They want all the relevant tools at arm's reach, not to go wandering around a large codebase for simple experiments and optimizations.
- **nbdev opponents** are all for tidiness and purity. Screwdrivers belong in the screwdriver drawer, nuts and bolts should be neatly classified by size. Damn newbs come with their all-purpose trays (Jupyter notebooks) and make a mess of a nice workshop.

But wait! Software is more flexible than physical workshops!

**nbpeek** takes a different approach from `nbdev`. There are no magic comments or automatic export workflows. Package code lives in `.py` files as the single source of truth, organized however you prefer. Notebooks contain imports plus experiments, visualizations, etc. **nbpeek** simply gives you editable windows into your codebase without leaving the notebook.

## Architecture Roadmap

### Peek Definition (v0, current)

The simplest viable implementation leverages VS Code's built-in Peek Definition widget:

- **CodeLens provider** detects `from X import Y` statements in notebook cells and places a `⬡ Show` button above each imported symbol.
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
- Auto-expand on cell execution.

### Future: VS Code API Proposal (v2)

A public `ZoneWidget` API for persistent embedded editors — the ideal solution, requiring upstream VS Code support.

## Development Notes

### Key VS Code APIs

- `vscode.languages.registerCodeLensProvider` — attach `⬡ Show` buttons to import lines.
- `vscode.commands.executeCommand('editor.action.peekDefinition')` — open the inline editor.
- `vscode.executeDefinitionProvider` — resolve symbol locations for auto-save tracking.
- `vscode.NotebookDocument` / `vscode.NotebookCell` — access notebook cell contents.
- `vscode.workspace.onDidChangeNotebookDocument` — detect cell execution for auto-save.

### Import Detection Strategy

Parse cell text for `from module import name1, name2` patterns, including multi-line parenthesized forms. Uses regex with a normalization pass that collapses multi-line imports.

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
