import { describe, it, expect } from "vitest";
import {
  encodeNodeId,
  buildFigmaUrl,
  enrichIssuesWithUrls,
} from "./figma-urls.js";

describe("encodeNodeId", () => {
  it("replaces colon with hyphen", () => {
    expect(encodeNodeId("1:23")).toBe("1-23");
  });

  it("handles multiple colons", () => {
    expect(encodeNodeId("1:2:3")).toBe("1-2-3");
  });

  it("handles node ID with no colon", () => {
    expect(encodeNodeId("abc")).toBe("abc");
  });

  it("handles zero-prefixed IDs", () => {
    expect(encodeNodeId("0:1")).toBe("0-1");
  });

  it("handles large node IDs", () => {
    expect(encodeNodeId("456:78901")).toBe("456-78901");
  });
});

describe("buildFigmaUrl", () => {
  it("builds a URL for a main file key", () => {
    expect(buildFigmaUrl("abcDEF123", "1:23")).toBe(
      "https://www.figma.com/design/abcDEF123/?node-id=1-23",
    );
  });

  it("builds a URL for a branch file key", () => {
    expect(buildFigmaUrl("branchXYZ789", "45:678")).toBe(
      "https://www.figma.com/design/branchXYZ789/?node-id=45-678",
    );
  });

  it("encodes the node ID colon as a hyphen", () => {
    const url = buildFigmaUrl("fileKey", "100:200");
    expect(url).toContain("node-id=100-200");
    const nodeIdParam = url.split("node-id=")[1];
    expect(nodeIdParam).not.toContain(":");
  });

  it("handles single-digit node IDs", () => {
    expect(buildFigmaUrl("f", "0:1")).toBe(
      "https://www.figma.com/design/f/?node-id=0-1",
    );
  });
});

describe("enrichIssuesWithUrls", () => {
  it("adds figmaUrl to each issue using the main file key", () => {
    const issues = [
      { nodeId: "1:23", layerName: "Frame 1" },
      { nodeId: "4:56", layerName: "Group 2" },
    ];

    const enriched = enrichIssuesWithUrls(issues, "mainFileKey");

    expect(enriched).toHaveLength(2);
    expect(enriched[0].figmaUrl).toBe(
      "https://www.figma.com/design/mainFileKey/?node-id=1-23",
    );
    expect(enriched[1].figmaUrl).toBe(
      "https://www.figma.com/design/mainFileKey/?node-id=4-56",
    );
  });

  it("uses the branch key in URLs when a branch key is passed as the effective file key", () => {
    const issues = [{ nodeId: "10:20", componentName: "Button" }];

    const enriched = enrichIssuesWithUrls(issues, "branchABC");

    expect(enriched[0].figmaUrl).toBe(
      "https://www.figma.com/design/branchABC/?node-id=10-20",
    );
  });

  it("preserves all original issue properties", () => {
    const issues = [
      {
        nodeId: "1:1",
        componentName: "Card",
        layerName: "Vector",
        layerType: "VECTOR",
        parentName: "icon-wrapper",
        suggestedName: "vector",
      },
    ];

    const enriched = enrichIssuesWithUrls(issues, "fk");

    expect(enriched[0]).toMatchObject({
      nodeId: "1:1",
      componentName: "Card",
      layerName: "Vector",
      layerType: "VECTOR",
      parentName: "icon-wrapper",
      suggestedName: "vector",
    });
    expect(enriched[0]).toHaveProperty("figmaUrl");
  });

  it("does not mutate the original issues array", () => {
    const original = [{ nodeId: "1:1", name: "test" }];
    const enriched = enrichIssuesWithUrls(original, "fk");

    expect(original[0]).not.toHaveProperty("figmaUrl");
    expect(enriched[0]).toHaveProperty("figmaUrl");
    expect(enriched).not.toBe(original);
  });

  it("returns an empty array when given an empty array", () => {
    const enriched = enrichIssuesWithUrls([], "fk");
    expect(enriched).toEqual([]);
  });

  it("works with issues that have extra nested properties", () => {
    const issues = [
      {
        nodeId: "5:6",
        occurrences: [
          { type: "FRAME", id: "5:7", index: 0 },
          { type: "FRAME", id: "5:8", index: 1 },
        ],
      },
    ];

    const enriched = enrichIssuesWithUrls(issues, "fk");

    expect(enriched[0].occurrences).toHaveLength(2);
    expect(enriched[0].figmaUrl).toBe(
      "https://www.figma.com/design/fk/?node-id=5-6",
    );
  });

  it("generates different URLs when switching between main and branch keys", () => {
    const issues = [{ nodeId: "1:1" }];

    const mainResult = enrichIssuesWithUrls(issues, "mainKey");
    const branchResult = enrichIssuesWithUrls(issues, "branchKey");

    expect(mainResult[0].figmaUrl).toBe(
      "https://www.figma.com/design/mainKey/?node-id=1-1",
    );
    expect(branchResult[0].figmaUrl).toBe(
      "https://www.figma.com/design/branchKey/?node-id=1-1",
    );
    expect(mainResult[0].figmaUrl).not.toBe(branchResult[0].figmaUrl);
  });
});
