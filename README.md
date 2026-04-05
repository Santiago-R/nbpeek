# nbpeek

A VS Code extension that bridges the gap between `nbdev` enthusiasts and code-structure purists.

## The Problem

The `nbdev` community is split:

- **nbdev enthusiasts** are all for ergonomics. They want all the relevant tools at arm's reach, not to go wandering around a large codebase for simple experiments and optimizations.
- **nbdev opponents** are all for tidiness and purity. Screwdrivers belong in the screwdriver drawer, nuts and bolts should be neatly classified by size. Damn newbs come with their all-purpose trays (Jupyter notebooks) and make a mess of a nice workshop.

But wait! Software is more flexible than physical workshops! **nbpeek** satisfies both camps.

## The Idea

Notebooks contain imports plus experiments, visualizations, etc. Package code lives in `.py` files as single source of truth, organized by functional categories as purists prefer.

But when working in a notebook, you shouldn't have to leave it to play with that code.

**nbpeek** displays import statements as editable windows into your codebase:

1. You write `from mymodule import myfunc` in a notebook cell.
2. A "Show" button appears above the import.
3. Click it, and an inline editor opens showing `myfunc`'s source code. Yes, the actual `.py` file.
4. Edit directly. Changes are written to the `.py` file. The notebook cell stays untouched.

Full `nbdev` style locality of behavior. Full code-structure purity. No compromise on either camp.

## Architecture Roadmap

### Peek Definition (v0, current)

The simplest viable implementation leverages VS Code's built-in Peek Definition widget:

- **CodeLens provider** detects `from X import Y` statements in notebook cells and places a "Show Source" button above each import line.
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

- `vscode.languages.registerCodeLensProvider` — attach "Show Source" buttons to import lines.
- `vscode.commands.executeCommand('editor.action.peekDefinition')` — open the inline editor.
- `vscode.NotebookDocument` / `vscode.NotebookCell` — access notebook cell contents.
- `vscode.TextEditor.selection` — position cursor on the symbol before peeking.

### Import Detection Strategy

Parse cell text for Python import patterns:

- `from module import name1, name2`
- `from package.module import name`
- `import module` (lower priority)

Use regex for v0. Consider Python AST parsing if edge cases demand it.

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
```

## License

MIT
