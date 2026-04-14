/**
 * Remap Remote Variables — Figma Plugin API Fix Script
 * =====================================================
 *
 * Rebinds all remote variable bindings under a target node to local
 * variables with the same name. Designed to run via the Figma MCP
 * `use_figma` tool after copying a component from an external library.
 *
 * Usage:
 *   1. Set TARGET_NODE_ID to the component set (or subtree root).
 *   2. Optionally set COLLECTION_FILTER to limit which local collections
 *      are indexed (avoids WASM memory limits on large files).
 *   3. Pass this file as the `code` parameter to `use_figma`.
 *
 * Collection filtering:
 *   Large files can have thousands of local variables. Iterating all of
 *   them in a single Plugin API script can exceed the WASM sandbox memory
 *   limit (~3K variables). Set COLLECTION_FILTER to an array of collection
 *   name substrings to only index matching collections:
 *
 *     var COLLECTION_FILTER = ["v4 Element tone", "v4 Card tone"];
 *
 *   Set to null to index all collections (only safe for smaller files).
 *   Run the script multiple times with different filters to cover all
 *   collections without hitting memory limits.
 *
 * Effects handling:
 *   Multi-shadow effects (e.g. umbra + penumbra + ambient) store bindings
 *   in a flat array across all effects and fields. This script groups
 *   bindings by effect index and infers the correct field name (color,
 *   offsetX, offsetY, radius, spread) from each variable's type and name.
 *   This handles the common shadow variable naming convention:
 *     shadow/<level>/<layer>/blur   → radius
 *     shadow/<level>/<layer>/spread → spread
 *     shadow/<level>/<layer>/x      → offsetX
 *     shadow/<level>/<layer>/y      → offsetY
 *     color/shadow/<layer>          → color
 */

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
var TARGET_NODE_ID = "__TARGET_NODE_ID__";
var COLLECTION_FILTER = __COLLECTION_FILTER__;  // null or ["name1", "name2"]
// ─────────────────────────────────────────────────────────────────────────────

// Step 1: Build local variable lookup by name (filtered by collection)
var collections = figma.variables.getLocalVariableCollections();
var localByName = {};
for (var ci = 0; ci < collections.length; ci++) {
  var coll = collections[ci];
  if (COLLECTION_FILTER) {
    var match = false;
    for (var fi = 0; fi < COLLECTION_FILTER.length; fi++) {
      if (coll.name === COLLECTION_FILTER[fi]) { match = true; break; }
    }
    if (!match) continue;
  }
  for (var vi = 0; vi < coll.variableIds.length; vi++) {
    var v = figma.variables.getVariableById(coll.variableIds[vi]);
    if (v && !localByName[v.name]) {
      localByName[v.name] = v;
    }
  }
}

// Step 2: Get target node
var targetNode = figma.getNodeById(TARGET_NODE_ID);
if (!targetNode) {
  return { error: "Node " + TARGET_NODE_ID + " not found" };
}

// Step 3: Helper — infer effect field from variable type and name
function inferEffectField(resolvedType, varName) {
  if (resolvedType === "COLOR") return "color";
  if (resolvedType !== "FLOAT") return null;
  if (varName.indexOf("/blur") !== -1) return "radius";
  if (varName.indexOf("/spread") !== -1) return "spread";
  if (/\/x$/.test(varName)) return "offsetX";
  if (/\/y$/.test(varName)) return "offsetY";
  return null;
}

// Step 4: Remap function
var remapped = 0;
var skipped = 0;
var missingLocal = [];
var effectsRemapped = 0;
var effectsSkipped = 0;
var errors = [];

