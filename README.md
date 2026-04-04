# Figma Library Maintenance Tools

A collection of single-purpose CLI tools that audit and maintain Figma design libraries. Each tool scans a Figma file, detects a specific category of issue, and returns a structured JSON report with direct links to every flagged node.

**Two data sources are supported:**

- **Figma REST API** — pass a personal access token and file key
- **Figma MCP** — extract data via the `use_figma` tool from Claude Desktop or any MCP client, then pipe it in with `--stdin` (no token needed)

---

## Table of Contents

- [Installation](#installation)
- [Data Sources](#data-sources)
  - [REST API](#rest-api)
  - [Figma MCP (no API token)](#figma-mcp-no-api-token)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Figma Branches](#figma-branches)
  - [CLI Flags](#cli-flags)
- [Tools](#tools)
  - [1. Generic Layer Name Linter](#1-generic-layer-name-linter)
  - [2. Duplicate Sibling Name Detector](#2-duplicate-sibling-name-detector)
  - [3. Unbound Auto-Layout Value Detector](#3-unbound-auto-layout-value-detector)
  - [4. Unbound Radius Value Detector](#4-unbound-radius-value-detector)
  - [5. Hardcoded Text Style Detector](#5-hardcoded-text-style-detector)
  - [6. Component Description Coverage Checker](#6-component-description-coverage-checker)
  - [7. Property Naming Convention Auditor](#7-property-naming-convention-auditor)
  - [8. Page Hygiene Scanner](#8-page-hygiene-scanner)
  - [9. Variant Linter](#9-variant-linter)
  - [10. Layer Casing Linter](#10-layer-casing-linter)
  - [11. Canvas Hygiene Linter](#11-canvas-hygiene-linter)
- [Programmatic Usage](#programmatic-usage)
- [Exit Codes](#exit-codes)
- [Development](#development)

---

## Installation

Requires **Node.js 18+**.

```sh
git clone <repo-url>
cd figma-library-maintenance-tools
npm install

# (Optional) Link CLI commands globally
npm link
```

---

## Data Sources

Every tool can receive Figma file data in one of two ways. The analysis logic is identical regardless of how the data arrives.

### REST API

The default path. Pass a Figma personal access token and file key — the tool calls the Figma REST API directly.

```sh
figma-lint-names -f <file-key> -t <token>
```

Or configure them once in `.env` (see [Environment Variables](#environment-variables)) and run with no flags:

```sh
figma-lint-names
```

### Figma MCP (no API token)

When running inside **Claude Desktop** or any MCP-connected environment, you can extract file data via the Figma MCP `use_figma` tool and pipe it into the CLI — no personal access token required.

**How it works:**

1. The MCP `use_figma` tool runs a Plugin API script inside the open Figma file and returns the document tree as JSON.
2. You pipe that JSON into any CLI tool with the `--stdin` flag.
3. The tool runs its analysis on the pre-fetched data identically to the REST API path.

**Step 1 — Extract data via MCP:**

This project ships ready-made Plugin API scripts in `src/shared/mcp-scripts.js`:

```js
import { getFileScript, getLocalVariablesScript, getTextStylesScript } from 'figma-library-maintenance-tools/src/shared/mcp-scripts.js'

// Returns a Plugin API JavaScript string to pass to use_figma
const fileScript = getFileScript({ pageNames: ['Components', 'Primitives'] })

// Only needed for the autolayout and radius linters
const variablesScript = getLocalVariablesScript({ collectionFilter: 'spac(e|ing)' })

// Only needed for the text style linter
const textStylesScript = getTextStylesScript()
```

Each script returns data in the same shape as the corresponding Figma REST API endpoint, so all downstream detection functions work identically.

**Step 2 — Pipe into CLI tools:**

```sh
# Most tools only need the file tree
cat figma-data.json | figma-lint-names --stdin -f <file-key>
cat figma-data.json | figma-lint-duplicates --stdin -f <file-key>
cat figma-data.json | figma-check-descriptions --stdin -f <file-key>
cat figma-data.json | figma-audit-properties --stdin -f <file-key>
cat figma-data.json | figma-scan-pages --stdin -f <file-key>

# The autolayout and radius linters also need variable data:
# stdin JSON must include both keys: { "fileData": { ... }, "variablesData": { ... } }
cat figma-full.json | figma-lint-autolayout --stdin -f <file-key>
cat figma-full.json | figma-lint-radius --stdin -f <file-key>

# The text style linter optionally accepts text style data for suggestions:
# { "fileData": { ... }, "textStylesData": [ ... ] }
cat figma-full.json | figma-lint-text-styles --stdin -f <file-key>
```

> **Note:** `--stdin` makes `--token` optional, but `--file-key` is still required — it's used to generate direct Figma URLs in the report.

**Programmatic usage (skip the REST API entirely):**

Every orchestrator accepts a `fileData` option. When present, the REST API client is never instantiated:

```js
import { lintLayerNames } from 'figma-library-maintenance-tools/src/tools/lint-layer-names/index.js'

const report = await lintLayerNames({
  fileKey: 'abc123',
  fileData: mcpResult,  // the object returned by use_figma — { document: { ... } }
})
```

All eight tools support `fileData`. The autolayout and radius linters additionally accept `variablesData`. The text style linter accepts `textStylesData`.

---

## Configuration

### Environment Variables

Create a `.env` file in the project root (see `.env.example`). The tools load it automatically via [dotenv](https://github.com/motdotla/dotenv) — no need to `source` or `export` manually:

```sh
FIGMA_ACCESS_TOKEN=figd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FIGMA_FILE_KEY=abcDEF123ghiJKL456
FIGMA_BRANCH_KEY=                # optional — set when working on a branch
FIGMA_EXCLUDE_PAGES=             # optional — comma-separated page names to always skip
```

> **Tip:** Variables already set in your shell or CI environment are never overwritten by the `.env` file.

### Figma Branches

When working on a Figma branch, provide the branch's own file key via `--branch` / `-b` or `FIGMA_BRANCH_KEY`. When a branch key is present it is used for all API calls and Figma URLs instead of the base file key.

```sh
figma-lint-names -b <branch-file-key>
```

### CLI Flags

Flags override environment variables:

| Flag | Short | Description |
|------|-------|-------------|
| `--file-key` | `-f` | Figma file key |
| `--token` | `-t` | Figma personal access token |
| `--branch` | `-b` | Figma branch key (overrides file key for API calls and URLs) |
| `--pages` | `-p` | Comma-separated page names to include |
| `--exclude-pages` | `-x` | Comma-separated page names to exclude (takes precedence over `--pages`) |
| `--scope` | `-s` | Scan scope: `all` (default) or `components` |
| `--stdin` | | Read pre-fetched Figma data from stdin (no token needed) |
| `--summary` | | Deduplicate issues into unique patterns with occurrence counts |
| `--format` | | Output format: `json` (default) or `text` |
| `--help` | `-h` | Show help for a specific tool |

---

## Tools

### 1. Generic Layer Name Linter

Detects layers that still carry Figma's default names — `Frame 1`, `Group 2`, `Rectangle 3`, `Vector`, `Ellipse 1`, etc.

```sh
figma-lint-names
figma-lint-names -p "Components,Primitives"
figma-lint-names -x ".explorations,.archive"
figma-lint-names -s components     # only scan inside components
figma-lint-names --stdin < data.json
```

**Scan scope (`--scope` / `-s`):**

| Scope | Description |
|-------|-------------|
| `all` (default) | Scans **every node** on every page — inside components and outside. Nodes inside components retain full component/variant context; nodes outside components are reported with the page name as context. |
| `components` | Only scans layers inside component sets and standalone components. |

**What it reports:** component name (or page name), variant name, layer name, layer type, node ID, direct Figma URL, parent name, child names, and a suggested rename (`{childName}-wrapper`, `container`, or the lowercased type).

---

### 2. Duplicate Sibling Name Detector

Detects direct children of the same parent that share identical names — e.g., four children all named `flex` inside a single frame.

```sh
figma-lint-duplicates
figma-lint-duplicates -p "Components"
figma-lint-duplicates --stdin < data.json
```

**What it reports:** component name, variant name, parent layer name, the duplicated name, occurrence count, and each occurrence's type/ID/index.

---

### 3. Unbound Auto-Layout Value Detector

Detects auto-layout frames where padding or gap values are not bound to a spacing variable — including zero values.

> **Note:** When using the REST API, your token must include the **`file_variables:read`** scope. When using MCP with `--stdin`, pass both `fileData` and `variablesData` in the JSON payload.

```sh
figma-lint-autolayout
figma-lint-autolayout --summary          # deduplicate into unique patterns
figma-lint-autolayout --stdin < full.json # stdin must include variablesData
```

**What it reports:** Each unbound value is classified as `bindable` (exact variable match exists), `off-scale` (no match — reports two nearest scale values), or `exception` (negative value). The `--summary` flag groups identical patterns with occurrence counts.

---

### 4. Unbound Radius Value Detector

Detects border radius values (`topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`) that are not bound to a radius variable.

> **Note:** Same variable data requirements as the autolayout linter — REST API needs `file_variables:read` scope; `--stdin` needs `variablesData` in the payload.

```sh
figma-lint-radius
figma-lint-radius --stdin < full.json
```

**What it reports:** Each unbound radius is classified as `bindable` or `off-scale`, with the same pattern as the autolayout linter.

---

### 5. Hardcoded Text Style Detector

Detects text nodes with no text style applied — meaning they have hardcoded font size, family, and weight instead of referencing a shared text style.

```sh
figma-lint-text-styles
figma-lint-text-styles --stdin < data.json
```

When text style data is available (via `textStylesData` in the JSON payload or from the MCP `getTextStylesScript`), each issue includes a `suggestedStyle` — the closest matching text style by font size and weight.

**What it reports:** component name, layer name, node ID, font size, font family, font style, and suggested text style (if available).

---

### 6. Component Description Coverage Checker

Detects published components and component sets with empty or missing `description` fields.

```sh
figma-check-descriptions
figma-check-descriptions --stdin < data.json
```

**What it reports:** component name, page, node ID, component type. Summary: `X of Y components have descriptions (Z%)`.

---

### 7. Property Naming Convention Auditor

Detects component properties that violate the library's naming conventions.

```sh
figma-audit-properties
figma-audit-properties -p "Components,.labs"
figma-audit-properties --stdin < data.json
```

**What it checks:**

| Violation | Example | Rule |
|-----------|---------|------|
| Capitalized names | `Size` instead of `size` | First letter must be lowercase |
| Default names | `Property 1` | Must be renamed from Figma's default |
| Toggle inconsistency | `show icon` + `with avatar` in same library | Pick one boolean prefix convention |
| Boolean/variant conflict | `focused` boolean + `state` variant with `focused` value | Two controls for the same concept |
| Dependency prefix order | `↳ text` appearing before `show text` | `↳` prefixed properties must follow their parent toggle |

**What it reports:** Each violation with component name, property name, type, and message. Boolean/variant conflicts show both the boolean name and the conflicting variant property. Dependency prefix issues show the dependent property and its expected parent. Also includes a toggle convention summary.

---

### 8. Page Hygiene Scanner

Detects non-component items at the top level of published pages — stray instances, loose frames, groups, etc. Also checks Section naming conventions.

```sh
figma-scan-pages
figma-scan-pages -p "Components,Primitives,Icons"
figma-scan-pages --stdin < data.json
```

**What it reports:** page name, item name, item type, node ID. Expected types: `COMPONENT_SET`, `COMPONENT`, `SECTION`. Everything else is flagged as unexpected. Also flags Sections whose names don't reference any of their child component names (e.g., a Section named "Controls" containing Checkbox, Switch, and Radio).

---

### 9. Variant Linter

Detects variant-related issues in component sets: single-value variant properties (dead-end dropdowns), duplicate variant name strings (which break API access), and missing combinations in the variant matrix.

```sh
figma-lint-variants
figma-lint-variants -p "Components"
figma-lint-variants --matrix                    # include coverage gap analysis
figma-lint-variants -x ".labs,.explorations"
figma-lint-variants --stdin < data.json
```

**Issue types:**

| Type | Description |
|------|-------------|
| `single-value-variant` | A variant property with only one selectable option |
| `duplicate-variant-name` | Identical variant name strings — breaks `componentPropertyDefinitions` API |
| `coverage-gap` | Missing combination in the variant matrix (only with `--matrix`) |

**What it reports:** Component name, property name, single value (single-value issues). Duplicate name string, count, node IDs (duplicate issues). Missing variant name string (coverage gaps). Summary with counts by type.

---

### 10. Layer Casing Linter

Detects layer names inside published components that violate the lowercase naming convention. By default checks only `TEXT` layers; use `--all-layers` for all layer types.

```sh
figma-lint-casing
figma-lint-casing -p "Components"
figma-lint-casing --all-layers                  # check FRAME, GROUP, etc. too
figma-lint-casing --stdin < data.json
```

**What it checks:** TEXT layer names inside component sets and standalone components. Instance layers (`INSTANCE` type) are exempt — they conventionally use PascalCase component names.

**What it reports:** Component name, variant name, current layer name, expected (lowercased) name, node ID.

---

### 11. Canvas Hygiene Linter

Detects canvas-level hygiene issues: pages whose content doesn't start at (0, 0), and page names with leading or trailing whitespace.

```sh
figma-lint-canvas
figma-lint-canvas -p "Icons,.internal,.explorations"
figma-lint-canvas --stdin < data.json
```

**Issue types:**

| Type | Description |
|------|-------------|
| `origin-drift` | Page content does not start at canvas origin (0, 0) |
| `page-name-whitespace` | Page name has invisible leading or trailing spaces |

---

## Programmatic Usage

Every tool can be imported into a Node.js application. All functions accept `fileData` to skip the REST API:

```js
import { lintLayerNames } from 'figma-library-maintenance-tools/src/tools/lint-layer-names/index.js'
import { lintDuplicateSiblings } from 'figma-library-maintenance-tools/src/tools/lint-duplicate-siblings/index.js'
import { lintAutolayoutValues } from 'figma-library-maintenance-tools/src/tools/lint-autolayout-values/index.js'
import { lintRadiusValues } from 'figma-library-maintenance-tools/src/tools/lint-radius-values/index.js'
import { lintTextStyles } from 'figma-library-maintenance-tools/src/tools/lint-text-styles/index.js'
import { checkDescriptionCoverage } from 'figma-library-maintenance-tools/src/tools/check-descriptions/index.js'
import { auditPropertyNames } from 'figma-library-maintenance-tools/src/tools/audit-property-names/index.js'
import { scanPageHygiene } from 'figma-library-maintenance-tools/src/tools/scan-page-hygiene/index.js'
import { lintVariants } from 'figma-library-maintenance-tools/src/tools/lint-variants/index.js'
import { lintCasing } from 'figma-library-maintenance-tools/src/tools/lint-casing/index.js'
import { lintCanvas } from 'figma-library-maintenance-tools/src/tools/lint-canvas/index.js'

// Via REST API
const report = await lintLayerNames({
  accessToken: 'figd_...',
  fileKey: 'abcDEF123',
  branchKey: 'branchXYZ789',            // optional
  pages: ['Components', 'Primitives'],  // optional
  excludePages: ['.archive'],           // optional
  scope: 'all',                         // optional — 'all' or 'components'
})

// Via pre-fetched data (from MCP or saved JSON)
const report = await lintLayerNames({
  fileKey: 'abcDEF123',
  fileData: mcpResult,  // { document: { ... } }
})
```

All functions return a report with this shape:

```js
{
  title: 'Report Name',
  summary: { /* tool-specific counts */ },
  issues: [
    {
      nodeId: '123:456',
      figmaUrl: 'https://www.figma.com/design/<key>/?node-id=123-456',
      // ... tool-specific fields
    }
  ],
}
```

Lower-level detection functions are also available for custom integrations:

```js
import { isGenericName, suggestName } from 'figma-library-maintenance-tools/src/tools/lint-layer-names/detect.js'
import { findDuplicateSiblings } from 'figma-library-maintenance-tools/src/tools/lint-duplicate-siblings/detect.js'
import { isAutoLayoutNode, classifyValue, buildSpaceScale } from 'figma-library-maintenance-tools/src/tools/lint-autolayout-values/detect.js'
import { hasRadiusValues, buildRadiusScale } from 'figma-library-maintenance-tools/src/tools/lint-radius-values/detect.js'
import { isHardcodedText, buildTextStyleMap } from 'figma-library-maintenance-tools/src/tools/lint-text-styles/detect.js'
import { hasValidDescription } from 'figma-library-maintenance-tools/src/tools/check-descriptions/detect.js'
import { cleanPropertyName, isDefaultName, isCapitalized } from 'figma-library-maintenance-tools/src/tools/audit-property-names/detect.js'
import { classifyTopLevelItem, scanPage } from 'figma-library-maintenance-tools/src/tools/scan-page-hygiene/detect.js'

// MCP extraction scripts
import { getFileScript, getLocalVariablesScript, getTextStylesScript } from 'figma-library-maintenance-tools/src/shared/mcp-scripts.js'

// Utilities
import { getEffectiveFileKey } from 'figma-library-maintenance-tools/src/shared/cli-utils.js'
import { buildFigmaUrl, enrichIssuesWithUrls } from 'figma-library-maintenance-tools/src/shared/figma-urls.js'
```

---

## Exit Codes

All tools use consistent exit codes:

| Code | Meaning |
|------|---------|
| `0` | No issues found |
| `1` | Issues found (report on stdout) |
| `2` | Runtime error (missing token, API failure, etc.) |

```sh
figma-lint-names > report.json || echo "Issues found"
```

---

## Development

### Running Tests

```sh
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

### Project Structure

```
figma-library-maintenance-tools/
├── package.json
├── vitest.config.js
├── .env.example
└── src/
    ├── shared/
    │   ├── figma-client.js          # Figma REST API client
    │   ├── tree-traversal.js        # Node tree traversal utilities
    │   ├── cli-utils.js             # CLI arg parsing, report formatting, summary dedup
    │   ├── figma-urls.js            # Figma node URL builder
    │   ├── env.js                   # .env file loader (dotenv wrapper)
    │   ├── stdin.js                 # Reads pre-fetched Figma data from stdin
    │   └── mcp-scripts.js           # Plugin API extraction scripts for Figma MCP
    └── tools/
        ├── lint-layer-names/        # Generic layer name linter
        ├── lint-duplicate-siblings/ # Duplicate sibling name detector
        ├── lint-autolayout-values/  # Unbound auto-layout value detector
        ├── lint-radius-values/      # Unbound radius value detector
        ├── lint-text-styles/        # Hardcoded text style detector
        ├── check-descriptions/      # Component description coverage checker
        ├── audit-property-names/    # Property naming convention auditor
        ├── scan-page-hygiene/       # Page hygiene scanner
        ├── lint-variants/           # Variant linter
        ├── lint-casing/             # Layer casing linter
        └── lint-canvas/             # Canvas hygiene linter
```

Each tool directory contains:

- `detect.js` — Pure detection functions. No API calls, no side effects.
- `detect.test.js` — Thorough tests for detection logic.
- `index.js` — Orchestrator. Fetches data (or accepts `fileData`), calls detection, assembles the report.
- `index.test.js` — Tests with mocked API responses.
- `cli.js` — Thin CLI wrapper. Parses arguments, handles `--stdin`, formats output.

Shared utilities in `src/shared/` handle API communication, tree traversal, argument parsing, `.env` loading, stdin reading, MCP script generation, branch key resolution, URL building, and report formatting.