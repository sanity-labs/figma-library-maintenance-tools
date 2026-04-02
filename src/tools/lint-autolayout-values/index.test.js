import { describe, it, expect, vi, beforeEach } from "vitest";
import { lintAutolayoutValues } from "./index.js";

vi.mock("../../shared/figma-client.js", () => ({
  createFigmaClient: vi.fn(),
}));

import { createFigmaClient } from "../../shared/figma-client.js";

/**
 * Builds a minimal fake Figma file response for testing.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode[]} pages - Array of page nodes
 * @returns {Object} Fake Figma API file response
 */
function buildFakeFileResponse(pages) {
  return {
    document: {
      id: "0:0",
      name: "Document",
      type: "DOCUMENT",
      children: pages,
    },
  };
}

/**
 * Builds a fake Figma local variables API response with a Space collection.
 *
 * @param {Array<{ name: string, value: number }>} variables - Variable entries to include
 * @returns {Object} Fake local variables response
 */
function buildFakeVariablesResponse(variables) {
  const vars = {};
  for (let i = 0; i < variables.length; i++) {
    vars[`v${i}`] = {
      name: variables[i].name,
      resolvedType: "FLOAT",
      variableCollectionId: "space-coll",
      valuesByMode: { "mode-1": variables[i].value },
    };
  }

  return {
    meta: {
      variableCollections: {
        "space-coll": {
          id: "space-coll",
          name: "Space",
          modes: [{ modeId: "mode-1", name: "Default" }],
        },
      },
      variables: vars,
    },
  };
}

/**
 * Standard space scale entries used across most tests.
 *
 * @returns {Array<{ name: string, value: number }>} Space variable definitions
 */
function standardSpaceEntries() {
  return [
    { name: "Space/0", value: 0 },
    { name: "Space/1", value: 4 },
    { name: "Space/2", value: 8 },
    { name: "Space/3", value: 12 },
    { name: "Space/4", value: 16 },
    { name: "Space/5", value: 24 },
  ];
}

/**
 * Creates a mock Figma client that resolves getFile and getLocalVariables
 * with the given responses.
 *
 * @param {Object} fileResponse - The fake file response to return
 * @param {Object} variablesResponse - The fake local variables response to return
 * @returns {{ getFile: import('vitest').Mock, getLocalVariables: import('vitest').Mock }} Mocked client
 */
function setupMockClient(fileResponse, variablesResponse) {
  const mockClient = {
    getFile: vi.fn().mockResolvedValue(fileResponse),
    getLocalVariables: vi.fn().mockResolvedValue(variablesResponse),
  };
  createFigmaClient.mockReturnValue(mockClient);
  return mockClient;
}

