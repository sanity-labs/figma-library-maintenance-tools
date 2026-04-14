/**
 * Remap Remote Variables — Figma Plugin API Fix Script
 * =====================================================
 *
 * Rebinds all remote variable bindings under a target node to local
 * variables with the same name. Designed to run via the Figma MCP
 * `use_figma` tool after copying a component from an external library.
 *
 * Usage:
 *   Replace TARGET_NODE_ID below with the component set (or subtree root)
 *   to process, then pass this entire file as the `code` parameter to
 *   `use_figma`.
 *
 * How it works:
 *   1. Builds a name → Variable lookup from all local variable collections.
 *   2. Recursively walks every descendant of the target node.
 *   3. For each bound variable that is remote, finds the local variable
 *      with the same name and rebinds using:
 *        - node.setBoundVariable()          — scalar fields (spacing, radius, etc.)
 *        - setBoundVariableForPaint()        — fills and strokes
 *        - setBoundVariableForEffect()       — effects (shadows, blurs)
 *   4. Returns a structured report.
 *
 * Handles:
 *   - Scalar properties (paddingLeft, topLeftRadius, itemSpacing, etc.)
 *   - Paint array properties (fills, strokes) via setBoundVariableForPaint
 *   - Effect array properties (shadows, blurs) via setBoundVariableForEffect
 *
 * Limitations:
 *   - Matches variables by exact name only. If the source and target files
 *     use different naming conventions, manual mapping is required.
 *   - Last-write-wins: if a remote variable name matches multiple local
 *     variables, the first one found in collection iteration order is used.
 */

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
var TARGET_NODE_ID = "__TARGET_NODE_ID__"; // ← Replace with the target node ID
// ─────────────────────────────────────────────────────────────────────────────

// Step 1: Build local variable lookup by name
var collections = figma.variables.getLocalVariableCollections();
var localByName = {};
for (var ci = 0; ci < collections.length; ci++) {
  var coll = collections[ci];
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

// Step 3: Remap
var remapped = 0;
var skipped = 0;
var missingLocal = [];
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

    // ── Effect fields (shadows, blurs) ──────────────────────────────────
    } else if (field === "effects") {
      var effectArr = node[field];
      if (!effectArr) continue;
      var eBind = Array.isArray(binding) ? binding : [binding];

      for (var ei = 0; ei < eBind.length; ei++) {
        var eb = eBind[ei];
        if (!eb || !eb.id) continue;
        try {
          var eVar = figma.variables.getVariableById(eb.id);
          if (!eVar || !eVar.remote) { skipped++; continue; }
          var eLocal = localByName[eVar.name];
          if (!eLocal) {
            missingLocal.push(eVar.name);
            continue;
          }
          var newEffects = effectArr.slice();
          newEffects[ei] = figma.variables.setBoundVariableForEffect(
            newEffects[ei], "color", eLocal
          );
          node[field] = newEffects;
          remapped++;
        } catch (e) {
          errors.push({ nodeId: node.id, field: field, index: ei, error: e.message });
        }
      }

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
  summary: "Remapped " + remapped + " bindings. Skipped " + skipped +
    " (already local). " + errors.length + " errors. " +
    uniqueMissing.length + " unmatched remote variable names.",
  remapped: remapped,
  skipped: skipped,
  errorCount: errors.length,
  errors: errors.length > 20 ? errors.slice(0, 20) : errors,
  missingLocalMatches: uniqueMissing,
};
