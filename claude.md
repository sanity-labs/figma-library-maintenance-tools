# Figma Library Maintenance Tools — Agent Guide

A set of CLI tools for auditing a Figma design library. Each tool scans a Figma file and returns a JSON report with a `figmaUrl` on every issue for direct navigation.

## Running Tools

The fastest way — no setup required beyond `npm install`:

```sh
npx figma-lint-names
npx figma-lint-autolayout -p "Components,Primitives"
```

Or use `node` directly:

```sh
node src/tools/lint-layer-names/cli.js
node src/tools/lint-layer-names/cli.js -p "Components,Primitives"
```

Credentials are loaded from `.env` automatically. Override on the command line:

```sh
npx figma-lint-names -f <file-key> -t <token> -b <branch-key>
```

## Token Scopes

Most tools only need `file_content:read`. The autolayout and radius linters additionally require `file_variables:read`. If you hit a 403 scope error, generate a new token with both scopes checked.

| Token scope | Tools that require it |
|-------------|----------------------|
| `file_content:read` | All tools |
| `file_variables:read` | `figma-lint-autolayout`, `figma-lint-radius` |

## Data Sources

Tools support two ways of getting Figma data. Analysis is identical either way.

### Option 1: REST API

Set `FIGMA_ACCESS_TOKEN` and `FIGMA_FILE_KEY` in `.env`. Run any tool with no extra flags.

### Option 2: Figma MCP (no token needed)

When you have access to the Figma MCP `use_figma` tool, extract data directly from the open Figma file and pipe it in via `--stdin`.

**Step 1 — Generate the extraction scripts:**

```js
import { getFileScript, getLocalVariablesScript, getTextStylesScript } from './src/shared/mcp-scripts.js'

const fileScript = getFileScript({ pageNames: ['Components', 'Primitives'] })
const variablesScript = getLocalVariablesScript()   // autolayout + radius only
const textStylesScript = getTextStylesScript()       // text style linter only
```

Pass each script string to `use_figma` as the `code` parameter. Save the results to JSON files.

> **MCP truncation limit:** The `use_figma` tool response is capped at ~20kb. For large files, extract one page at a time and concatenate the `children` arrays before piping.

**Step 2 — Pipe into tools:**

```sh
# Most tools (fileData only)
cat data.json | npx figma-lint-names --stdin -f <file-key>

# Autolayout + radius (needs variablesData)
# stdin JSON: { "fileData": { "document": ... }, "variablesData": { "meta": ... } }
cat full.json | npx figma-lint-autolayout --stdin -f <file-key>

# Text style linter (optional textStylesData)
# stdin JSON: { "fileData": { ... }, "textStylesData": [ ... ] }
cat full.json | npx figma-lint-text-styles --stdin -f <file-key>
```

`--file-key` is still required with `--stdin` — it builds the `figmaUrl` links in the report.

**Programmatic usage (skip the CLI entirely):**

```js
import { lintLayerNames } from './src/tools/lint-layer-names/index.js'

const report = await lintLayerNames({
  fileKey: 'abc123',
  fileData: mcpResult,  // { document: { ... } }
})
```

## Available Tools

### Naming & layer hygiene

| Command | What it finds | Notes |
|---------|---------------|-------|
| `figma-lint-names` | Layers with Figma default names (`Frame 1`, `Group 2`, `Vector`) | Use `-s components` to limit to inside components |
| `figma-lint-duplicates` | Sibling layers sharing the same name under one parent | |
| `figma-lint-casing` | TEXT layers inside components not using lowercase names | Use `--all-layers` to check all layer types |
| `figma-audit-properties` | Component properties with capitalized names, unrenamed defaults, or mixed boolean prefixes | |

### Variable & style binding

| Command | What it finds | Extra data |
|---------|---------------|------------|
| `figma-lint-autolayout` | Auto-layout padding/gap values not bound to a spacing variable | `variablesData` — needs `file_variables:read` scope |
| `figma-lint-radius` | Border radius values not bound to a radius variable | `variablesData` — needs `file_variables:read` scope |
| `figma-lint-text-styles` | Text nodes with hardcoded font settings, no text style applied | `textStylesData` optional — enables style suggestions |

