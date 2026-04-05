/**
 * figma-fix-layer-order.js
 * 
 * Figma Plugin API script — run via `use_figma` MCP tool.
 * Reorders layers within all variants of a given component set to match
 * a canonical order derived from the first variant (or explicitly specified).
 * 
 * What it does:
 * 1. Reads the canonical layer order from the first variant of the target
 *    component set (or from CANONICAL_ORDER if provided).
 * 2. For each subsequent variant, reorders shared layers to match the
 *    canonical relative order.
 * 3. Reports what changed and what couldn't be auto-fixed.
 * 
 * What it does NOT do:
 * - Rename layers (that's a naming hygiene issue, not ordering)
 * - Add missing layers (structural gap, needs manual fix)
 * - Reorder layers with completely different names from canonical
 *   (flags these as structural issues instead)
 * 
 * Usage:
 *   Set COMPONENT_SET_ID to the target component set's node ID.
 *   Optionally set CANONICAL_ORDER to override the first-variant default.
 *   Copy into a `use_figma` call targeting the library branch.
 * 
 * Output format:
 *   {
 *     componentSet: "name",
 *     canonicalOrder: ["layer1", "layer2", ...],
 *     fixed: [{ variant, before, after }],
 *     skipped: [{ variant, reason, layers }],
 *     alreadyCorrect: number
 *   }
 * 
 * Reference: layer-ordering-standard.md
 */

// ── Configuration ───────────────────────────────────────────────────
const COMPONENT_SET_ID = null;  // Required: set to the component set node ID
const CANONICAL_ORDER = null;   // Optional: override with ['layer1', 'layer2', ...]
const DRY_RUN = false;          // Set to true to preview changes without applying
// ────────────────────────────────────────────────────────────────────

if (!COMPONENT_SET_ID) {
  return JSON.stringify({
    error: 'COMPONENT_SET_ID is required. Set it to the node ID of the component set to fix.',
  });
}

const componentSet = figma.getNodeById(COMPONENT_SET_ID);
if (!componentSet || componentSet.type !== 'COMPONENT_SET') {
  return JSON.stringify({
    error: `Node ${COMPONENT_SET_ID} is not a COMPONENT_SET. Got: ${componentSet?.type || 'null'}`,
  });
}

const variants = componentSet.children.filter(c => c.type === 'COMPONENT');
if (variants.length < 2) {
  return JSON.stringify({
    error: 'Component set has fewer than 2 variants. Nothing to check.',
  });
}

// Determine canonical order
const canonical = CANONICAL_ORDER || variants[0].children.map(c => c.name);
const canonicalStr = canonical.join(',');

const fixed = [];
const skipped = [];
let alreadyCorrect = 0;

for (let v = 0; v < variants.length; v++) {
  const variant = variants[v];
  const currentNames = variant.children.map(c => c.name);

  // Check if this variant's shared layers already match canonical order
  const canonicalSet = new Set(canonical);
  const sharedFromCanonical = canonical.filter(n => currentNames.includes(n));
  const sharedFromVariant = currentNames.filter(n => canonicalSet.has(n));

  if (sharedFromCanonical.join(',') === sharedFromVariant.join(',')) {
    alreadyCorrect++;
    continue;
  }

  // Check if all shared names exist (just in different order) vs. structural mismatch
  const sharedCanonicalSet = new Set(sharedFromCanonical);
  const sharedVariantSet = new Set(sharedFromVariant);
  const inCanonicalNotVariant = sharedFromCanonical.filter(n => !sharedVariantSet.has(n));
  const inVariantNotCanonical = sharedFromVariant.filter(n => !sharedCanonicalSet.has(n));

  if (inCanonicalNotVariant.length > 0 || inVariantNotCanonical.length > 0) {
    // Names don't match — this is a structural issue, not an ordering issue
    skipped.push({
      variant: variant.name,
      nodeId: variant.id,
      reason: 'Layer names differ from canonical — structural issue, not ordering',
      currentLayers: currentNames,
      missingFromCanonical: inCanonicalNotVariant,
      extraInVariant: inVariantNotCanonical,
    });
    continue;
  }

  // Same shared names, different order. Reorder to match canonical.
  const beforeOrder = currentNames.slice();

  if (!DRY_RUN) {
    // Build a map of name → node for the layers we need to reorder
    const childByName = {};
    for (const child of variant.children) {
      // If duplicate names exist, track them (but we can only reorder unambiguous ones)
      if (childByName[child.name]) {
        skipped.push({
          variant: variant.name,
          nodeId: variant.id,
          reason: `Duplicate layer name "${child.name}" — cannot reorder unambiguously`,
          currentLayers: currentNames,
        });
        continue;
      }
      childByName[child.name] = child;
    }

    // Reorder: walk through canonical order and insertChild at the correct position
    // We only move layers that are shared with canonical.
    // Strategy: for each canonical name (in order), find the node and move it
    // to the correct index.
    let targetIdx = 0;
    for (const name of canonical) {
      if (!childByName[name]) continue;
      
      const node = childByName[name];
      // Find current index of this node
      const currentIdx = variant.children.indexOf(node);

      if (currentIdx !== targetIdx) {
        variant.insertChild(targetIdx, node);
      }
      targetIdx++;
    }
  }

  const afterOrder = variant.children.map(c => c.name);
  fixed.push({
    variant: variant.name,
    nodeId: variant.id,
    before: beforeOrder,
    after: DRY_RUN ? '(dry run — not applied)' : afterOrder,
  });
}

return JSON.stringify({
  componentSet: componentSet.name,
  canonicalOrder: canonical,
  dryRun: DRY_RUN,
  fixed: fixed,
  skipped: skipped,
  alreadyCorrect: alreadyCorrect,
  totalVariants: variants.length,
}, null, 2);
