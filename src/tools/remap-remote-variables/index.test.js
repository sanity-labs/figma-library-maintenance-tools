import { describe, it, expect } from "vitest";
import { remapRemoteVariables } from "./index.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeVariablesResponse(variables) {
  return {
    meta: {
      variableCollections: {
        "coll:1": {
          id: "coll:1",
          name: "Theme",
          modes: [{ modeId: "m:1" }],
          variableIds: Object.keys(variables),
        },
      },
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
    valuesByMode: { "m:1": 8 },
  },
  "VariableID:100:2": {
    id: "VariableID:100:2",
    name: "color/bg",
    variableCollectionId: "coll:1",
    resolvedType: "COLOR",
    valuesByMode: { "m:1": { r: 1, g: 1, b: 1, a: 1 } },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("remapRemoteVariables", () => {
  it("throws when variablesData is missing with fileData", async () => {
    await expect(
      remapRemoteVariables({
        fileKey: "abc",
        fileData: { document: { children: [] } },
      }),
    ).rejects.toThrow("variable data");
  });

  it("detects remappable remote bindings in components scope", async () => {
    const fileData = {
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "0:1",
            name: "Components",
            type: "PAGE",
            children: [
              {
                id: "1:1",
                name: "Button",
                type: "COMPONENT_SET",
                children: [
                  {
                    id: "1:2",
                    name: "State=Default",
                    type: "COMPONENT",
                    boundVariables: {
                      paddingLeft: { id: "VariableID:REMOTE:1", name: "space/2" },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const report = await remapRemoteVariables({
      fileKey: "abc",
      fileData,
      variablesData: makeVariablesResponse(LOCAL_VARS),
      scope: "components",
    });

    expect(report.title).toBe("Remote Variable Bindings Report");
    expect(report.summary.totalComponents).toBe(1);
    expect(report.summary.totalIssues).toBe(1);
    expect(report.summary.remappable).toBe(1);
    expect(report.summary.missingLocal).toBe(0);
    expect(report.issues[0].status).toBe("remappable");
    expect(report.issues[0].figmaUrl).toContain("abc");
  });

  it("reports missing-local when no name match exists", async () => {
    const fileData = {
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "0:1",
            name: "Components",
            type: "PAGE",
            children: [
              {
                id: "2:1",
                name: "Card",
                type: "COMPONENT",
                boundVariables: {
                  topLeftRadius: { id: "VariableID:REMOTE:9", name: "radius/unknown" },
                },
              },
            ],
          },
        ],
      },
    };

    const report = await remapRemoteVariables({
      fileKey: "abc",
      fileData,
      variablesData: makeVariablesResponse(LOCAL_VARS),
      scope: "components",
    });

    expect(report.summary.missingLocal).toBe(1);
    expect(report.issues[0].status).toBe("missing-local");
  });

  it("skips excluded pages", async () => {
    const fileData = {
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "0:1",
            name: "Excluded",
            type: "PAGE",
            children: [
              {
                id: "3:1",
                name: "Btn",
                type: "COMPONENT",
                boundVariables: {
                  paddingLeft: { id: "VariableID:REMOTE:1", name: "space/2" },
                },
              },
            ],
          },
        ],
      },
    };

    const report = await remapRemoteVariables({
      fileKey: "abc",
      fileData,
      variablesData: makeVariablesResponse(LOCAL_VARS),
      excludePages: ["Excluded"],
      scope: "components",
    });

    expect(report.summary.totalIssues).toBe(0);
  });

  it("works in all scope (page-level scan)", async () => {
    const fileData = {
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "0:1",
            name: "Page 1",
            type: "PAGE",
            children: [
              {
                id: "4:1",
                name: "LooseFrame",
                type: "FRAME",
                boundVariables: {
                  fills: [{ id: "VariableID:REMOTE:2", name: "color/bg" }],
                },
              },
            ],
          },
        ],
      },
    };

    const report = await remapRemoteVariables({
      fileKey: "abc",
      fileData,
      variablesData: makeVariablesResponse(LOCAL_VARS),
      scope: "all",
    });

    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0].status).toBe("remappable");
  });

  it("returns zero issues when all bindings are local", async () => {
    const fileData = {
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "0:1",
            name: "Components",
            type: "PAGE",
            children: [
              {
                id: "5:1",
                name: "Clean",
                type: "COMPONENT",
                boundVariables: {
                  paddingLeft: { id: "VariableID:100:1", name: "space/2" },
                },
              },
            ],
          },
        ],
      },
    };

    const report = await remapRemoteVariables({
      fileKey: "abc",
      fileData,
      variablesData: makeVariablesResponse(LOCAL_VARS),
      scope: "components",
    });

    expect(report.summary.totalIssues).toBe(0);
  });
});
