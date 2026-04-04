# Figma Library Maintenance Tools — Agent Guide

You have access to a set of CLI tools for auditing a Figma design library. Each tool scans a Figma file and returns a JSON report of issues, with a direct `figmaUrl` link on every issue for navigation.

## Data Sources

These tools support two ways of getting Figma file data. The analysis is identical regardless of which path you use.

### Option 1: REST API (with token)

The `.env` file at the project root stores the API token and file key. It's loaded automatically — just run the commands:

```sh
cd figma-library-maintenance-tools
node src/tools/lint-layer-names/cli.js
```

To override credentials or target a branch:

```sh
node src/tools/lint-layer-names/cli.js -f <file-key> -t <token> -b <branch-key>
```

### Option 2: Figma MCP (no token needed)

When you have access to Figma's MCP `use_figma` tool, you can extract file data directly from the open Figma file and pipe it in with `--stdin`. No API token is required.

**Step 1 — Extract data using the MCP extraction scripts:**

```js
import { getFileScript, getLocalVariablesScript, getTextStylesScript } from './src/shared/mcp-scripts.js'

// Returns a Plugin API JavaScript string to pass to use_figma
const fileScript = getFileScript({ pageNames: ['Components'] })

// Only needed for autolayout and radius linters
const variablesScript = getLocalVariablesScript({ collectionFilter: 'spac(e|ing)' })

// Only needed for the text style linter
const textStylesScript = getTextStylesScript()
```

Call `use_figma` with each script. The returned data matches the shape of the Figma REST API, so all tools work identically.

**Step 2 — Pipe the data into any tool:**

```sh
# Most tools only need the file tree
cat data.json | node src/tools/lint-layer-names/cli.js --stdin -f <file-key>

# Autolayout and radius linters also need variable data:
# stdin JSON: { "fileData": { "document": ... }, "variablesData": { "meta": ... } }
cat full.json | node src/tools/lint-autolayout-values/cli.js --stdin -f <file-key>

# Text style linter optionally accepts text style data for suggestions:
# stdin JSON: { "fileData": { ... }, "textStylesData": [ ... ] }
cat full.json | node src/tools/lint-text-styles/cli.js --stdin -f <file-key>
```

> `--file-key` is still required with `--stdin` — it's used to build the `figmaUrl` links in the report.

**Programmatic usage (import directly, skip CLI):**

Every orchestrator accepts `fileData` directly. When provided, the REST API client is never created:

```js
import { lintLayerNames } from './src/tools/lint-layer-names/index.js'

const report = await lintLayerNames({
  fileKey: 'abc123',
  fileData: mcpResult,  // { document: { ... } }
})
```

## Available Tools

All tools output JSON by default. Every issue includes a `figmaUrl` field linking directly to the flagged node.

### Layer & naming hygiene

| Command | What it finds |
|---------|---------------|
| `figma-lint-names` | Layers with Figma default names (`Frame 1`, `Group 2`, `Vector`, etc.) |
| `figma-lint-duplicates` | Sibling layers that share the same name under a single parent |
| `figma-audit-properties` | Component properties with capitalized names, unrenamed defaults (`Property 1`), or mixed boolean prefixes (`show` vs `with`) |

### Variable & style binding

| Command | What it finds | Extra data needed |
|---------|---------------|-------------------|
| `figma-lint-autolayout` | Auto-layout padding/gap values not bound to a spacing variable | `variablesData` (REST API needs `file_variables:read` scope) |
| `figma-lint-radius` | Border radius values not bound to a radius variable | `variablesData` (REST API needs `file_variables:read` scope) |
| `figma-lint-text-styles` | Text nodes with hardcoded font settings instead of a shared text style | `textStylesData` (optional — enables suggested style matching) |

### Documentation & structure

| Command | What it finds |
|---------|---------------|
| `figma-check-descriptions` | Components and component sets with empty or missing descriptions |
| `figma-scan-pages` | Non-component items (stray frames, groups, instances) at the top level of published pages |

## Common Flags

