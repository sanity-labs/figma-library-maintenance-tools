import { describe, it, expect } from "vitest";
import {
  isHardcodedText,
  buildTextStyleMap,
  suggestTextStyle,
  detectHardcodedText,
  detectHardcodedTextOnPage,
} from "./detect.js";

describe("isHardcodedText", () => {
  it("returns true for TEXT node with empty textStyleId", () => {
    expect(isHardcodedText({ type: "TEXT", textStyleId: "" })).toBe(true);
  });

  it("returns true for TEXT node with missing textStyleId", () => {
    expect(isHardcodedText({ type: "TEXT" })).toBe(true);
  });

  it("returns true for TEXT node with whitespace-only textStyleId", () => {
    expect(isHardcodedText({ type: "TEXT", textStyleId: "  " })).toBe(true);
  });

  it("returns false for TEXT node with a valid textStyleId", () => {
    expect(isHardcodedText({ type: "TEXT", textStyleId: "S:abc123," })).toBe(false);
  });

  it("returns false for non-TEXT nodes", () => {
    expect(isHardcodedText({ type: "FRAME", textStyleId: "" })).toBe(false);
  });

  it("returns false for FRAME nodes without textStyleId", () => {
    expect(isHardcodedText({ type: "FRAME" })).toBe(false);
  });
});

describe("buildTextStyleMap", () => {
  it("builds a map from font size and style to name", () => {
    const styles = [
      { name: "Text 1/Medium", fontSize: 13, fontName: { family: "Inter", style: "Medium" } },
      { name: "Text 1/Bold", fontSize: 13, fontName: { family: "Inter", style: "Bold" } },
    ];
    const map = buildTextStyleMap(styles);
    expect(map.get("13:Medium")).toBe("Text 1/Medium");
    expect(map.get("13:Bold")).toBe("Text 1/Bold");
  });

  it("defaults fontStyle to Regular when missing", () => {
    const styles = [{ name: "Text 0/Regular", fontSize: 10 }];
    const map = buildTextStyleMap(styles);
    expect(map.get("10:Regular")).toBe("Text 0/Regular");
  });

  it("returns empty map for null input", () => {
    expect(buildTextStyleMap(null).size).toBe(0);
  });

  it("returns empty map for empty array", () => {
    expect(buildTextStyleMap([]).size).toBe(0);
  });

  it("skips styles missing fontSize", () => {
    const styles = [{ name: "Bad Style" }];
    expect(buildTextStyleMap(styles).size).toBe(0);
  });
});

describe("suggestTextStyle", () => {
  const map = new Map([
    ["13:Medium", "Text 1/Medium"],
    ["13:Bold", "Text 1/Bold"],
    ["10:Regular", "Text 0/Regular"],
  ]);

  it("returns exact match when fontSize and fontStyle match", () => {
    const node = { fontSize: 13, fontName: { family: "Inter", style: "Medium" } };
    expect(suggestTextStyle(node, map)).toBe("Text 1/Medium");
  });

  it("returns a size-based match when exact style doesn't match", () => {
    const node = { fontSize: 13, fontName: { family: "Inter", style: "Regular" } };
    const result = suggestTextStyle(node, map);
    // Should match one of the 13px styles
    expect(result).toMatch(/Text 1\//);
  });

  it("returns undefined when no match exists", () => {
    const node = { fontSize: 99, fontName: { family: "Inter", style: "Regular" } };
    expect(suggestTextStyle(node, map)).toBeUndefined();
  });

  it("returns undefined when node has no fontSize", () => {
    const node = {};
    expect(suggestTextStyle(node, map)).toBeUndefined();
  });
});

describe("detectHardcodedText", () => {
  const styleMap = new Map([["13:Medium", "Text 1/Medium"]]);

  it("detects text nodes without a text style", () => {
    const component = {
      id: "1:1",
      name: "root",
      type: "COMPONENT",
      children: [
        { id: "2:1", name: "label", type: "TEXT", textStyleId: "", fontSize: 13, fontName: { family: "Inter", style: "Medium" } },
      ],
    };
    const issues = detectHardcodedText(component, "Button", null, styleMap);
    expect(issues).toHaveLength(1);
    expect(issues[0].componentName).toBe("Button");
    expect(issues[0].layerName).toBe("label");
    expect(issues[0].fontSize).toBe(13);
    expect(issues[0].suggestedStyle).toBe("Text 1/Medium");
  });

  it("skips text nodes with a text style applied", () => {
    const component = {
      id: "1:1",
      name: "root",
      type: "COMPONENT",
      children: [
        { id: "2:1", name: "label", type: "TEXT", textStyleId: "S:abc," },
      ],
    };
    const issues = detectHardcodedText(component, "Button", null, styleMap);
    expect(issues).toHaveLength(0);
  });

  it("skips non-TEXT nodes", () => {
    const component = {
      id: "1:1",
      name: "root",
      type: "COMPONENT",
      children: [
        { id: "2:1", name: "frame", type: "FRAME", children: [] },
      ],
    };
    const issues = detectHardcodedText(component, "Button", null, styleMap);
    expect(issues).toHaveLength(0);
  });

  it("includes variantName when provided", () => {
    const component = {
      id: "1:1",
      name: "root",
      type: "COMPONENT",
      children: [
        { id: "2:1", name: "label", type: "TEXT", textStyleId: "" },
      ],
    };
    const issues = detectHardcodedText(component, "Button", "size=large", styleMap);
    expect(issues[0].variantName).toBe("size=large");
  });

  it("includes font details when available", () => {
    const component = {
      id: "1:1",
      name: "root",
      type: "COMPONENT",
      children: [
        {
          id: "2:1",
          name: "text",
          type: "TEXT",
          textStyleId: "",
          fontSize: 16,
          fontName: { family: "Inter", style: "Semi Bold" },
        },
      ],
    };
    const issues = detectHardcodedText(component, "Card", null, new Map());
    expect(issues[0].fontSize).toBe(16);
    expect(issues[0].fontFamily).toBe("Inter");
    expect(issues[0].fontStyle).toBe("Semi Bold");
  });
});

describe("detectHardcodedTextOnPage", () => {
  it("scans all text nodes on a page", () => {
    const page = {
      id: "0:1",
      name: "TestPage",
      type: "PAGE",
      children: [
        {
          id: "1:1",
          name: "frame",
          type: "FRAME",
          children: [
            { id: "2:1", name: "label", type: "TEXT", textStyleId: "" },
            { id: "2:2", name: "styled", type: "TEXT", textStyleId: "S:abc," },
          ],
        },
      ],
    };
    const issues = detectHardcodedTextOnPage(page, new Map());
    expect(issues).toHaveLength(1);
    expect(issues[0].layerName).toBe("label");
    expect(issues[0].componentName).toBe("TestPage");
  });
});