### Component structure

| Command | What it finds |
|---------|---------------|
| `figma-lint-variants` | Single-value variant properties, duplicate variant names, missing matrix combinations |
| `figma-lint-layer-order` | Variant layer ordering inconsistencies, misplaced background/overlay layers |
| `figma-check-descriptions` | Components and component sets with empty or missing descriptions |
| `figma-audit-properties` | Property naming convention violations |
| `figma-scan-pages` | Non-component items at the top level of published pages |

### Canvas & file hygiene

| Command | What it finds |
|---------|---------------|
| `figma-lint-canvas` | Pages whose content doesn't start at (0, 0), page names with whitespace |

### Accessibility

| Command | What it finds |
|---------|---------------|
| `figma-audit-a11y-target-sizes` | Interactive components below WCAG 2.5.8 24×24px threshold |
| `figma-audit-a11y-states` | Missing focused/disabled/invalid/readOnly states on interactive components |
| `figma-audit-a11y-descriptions` | Interactive components without accessibility notes in their descriptions |

### Utilities

| Command | What it does |
|---------|--------------|
| `figma-run-script` | Prints a Plugin API script to stdout for piping to `use_figma` |

## Common Flags

```
-f, --file-key <key>         Figma file key (overrides FIGMA_FILE_KEY)
-t, --token <token>          Figma access token (overrides FIGMA_ACCESS_TOKEN)
-b, --branch <key>           Target a branch instead of the main file
-p, --pages <names>          Comma-separated page names to include
-x, --exclude-pages <names>  Comma-separated page names to exclude (takes precedence)
-s, --scope <scope>          "all" (default) or "components"
    --stdin                  Read pre-fetched Figma data from stdin
    --summary                Deduplicate issues into unique patterns with counts
    --format <fmt>           "json" (default) or "text"
-h, --help                   Show help for the specific tool
```

## Report Shape

Every tool returns JSON in this shape:

```json
{
  "title": "Report Name",
  "summary": { "total": 12, ... },
  "issues": [
    {
      "nodeId": "123:456",
      "figmaUrl": "https://www.figma.com/design/<key>/?node-id=123-456",
      "componentName": "Button",
      "variantName": "size=sm, variant=primary"
    }
  ]
}
```

Use `figmaUrl` on every issue to navigate directly to the flagged node. Use `--summary` to collapse identical patterns into occurrence counts.

## Acting on Findings

- **`figma-lint-names`** — Each issue has a `suggestedName`. Apply it or rename to something contextually appropriate.
- **`figma-lint-autolayout`** — Check `status`: `bindable` means an exact variable match exists; `off-scale` means no match and a design decision is needed; `exception` is intentional (negative values, structural 1px).
- **`figma-lint-radius`** — Same `status` pattern as autolayout.
- **`figma-lint-text-styles`** — If `suggestedStyle` is present, apply it. Otherwise the node needs a matching style created.
- **`figma-audit-properties`** — Check `toggleSummary` in the summary first to understand the library's boolean prefix convention before suggesting renames.
- **`figma-lint-layer-order`** — A `fix-script.js` is included at `src/tools/lint-layer-order/fix-script.js`. Set `COMPONENT_SET_ID` and run via `use_figma`.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No issues found |
| `1` | Issues found (report on stdout) |
| `2` | Runtime error (missing token, API failure, etc.) |

## Architecture

Each tool is three files:

- `detect.js` — Pure detection functions, no API calls, fully testable
- `index.js` — Orchestrator: fetches data (or accepts `fileData`), calls detect, assembles report
- `cli.js` — Thin wrapper: parses args, handles `--stdin`, formats output

Shared utilities in `src/shared/`:

- `figma-client.js` — REST API client
- `mcp-scripts.js` — Plugin API extraction scripts for MCP `use_figma`
- `stdin.js` — Reads piped JSON from stdin
- `cli-utils.js` — Arg parsing, report formatting, summary deduplication
- `figma-urls.js` — Builds direct Figma node URLs
- `tree-traversal.js` — Depth-first node tree traversal
- `env.js` — Loads `.env` via dotenv
- `script-emitter.js` — Strips ESM syntax for Plugin API sandbox compatibility
