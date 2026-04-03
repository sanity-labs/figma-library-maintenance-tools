import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the Figma client — verify it is NEVER called when fileData is provided
// ---------------------------------------------------------------------------
const { mockGetFile, mockGetLocalVariables, mockCreateFigmaClient } = vi.hoisted(() => {
  const mockGetFile = vi.fn();
  const mockGetLocalVariables = vi.fn();
  const mockCreateFigmaClient = vi.fn(() => ({
    getFile: mockGetFile,
    getFileNodes: vi.fn(),
    getFileComponents: vi.fn(),
    getLocalVariables: mockGetLocalVariables,
  }));
  return { mockGetFile, mockGetLocalVariables, mockCreateFigmaClient };
});

vi.mock("../../shared/figma-client.js", () => ({
  createFigmaClient: mockCreateFigmaClient,
}));

// ---------------------------------------------------------------------------
// Import all orchestrators
// ---------------------------------------------------------------------------
import { lintLayerNames } from "../lint-layer-names/index.js";
import { lintDuplicateSiblings } from "../lint-duplicate-siblings/index.js";
import { lintAutolayoutValues } from "../lint-autolayout-values/index.js";
import { checkDescriptionCoverage } from "../check-descriptions/index.js";
import { auditPropertyNames } from "../audit-property-names/index.js";
import { scanPageHygiene } from "../scan-page-hygiene/index.js";

// ---------------------------------------------------------------------------
// Shared test data — a minimal file with one component containing a generic
// layer name, one missing description, one duplicate sibling, and one
// unbound autolayout value.
// ---------------------------------------------------------------------------

