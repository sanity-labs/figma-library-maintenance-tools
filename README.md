# Figma Library Maintenance Tools

A collection of single-purpose CLI tools that audit and maintain Figma design libraries. Supports two data sources: the **Figma REST API** (with a personal access token) and the **Figma MCP** `use_figma` tool (no token needed). Built for agentic workflows but works great for humans too.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Using with Figma MCP (no API token)](#using-with-figma-mcp-no-api-token)
- [Tools](#tools)
  - [1. Generic Layer Name Linter](#1-generic-layer-name-linter)
  - [2. Duplicate Sibling Name Detector](#2-duplicate-sibling-name-detector)
  - [3. Unbound Auto-Layout Value Detector](#3-unbound-auto-layout-value-detector)
  - [4. Component Description Coverage Checker](#4-component-description-coverage-checker)
  - [5. Property Naming Convention Auditor](#5-property-naming-convention-auditor)
  - [6. Page Hygiene Scanner](#6-page-hygiene-scanner)
- [Programmatic Usage](#programmatic-usage)
- [Exit Codes](#exit-codes)
- [Development](#development)

---

## Installation

Requires **Node.js 18+**.

```sh
# Clone the repository
git clone <repo-url>
cd figma-library-maintenance-tools

# Install dependencies
npm install

# (Optional) Link CLI commands globally
npm link
```

## Configuration

Every tool needs a **Figma personal access token** and a **file key**.

### Environment Variables

Create a `.env` file in the project root (see `.env.example`). The tools automatically load this file at startup via [dotenv](https://github.com/motdotla/dotenv), so there's no need to `source` or `export` manually:


The file key is the alphanumeric string in your Figma file URL:

```
https://www.figma.com/design/<FILE_KEY>/File-Name
```

> **Tip:** Variables already set in your shell or CI environment are never overwritten by the `.env` file.

### Figma Branches

When working on a Figma branch, provide the branch's own file key via `--branch` / `-b` or the `FIGMA_BRANCH_KEY` environment variable. When a branch key is present it is used for all API calls instead of the base file key — Figma branches are accessed through the same REST API endpoints using their own unique key.

```sh
# Run a tool against a branch
figma-lint-names -b <branch-file-key>

# Or set it in .env for the duration of a session
FIGMA_BRANCH_KEY=branchABC123
```

### CLI Flags

Flags override environment variables:

| Flag | Short | Description |
|------|-------|-------------|
| `--file-key` | `-f` | Figma file key |
| `--token` | `-t` | Figma personal access token |
| `--branch` | `-b` | Figma branch key (overrides file key for API calls) |
| `--pages` | `-p` | Comma-separated page names to include in the audit |
| `--exclude-pages` | `-x` | Comma-separated page names to exclude (takes precedence over `--pages`) |
| `--scope` | `-s` | Scan scope: `all` (default) or `components` (lint-layer-names only) |
| `--stdin` | | Read pre-fetched Figma data from stdin instead of calling the REST API (no token needed) |
| `--format` | | Output format: `json` (default) or `text` |
| `--help` | `-h` | Show help |

### Using with Figma MCP (no API token)

When running inside Claude Desktop or any MCP-connected environment, you can extract file data via the Figma MCP `use_figma` tool and pipe it into the CLI tools — no Figma API token required.

**How it works:**

1. The MCP `use_figma` tool runs a Plugin API script inside the Figma file and returns the document tree as JSON.
2. You pipe that JSON into any CLI tool with the `--stdin` flag.
3. The tool runs its analysis on the pre-fetched data, identical to the REST API path.

**Step 1 — Extract data via MCP:**

Use the scripts from `src/shared/mcp-scripts.js`:

```js
import { getFileScript, getLocalVariablesScript } from 'figma-library-maintenance-tools/src/shared/mcp-scripts.js'

// These return Plugin API JavaScript strings to pass to use_figma
const fileScript = getFileScript({ pageNames: ['Components'] })
const variablesScript = getLocalVariablesScript({ collectionFilter: 'spac(e|ing)' })  // only needed for autolayout linter
```

Or call `use_figma` directly with the extraction script — it returns the full document tree in the same shape as the Figma REST API.

**Step 2 — Pipe into CLI tools:**

```bash
# Pipe saved MCP output into any tool (no --token needed)
cat figma-data.json | figma-lint-names --stdin -f <file-key>

# For the autolayout linter, stdin JSON must include both keys:
# { "fileData": { "document": ... }, "variablesData": { "meta": ... } }
cat figma-full.json | figma-lint-autolayout --stdin -f <file-key>
```

**Programmatic usage (skip REST API):**

```js
import { lintLayerNames } from 'figma-library-maintenance-tools/src/tools/lint-layer-names/index.js'

// Pass fileData directly — no accessToken needed
const report = await lintLayerNames({
  fileKey: 'abc123',
  fileData: mcpResult,  // the object returned by use_figma
})
```

The `fileData` option is supported by all six tools. The autolayout linter additionally accepts `variablesData`.

---

## Tools

### 1. Generic Layer Name Linter

Detects layers that still carry Figma's default names — `Frame 1`, `Group 2`, `Rectangle 3`, `Vector`, `Ellipse 1`, etc.

```sh
figma-lint-names -f <file-key> -t <token>

# Scope to specific pages
figma-lint-names -f <file-key> -t <token> -p "Components,Primitives"

# Exclude scratchpad or exploration pages
figma-lint-names -f <file-key> -t <token> -x ".explorations,.archive"

# Run against a branch
figma-lint-names -f <file-key> -t <token> -b <branch-key>

# Only scan inside components (skip stray page-level nodes)
figma-lint-names -f <file-key> -t <token> -s components

# Human-readable text output
figma-lint-names -f <file-key> -t <token> --format text
```

**Scan scope (`--scope` / `-s`):**

| Scope | Description |
|-------|-------------|
| `all` (default) | Scans **every node** on every page — inside components and outside. Nodes inside components retain full component/variant context; nodes outside components are reported with the page name as context. |
| `components` | Only scans layers inside component sets and standalone components (original behaviour). |

**What it checks:**
- Matches the pattern: `Frame`, `Group`, `Rectangle`, `Vector`, `Ellipse`, `Line`, `Polygon`, `Star`, `Boolean`, `Image` — optionally followed by a number
- In `all` scope: every node on every matching page, at every nesting depth
- In `components` scope: all component sets and standalone components on published pages, every variant, at every nesting depth

**What it reports:**
- Component name (or page name for non-component nodes), variant name, layer name, layer type, node ID, direct Figma URL
- Parent name and child names for context
- A suggested rename:
  - Single child → `{childName}-wrapper`
  - Multiple children → `container`
  - No children → lowercased node type (e.g., `rectangle`)

---

### 2. Duplicate Sibling Name Detector

Detects direct children of the same parent that share identical names — e.g., four children all named `flex` inside a single frame.

```sh
figma-lint-duplicates -f <file-key> -t <token>
figma-lint-duplicates -f <file-key> -t <token> -b <branch-key>
figma-lint-duplicates -f <file-key> -t <token> -p "Components" --format text
```

**What it checks:**
- Every node with children inside every variant of every component
- Flags any name that appears more than once among siblings

**What it reports:**
- Component name, variant name, parent layer name
- The duplicated name and how many times it occurs
- Each occurrence's type, ID, and position index

---

### 3. Unbound Auto-Layout Value Detector

Detects auto-layout frames where padding or gap values are not bound to a spacing variable — including zero values.

> **Note:** This tool calls the [Local Variables API](https://www.figma.com/developers/api#variables) to read the Space variable collection. Your Figma personal access token must include the **`file_variables:read`** scope. Tokens generated before scopes were introduced may need to be regenerated with this scope enabled.

```sh
figma-lint-autolayout -f <file-key> -t <token>
figma-lint-autolayout -f <file-key> -t <token> -b <branch-key>
figma-lint-autolayout -f <file-key> -t <token> -p "Building blocks,Primitives"

# Deduplicate issues into unique patterns with occurrence counts
figma-lint-autolayout -f <file-key> -t <token> --summary
figma-lint-autolayout -f <file-key> -t <token> --summary --format text
```

**What it checks:**
- Every auto-layout frame (`layoutMode: HORIZONTAL | VERTICAL`) inside every component
- The five properties: `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`, `itemSpacing`
- Cross-references values against the file's **Space** variable collection

**What it reports:**

Each unbound value is classified as one of:

| Status | Meaning |
|--------|---------|
| `bindable` | Exact match found in the Space scale — safe to auto-bind |
| `off-scale` | No exact match — reports the two nearest scale values |
| `exception` | Negative value or other known exception |

The summary includes counts for each status category.

**Summary mode (`--summary`):**

When `--summary` is set, identical issues are deduplicated by grouping on shared properties (component name, layer name, property, raw value, status). Each group becomes a single entry with an `occurrences` count, sorted highest-first. This collapses hundreds of individual issues into a manageable set of unique patterns — useful for agentic workflows and triage.

---

### 4. Component Description Coverage Checker

Detects published components and component sets with empty or missing `description` fields.

```sh
figma-check-descriptions -f <file-key> -t <token>
figma-check-descriptions -f <file-key> -t <token> -b <branch-key>
figma-check-descriptions --format text -f <file-key> -t <token>
```

**What it checks:**
- All component sets and standalone components on published pages
- Flags empty strings, whitespace-only strings, and missing descriptions

**What it reports:**
- Component name, page, node ID, component type
- Summary: `X of Y components have descriptions (Z%)`

---

### 5. Property Naming Convention Auditor

Detects component properties that violate the library's naming conventions.

```sh
figma-audit-properties -f <file-key> -t <token>
figma-audit-properties -f <file-key> -t <token> -b <branch-key>
figma-audit-properties -f <file-key> -t <token> -p "Components,.labs"
```

**What it checks:**

| Violation | Example | Rule |
|-----------|---------|------|
| Capitalized names | `Size` instead of `size` | First letter must be lowercase |
| Default names | `Property 1` | Must be renamed from Figma's default |
| Toggle inconsistency | `show icon` + `with avatar` in same library | Pick one boolean prefix convention |

Special handling for the `↳` nested-property indicator — `↳ Size` is checked for the character after the prefix.

**What it reports:**
- Each violation with component name, property name, type, and a human-readable message
- A toggle convention summary showing how many boolean properties use `show`, `with`, or other prefixes

---

### 6. Page Hygiene Scanner

Detects non-component items sitting at the top level of published pages — stray instances, loose frames, groups, and other items that don't belong alongside published components.

```sh
figma-scan-pages -f <file-key> -t <token>
figma-scan-pages -f <file-key> -t <token> -b <branch-key>
figma-scan-pages -f <file-key> -t <token> -p "Components,Primitives,Building blocks,Icons"
```

**What it checks:**
- Top-level children of each published page
- Expected types: `COMPONENT_SET`, `COMPONENT`, `SECTION`
- Everything else is flagged: `INSTANCE`, `FRAME`, `GROUP`, `TEXT`, `RECTANGLE`, etc.

**What it reports:**
- Page name, item name, item type, node ID
- Summary: total pages scanned, expected vs. unexpected item counts

---

## Programmatic Usage

Every tool can be imported and used in a Node.js application:

```js
import { lintLayerNames } from 'figma-library-maintenance-tools/src/tools/lint-layer-names/index.js'
import { lintDuplicateSiblings } from 'figma-library-maintenance-tools/src/tools/lint-duplicate-siblings/index.js'
import { lintAutolayoutValues } from 'figma-library-maintenance-tools/src/tools/lint-autolayout-values/index.js'
import { checkDescriptionCoverage } from 'figma-library-maintenance-tools/src/tools/check-descriptions/index.js'
import { auditPropertyNames } from 'figma-library-maintenance-tools/src/tools/audit-property-names/index.js'
import { scanPageHygiene } from 'figma-library-maintenance-tools/src/tools/scan-page-hygiene/index.js'

const report = await lintLayerNames({
  accessToken: 'figd_...',
  fileKey: 'abcDEF123',
  branchKey: 'branchXYZ789',       // optional — use a branch instead of the main file
  pages: ['Components', 'Primitives'],  // optional — omit to scan all pages
})

console.log(report.summary)  // { totalComponents: 42, totalIssues: 7 }
console.log(report.issues)   // Array of issue objects
```

All functions return a report object with the shape:

```js
{
  title: 'Report Name',
  summary: { /* tool-specific summary stats */ },
  issues: [ /* array of issue objects */ ],
}
```

You can also import the lower-level detection functions for custom integrations:

```js
import { isGenericName, suggestName, detectGenericNames } from 'figma-library-maintenance-tools/src/tools/lint-layer-names/detect.js'
import { findDuplicateSiblings } from 'figma-library-maintenance-tools/src/tools/lint-duplicate-siblings/detect.js'
import { isAutoLayoutNode, classifyValue, buildSpaceScale } from 'figma-library-maintenance-tools/src/tools/lint-autolayout-values/detect.js'
import { hasValidDescription } from 'figma-library-maintenance-tools/src/tools/check-descriptions/detect.js'
import { cleanPropertyName, isDefaultName, isCapitalized } from 'figma-library-maintenance-tools/src/tools/audit-property-names/detect.js'
import { classifyTopLevelItem, scanPage } from 'figma-library-maintenance-tools/src/tools/scan-page-hygiene/detect.js'
import { getEffectiveFileKey } from 'figma-library-maintenance-tools/src/shared/cli-utils.js'
```

---

## Exit Codes

All CLI tools use consistent exit codes:

| Code | Meaning |
|------|---------|
| `0` | No issues found |
| `1` | Issues were found (report printed to stdout) |
| `2` | Runtime error (missing token, API failure, etc.) |

This makes it easy to use the tools in CI pipelines or shell scripts:

```sh
figma-lint-names -f "$FILE_KEY" -t "$TOKEN" > report.json || echo "Issues found"
```

---

## Development

### Running Tests

```sh
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Project Structure

```
figma-library-maintenance-tools/
├── package.json
├── vitest.config.js
├── .env.example              # Copy to .env and fill in your credentials
├── .env                      # Loaded automatically by all CLI tools (git-ignored)
└── src/
    ├── shared/
    │   ├── figma-client.js          # Figma REST API client
    │   ├── figma-client.test.js
    │   ├── tree-traversal.js        # Node tree traversal utilities
    │   ├── tree-traversal.test.js
    │   ├── cli-utils.js             # CLI arg parsing, branch key resolution & report formatting
    │   ├── cli-utils.test.js
    │   ├── env.js                   # .env file loader (dotenv wrapper)
    │   ├── stdin.js                 # Reads pre-fetched Figma data from stdin
    │   └── mcp-scripts.js           # Plugin API extraction scripts for Figma MCP use_figma
    └── tools/
        ├── lint-layer-names/        # Tool 1: Generic layer name linter
        │   ├── detect.js
        │   ├── detect.test.js
        │   ├── index.js
        │   ├── index.test.js
        │   └── cli.js
        ├── lint-duplicate-siblings/  # Tool 2: Duplicate sibling detector
        │   ├── detect.js
        │   ├── detect.test.js
        │   ├── index.js
        │   ├── index.test.js
        │   └── cli.js
        ├── lint-autolayout-values/   # Tool 3: Unbound auto-layout detector
        │   ├── detect.js
        │   ├── detect.test.js
        │   ├── index.js
        │   ├── index.test.js
        │   └── cli.js
        ├── check-descriptions/       # Tool 4: Description coverage checker
        │   ├── detect.js
        │   ├── detect.test.js
        │   ├── index.js
        │   ├── index.test.js
        │   └── cli.js
        ├── audit-property-names/     # Tool 5: Property naming auditor
        │   ├── detect.js
        │   ├── detect.test.js
        │   ├── index.js
        │   ├── index.test.js
        │   └── cli.js
        └── scan-page-hygiene/        # Tool 6: Page hygiene scanner
            ├── detect.js
            ├── detect.test.js
            ├── index.js
            ├── index.test.js
            └── cli.js
```

### Architecture

Each tool follows the same three-layer pattern:

1. **`detect.js`** — Pure detection functions. No API calls, no side effects. Takes Figma node data in, returns issues out. This is where all the logic lives and where tests are most thorough.

2. **`index.js`** — Orchestrator. Creates the Figma client, fetches data, finds components, calls the detection functions, and assembles the report. Tested with mocked API responses.

3. **`cli.js`** — Thin CLI wrapper. Parses arguments, calls the orchestrator, formats and prints the report, sets the exit code.

Shared utilities in `src/shared/` handle API communication, tree traversal, argument parsing, `.env` loading, branch key resolution, and report formatting — keeping each tool focused on its specific detection logic.
