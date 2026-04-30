/**
 * Scalar Primitive Component Builder
 * --------------------------------------------------------------------------
 * Builds a Figma component set for a "scalar primitive" — a container with
 * one or two VARIANT axes whose only behavior is binding visual values
 * (padding, radius, fill, stroke) to design tokens. First built for Card.v4
 * (2026-04-30); reusable for Box, Surface, Container, and similar primitives.
 *
 * USAGE
 *   This is a Plugin API script, not a CLI. Pass the entire file contents
 *   as the `code` parameter to the Figma MCP `use_figma` tool. The script
 *   runs once inside the Figma plugin runtime and returns a JSON summary.
 *
 *   Edit the CONFIG block. Do not edit the ENGINE block.
 *
 * WHAT IT BUILDS
 *   - One COMPONENT_SET on the page named in CONFIG.pageName
 *   - One COMPONENT child for every combination of axis values
 *   - Each child has all visual values bound to variables (padding × 4 sides,
 *     radius × 4 corners, itemSpacing including 0, fill, stroke)
 *   - The default variant is created first AND placed at grid (0, 0)
 *
 * NOT FOR
 *   - Components with composite inner structure (multiple slots, nested
 *     instances, conditional layers — use a hand-built script for those)
 *   - Components whose axes aren't pure VARIANT (booleans, instance swaps,
 *     text properties — those need different APIs)
 *   - Modifying existing components (this script only creates)
 *
 * KNOWN FIGMA QUIRKS — see templates/scalar-primitive/README.md
 */

// =============================================================================
// CONFIG — edit per component. The example below builds Card.v4.
// =============================================================================

const CONFIG = {
  pageName: '.labs',
  setName: 'Card.v4',
  description:
    'A container for grouping content. (v4 preview — `none` tone is bound to v3 `default/*` color variables; new `none/*` tokens pending.)',

  // Variant axes. The FIRST value of each axis becomes the default.
  // 1 or 2 axes supported. axes[0] = columns, axes[1] = rows (if present).
  axes: {
    density: ['regular', 'compact', 'loose'],
    tone: ['none', 'neutral', 'primary', 'positive', 'suggest', 'caution', 'critical'],
  },

  // Frame size and auto-layout
  frame: {
    width: 320,
    layoutMode: 'VERTICAL',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'FIXED',
  },

  // Visual grid layout (just for placing variants on the canvas;
  // doesn't affect the component itself)
  layout: {
    colGap: 80,
    rowGap: 40,
    cellHeightHint: 50, // approximate row pitch; only used for placement
  },

  // For each variant combination, return which variables to bind.
  // Each binding is { name, collection } — `collection` is omitted for Color
  // (since Color collection variables are matched by name only).
  // Set any binding to null to skip it.
  resolveBindings: ({ density, tone }) => {
    const densityMap = {
      compact: { padding: '3', radius: '2' },
      regular: { padding: '4', radius: '3' },
      loose: { padding: '5', radius: '4' },
    };
    // FIXME: 'none' rebinds to 'default/*' until none/bg + none/border land
    const toneToColorPrefix = {
      none: 'default',
      neutral: 'neutral',
      primary: 'primary',
      positive: 'positive',
      suggest: 'suggest',
      caution: 'caution',
      critical: 'critical',
    };
    return {
      padding: { name: densityMap[density].padding, collection: 'Space' },
      itemSpacing: { name: '0', collection: 'Space' },
      radius: { name: densityMap[density].radius, collection: 'Radius' },
      fill: { name: `${toneToColorPrefix[tone]}/bg` },
      stroke: { name: `${toneToColorPrefix[tone]}/border` },
    };
  },

  stroke: { weight: 1, align: 'INSIDE' },

  // Build the inside of each variant. Called AFTER frame layout + bindings
  // so children can use layoutSizingHorizontal = 'FILL'.
  buildInner: async (comp) => {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    const content = figma.createText();
    content.name = 'content';
    content.fontName = { family: 'Inter', style: 'Regular' };
    content.characters = 'Card content';
    content.fontSize = 14;
    comp.appendChild(content);
    content.layoutSizingHorizontal = 'FILL';
  },

  // Where to place the resulting component set on the page
  position: { x: 100, y: 3592 },
};

// =============================================================================
// ENGINE — do not edit
// =============================================================================

const page = figma.root.children.find((p) => p.name === CONFIG.pageName);
if (!page) throw new Error(`Page "${CONFIG.pageName}" not found`);
await page.loadAsync();
await figma.setCurrentPageAsync(page);

const collections = await figma.variables.getLocalVariableCollectionsAsync();
const allVars = await figma.variables.getLocalVariablesAsync();