function makeFileData() {
  return {
    document: {
      children: [
        {
          id: "page:1",
          name: "Components",
          type: "CANVAS",
          children: [
            {
              id: "set:Badge",
              name: "Badge",
              type: "COMPONENT_SET",
              description: "",
              componentPropertyDefinitions: {
                "tone": {
                  type: "VARIANT",
                  defaultValue: "default",
                  variantOptions: ["default", "primary"],
                },
                "Property 1": {
                  type: "BOOLEAN",
                  defaultValue: true,
                },
              },
              children: [
                {
                  id: "comp:v1",
                  name: "tone=default",
                  type: "COMPONENT",
                  layoutMode: "HORIZONTAL",
                  paddingTop: 4,
                  paddingRight: 4,
                  paddingBottom: 4,
                  paddingLeft: 4,
                  itemSpacing: 4,
                  boundVariables: {},
                  children: [
                    {
                      id: "layer:1",
                      name: "Frame 1",
                      type: "FRAME",
                      children: [
                        { id: "layer:2", name: "label", type: "TEXT", children: [] },
                      ],
                    },
                    {
                      id: "layer:3",
                      name: "flex",
                      type: "FRAME",
                      children: [],
                    },
                    {
                      id: "layer:4",
                      name: "flex",
                      type: "FRAME",
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function makeVariablesData() {
  return {
    meta: {
      variableCollections: {
        "vc:1": {
          id: "vc:1",
          name: "Space",
          modes: [{ modeId: "mode:1", name: "default" }],
          variableIds: ["var:0", "var:1"],
        },
      },
      variables: {
        "var:0": {
          id: "var:0",
          name: "space/0",
          variableCollectionId: "vc:1",
          resolvedType: "FLOAT",
          valuesByMode: { "mode:1": 0 },
        },
        "var:1": {
          id: "var:1",
          name: "space/1",
          variableCollectionId: "vc:1",
          resolvedType: "FLOAT",
          valuesByMode: { "mode:1": 4 },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fileData bypass — REST client is never called", () => {
  it("lintLayerNames works with fileData", async () => {
    mockCreateFigmaClient.mockClear();
    mockGetFile.mockClear();

    const report = await lintLayerNames({
      fileKey: "test123",
      fileData: makeFileData(),
    });

    expect(mockCreateFigmaClient).not.toHaveBeenCalled();
    expect(mockGetFile).not.toHaveBeenCalled();
    expect(report.title).toBe("Generic Layer Name Lint");
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.layerName === "Frame 1")).toBe(true);
  });

  it("lintDuplicateSiblings works with fileData", async () => {
    mockCreateFigmaClient.mockClear();
    mockGetFile.mockClear();

    const report = await lintDuplicateSiblings({
      fileKey: "test123",
      fileData: makeFileData(),
    });

    expect(mockCreateFigmaClient).not.toHaveBeenCalled();
    expect(mockGetFile).not.toHaveBeenCalled();
    expect(report.title).toBe("Duplicate Sibling Name Report");
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.duplicatedName === "flex")).toBe(true);
  });

  it("lintAutolayoutValues works with fileData + variablesData", async () => {
    mockCreateFigmaClient.mockClear();
    mockGetFile.mockClear();
    mockGetLocalVariables.mockClear();

    const report = await lintAutolayoutValues({
      fileKey: "test123",
      fileData: makeFileData(),
      variablesData: makeVariablesData(),
    });

    expect(mockCreateFigmaClient).not.toHaveBeenCalled();
    expect(mockGetFile).not.toHaveBeenCalled();
    expect(mockGetLocalVariables).not.toHaveBeenCalled();
    expect(report.title).toBe("Unbound Auto-Layout Values Report");
  });

  it("lintAutolayoutValues throws when fileData is provided without variablesData", async () => {
    await expect(
      lintAutolayoutValues({
        fileKey: "test123",
        fileData: makeFileData(),
      }),
    ).rejects.toThrow("variablesData");
  });

  it("checkDescriptionCoverage works with fileData", async () => {
    mockCreateFigmaClient.mockClear();
    mockGetFile.mockClear();

    const report = await checkDescriptionCoverage({
      fileKey: "test123",
      fileData: makeFileData(),
    });

    expect(mockCreateFigmaClient).not.toHaveBeenCalled();
    expect(mockGetFile).not.toHaveBeenCalled();
    expect(report.title).toBe("Component Description Coverage Report");
    // Badge has empty description → should be flagged
    expect(report.summary.missingDescriptions).toBe(1);
  });

  it("auditPropertyNames works with fileData", async () => {
    mockCreateFigmaClient.mockClear();
    mockGetFile.mockClear();

    const report = await auditPropertyNames({
      fileKey: "test123",
      fileData: makeFileData(),
    });

    expect(mockCreateFigmaClient).not.toHaveBeenCalled();
    expect(mockGetFile).not.toHaveBeenCalled();
    expect(report.title).toBe("Property Naming Convention Report");
    // "Property 1" is a default name → should be flagged
    expect(report.issues.some((i) => i.propertyName === "Property 1")).toBe(true);
  });

  it("scanPageHygiene works with fileData", async () => {
    mockCreateFigmaClient.mockClear();
    mockGetFile.mockClear();

    const report = await scanPageHygiene({
      fileKey: "test123",
      fileData: makeFileData(),
    });

    expect(mockCreateFigmaClient).not.toHaveBeenCalled();
    expect(mockGetFile).not.toHaveBeenCalled();
    expect(report.title).toBe("Page Hygiene Report");
    // Only a COMPONENT_SET on the page → all expected
    expect(report.summary.unexpectedItems).toBe(0);
  });
});

describe("fileData bypass — page filtering still works", () => {
  it("respects pages filter with fileData", async () => {
    const report = await lintLayerNames({
      fileKey: "test123",
      fileData: makeFileData(),
      pages: ["Nonexistent Page"],
    });

    expect(report.issues.length).toBe(0);
    expect(report.summary.totalComponents).toBe(0);
  });

  it("respects excludePages filter with fileData", async () => {
    const report = await lintLayerNames({
      fileKey: "test123",
      fileData: makeFileData(),
      excludePages: ["Components"],
    });

    expect(report.issues.length).toBe(0);
    expect(report.summary.totalComponents).toBe(0);
  });
});
