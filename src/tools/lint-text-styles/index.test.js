import { describe, it, expect } from "vitest";
import { lintTextStyles } from "./index.js";

const makeFileData = (pages) => ({
  document: {
    id: "0:0",
    name: "Document",
    type: "DOCUMENT",
    children: pages,
  },
});

describe("lintTextStyles", () => {
  it("detects hardcoded text in component-scoped mode", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Components",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "Button",
            type: "COMPONENT_SET",
            children: [
              {
                id: "3:1",
                name: "size=default",
                type: "COMPONENT",
                children: [
                  { id: "4:1", name: "label", type: "TEXT", textStyleId: "", fontSize: 13 },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const report = await lintTextStyles({
      fileKey: "test",
      scope: "components",
      fileData,
    });
    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0].layerName).toBe("label");
    expect(report.summary.scope).toBe("components");
  });

  it("skips styled text nodes", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Components",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "Badge",
            type: "COMPONENT",
            children: [
              { id: "3:1", name: "label", type: "TEXT", textStyleId: "S:abc123," },
            ],
          },
        ],
      },
    ]);
    const report = await lintTextStyles({
      fileKey: "test",
      scope: "components",
      fileData,
    });
    expect(report.summary.totalIssues).toBe(0);
  });

  it("respects page filter", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Components",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "Button",
            type: "COMPONENT",
            children: [{ id: "3:1", name: "a", type: "TEXT", textStyleId: "" }],
          },
        ],
      },
      {
        id: "1:2",
        name: "Other",
        type: "PAGE",
        children: [
          {
            id: "2:2",
            name: "Card",
            type: "COMPONENT",
            children: [{ id: "3:2", name: "b", type: "TEXT", textStyleId: "" }],
          },
        ],
      },
    ]);
    const report = await lintTextStyles({
      fileKey: "test",
      pages: ["Components"],
      scope: "components",
      fileData,
    });
    expect(report.issues.every((i) => i.componentName === "Button")).toBe(true);
  });

  it("includes text style suggestions when textStylesData is provided", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Components",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "Tag",
            type: "COMPONENT",
            children: [
              { id: "3:1", name: "label", type: "TEXT", textStyleId: "", fontSize: 13, fontName: { family: "Inter", style: "Medium" } },
            ],
          },
        ],
      },
    ]);
    const textStylesData = [
      { name: "Text 1/Medium", fontSize: 13, fontName: { family: "Inter", style: "Medium" } },
    ];
    const report = await lintTextStyles({
      fileKey: "test",
      scope: "components",
      fileData,
      textStylesData,
    });
    expect(report.issues[0].suggestedStyle).toBe("Text 1/Medium");
  });

  it("works without textStylesData (no suggestions)", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Components",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "Tag",
            type: "COMPONENT",
            children: [
              { id: "3:1", name: "label", type: "TEXT", textStyleId: "" },
            ],
          },
        ],
      },
    ]);
    const report = await lintTextStyles({
      fileKey: "test",
      scope: "components",
      fileData,
    });
    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0]).not.toHaveProperty("suggestedStyle");
  });

  it("scans all nodes in all scope mode", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Page",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "loose-frame",
            type: "FRAME",
            children: [
              { id: "3:1", name: "stray-text", type: "TEXT", textStyleId: "" },
            ],
          },
        ],
      },
    ]);
    const report = await lintTextStyles({
      fileKey: "test",
      scope: "all",
      fileData,
    });
    expect(report.summary.totalIssues).toBe(1);
  });

  it("excludes pages listed in excludePages", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Components",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "A",
            type: "COMPONENT",
            children: [{ id: "3:1", name: "t", type: "TEXT", textStyleId: "" }],
          },
        ],
      },
      {
        id: "1:2",
        name: ".labs",
        type: "PAGE",
        children: [
          {
            id: "2:2",
            name: "B",
            type: "COMPONENT",
            children: [{ id: "3:2", name: "t", type: "TEXT", textStyleId: "" }],
          },
        ],
      },
    ]);
    const report = await lintTextStyles({
      fileKey: "test",
      scope: "components",
      excludePages: [".labs"],
      fileData,
    });
    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0].componentName).toBe("A");
  });
});
