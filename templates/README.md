# Templates

Parameterized Plugin API scripts for **building** Figma components programmatically. Sibling category to the CLI lints in this repo — separate because they serve a different purpose and run in a different environment.

| | CLI lints (`packages/figma-lint-*`) | Templates (`templates/*`) |
|---|---|---|
| Purpose | Audit existing components | Build new components |
| Runtime | Node.js, REST API or `--stdin` | Figma plugin runtime via MCP `use_figma` |
| Surface | Read-only checks, exit codes | Mutates the Figma file |
| Reusability | Same lint, many files | Same template, many components |

Each template is a single self-contained `build.js` with a `CONFIG` block and an `ENGINE` block. Edit the CONFIG, run via the MCP, get a component set. The ENGINE block doesn't change between uses.

---

## Available templates

| Template | What it builds | First used for |
|---|---|---|
| [`scalar-primitive`](./scalar-primitive/) | A component set with 1–2 VARIANT axes that bind padding, radius, fill, and stroke to design tokens | Card.v4 (2026-04-30) |

---

## How to run a template

1. Open the template's `build.js` and edit the `CONFIG` block.
2. Pass the full file contents as the `code` parameter to the Figma MCP `use_figma` tool, with the target file's `fileKey`.
3. The script returns a JSON summary. Verify per the template's README before considering it done.

These scripts are designed for agentic use — Claude (or another agent) reads the CONFIG schema from the README, fills it in based on the source-of-truth code component, and runs the script. They're equally usable by hand if you're comfortable in the Plugin API.

---

## Adding a new template

Add a new sibling directory under `templates/` with its own `build.js` + `README.md`. Don't bend an existing template to fit a different component shape — write a new one. Promote shared helpers to `templates/_shared/` only after the same code appears in two templates.

The bar for adding a template:
- The pattern has been used at least once on a real component
- The CONFIG block is small enough that a new caller can fill it in without reading the engine
- Known Figma quirks are documented in the template's README, not buried in code comments
