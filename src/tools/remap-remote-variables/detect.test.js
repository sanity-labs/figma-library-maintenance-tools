import { describe, it, expect } from "vitest";
import {
  buildLocalVariableIdSet,
  buildLocalVariablesByName,
  resolveVariableName,
  isRemoteBinding,
  inferEffectField,
  detectRemoteBindingsOnNode,
  detectRemoteBindings,
  detectRemoteBindingsOnPage,
} from "./detect.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVariablesResponse(variables = {}, collections = {}) {
  return {
    meta: {
      variableCollections: collections,
      variables,
    },
  };
}

const LOCAL_VARS = {
  "VariableID:100:1": {
    id: "VariableID:100:1",
    name: "space/2",
    variableCollectionId: "coll:1",
    resolvedType: "FLOAT",
    valuesByMode: { "mode:1": 8 },
  },
  "VariableID:100:2": {
    id: "VariableID:100:2",
    name: "radius/3",
    variableCollectionId: "coll:1",
    resolvedType: "FLOAT",
    valuesByMode: { "mode:1": 7 },
  },
  "VariableID:100:3": {
    id: "VariableID:100:3",
    name: "color/solid/bg/0",
    variableCollectionId: "coll:2",
    resolvedType: "COLOR",
    valuesByMode: { "mode:1": { r: 0.2, g: 0.2, b: 0.2, a: 1 } },
  },
};

const VARIABLES_RESPONSE = makeVariablesResponse(LOCAL_VARS, {
  "coll:1": { id: "coll:1", name: "Theme", modes: [{ modeId: "mode:1" }], variableIds: ["VariableID:100:1", "VariableID:100:2"] },
  "coll:2": { id: "coll:2", name: "Color", modes: [{ modeId: "mode:1" }], variableIds: ["VariableID:100:3"] },
});

// ---------------------------------------------------------------------------
// buildLocalVariableIdSet
// ---------------------------------------------------------------------------

