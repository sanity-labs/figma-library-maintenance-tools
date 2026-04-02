import { describe, it, expect, vi, beforeEach } from "vitest";
import { lintDuplicateSiblings } from "./index.js";

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
 * Creates a mock Figma client that resolves getFile with the given response.
 *
 * @param {Object} fileResponse - The fake file response to return
 * @returns {{ getFile: import('vitest').Mock }} Mocked client
 */
function setupMockClient(fileResponse) {
  const mockClient = {
    getFile: vi.fn().mockResolvedValue(fileResponse),
  };
  createFigmaClient.mockReturnValue(mockClient);
  return mockClient;
}

describe("lintDuplicateSiblings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a report with correct title and summary when issues are found", async () => {
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
              { id: "3:0", name: "Label", type: "TEXT" },
              { id: "3:1", name: "Label", type: "TEXT" },
              { id: "3:2", name: "Icon", type: "INSTANCE" },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await lintDuplicateSiblings({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.title).toBe("Duplicate Sibling Name Report");
    expect(report.summary.totalIssues).toBeGreaterThan(0);
    expect(report.summary.totalComponents).toBe(1);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues[0].figmaUrl).toBe(
      "https://www.figma.com/design/abc123/?node-id=2-0",
    );
  });

  it("returns zero issues when no duplicates exist", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Icon",
            type: "COMPONENT",
            children: [
              { id: "3:0", name: "Shape", type: "RECTANGLE" },
              { id: "3:1", name: "Background", type: "ELLIPSE" },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await lintDuplicateSiblings({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.title).toBe("Duplicate Sibling Name Report");
    expect(report.summary.totalIssues).toBe(0);
    expect(report.summary.totalComponents).toBe(1);
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
            name: "Tag",
            type: "COMPONENT_SET",
            children: [
              {
                id: "4:0",
                name: "Size=Small",
                type: "COMPONENT",
                children: [
                  { id: "5:0", name: "Label", type: "TEXT" },
                  { id: "5:1", name: "Label", type: "TEXT" },
                ],
              },
              {
                id: "4:1",
                name: "Size=Large",
                type: "COMPONENT",
                children: [
                  { id: "6:0", name: "Label", type: "TEXT" },
                  { id: "6:1", name: "Icon", type: "INSTANCE" },
                ],
              },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await lintDuplicateSiblings({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0].componentName).toBe("Tag");
    expect(report.issues[0].variantName).toBe("Size=Small");
    expect(report.issues[0].duplicatedName).toBe("Label");
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
              { id: "3:0", name: "Path", type: "VECTOR" },
              { id: "3:1", name: "Path", type: "VECTOR" },
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
            name: "PrimaryButton",
            type: "COMPONENT",
            children: [
              { id: "3:2", name: "Text", type: "TEXT" },
              { id: "3:3", name: "Text", type: "TEXT" },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await lintDuplicateSiblings({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: ["Buttons"],
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(
      report.issues.every((i) => i.componentName === "PrimaryButton"),
    ).toBe(true);
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
              { id: "3:0", name: "Dupe", type: "FRAME" },
              { id: "3:1", name: "Dupe", type: "FRAME" },
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
              { id: "4:0", name: "Dupe", type: "FRAME" },
              { id: "4:1", name: "Dupe", type: "FRAME" },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await lintDuplicateSiblings({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.summary.totalIssues).toBe(2);
  });

  it("creates the Figma client with the provided access token", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [],
      },
    ]);

    const mockClient = setupMockClient(fileResponse);

    await lintDuplicateSiblings({
      accessToken: "my-secret-token",
      fileKey: "xyz789",
      pages: [],
    });

    expect(createFigmaClient).toHaveBeenCalledWith({
      accessToken: "my-secret-token",
    });
    expect(mockClient.getFile).toHaveBeenCalledWith("xyz789");
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
              { id: "3:0", name: "Layer", type: "FRAME" },
              { id: "3:1", name: "Layer", type: "FRAME" },
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
                  { id: "5:0", name: "Row", type: "FRAME" },
                  { id: "5:1", name: "Row", type: "FRAME" },
                  { id: "5:2", name: "Row", type: "FRAME" },
                ],
              },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await lintDuplicateSiblings({
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
    expect(standaloneIssue.duplicatedName).toBe("Layer");
    expect(standaloneIssue.count).toBe(2);
    expect(standaloneIssue.variantName).toBeUndefined();

    const variantIssue = report.issues.find(
      (i) => i.componentName === "CardSet",
    );
    expect(variantIssue).toBeDefined();
    expect(variantIssue.variantName).toBe("Variant=A");
    expect(variantIssue.duplicatedName).toBe("Row");
    expect(variantIssue.count).toBe(3);
  });

  it("detects deeply nested duplicate siblings inside a component", async () => {
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
                children: [
                  {
                    id: "4:0",
                    name: "Inner",
                    type: "FRAME",
                    children: [
                      { id: "5:0", name: "Dot", type: "ELLIPSE" },
                      { id: "5:1", name: "Dot", type: "ELLIPSE" },
                      { id: "5:2", name: "Dot", type: "ELLIPSE" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await lintDuplicateSiblings({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0].parentName).toBe("Inner");
    expect(report.issues[0].duplicatedName).toBe("Dot");
    expect(report.issues[0].count).toBe(3);
  });

  it("includes occurrences with correct type, id, and index", async () => {
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
              { id: "3:0", name: "Item", type: "FRAME" },
              { id: "3:1", name: "Spacer", type: "RECTANGLE" },
              { id: "3:2", name: "Item", type: "INSTANCE" },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await lintDuplicateSiblings({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.issues.length).toBe(1);
    const issue = report.issues[0];
    expect(issue.occurrences).toHaveLength(2);
    expect(issue.occurrences[0]).toEqual({
      type: "FRAME",
      id: "3:0",
      index: 0,
    });
    expect(issue.occurrences[1]).toEqual({
      type: "INSTANCE",
      id: "3:2",
      index: 2,
    });
  });

  it("uses branchKey as the effective file key when provided", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [],
      },
    ]);

    const mockClient = setupMockClient(fileResponse);

    await lintDuplicateSiblings({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
      pages: [],
    });

    expect(mockClient.getFile).toHaveBeenCalledWith("branchFile");
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
              { id: "3:0", name: "Dupe", type: "FRAME" },
              { id: "3:1", name: "Dupe", type: "FRAME" },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await lintDuplicateSiblings({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
      pages: [],
    });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].figmaUrl).toBe(
      "https://www.figma.com/design/branchFile/?node-id=2-0",
    );
  });
});