function remapNode(node) {
  var bindings = node.boundVariables || {};

  for (var field in bindings) {
    if (!bindings.hasOwnProperty(field)) continue;
    var binding = bindings[field];

    // ── Paint fields (fills, strokes) ───────────────────────────────────
    if (field === "fills" || field === "strokes") {
      var paintArr = node[field];
      if (!paintArr) continue;
      var bindArr = Array.isArray(binding) ? binding : [binding];

      for (var pi = 0; pi < bindArr.length; pi++) {
        var pb = bindArr[pi];
        if (!pb || !pb.id) continue;
        try {
          var pVar = figma.variables.getVariableById(pb.id);
          if (!pVar || !pVar.remote) { skipped++; continue; }
          var pLocal = localByName[pVar.name];
          if (!pLocal) {
            missingLocal.push(pVar.name);
            continue;
          }
          var newPaints = paintArr.slice();
          newPaints[pi] = figma.variables.setBoundVariableForPaint(
            newPaints[pi], "color", pLocal
          );
          node[field] = newPaints;
          remapped++;
        } catch (e) {
          errors.push({ nodeId: node.id, field: field, index: pi, error: e.message });
        }
      }

    // ── Effect fields — per-effect grouped remapping ────────────────────
    } else if (field === "effects") {
      var effectArr = node[field];
      if (!effectArr || effectArr.length === 0) continue;
      var eBind = Array.isArray(binding) ? binding : [binding];
      if (eBind.length === 0) continue;

      // Group bindings by effect index.
      // The flat bindings array has (fieldsPerEffect * effectCount) entries.
      var effectCount = effectArr.length;
      var fieldsPerEffect = Math.max(1, Math.floor(eBind.length / effectCount));

      var newEffects = effectArr.slice();
      var changed = false;

      for (var ei = 0; ei < eBind.length; ei++) {
        var eb = eBind[ei];
        if (!eb || !eb.id) continue;
        try {
          var eVar = figma.variables.getVariableById(eb.id);
          if (!eVar || !eVar.remote) { effectsSkipped++; continue; }
          var eLocal = localByName[eVar.name];
          if (!eLocal) {
            missingLocal.push(eVar.name);
            continue;
          }

          // Determine which effect this binding belongs to
          var effectIdx = Math.min(
            Math.floor(ei / fieldsPerEffect),
            effectCount - 1
          );

          // Infer the correct field for this variable
          var eField = inferEffectField(eLocal.resolvedType, eVar.name);
          if (!eField) {
            missingLocal.push("(unknown field) " + eVar.name);
            continue;
          }

          newEffects[effectIdx] = figma.variables.setBoundVariableForEffect(
            newEffects[effectIdx], eField, eLocal
          );
          changed = true;
          effectsRemapped++;
        } catch (e) {
          errors.push({ nodeId: node.id, field: "effects", index: ei, error: e.message });
        }
      }

      if (changed) node.effects = newEffects;

    // ── Scalar fields (spacing, radius, strokeWeight, etc.) ─────────────
    } else {
      var sb = Array.isArray(binding) ? binding[0] : binding;
      if (!sb || !sb.id) continue;
      try {
        var sVar = figma.variables.getVariableById(sb.id);
        if (!sVar || !sVar.remote) { skipped++; continue; }
        var sLocal = localByName[sVar.name];
        if (!sLocal) {
          missingLocal.push(sVar.name);
          continue;
        }
        node.setBoundVariable(field, sLocal);
        remapped++;
      } catch (e) {
        errors.push({ nodeId: node.id, field: field, error: e.message });
      }
    }
  }

  if ("children" in node && node.children) {
    for (var chi = 0; chi < node.children.length; chi++) {
      remapNode(node.children[chi]);
    }
  }
}

// Process: walk the target node and all descendants
if ("children" in targetNode && targetNode.children) {
  for (var ti = 0; ti < targetNode.children.length; ti++) {
    remapNode(targetNode.children[ti]);
  }
}
// Also check bindings on the target node itself
remapNode(targetNode);

// Deduplicate missing names
var uniqueMissing = [];
var seenMissing = {};
for (var mi = 0; mi < missingLocal.length; mi++) {
  if (!seenMissing[missingLocal[mi]]) {
    seenMissing[missingLocal[mi]] = true;
    uniqueMissing.push(missingLocal[mi]);
  }
}

return {
  summary: "Remapped " + (remapped + effectsRemapped) + " bindings (" +
    remapped + " scalar/paint, " + effectsRemapped + " effects). Skipped " +
    (skipped + effectsSkipped) + " (already local). " + errors.length +
    " errors. " + uniqueMissing.length + " unmatched names.",
  remapped: remapped + effectsRemapped,
  remappedScalar: remapped,
  remappedEffects: effectsRemapped,
  skipped: skipped + effectsSkipped,
  errorCount: errors.length,
  errors: errors.length > 20 ? errors.slice(0, 20) : errors,
  missingLocalMatches: uniqueMissing,
  collectionsIndexed: COLLECTION_FILTER || "(all)",
};
