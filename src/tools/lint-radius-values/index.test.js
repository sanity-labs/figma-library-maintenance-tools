import { describe, it, expect } from "vitest";
import { lintRadiusValues } from "./index.js";

const makeVariablesData = () => ({
  meta: {
    variableCollections: {
      coll1: {
        id: "coll1",
        name: "Radius",
        modes: [{ modeId: "m1" }],
        variableIds: ["v0", "v2"],
      },
    },
    variables: {
      v0: { name: "0", resolvedType: "FLOAT", variableCollectionId: "coll1", valuesByMode: { m1: 0 } },
      v2: { name: "2", resolvedType: "FLOAT", variableCollectionId: "coll1", valuesByMode: { m1: 3 } },
    },
  },
});

const makeFileData = (pages) => ({
  document: {
    id: "0:0",
    name: "Document",
    type: "DOCUMENT",
    children: pages,
  },
});

describe("lintRadiusValues", () => {
  it("detects unbound radius in component-scoped mode", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Components",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "Card",
            type: "COMPONENT_SET",
            children: [
              {
                id: "3:1",
                name: "size=default",
                type: "COMPONENT",
                topLeftRadius: 5,
                topRightRadius: 5,
                bottomLeftRadius: 5,
                bottomRightRadius: 5,
                children: [],
              },
            ],
          },
        ],
      },
    ]);
    const report = await lintRadiusValues({
      fileKey: "test",
      scope: "components",
      fileData,
      variablesData: makeVariablesData(),
    });
    expect(report.summary.totalIssues).toBe(4);
    expect(report.issues[0].status).toBe("off-scale");
    expect(report.summary.scope).toBe("components");
  });

  it("reports bindable values when they match the scale", async () => {
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
            topLeftRadius: 3,
            children: [],
          },
        ],
      },
    ]);
    const report = await lintRadiusValues({
      fileKey: "test",
      scope: "components",
      fileData,
      variablesData: makeVariablesData(),
    });
    expect(report.issues[0].status).toBe("bindable");
    expect(report.issues[0].suggestedVariable).toBe("2");
  });

  it("skips fully bound nodes", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Components",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "CleanCard",
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
          },
        ],
      },
    ]);
    const report = await lintRadiusValues({
      fileKey: "test",
      scope: "components",
      fileData,
      variablesData: makeVariablesData(),
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
          { id: "2:1", name: "Card", type: "COMPONENT", topLeftRadius: 5, children: [] },
        ],
      },
      {
        id: "1:2",
        name: "Other",
        type: "PAGE",
        children: [
          { id: "3:1", name: "Badge", type: "COMPONENT", topLeftRadius: 5, children: [] },
        ],
      },
    ]);
    const report = await lintRadiusValues({
      fileKey: "test",
      pages: ["Components"],
      scope: "components",
      fileData,
      variablesData: makeVariablesData(),
    });
    expect(report.issues.every((i) => i.componentName === "Card")).toBe(true);
  });

  it("throws when variablesData is missing with fileData", async () => {
    const fileData = makeFileData([]);
    await expect(
      lintRadiusValues({ fileKey: "test", fileData }),
    ).rejects.toThrow("variable data");
  });

  it("scans all nodes in all scope mode", async () => {
    const fileData = makeFileData([
      {
        id: "1:1",
        name: "Components",
        type: "PAGE",
        children: [
          {
            id: "2:1",
            name: "loose-frame",
            type: "FRAME",
            topLeftRadius: 10,
            children: [],
          },
        ],
      },
    ]);
    const report = await lintRadiusValues({
      fileKey: "test",
      scope: "all",
      fileData,
      variablesData: makeVariablesData(),
    });
    expect(report.summary.totalIssues).toBeGreaterThan(0);
  });
});
