# Scalar Primitive Component Builder

A parameterized template for building Figma component sets where the only thing varying across variants is which design tokens get bound to padding, radius, fill, and stroke. Edit one CONFIG block, run via the Figma MCP `use_figma` tool, get a fully-bound component set with the correct default variant.

First built for Card.v4 (2026-04-30). Reusable for any single-frame primitive with one or two pure VARIANT axes.

---

## When to use this

Use it when:

- You need a Figma component set with **1 or 2 VARIANT axes** (the typical pattern: a size-like axis × a tone axis)
- The component is **structurally a single frame** with optional inner content (one text node, one slot, that kind of thing — not a multi-slot layout)
- Every visual value (padding, radius, fill, stroke, gap) **resolves to a Figma variable** — no hardcoded hex or pixel values
- You're creating, not modifying — this template only creates new component sets

Don't use it when:

- The component has **multiple slots, conditional layers, or nested instances** that vary across variants — write a hand-built script
- The axes include **booleans, instance swaps, or text properties** — those need different APIs (`addComponentProperty`)
- You need to **modify an existing component set** — this only creates

---

## How to run it

This is a Plugin API script, not a CLI. It runs inside Figma's plugin runtime via the MCP `use_figma` tool.

1. Edit the `CONFIG` block at the top of `build.js`. The CONFIG block is the only thing that changes per component. Don't touch the ENGINE block below it.
2. Pass the entire file contents as the `code` parameter to the MCP `use_figma` tool, with the target file's `fileKey`.
3. The script returns a JSON summary: `{ setId, setName, defaults, variantCount }`.
4. Run the verification steps below.

---

## What the CONFIG block controls

```js
{
  pageName,        // string — page to place the set on (e.g. '.labs')
  setName,         // string — final component set name (PascalCase, dotted versions OK)
  description,     // string — Figma component description (one sentence + optional preview note)

  axes,            // 1 or 2 keys → array of value strings.
                   //   First value of each axis becomes the default variant.
                   //   First axis = columns, second axis = rows.

  frame,           // width + auto-layout settings for each variant frame
  layout,          // visual grid spacing for placing the variants

  resolveBindings, // function({...combo}) => {
                   //   padding:     { name, collection },  // applies to all 4 sides
                   //   itemSpacing: { name, collection },  // bind even 0 values
                   //   radius:      { name, collection },  // applies to all 4 corners
                   //   fill:        { name },              // Color collection (no `collection`)
                   //   stroke:      { name },              // Color collection
                   // }
                   // Set any binding to null to skip it.

  stroke,          // weight + align for the stroke
  buildInner,      // async (comp) => void — builds children inside each variant
  position,        // { x, y } where the resulting component set lands on the page
}
```

The engine validates every binding resolves to a real variable **before creating any nodes**. If anything is missing, it throws with a list of what's missing — no half-built component sets left on the canvas.

---

## Known Figma quirks (banked from Card.v4)

These are not obvious from the Plugin API docs. The engine handles them so callers don't have to.

**1. Variant default = top-left grid position.** The `defaultValue` of a VARIANT property is determined by which variant is at the smallest (x, y) in the variant grid. `editComponentProperty` cannot change variant defaults — it errors with `"Cannot change defaultValue of a variant property"`. Children-array order also doesn't matter. The engine places the default-combo variant at (0, 0) so the right default falls out.

**2. `loadAllPagesAsync()` is unsupported in the MCP plugin runtime.** Use `page.loadAsync()` per page instead. The engine loads only the target page.

**3. Two different APIs for variable bindings.**
- For numeric properties (padding, radius, itemSpacing): `node.setBoundVariable(field, variable)` — mutates in place
- For paint properties (fills, strokes): `figma.variables.setBoundVariableForPaint(paint, 'color', variable)` returns a NEW paint, which must then be assigned to `node.fills` or `node.strokes`

**4. Bind 0-valued padding and itemSpacing explicitly.** Leaving them as raw `0` violates the "all spacing bound" rule from the library structure guidelines. The engine binds itemSpacing to `space/0` even when its value is 0.

**5. `layoutSizingHorizontal = 'FILL'` requires a fixed counter axis.** A child can only `FILL` horizontally if its parent has `counterAxisSizingMode = 'FIXED'`. Inner content is built AFTER frame layout is configured so this works.

---

## Verification after running

The engine returns a summary, but you should always check:

1. **Defaults match what you intended.** Check `defaults.<axis>.defaultValue` in the returned JSON. If it's wrong, the first value of the axis array doesn't match the design intent.
2. **Variant count matches expectation.** For 1 axis it's `axes[0].length`; for 2 axes it's `axes[0].length × axes[1].length`.
3. **Variable bindings landed on every variant.** Run a Plugin API check that iterates the children and verifies `boundVariables` and `fills[0].boundVariables.color.id` / `strokes[0].boundVariables.color.id` are populated for every variant.
4. **Visual screenshot.** Use `Figma:get_design_context` with the new set's nodeId to render a screenshot and eyeball the grid.

A reusable post-build verification snippet is part of the Card.v4 build transcript and should be promoted into a `verify.js` companion if this template gets used a second time.

---

## Example: the Card.v4 CONFIG

The CONFIG block in `build.js` builds Card.v4 as-shipped: 21 variants (3 density × 7 tone), default `density=regular, tone=none`, all values bound to the existing Sanity UI variable collections. Treat it as a working reference rather than a starter template — copy, edit, run.

---

## Adding a new template here

If a future component doesn't fit this template's shape (e.g. needs boolean properties, or has compound inner structure), don't bend this template. Add a sibling directory under `templates/` with its own `build.js` + README. Promote shared helpers into `templates/_shared/` only after the same pattern shows up in two templates — not before.
