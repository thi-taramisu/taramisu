# Markdown Linting Guide

This repository enforces consistent Markdown formatting across all documentation, templates, and README files
using [markdownlint](https://github.com/DavidAnson/markdownlint) and
[markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2).

---

## 1. Quick Start: Local Linting

You can run the linter directly without installing anything globally via `npx` (requires Node.js $\ge 20$):

```bash
# Check all Markdown files in the repository
npx markdownlint-cli2

# Automatically fix fixable issues (whitespace, list indentation, line breaks)
npx markdownlint-cli2 --fix
```

The CLI automatically reads our root configuration files (`.markdownlint.yaml` and `.markdownlint-cli2.yaml`)
and respects `.gitignore`, so `node_modules`, build artifacts, and local scratch files are ignored.

---

## 2. Editor Integration (VS Code)

For live feedback while writing Markdown, install the official extension:

* **Extension:** `DavidAnson.vscode-markdownlint` ([VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint))
* The extension automatically picks up `.markdownlint.yaml` in the workspace root.
* You can configure auto-formatting on save in your VS Code settings (`settings.json`):

```json
{
  "[markdown]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "DavidAnson.vscode-markdownlint"
  }
}
```

---

## 3. Configured Rules & Defaults

Our rules are defined in [`.markdownlint.yaml`](../../../.markdownlint.yaml) with developer convenience in mind:

| Rule | Configuration | Rationale |
| :--- | :--- | :--- |
| `MD013` (line-length) | `line_length: 140`<br>`code_blocks: false`<br>`tables: false`<br>`headings: false` | 140 characters for prose; prevents awkward breaks in code snippets, tables, and headings. |
| `MD033` (no-inline-html) | Allowed: `<details>`, `<summary>`, `<br>`, `<img>`, `<kbd>`, `<sub>`, `<sup>` | Enables collapsible sections, badges, keyboard shortcuts, and image sizing. |
| `MD024` (no-duplicate-heading) | `siblings_only: true` | Allows repeating identical subheadings (e.g. `### Overview`) in different sections. |
| `MD026` (no-trailing-punctuation) | `punctuation: ".,;:!"` | Allows question marks (`?`) in headings (e.g. FAQ entries or rhetorical questions). |
| `MD029` (ol-prefix) | `style: "ordered"` | Ordered lists follow increasing numbers (`1.`, `2.`, `3.`). |
| `MD041` (first-line-heading) | `false` | Allows files starting with badges, front matter, or PR/issue templates starting with H2. |

---

## 4. Continuous Integration (CI)

Every pull request runs the `markdown` job in [`.github/workflows/lint.yml`](../../../.github/workflows/lint.yml).
The job only executes when Markdown files or lint configurations are touched (via `dorny/paths-filter`).
Any lint error will block the aggregating `Lint result` status check.
