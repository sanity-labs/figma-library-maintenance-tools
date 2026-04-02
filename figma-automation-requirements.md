# Figma Library Automation Requirements

**From:** Production Designer + Frontend Engineer
**Purpose:** Tooling specs derived from repetitive manual work observed during the Sanity UI library audit and cleanup.

---

## Overview

During the library cleanup, six categories of work were repetitive enough to warrant automation. Each spec below describes the pattern, the manual process it replaces, the estimated frequency, and the recommended implementation approach.

---

## Tool 1: Generic Layer Name Linter

### What it detects
Layers inside published components that still have Figma's default names: `Frame 1`, `Group 2`, `Rectangle 3`, `Vector`, `Ellipse 1`, etc.

### Pattern
Regex: `^(Frame|Group|Rectangle|Vector|Ellipse|Line|Polygon|Star|Boolean)\s+\d+$`

### Manual process it replaces
During the audit, we walked every node inside every variant of every component set across 3 pages, matched against the regex, and renamed each layer based on its structural context (child names, parent name, node type). This took multiple MCP calls and produced 42 renames.

### Scope
All component sets and standalone components on published pages (currently: Building blocks, Primitives, Components). Traverses all variants, all nesting depths.

### Output
A report listing every match: component name, variant name, layer name, layer type, node ID, parent name, child names. Optionally: a suggested rename based on the layer's context (single child → `{childName}-wrapper`, multiple children → `container`, no children → type-based name).

### Recommended implementation
**Figma plugin (lint rule).** Runs on demand or as part of a pre-publish check. Displays findings in a panel. Does not auto-rename — the production designer reviews suggestions and applies them.

### Frequency
Every component update. New components regularly arrive with unnamed layers.

---

## Tool 2: Duplicate Sibling Name Detector

### What it detects
Direct children of the same parent that share identical names. Example: four children all named `flex` inside a MenuItem variant.

### Pattern
For each node with children, collect child names. Flag any name that appears more than once among siblings.

### Manual process it replaces
We checked the first variant of each component, identified duplicate names, then applied disambiguating renames across all variants (90 renames in MenuItem × 24 variants, 540 renames in Button × 180 variants). The bulk of the time was spent applying the same rename pattern across every variant.

### Scope
Same as Tool 1 — all published components, all variants, all nesting depths.

### Output
Report listing: component name, parent layer name, the duplicated name, how many times it appears, and the children's types/positions.

### Recommended implementation
**Figma plugin (lint rule).** Part of the same linter as Tool 1. Flagging only — disambiguation requires context that's hard to automate (the production designer needs to decide whether `flex` becomes `flex-leading`, `flex-content`, `flex-trailing` or something else).

### Frequency
Every component update.

---

## Tool 3: Unbound Auto-Layout Value Detector

### What it detects
Auto-layout frames inside published components where padding (top/right/bottom/left) or gap (itemSpacing) values are not bound to a spacing variable — including zero values.

### Pattern
For each node with `layoutMode !== 'NONE'`, check `boundVariables` for `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`, and `itemSpacing`. If any of these exist as raw values without a variable binding, flag them.

### Additional check: off-scale values
When a value is unbound, check whether it matches any value in the Space variable collection. Report whether the value has an exact match (bindable), no match (scale gap), or is a known exception (negative values, sub-scale structural values like 1px).

### Manual process it replaces
We scanned every auto-layout frame inside every variant of every component, cross-referenced each value against the Space variable collection's resolved values, then bound 256 values in one pass. The remaining 32 unbound values were flagged as scale gaps (10px) or intentional exceptions (1px, -8px).

### Scope
All published components, all variants, all nesting depths. Needs access to the Space variable collection for value matching.

### Output
Report listing: component name, layer name, property (paddingTop/itemSpacing/etc.), raw value, and status (`bindable: Space/{name}`, `off-scale: nearest are Space/2=8 and Space/3=12`, or `exception: negative/sub-scale`).

For bindable values, the tool should offer a one-click "bind all" action that applies the correct variable bindings in bulk.

### Recommended implementation
**Figma plugin (lint rule + auto-fix).** The detection is a lint rule. The binding of exact-match values is safe to auto-fix. Off-scale values are flagged for design decision, not auto-fixed.