describe("lintAutolayoutValues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a report with correct title and summary structure", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Button",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "Container",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                paddingTop: 8,
                paddingRight: 16,
                paddingBottom: 8,
                paddingLeft: 16,
                itemSpacing: 4,
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.title).toBe("Unbound Auto-Layout Values Report");
    expect(report.summary).toBeDefined();
    expect(typeof report.summary.totalComponents).toBe("number");
    expect(typeof report.summary.totalIssues).toBe("number");
    expect(typeof report.summary.bindable).toBe("number");
    expect(typeof report.summary.offScale).toBe("number");
    expect(typeof report.summary.exceptions).toBe("number");
    expect(Array.isArray(report.issues)).toBe(true);
  });

  it("returns correct counts for bindable issues", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Card",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "Content",
                type: "FRAME",
                layoutMode: "VERTICAL",
                paddingTop: 8,
                paddingBottom: 8,
                itemSpacing: 4,
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(report.summary.totalIssues).toBe(3);
    expect(report.summary.bindable).toBe(3);
    expect(report.summary.offScale).toBe(0);
    expect(report.summary.exceptions).toBe(0);
    expect(report.issues).toHaveLength(3);
  });

  it("returns zero issues when all values are bound", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Tag",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "Inner",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                paddingTop: 4,
                paddingRight: 8,
                paddingBottom: 4,
                paddingLeft: 8,
                itemSpacing: 4,
                boundVariables: {
                  paddingTop: { id: "v1", type: "VARIABLE_ALIAS" },
                  paddingRight: { id: "v2", type: "VARIABLE_ALIAS" },
                  paddingBottom: { id: "v3", type: "VARIABLE_ALIAS" },
                  paddingLeft: { id: "v4", type: "VARIABLE_ALIAS" },
                  itemSpacing: { id: "v5", type: "VARIABLE_ALIAS" },
                },
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(report.summary.totalIssues).toBe(0);
    expect(report.summary.bindable).toBe(0);
    expect(report.summary.offScale).toBe(0);
    expect(report.summary.exceptions).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it("handles component sets with variant children", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Button",
            type: "COMPONENT_SET",
            children: [
              {
                id: "4:0",
                name: "Size=Small",
                type: "COMPONENT",
                children: [
                  {
                    id: "5:0",
                    name: "Row",
                    type: "FRAME",
                    layoutMode: "HORIZONTAL",
                    paddingTop: 4,
                    itemSpacing: 8,
                  },
                ],
              },
              {
                id: "4:1",
                name: "Size=Large",
                type: "COMPONENT",
                children: [
                  {
                    id: "6:0",
                    name: "Row",
                    type: "FRAME",
                    layoutMode: "HORIZONTAL",
                    paddingTop: 12,
                    itemSpacing: 16,
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.summary.totalIssues).toBe(4);
    expect(report.summary.bindable).toBe(4);

    const smallIssues = report.issues.filter(
      (i) => i.variantName === "Size=Small",
    );
    const largeIssues = report.issues.filter(
      (i) => i.variantName === "Size=Large",
    );

    expect(smallIssues).toHaveLength(2);
    expect(largeIssues).toHaveLength(2);
    expect(smallIssues[0].componentName).toBe("Button");
    expect(largeIssues[0].componentName).toBe("Button");
  });

  it("filters pages when the pages option is provided", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Icons",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "StarIcon",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "Frame",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                paddingTop: 8,
              },
            ],
          },
        ],
      },
      {
        id: "1:1",
        name: "Buttons",
        type: "CANVAS",
        children: [
          {
            id: "2:1",
            name: "PrimaryBtn",
            type: "COMPONENT",
            children: [
              {
                id: "3:1",
                name: "Container",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                paddingTop: 12,
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: ["Buttons"],
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(report.issues.every((i) => i.componentName === "PrimaryBtn")).toBe(
      true,
    );
  });

  it("processes all pages when pages option is an empty array", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page A",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "CompA",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "Frame",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                paddingTop: 8,
              },
            ],
          },
        ],
      },
      {
        id: "1:1",
        name: "Page B",
        type: "CANVAS",
        children: [
          {
            id: "2:1",
            name: "CompB",
            type: "COMPONENT",
            children: [
              {
                id: "3:1",
                name: "Frame",
                type: "FRAME",
                layoutMode: "VERTICAL",
                itemSpacing: 4,
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.summary.totalIssues).toBe(2);
  });

  it("creates the Figma client with the provided access token and fetches both file and variables", async () => {
    const fileResponse = buildFakeFileResponse([
      { id: "1:0", name: "Page", type: "CANVAS", children: [] },
    ]);
    const variablesResponse = buildFakeVariablesResponse([]);

    const mockClient = setupMockClient(fileResponse, variablesResponse);

    await lintAutolayoutValues({
      accessToken: "my-secret-token",
      fileKey: "xyz789",
      pages: [],
    });

    expect(createFigmaClient).toHaveBeenCalledWith({
      accessToken: "my-secret-token",
    });
    expect(mockClient.getFile).toHaveBeenCalledWith("xyz789");
    expect(mockClient.getLocalVariables).toHaveBeenCalledWith("xyz789");
  });

  it("counts off-scale and exception statuses separately", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "MixedComp",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "Frame",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                paddingTop: 8,
                paddingRight: 10,
                paddingBottom: -4,
                paddingLeft: 16,
                itemSpacing: 7,
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalIssues).toBe(5);
    expect(report.summary.bindable).toBe(2);
    expect(report.summary.offScale).toBe(2);
    expect(report.summary.exceptions).toBe(1);
  });

  it("finds issues across both standalone components and component sets", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Mixed",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Standalone",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "Inner",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                paddingTop: 4,
              },
            ],
          },
          {
            id: "2:1",
            name: "CardSet",
            type: "COMPONENT_SET",
            children: [
              {
                id: "4:0",
                name: "Variant=A",
                type: "COMPONENT",
                children: [
                  {
                    id: "5:0",
                    name: "Row",
                    type: "FRAME",
                    layoutMode: "VERTICAL",
                    itemSpacing: 12,
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.summary.totalIssues).toBe(2);

    const standaloneIssue = report.issues.find(
      (i) => i.componentName === "Standalone",
    );
    expect(standaloneIssue).toBeDefined();
    expect(standaloneIssue.variantName).toBeUndefined();

    const variantIssue = report.issues.find(
      (i) => i.componentName === "CardSet",
    );
    expect(variantIssue).toBeDefined();
    expect(variantIssue.variantName).toBe("Variant=A");
  });

  it("returns zero issues for components with no auto-layout frames", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "StaticComp",
            type: "COMPONENT",
            children: [
              { id: "3:0", name: "Rect", type: "RECTANGLE" },
              { id: "3:1", name: "Text", type: "TEXT" },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(report.summary.totalIssues).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it("works correctly when the variables response has no Space collection", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Chip",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "Layout",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                paddingTop: 4,
                itemSpacing: 8,
              },
            ],
          },
        ],
      },
    ]);

    const noSpaceResponse = {
      meta: {
        variableCollections: {
          coll1: {
            id: "coll1",
            name: "Color",
            modes: [{ modeId: "m1", name: "Light" }],
          },
        },
        variables: {},
      },
    };

    setupMockClient(fileResponse, noSpaceResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(report.summary.totalIssues).toBe(2);
    // With no space scale, all values should be off-scale
    expect(report.summary.offScale).toBe(2);
    expect(report.summary.bindable).toBe(0);
  });

  it("populates issue fields with correct componentName, layerName, and nodeId", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Alert",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "AlertBody",
                type: "FRAME",
                layoutMode: "VERTICAL",
                paddingTop: 16,
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.issues).toHaveLength(1);
    const issue = report.issues[0];
    expect(issue.componentName).toBe("Alert");
    expect(issue.layerName).toBe("AlertBody");
    expect(issue.nodeId).toBe("3:0");
    expect(issue.property).toBe("paddingTop");
    expect(issue.rawValue).toBe(16);
    expect(issue.status).toBe("bindable");
    expect(issue.suggestedVariable).toBe("Space/4");
    expect(issue.figmaUrl).toBe(
      "https://www.figma.com/design/abc123/?node-id=3-0",
    );
  });

  it("detects issues from deeply nested auto-layout frames", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "DeepComp",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "Wrapper",
                type: "FRAME",
                layoutMode: "VERTICAL",
                paddingTop: 8,
                children: [
                  {
                    id: "4:0",
                    name: "Inner",
                    type: "FRAME",
                    layoutMode: "HORIZONTAL",
                    itemSpacing: 4,
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalIssues).toBe(2);

    const wrapperIssue = report.issues.find((i) => i.nodeId === "3:0");
    expect(wrapperIssue).toBeDefined();
    expect(wrapperIssue.layerName).toBe("Wrapper");

    const innerIssue = report.issues.find((i) => i.nodeId === "4:0");
    expect(innerIssue).toBeDefined();
    expect(innerIssue.layerName).toBe("Inner");
  });

  it("uses branchKey as the effective file key when provided", async () => {
    const fileResponse = buildFakeFileResponse([
      { id: "1:0", name: "Page", type: "CANVAS", children: [] },
    ]);
    const variablesResponse = buildFakeVariablesResponse([]);

    const mockClient = setupMockClient(fileResponse, variablesResponse);

    await lintAutolayoutValues({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
      pages: [],
    });

    expect(mockClient.getFile).toHaveBeenCalledWith("branchFile");
    expect(mockClient.getLocalVariables).toHaveBeenCalledWith("branchFile");
  });

  it("includes branch key in figmaUrl when branchKey is provided", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Comp",
            type: "COMPONENT",
            children: [
              {
                id: "3:0",
                name: "AutoFrame",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                paddingTop: 8,
              },
            ],
          },
        ],
      },
    ]);
    const variablesResponse = buildFakeVariablesResponse(
      standardSpaceEntries(),
    );
    setupMockClient(fileResponse, variablesResponse);

    const report = await lintAutolayoutValues({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
      pages: [],
    });

    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues[0].figmaUrl).toBe(
      "https://www.figma.com/design/branchFile/?node-id=3-0",
    );
  });
});