```
-f, --file-key <key>         Figma file key (overrides FIGMA_FILE_KEY)
-t, --token <token>          Figma access token (overrides FIGMA_ACCESS_TOKEN)
-b, --branch <key>           Target a branch instead of the main file
-p, --pages <names>          Comma-separated page names to include
-x, --exclude-pages <names>  Comma-separated page names to exclude (takes precedence)
-s, --scope <scope>          "all" (default) or "components"
    --stdin                  Read pre-fetched Figma data from stdin (no token needed)
    --summary                Deduplicate issues into unique patterns with occurrence counts
    --format <fmt>           "json" (default) or "text"
-h, --help                   Show help for a specific tool
```

## Workflow

### 1. Run a scan

```sh
cd figma-library-maintenance-tools

# REST API (credentials from .env)
node src/tools/lint-layer-names/cli.js

# Scope to specific pages
node src/tools/lint-layer-names/cli.js -p "Components,Primitives"

# Exclude exploration pages
node src/tools/lint-layer-names/cli.js -x ".explorations,.archive"

# MCP path (pipe data in)
cat data.json | node src/tools/lint-layer-names/cli.js --stdin -f <file-key>
```

If the package has been linked (`npm link`), you can use the short commands:

```sh
figma-lint-names
figma-lint-names -p "Components"
```

### 2. Read the results

Every tool returns JSON with this shape:

```json
{
  "title": "Report Name",
  "summary": { ... },
  "issues": [
    {
      "nodeId": "123:456",
      "figmaUrl": "https://www.figma.com/design/<key>/?node-id=123-456",
      ...
    }
  ]
}
```

- **`summary`** — aggregate counts for quick severity assessment.
- **`issues`** — the array to iterate. Every issue has a `figmaUrl` for direct navigation.

### 3. Act on findings

- **`figma-lint-names`** — Report each generic name with its `suggestedName` and `figmaUrl`. Suggestions: `{childName}-wrapper` for single-child wrappers, `container` for multi-child frames, or the lowercased type for leaf nodes.
- **`figma-lint-duplicates`** — Report the parent node, the duplicated name, and count. Disambiguation requires context (e.g., `flex-leading` vs `flex-trailing`).
- **`figma-lint-autolayout`** — Check the `status` field: `bindable` = exact variable match exists; `off-scale` = no match, needs design decision; `exception` = intentional (negative values, structural 1px).
- **`figma-lint-radius`** — Same pattern as autolayout: `bindable` or `off-scale`.
- **`figma-lint-text-styles`** — Report each hardcoded text node. If `suggestedStyle` is present, recommend applying that text style.
- **`figma-check-descriptions`** — List each undescribed component with its link.
- **`figma-audit-properties`** — Report each violation. Check `toggleSummary` in the summary to understand the library's boolean prefix convention before suggesting renames.
- **`figma-scan-pages`** — Report each unexpected item with its type and link. These are typically stray instances or frames that should be moved or deleted.

### 4. Scope control for layer linters

By default, `figma-lint-names` scans **every node** on every page (`--scope all`). This catches stray frames and groups outside of components. To only scan inside components:

```sh
node src/tools/lint-layer-names/cli.js -s components
```

In `all` scope, nodes inside components retain component/variant context. Nodes outside components are reported with the page name as context.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No issues found |
| `1` | Issues found (report on stdout) |
| `2` | Runtime error (missing token, API failure, etc.) |

## Development

```sh
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

Each tool follows a three-layer architecture:

- `detect.js` — Pure detection functions, no API calls, no side effects
- `index.js` — Orchestrator: fetches data (or accepts `fileData`), calls detection, assembles report
- `cli.js` — Thin CLI wrapper: parses args, handles `--stdin`, formats output

Shared utilities in `src/shared/`:

- `figma-client.js` — REST API client
- `mcp-scripts.js` — Plugin API extraction scripts for Figma MCP `use_figma`
- `stdin.js` — Reads piped JSON from stdin
- `cli-utils.js` — Arg parsing, report formatting, summary deduplication
- `figma-urls.js` — Builds direct Figma node URLs
- `tree-traversal.js` — Depth-first node tree traversal
- `env.js` — Loads `.env` via dotenv