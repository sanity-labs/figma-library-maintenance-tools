import { describe, it, expect } from "vitest";
import {
  hasRadiusValues,
  getUnboundRadiusProperties,
  classifyRadiusValue,
  buildRadiusScale,
  detectUnboundRadiusValues,
  detectUnboundRadiusValuesOnPage,
} from "./detect.js";

describe("hasRadiusValues", () => {
  it("returns true when node has topLeftRadius", () => {
    expect(hasRadiusValues({ topLeftRadius: 4 })).toBe(true);
  });

  it("returns true when node has any radius property", () => {
    expect(hasRadiusValues({ bottomRightRadius: 0 })).toBe(true);
  });

  it("returns false when node has no radius properties", () => {
    expect(hasRadiusValues({ name: "frame", type: "FRAME" })).toBe(false);
  });
});

describe("getUnboundRadiusProperties", () => {
  it("returns all radius properties when none are bound", () => {
    const node = {
      topLeftRadius: 4,
      topRightRadius: 4,
      bottomLeftRadius: 4,
      bottomRightRadius: 4,
    };
    const result = getUnboundRadiusProperties(node);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ property: "topLeftRadius", rawValue: 4 });
  });

  it("excludes properties that are bound", () => {
    const node = {
      topLeftRadius: 4,
      topRightRadius: 4,
      bottomLeftRadius: 4,
      bottomRightRadius: 4,
      boundVariables: {
        topLeftRadius: { id: "var1" },
        topRightRadius: { id: "var1" },
      },
    };
    const result = getUnboundRadiusProperties(node);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.property)).toEqual([
      "bottomLeftRadius",
      "bottomRightRadius",
    ]);
  });

  it("returns empty array when all properties are bound", () => {
    const node = {
      topLeftRadius: 4,
      topRightRadius: 4,
      bottomLeftRadius: 4,
      bottomRightRadius: 4,
      boundVariables: {
        topLeftRadius: { id: "v" },
        topRightRadius: { id: "v" },
        bottomLeftRadius: { id: "v" },
        bottomRightRadius: { id: "v" },
      },
    };
    expect(getUnboundRadiusProperties(node)).toHaveLength(0);
  });

  it("includes zero values that are unbound", () => {
    const node = { topLeftRadius: 0 };
    const result = getUnboundRadiusProperties(node);
    expect(result).toEqual([{ property: "topLeftRadius", rawValue: 0 }]);
  });
});

describe("classifyRadiusValue", () => {
  const scale = new Map([
    [0, "0"],
    [1, "1"],
    [3, "2"],
    [7, "3"],
    [11, "4"],
  ]);

  it("returns bindable when value exists in scale", () => {
    expect(classifyRadiusValue(3, scale)).toEqual({
      status: "bindable",
      suggestedVariable: "2",
    });
  });

  it("returns off-scale with nearest values", () => {
    const result = classifyRadiusValue(5, scale);
    expect(result.status).toBe("off-scale");
    expect(result.nearestVariables).toContain("2=3");
    expect(result.nearestVariables).toContain("3=7");
  });

  it("returns off-scale with empty scale", () => {
    expect(classifyRadiusValue(5, new Map())).toEqual({
      status: "off-scale",
      nearestVariables: "no variables in scale",
    });
  });

  it("returns bindable for zero when zero is in the scale", () => {
    expect(classifyRadiusValue(0, scale).status).toBe("bindable");
  });
});

describe("buildRadiusScale", () => {
  it("builds scale from Radius collection", () => {
    const response = {
      meta: {
        variableCollections: {
          coll1: {
            id: "coll1",
            name: "Radius",
            modes: [{ modeId: "m1" }],
            variableIds: ["v1", "v2"],
          },
        },
        variables: {
          v1: {
            name: "0",
            resolvedType: "FLOAT",
            variableCollectionId: "coll1",
            valuesByMode: { m1: 0 },
          },
          v2: {
            name: "2",
            resolvedType: "FLOAT",
            variableCollectionId: "coll1",
            valuesByMode: { m1: 3 },
          },
        },
      },
    };
    const scale = buildRadiusScale(response);
    expect(scale.get(0)).toBe("0");
    expect(scale.get(3)).toBe("2");
  });

  it("returns empty map when no Radius collection exists", () => {
    const response = {
      meta: {
        variableCollections: {
          c: { id: "c", name: "Color", modes: [{ modeId: "m" }], variableIds: [] },
        },
        variables: {},
      },
    };
    expect(buildRadiusScale(response).size).toBe(0);
  });

  it("returns empty map for null input", () => {
    expect(buildRadiusScale(null).size).toBe(0);
  });
});

describe("detectUnboundRadiusValues", () => {
  const scale = new Map([
    [0, "0"],
    [3, "2"],
    [7, "3"],
  ]);

  it("detects unbound radius values in nested nodes", () => {
    const component = {
      id: "1:1",
      name: "root",
      type: "COMPONENT",
      topLeftRadius: 5,
      topRightRadius: 5,
      bottomLeftRadius: 5,
      bottomRightRadius: 5,
      children: [],
    };
    const issues = detectUnboundRadiusValues(component, "Card", null, scale);
    expect(issues).toHaveLength(4);
    expect(issues[0].componentName).toBe("Card");
    expect(issues[0].status).toBe("off-scale");
  });

  it("skips nodes with all radii bound", () => {
    const component = {
      id: "1:1",
      name: "root",
      type: "COMPONENT",
      topLeftRadius: 3,
      topRightRadius: 3,
      bottomLeftRadius: 3,
      bottomRightRadius: 3,
      boundVariables: {
        topLeftRadius: { id: "v" },
        topRightRadius: { id: "v" },
        bottomLeftRadius: { id: "v" },
        bottomRightRadius: { id: "v" },
      },
      children: [],
    };
    const issues = detectUnboundRadiusValues(component, "Card", null, scale);
    expect(issues).toHaveLength(0);
  });

  it("includes variantName when provided", () => {
    const component = {
      id: "1:1",
      name: "root",
      type: "COMPONENT",
      topLeftRadius: 3,
      children: [],
    };
    const issues = detectUnboundRadiusValues(
      component,
      "Card",
      "size=large",
      scale,
    );
    expect(issues[0].variantName).toBe("size=large");
  });

  it("classifies bindable values correctly", () => {
    const component = {
      id: "1:1",
      name: "root",
      type: "COMPONENT",
      topLeftRadius: 3,
      children: [],
    };
    const issues = detectUnboundRadiusValues(component, "Card", null, scale);
    expect(issues[0].status).toBe("bindable");
    expect(issues[0].suggestedVariable).toBe("2");
  });
});

describe("detectUnboundRadiusValuesOnPage", () => {
  const scale = new Map([[0, "0"], [3, "2"]]);

  it("scans all nodes on a page", () => {
    const page = {
      id: "0:1",
      name: "TestPage",
      type: "PAGE",
      children: [
        {
          id: "1:1",
          name: "frame",
          type: "FRAME",
          topLeftRadius: 5,
          topRightRadius: 5,
          bottomLeftRadius: 5,
          bottomRightRadius: 5,
          children: [],
        },
      ],
    };
    const issues = detectUnboundRadiusValuesOnPage(page, scale);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].componentName).toBe("TestPage");
  });
});