describe("buildLocalVariableIdSet", () => {
  it("returns a set of all variable IDs", () => {
    const ids = buildLocalVariableIdSet(VARIABLES_RESPONSE);
    expect(ids.size).toBe(3);
    expect(ids.has("VariableID:100:1")).toBe(true);
    expect(ids.has("VariableID:100:2")).toBe(true);
    expect(ids.has("VariableID:100:3")).toBe(true);
  });

  it("returns empty set for null input", () => {
    expect(buildLocalVariableIdSet(null).size).toBe(0);
  });

  it("returns empty set for missing meta", () => {
    expect(buildLocalVariableIdSet({}).size).toBe(0);
    expect(buildLocalVariableIdSet({ meta: {} }).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildLocalVariablesByName
// ---------------------------------------------------------------------------

describe("buildLocalVariablesByName", () => {
  it("builds a name-keyed map of local variables", () => {
    const byName = buildLocalVariablesByName(VARIABLES_RESPONSE);
    expect(byName.size).toBe(3);
    expect(byName.get("space/2").id).toBe("VariableID:100:1");
    expect(byName.get("radius/3").id).toBe("VariableID:100:2");
    expect(byName.get("color/solid/bg/0").id).toBe("VariableID:100:3");
  });

  it("returns empty map for null input", () => {
    expect(buildLocalVariablesByName(null).size).toBe(0);
  });

  it("keeps first variable when names collide", () => {
    const dupeResponse = makeVariablesResponse({
      "v:1": { id: "v:1", name: "shared-name", variableCollectionId: "c:1", resolvedType: "FLOAT" },
      "v:2": { id: "v:2", name: "shared-name", variableCollectionId: "c:2", resolvedType: "FLOAT" },
    });
    const byName = buildLocalVariablesByName(dupeResponse);
    expect(byName.size).toBe(1);
    expect(byName.get("shared-name").id).toBe("v:1");
  });
});

// ---------------------------------------------------------------------------
// resolveVariableName
// ---------------------------------------------------------------------------

describe("resolveVariableName", () => {
  it("returns binding.name when present (MCP path)", () => {
    expect(resolveVariableName({ id: "v:99", name: "space/4" }, null)).toBe("space/4");
  });

  it("falls back to variables response lookup (REST API path)", () => {
    expect(
      resolveVariableName({ id: "VariableID:100:1" }, VARIABLES_RESPONSE),
    ).toBe("space/2");
  });

  it("returns null for missing binding", () => {
    expect(resolveVariableName(null, VARIABLES_RESPONSE)).toBeNull();
  });

  it("returns null when ID not found in variables response", () => {
    expect(resolveVariableName({ id: "unknown:999" }, VARIABLES_RESPONSE)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isRemoteBinding
// ---------------------------------------------------------------------------

describe("isRemoteBinding", () => {
  const localIds = buildLocalVariableIdSet(VARIABLES_RESPONSE);

  it("returns false for a local variable", () => {
    expect(isRemoteBinding({ id: "VariableID:100:1" }, localIds)).toBe(false);
  });

  it("returns true for a remote variable", () => {
    expect(isRemoteBinding({ id: "VariableID:999:1" }, localIds)).toBe(true);
  });

  it("returns false for null binding", () => {
    expect(isRemoteBinding(null, localIds)).toBe(false);
  });

  it("returns false for binding without id", () => {
    expect(isRemoteBinding({}, localIds)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectRemoteBindingsOnNode
// ---------------------------------------------------------------------------

describe("detectRemoteBindingsOnNode", () => {
  const localIds = buildLocalVariableIdSet(VARIABLES_RESPONSE);
  const localByName = buildLocalVariablesByName(VARIABLES_RESPONSE);

  it("returns empty array for a node with no bound variables", () => {
    const node = { id: "1:1", name: "Clean", type: "FRAME" };
    expect(detectRemoteBindingsOnNode(node, localIds, localByName, VARIABLES_RESPONSE)).toEqual([]);
  });

  it("returns empty array when all bindings are local", () => {
    const node = {
      id: "1:1",
      name: "LocalFrame",
      type: "FRAME",
      boundVariables: {
        paddingLeft: { id: "VariableID:100:1", name: "space/2" },
      },
    };
    expect(detectRemoteBindingsOnNode(node, localIds, localByName, VARIABLES_RESPONSE)).toEqual([]);
  });

  it("detects a remote scalar binding with a local match", () => {
    const node = {
      id: "2:1",
      name: "RemoteFrame",
      type: "FRAME",
      boundVariables: {
        paddingLeft: { id: "VariableID:REMOTE:1", name: "space/2" },
      },
    };
    const issues = detectRemoteBindingsOnNode(node, localIds, localByName, VARIABLES_RESPONSE);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("paddingLeft");
    expect(issues[0].status).toBe("remappable");
    expect(issues[0].remoteVariableName).toBe("space/2");
    expect(issues[0].localVariableId).toBe("VariableID:100:1");
  });

  it("detects a remote binding with no local match", () => {
    const node = {
      id: "2:2",
      name: "OrphanFrame",
      type: "FRAME",
      boundVariables: {
        paddingTop: { id: "VariableID:REMOTE:2", name: "space/99" },
      },
    };
    const issues = detectRemoteBindingsOnNode(node, localIds, localByName, VARIABLES_RESPONSE);
    expect(issues).toHaveLength(1);
    expect(issues[0].status).toBe("missing-local");
    expect(issues[0].remoteVariableName).toBe("space/99");
  });

  it("handles array-type bindings (fills, strokes)", () => {
    const node = {
      id: "3:1",
      name: "PaintNode",
      type: "RECTANGLE",
      boundVariables: {
        fills: [
          { id: "VariableID:REMOTE:3", name: "color/solid/bg/0" },
        ],
      },
    };
    const issues = detectRemoteBindingsOnNode(node, localIds, localByName, VARIABLES_RESPONSE);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("fills");
    expect(issues[0].status).toBe("remappable");
    expect(issues[0].localVariableId).toBe("VariableID:100:3");
  });

  it("skips null entries in array bindings", () => {
    const node = {
      id: "3:2",
      name: "SparseNode",
      type: "RECTANGLE",
      boundVariables: {
        fills: [null, { id: "VariableID:100:3" }],
      },
    };
    const issues = detectRemoteBindingsOnNode(node, localIds, localByName, VARIABLES_RESPONSE);
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectRemoteBindings (component-level)
// ---------------------------------------------------------------------------

describe("detectRemoteBindings", () => {
  const localIds = buildLocalVariableIdSet(VARIABLES_RESPONSE);
  const localByName = buildLocalVariablesByName(VARIABLES_RESPONSE);

  it("traverses children and collects remote bindings", () => {
    const tree = {
      id: "10:1",
      name: "Variant1",
      type: "COMPONENT",
      boundVariables: {
        paddingLeft: { id: "VariableID:REMOTE:1", name: "space/2" },
      },
      children: [
        {
          id: "10:2",
          name: "Icon",
          type: "INSTANCE",
          boundVariables: {
            fills: [{ id: "VariableID:REMOTE:3", name: "color/solid/bg/0" }],
          },
        },
      ],
    };

    const issues = detectRemoteBindings(
      tree,
      "Button",
      "Mode=Default, State=Enabled",
      localIds,
      localByName,
      VARIABLES_RESPONSE,
    );

    expect(issues).toHaveLength(2);
    expect(issues[0].componentName).toBe("Button");
    expect(issues[0].variantName).toBe("Mode=Default, State=Enabled");
    expect(issues[0].layerName).toBe("Variant1");
    expect(issues[1].layerName).toBe("Icon");
  });

  it("omits variantName when null", () => {
    const tree = {
      id: "10:1",
      name: "Standalone",
      type: "COMPONENT",
      boundVariables: {
        topLeftRadius: { id: "VariableID:REMOTE:2", name: "radius/3" },
      },
    };

    const issues = detectRemoteBindings(
      tree,
      "Standalone",
      null,
      localIds,
      localByName,
      VARIABLES_RESPONSE,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).not.toHaveProperty("variantName");
  });
});

// ---------------------------------------------------------------------------
// detectRemoteBindingsOnPage (page-level)
// ---------------------------------------------------------------------------

describe("detectRemoteBindingsOnPage", () => {
  const localIds = buildLocalVariableIdSet(VARIABLES_RESPONSE);
  const localByName = buildLocalVariablesByName(VARIABLES_RESPONSE);

  it("scans all nodes on a page", () => {
    const page = {
      id: "0:1",
      name: "Components",
      type: "PAGE",
      children: [
        {
          id: "20:1",
          name: "Frame",
          type: "FRAME",
          boundVariables: {
            itemSpacing: { id: "VariableID:REMOTE:1", name: "space/2" },
          },
        },
        {
          id: "20:2",
          name: "Clean",
          type: "FRAME",
        },
      ],
    };

    const issues = detectRemoteBindingsOnPage(page, localIds, localByName, VARIABLES_RESPONSE);
    expect(issues).toHaveLength(1);
    expect(issues[0].componentName).toBe("Components");
    expect(issues[0].nodeId).toBe("20:1");
  });
});

// ---------------------------------------------------------------------------
// inferEffectField
// ---------------------------------------------------------------------------

describe("inferEffectField", () => {
  it("returns 'color' for COLOR type", () => {
    expect(inferEffectField("COLOR", "color/shadow/ambient")).toBe("color");
    expect(inferEffectField("COLOR", "color/focusRing")).toBe("color");
    expect(inferEffectField("COLOR", "transparent/shadow-outline")).toBe("color");
  });

  it("returns 'radius' for FLOAT with /blur in name", () => {
    expect(inferEffectField("FLOAT", "shadow/2/umbra/blur")).toBe("radius");
    expect(inferEffectField("FLOAT", "shadow/2/penumbra/blur")).toBe("radius");
    expect(inferEffectField("FLOAT", "shadow/2/ambient/blur")).toBe("radius");
  });

  it("returns 'spread' for FLOAT with /spread in name", () => {
    expect(inferEffectField("FLOAT", "shadow/2/umbra/spread")).toBe("spread");
    expect(inferEffectField("FLOAT", "shadow/2/penumbra/spread")).toBe("spread");
    expect(inferEffectField("FLOAT", "shadow/2/ambient/spread")).toBe("spread");
  });

  it("returns 'offsetX' for FLOAT ending in /x", () => {
    expect(inferEffectField("FLOAT", "shadow/2/umbra/x")).toBe("offsetX");
    expect(inferEffectField("FLOAT", "shadow/2/penumbra/x")).toBe("offsetX");
    expect(inferEffectField("FLOAT", "shadow/2/ambient/x")).toBe("offsetX");
  });

  it("returns 'offsetY' for FLOAT ending in /y", () => {
    expect(inferEffectField("FLOAT", "shadow/2/umbra/y")).toBe("offsetY");
    expect(inferEffectField("FLOAT", "shadow/2/penumbra/y")).toBe("offsetY");
    expect(inferEffectField("FLOAT", "shadow/2/ambient/y")).toBe("offsetY");
  });

  it("does not match /x or /y in the middle of a name", () => {
    expect(inferEffectField("FLOAT", "extra/y-axis/size")).toBeNull();
    expect(inferEffectField("FLOAT", "box/horizontal")).toBeNull();
  });

  it("returns null for ambiguous FLOAT names", () => {
    expect(inferEffectField("FLOAT", "card/shadow/outline")).toBeNull();
    expect(inferEffectField("FLOAT", "space/2")).toBeNull();
    expect(inferEffectField("FLOAT", "radius/3")).toBeNull();
  });

  it("returns null for unknown resolved types", () => {
    expect(inferEffectField("STRING", "some/variable")).toBeNull();
    expect(inferEffectField("BOOLEAN", "toggle/value")).toBeNull();
  });
});