### Frequency
Every component update. Also run monthly as part of the hygiene audit.

---

## Tool 4: Component Description Coverage Checker

### What it detects
Published components and component sets with empty or missing description fields.

### Pattern
Check `node.description` for empty string or whitespace-only content.

### Manual process it replaces
We queried every component on every published page, filtered for empty descriptions, and then wrote 22 descriptions manually. The detection was trivial; the writing was the real work. But the detection should be automated so gaps don't accumulate silently.

### Scope
All component sets and standalone components on published pages.

### Output
Report listing: component name, page, and whether a description exists. Summary count: `X of Y components have descriptions`.

### Recommended implementation
**REST API script.** Runs as a scheduled check (monthly or on-commit). Can be part of a CI-like pipeline. Doesn't need the Plugin API — the REST API's GET file endpoint returns component descriptions.

### Frequency
Monthly, or triggered by publishing events.

---

## Tool 5: Property Naming Convention Auditor

### What it detects
Component properties that violate the library's naming conventions:
- Capitalized property names (should be lowercase)
- Figma default names (`Property 1`, `Property 2`)
- Mixed toggle conventions (`show X` vs `with X` in the same library)

### Pattern
For each component set, read `componentPropertyDefinitions`. Strip the Figma hash suffix. Check:
1. First character of the clean name — if uppercase (excluding `↳` prefix), flag as capitalized
2. Match against `^Property\s+\d+$` — flag as unrenamed default
3. Categorize boolean properties by prefix (`show `, `with `, other) — flag if both `show` and `with` are used in the same library

### Manual process it replaces
We collected all 66 unique property names across 4 pages, categorized them by naming pattern, identified 6 capitalization violations and 1 unrenamed default, and then renamed 5 properties (the breaking changes). The categorization and flagging was the repetitive part.

### Scope
All component sets and standalone components on all pages (including .labs for early catches).

### Output
Report listing violations by category. For the toggle convention check: a summary of how many properties use each prefix, so the team can track progress toward standardization.

### Recommended implementation
**REST API script.** Same pipeline as Tool 4. Property definitions are available through the REST API.

### Frequency
Monthly, or on-publish.

---

## Tool 6: Page Hygiene Scanner

### What it detects
Non-component items at the top level of published pages: stray instances, loose frames, groups, and other items that don't belong alongside published components.

### Pattern
For each published page, check `page.children`. On pages that use Sections, every top-level item should be a Section. On pages that don't, every item should be a component set or standalone component. Flag anything else: INSTANCE, FRAME, GROUP, etc.

### Manual process it replaces
We manually inspected the top-level children of each page, identified 16+ DocsHeader instances, 2 stray groups, 1 stray instance, and 2 product design sections. Each had to be individually identified, then moved or deleted.

### Scope
All published pages (Building blocks, Primitives, Components, Icons).

### Output
Report listing: page name, item name, item type, node ID. Categorized as: expected (Section/Component/ComponentSet) or unexpected (everything else).

### Recommended implementation
**REST API script.** The page structure is available through GET file nodes. Runs as part of the monthly audit.

### Frequency
Monthly.

---

## Implementation Priority

| Tool | Impact | Effort | Recommended order |
|------|--------|--------|-------------------|
| Tool 3: Unbound auto-layout values | High — catches the most common binding drift | Medium — needs variable resolution | 1st |
| Tool 1: Generic layer names | High — catches the most visible debt | Low — regex match | 2nd |
| Tool 2: Duplicate sibling names | Medium — less frequent but hard to spot | Low — sibling name comparison | 2nd (bundle with Tool 1) |
| Tool 4: Description coverage | Medium — prevents silent gaps | Low — simple empty check | 3rd |
| Tool 5: Property naming | Medium — catches convention drift | Low — string matching | 3rd (bundle with Tool 4) |
| Tool 6: Page hygiene | Low — infrequent but easy | Low — type check on children | 3rd (bundle with Tool 4) |

**Recommendation:** Tools 1–3 as a single Figma plugin with a lint panel. Tools 4–6 as a single REST API script that runs monthly and outputs a report.
