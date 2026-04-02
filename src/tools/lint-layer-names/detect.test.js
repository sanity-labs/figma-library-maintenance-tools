import { describe, it, expect } from "vitest";
import {
  isGenericName,
  suggestName,
  detectGenericNames,
  detectGenericNamesOnPage,
} from "./detect.js";

// ---------------------------------------------------------------------------
// isGenericName
// ---------------------------------------------------------------------------
describe("isGenericName", () => {
  describe("matches generic/default Figma layer names", () => {
    const genericNames = [
      "Frame 1",
      "Frame 42",
      "Group 2",
      "Group 100",
      "Rectangle 3",
      "Vector",
      "Ellipse 1",
      "Line 5",
      "Polygon 1",
      "Star 2",
      "Boolean 1",
      "Image",
      "Image 7",
      "Frame",
      "Group",
      "Rectangle",
      "Ellipse",
      "Line",
      "Polygon",
      "Star",
      "Boolean",
    ];

    it.each(genericNames)('returns true for "%s"', (name) => {
      expect(isGenericName(name)).toBe(true);
    });
  });

  describe("rejects non-generic layer names", () => {
    const nonGenericNames = [
      "icon-frame",
      "Main Group",
      "bg-rectangle",
      "Vector Icon",
      "my-vector",
      "Button",
      "Card",
      "Header",
      "icon",
      "label-text",
      "Frame Extra Stuff",
      "Frame 1 copy",
      "Group hello",
      "My Rectangle 3",
      "the Vector",
      "1 Frame",
      "frame 1",
      "FRAME 1",
      "rectangle",
      "",
      "123",
    ];

    it.each(nonGenericNames)('returns false for "%s"', (name) => {
      expect(isGenericName(name)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// suggestName
// ---------------------------------------------------------------------------
describe("suggestName", () => {
  it('returns "{childName}-wrapper" when the node has exactly one child', () => {
    const node = {
      id: "1:1",
      name: "Frame 1",
      type: "FRAME",
      children: [{ id: "1:2", name: "icon", type: "INSTANCE" }],
    };
    expect(suggestName(node)).toBe("icon-wrapper");
  });

  it("uses the single child name verbatim for the wrapper suggestion", () => {
    const node = {
      id: "2:1",
      name: "Group 5",
      type: "GROUP",
      children: [{ id: "2:2", name: "profile-avatar", type: "ELLIPSE" }],
    };
    expect(suggestName(node)).toBe("profile-avatar-wrapper");
  });

  it('returns "container" when the node has multiple children', () => {
    const node = {
      id: "3:1",
      name: "Frame 2",
      type: "FRAME",
      children: [
        { id: "3:2", name: "icon", type: "INSTANCE" },
        { id: "3:3", name: "label", type: "TEXT" },
      ],
    };
    expect(suggestName(node)).toBe("container");
  });

  it('returns "container" for three or more children', () => {
    const node = {
      id: "4:1",
      name: "Group 1",
      type: "GROUP",
      children: [
        { id: "4:2", name: "a", type: "FRAME" },
        { id: "4:3", name: "b", type: "FRAME" },
        { id: "4:4", name: "c", type: "FRAME" },
      ],
    };
    expect(suggestName(node)).toBe("container");
  });

  it("returns lowercased node type for a RECTANGLE leaf node", () => {
    const node = {
      id: "5:1",
      name: "Rectangle 3",
      type: "RECTANGLE",
      children: [],
    };
    expect(suggestName(node)).toBe("rectangle");
  });

  it("returns lowercased node type for a VECTOR leaf node", () => {
    const node = {
      id: "6:1",
      name: "Vector",
      type: "VECTOR",
      children: [],
    };
    expect(suggestName(node)).toBe("vector");
  });

  it("returns lowercased node type for an ELLIPSE leaf node", () => {
    const node = {
      id: "7:1",
      name: "Ellipse 1",
      type: "ELLIPSE",
      children: [],
    };
    expect(suggestName(node)).toBe("ellipse");
  });

  it("treats a node with no children array the same as empty children", () => {
    const node = {
      id: "8:1",
      name: "Line 2",
      type: "LINE",
    };
    expect(suggestName(node)).toBe("line");
  });
});

// ---------------------------------------------------------------------------
// detectGenericNames
// ---------------------------------------------------------------------------
describe("detectGenericNames", () => {
  it("returns an empty array for a component with no children", () => {
    const component = {
      id: "10:0",
      name: "EmptyComponent",
      type: "COMPONENT",
      children: [],
    };
    const issues = detectGenericNames(component, "EmptyComponent", null);
    expect(issues).toEqual([]);
  });

  it("returns an empty array when no layers have generic names", () => {
    const component = {
      id: "11:0",
      name: "CleanButton",
      type: "COMPONENT",
      children: [
        { id: "11:1", name: "icon", type: "INSTANCE", children: [] },
        { id: "11:2", name: "label", type: "TEXT", children: [] },
        {
          id: "11:3",
          name: "background",
          type: "RECTANGLE",
          children: [],
        },
      ],
    };
    const issues = detectGenericNames(component, "CleanButton", null);
    expect(issues).toEqual([]);
  });

  it("detects generic names and returns correct issue metadata", () => {
    const component = {
      id: "12:0",
      name: "Card",
      type: "COMPONENT",
      children: [
        {
          id: "12:1",
          name: "Frame 1",
          type: "FRAME",
          children: [{ id: "12:2", name: "title", type: "TEXT", children: [] }],
        },
        { id: "12:3", name: "Rectangle 3", type: "RECTANGLE", children: [] },
      ],
    };

    const issues = detectGenericNames(component, "Card", null);

    expect(issues).toHaveLength(2);

    expect(issues[0]).toEqual({
      componentName: "Card",
      layerName: "Frame 1",
      layerType: "FRAME",
      nodeId: "12:1",
      parentName: "Card",
      childNames: ["title"],
      suggestedName: "title-wrapper",
    });

    expect(issues[1]).toEqual({
      componentName: "Card",
      layerName: "Rectangle 3",
      layerType: "RECTANGLE",
      nodeId: "12:3",
      parentName: "Card",
      childNames: [],
      suggestedName: "rectangle",
    });
  });

  it("returns only generic-name layers, leaving properly named layers out", () => {
    const component = {
      id: "13:0",
      name: "MixedComponent",
      type: "COMPONENT",
      children: [
        { id: "13:1", name: "header", type: "FRAME", children: [] },
        { id: "13:2", name: "Group 2", type: "GROUP", children: [] },
        { id: "13:3", name: "content-area", type: "FRAME", children: [] },
        { id: "13:4", name: "Vector", type: "VECTOR", children: [] },
        { id: "13:5", name: "footer", type: "FRAME", children: [] },
      ],
    };

    const issues = detectGenericNames(component, "MixedComponent", null);

    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.layerName)).toEqual(["Group 2", "Vector"]);
  });

  it("finds nested generics at any depth", () => {
    const component = {
      id: "14:0",
      name: "DeepComponent",
      type: "COMPONENT",
      children: [
        {
          id: "14:1",
          name: "wrapper",
          type: "FRAME",
          children: [
            {
              id: "14:2",
              name: "inner",
              type: "FRAME",
              children: [
                {
                  id: "14:3",
                  name: "Ellipse 1",
                  type: "ELLIPSE",
                  children: [],
                },
              ],
            },
          ],
        },
        {
          id: "14:4",
          name: "Frame 1",
          type: "FRAME",
          children: [
            { id: "14:5", name: "Line 5", type: "LINE", children: [] },
          ],
        },
      ],
    };

    const issues = detectGenericNames(component, "DeepComponent", null);

    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.layerName)).toEqual([
      "Ellipse 1",
      "Frame 1",
      "Line 5",
    ]);
    expect(issues.map((i) => i.nodeId)).toEqual(["14:3", "14:4", "14:5"]);
  });

  it("never flags the component node itself, even if it has a generic-style name", () => {
    const component = {
      id: "15:0",
      name: "Frame 1",
      type: "COMPONENT",
      children: [{ id: "15:1", name: "label", type: "TEXT", children: [] }],
    };

    const issues = detectGenericNames(component, "Frame 1", null);
    expect(issues).toEqual([]);
  });

  it("includes variantName when provided", () => {
    const variant = {
      id: "16:0",
      name: "State=Default",
      type: "COMPONENT",
      children: [{ id: "16:1", name: "Frame 1", type: "FRAME", children: [] }],
    };

    const issues = detectGenericNames(variant, "Button", "State=Default");

    expect(issues).toHaveLength(1);
    expect(issues[0].componentName).toBe("Button");
    expect(issues[0].variantName).toBe("State=Default");
  });

  it("omits variantName from the issue when it is null", () => {
    const component = {
      id: "17:0",
      name: "IconButton",
      type: "COMPONENT",
      children: [{ id: "17:1", name: "Vector", type: "VECTOR", children: [] }],
    };

    const issues = detectGenericNames(component, "IconButton", null);

    expect(issues).toHaveLength(1);
    expect(issues[0]).not.toHaveProperty("variantName");
  });

  it("reports correct parentName for deeply nested issues", () => {
    const component = {
      id: "18:0",
      name: "Avatar",
      type: "COMPONENT",
      children: [
        {
          id: "18:1",
          name: "ring",
          type: "FRAME",
          children: [
            {
              id: "18:2",
              name: "Ellipse 1",
              type: "ELLIPSE",
              children: [],
            },
          ],
        },
      ],
    };

    const issues = detectGenericNames(component, "Avatar", null);

    expect(issues).toHaveLength(1);
    expect(issues[0].parentName).toBe("ring");
  });

  it("reports childNames correctly for a generic layer with children", () => {
    const component = {
      id: "19:0",
      name: "Card",
      type: "COMPONENT",
      children: [
        {
          id: "19:1",
          name: "Group 1",
          type: "GROUP",
          children: [
            { id: "19:2", name: "alpha", type: "TEXT", children: [] },
            { id: "19:3", name: "beta", type: "TEXT", children: [] },
            { id: "19:4", name: "gamma", type: "TEXT", children: [] },
          ],
        },
      ],
    };

    const issues = detectGenericNames(component, "Card", null);

    expect(issues).toHaveLength(1);
    expect(issues[0].childNames).toEqual(["alpha", "beta", "gamma"]);
    expect(issues[0].suggestedName).toBe("container");
  });

  it("handles a component whose only children are all generic", () => {
    const component = {
      id: "20:0",
      name: "Messy",
      type: "COMPONENT",
      children: [
        { id: "20:1", name: "Frame 1", type: "FRAME", children: [] },
        { id: "20:2", name: "Rectangle 1", type: "RECTANGLE", children: [] },
        {
          id: "20:3",
          name: "Boolean 1",
          type: "BOOLEAN_OPERATION",
          children: [],
        },
      ],
    };

    const issues = detectGenericNames(component, "Messy", null);
    expect(issues).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// detectGenericNamesOnPage
// ---------------------------------------------------------------------------
describe("detectGenericNamesOnPage", () => {
  it("detects generic names across the entire page tree", () => {
    const page = {
      id: "0:1",
      name: "Components",
      type: "CANVAS",
      children: [
        { id: "1:1", name: "Frame 1", type: "FRAME", children: [] },
        {
          id: "1:2",
          name: "my-section",
          type: "SECTION",
          children: [
            { id: "2:1", name: "Vector", type: "VECTOR" },
            { id: "2:2", name: "label", type: "TEXT" },
          ],
        },
        { id: "1:3", name: "icon", type: "INSTANCE" },
      ],
    };

    const issues = detectGenericNamesOnPage(page, "Components");
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      componentName: "Components",
      layerName: "Frame 1",
      nodeId: "1:1",
    });
    expect(issues[1]).toMatchObject({
      componentName: "Components",
      layerName: "Vector",
      nodeId: "2:1",
    });
  });

  it("does not skip component or component-set nodes", () => {
    const page = {
      id: "0:1",
      name: "Page",
      type: "CANVAS",
      children: [
        {
          id: "1:1",
          name: "ButtonSet",
          type: "COMPONENT_SET",
          children: [
            {
              id: "2:1",
              name: "Default",
              type: "COMPONENT",
              children: [
                { id: "3:1", name: "Group 1", type: "GROUP", children: [] },
              ],
            },
          ],
        },
      ],
    };

    const issues = detectGenericNamesOnPage(page, "Page");
    expect(issues).toHaveLength(1);
    expect(issues[0].layerName).toBe("Group 1");
    expect(issues[0].nodeId).toBe("3:1");
  });

  it("skips the page node itself", () => {
    const page = {
      id: "0:1",
      name: "Frame 1",
      type: "CANVAS",
      children: [],
    };

    const issues = detectGenericNamesOnPage(page, "Frame 1");
    expect(issues).toHaveLength(0);
  });

  it("sets componentName to the provided pageName", () => {
    const page = {
      id: "0:1",
      name: "Building blocks",
      type: "CANVAS",
      children: [{ id: "1:1", name: "Rectangle 1", type: "RECTANGLE" }],
    };

    const issues = detectGenericNamesOnPage(page, "Building blocks");
    expect(issues[0].componentName).toBe("Building blocks");
  });

  it("does not set variantName on any issue", () => {
    const page = {
      id: "0:1",
      name: "Page",
      type: "CANVAS",
      children: [{ id: "1:1", name: "Ellipse 1", type: "ELLIPSE" }],
    };

    const issues = detectGenericNamesOnPage(page, "Page");
    expect(issues[0]).not.toHaveProperty("variantName");
  });

  it("returns empty array for a page with no generic names", () => {
    const page = {
      id: "0:1",
      name: "Page",
      type: "CANVAS",
      children: [
        { id: "1:1", name: "header", type: "FRAME", children: [] },
        { id: "1:2", name: "footer", type: "FRAME", children: [] },
      ],
    };

    const issues = detectGenericNamesOnPage(page, "Page");
    expect(issues).toEqual([]);
  });

  it("finds deeply nested generic names", () => {
    const page = {
      id: "0:1",
      name: "Page",
      type: "CANVAS",
      children: [
        {
          id: "1:1",
          name: "wrapper",
          type: "FRAME",
          children: [
            {
              id: "2:1",
              name: "inner",
              type: "FRAME",
              children: [{ id: "3:1", name: "Star 2", type: "STAR" }],
            },
          ],
        },
      ],
    };

    const issues = detectGenericNamesOnPage(page, "Page");
    expect(issues).toHaveLength(1);
    expect(issues[0].layerName).toBe("Star 2");
    expect(issues[0].parentName).toBe("inner");
  });
});