const findVar = (ref) => {
  if (!ref) return null;
  if (!ref.collection) return allVars.find((v) => v.name === ref.name) || null;
  const coll = collections.find((c) => c.name === ref.collection);
  if (!coll) throw new Error(`Variable collection "${ref.collection}" not found`);
  return allVars.find((v) => v.name === ref.name && v.variableCollectionId === coll.id) || null;
};

const axisNames = Object.keys(CONFIG.axes);
if (axisNames.length < 1 || axisNames.length > 2) {
  throw new Error('CONFIG.axes must define 1 or 2 axes');
}

// Cartesian product of all axis values
const cartesian = (arrs) =>
  arrs.reduce((acc, arr) => acc.flatMap((a) => arr.map((b) => [...a, b])), [[]]);
const allCombos = cartesian(axisNames.map((n) => CONFIG.axes[n])).map((tuple) => {
  const o = {};
  axisNames.forEach((n, i) => (o[n] = tuple[i]));
  return o;
});

// Validate every variable resolves before creating any nodes
const missing = new Set();
for (const combo of allCombos) {
  const b = CONFIG.resolveBindings(combo);
  for (const [key, ref] of Object.entries(b)) {
    if (ref && !findVar(ref)) {
      missing.add(`${ref.collection || 'Color'} :: ${ref.name} (used as ${key} for ${JSON.stringify(combo)})`);
    }
  }
}
if (missing.size) throw new Error('Missing variables:\n  ' + [...missing].join('\n  '));

const buildVariant = async (combo) => {
  const comp = figma.createComponent();
  comp.name = axisNames.map((n) => `${n}=${combo[n]}`).join(', ');
  comp.layoutMode = CONFIG.frame.layoutMode;
  comp.primaryAxisSizingMode = CONFIG.frame.primaryAxisSizingMode;
  comp.counterAxisSizingMode = CONFIG.frame.counterAxisSizingMode;
  comp.resize(CONFIG.frame.width, CONFIG.layout.cellHeightHint);

  const b = CONFIG.resolveBindings(combo);

  if (b.padding) {
    const v = findVar(b.padding);
    for (const side of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
      comp.setBoundVariable(side, v);
    }
  }
  if (b.itemSpacing) {
    comp.itemSpacing = 0;
    comp.setBoundVariable('itemSpacing', findVar(b.itemSpacing));
  }
  if (b.radius) {
    const v = findVar(b.radius);
    for (const c of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) {
      comp.setBoundVariable(c, v);
    }
  }
  if (b.fill) {
    const paint = figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 },
      'color',
      findVar(b.fill)
    );
    comp.fills = [paint];
  }
  if (b.stroke) {
    const paint = figma.variables.setBoundVariableForPaint(
      { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 },
      'color',
      findVar(b.stroke)
    );
    comp.strokes = [paint];
    comp.strokeWeight = CONFIG.stroke.weight;
    comp.strokeAlign = CONFIG.stroke.align;
  }

  await CONFIG.buildInner(comp);
  return comp;
};

// Default-combination variant created first AND placed at grid (0, 0).
// Both inputs feed Figma's variant-default heuristic.
const defaultCombo = {};
axisNames.forEach((n) => (defaultCombo[n] = CONFIG.axes[n][0]));
const isDefault = (c) => axisNames.every((n) => c[n] === defaultCombo[n]);

const built = [];
built.push({ variant: await buildVariant(defaultCombo), combo: defaultCombo });
for (const combo of allCombos) {
  if (isDefault(combo)) continue;
  built.push({ variant: await buildVariant(combo), combo });
}

// Place in a grid: axes[0] = columns, axes[1] = rows
const colAxis = axisNames[0];
const rowAxis = axisNames[1] || null;
const colIdx = Object.fromEntries(CONFIG.axes[colAxis].map((v, i) => [v, i]));
const rowIdx = rowAxis ? Object.fromEntries(CONFIG.axes[rowAxis].map((v, i) => [v, i])) : null;

for (const { variant, combo } of built) {
  variant.x = colIdx[combo[colAxis]] * (CONFIG.frame.width + CONFIG.layout.colGap);
  variant.y = rowAxis
    ? rowIdx[combo[rowAxis]] * (CONFIG.layout.cellHeightHint + CONFIG.layout.rowGap)
    : 0;
}

const set = figma.combineAsVariants(built.map((b) => b.variant), page);
set.name = CONFIG.setName;
set.description = CONFIG.description;
set.x = CONFIG.position.x;
set.y = CONFIG.position.y;

return JSON.stringify({
  setId: set.id,
  setName: set.name,
  defaults: set.componentPropertyDefinitions,
  variantCount: set.children.length,
});
