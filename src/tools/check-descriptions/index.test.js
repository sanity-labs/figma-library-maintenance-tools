import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkDescriptionCoverage } from "./index.js";

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

describe("checkDescriptionCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a report with correct title", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.title).toBe("Component Description Coverage Report");
  });

  it("returns correct summary counts for a mix of described and undescribed components", async () => {
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
            description: "Primary action button",
          },
          {
            id: "2:1",
            name: "Card",
            type: "COMPONENT",
            description: "",
          },
          {
            id: "2:2",
            name: "Badge",
            type: "COMPONENT",
            description: "Status indicator",
          },
          {
            id: "2:3",
            name: "Chip",
            type: "COMPONENT",
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(4);
    expect(report.summary.withDescriptions).toBe(2);
    expect(report.summary.missingDescriptions).toBe(2);
    expect(report.summary.coveragePercent).toBe(50);
  });

  it("calculates coveragePercent correctly with fractional values", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          { id: "2:0", name: "A", type: "COMPONENT", description: "Described" },
          { id: "2:1", name: "B", type: "COMPONENT", description: "" },
          { id: "2:2", name: "C", type: "COMPONENT", description: "" },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(3);
    expect(report.summary.withDescriptions).toBe(1);
    expect(report.summary.coveragePercent).toBe(33.3);
  });

  it("returns 100% coverage when all components have descriptions", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Button",
            type: "COMPONENT",
            description: "A button",
          },
          {
            id: "2:1",
            name: "Input",
            type: "COMPONENT",
            description: "A text input",
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.coveragePercent).toBe(100);
    expect(report.summary.missingDescriptions).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it("returns 0% coverage when no components have descriptions", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [
          { id: "2:0", name: "Button", type: "COMPONENT", description: "" },
          { id: "2:1", name: "Card", type: "COMPONENT" },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.coveragePercent).toBe(0);
    expect(report.summary.withDescriptions).toBe(0);
    expect(report.issues).toHaveLength(2);
  });

  it("returns 100% coverage when no components exist at all", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Empty Page",
        type: "CANVAS",
        children: [{ id: "2:0", name: "Frame", type: "FRAME" }],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(0);
    expect(report.summary.coveragePercent).toBe(100);
    expect(report.issues).toEqual([]);
  });

  it("only includes missing descriptions in the issues array", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Described",
            type: "COMPONENT",
            description: "Has a desc",
          },
          { id: "2:1", name: "Missing", type: "COMPONENT", description: "" },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].componentName).toBe("Missing");
    expect(report.issues[0].hasDescription).toBe(false);
  });

  it("filters pages when the pages option is provided", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Icons",
        type: "CANVAS",
        children: [
          { id: "2:0", name: "StarIcon", type: "COMPONENT", description: "" },
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
            description: "",
          },
          {
            id: "2:2",
            name: "SecondaryButton",
            type: "COMPONENT",
            description: "A secondary button",
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: ["Buttons"],
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].componentName).toBe("PrimaryButton");
    expect(report.issues[0].pageName).toBe("Buttons");
  });

  it("processes all pages when pages option is an empty array", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page A",
        type: "CANVAS",
        children: [
          { id: "2:0", name: "CompA", type: "COMPONENT", description: "" },
        ],
      },
      {
        id: "1:1",
        name: "Page B",
        type: "CANVAS",
        children: [
          { id: "2:1", name: "CompB", type: "COMPONENT", description: "" },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.issues).toHaveLength(2);

    const issueNames = report.issues.map((i) => i.componentName);
    expect(issueNames).toContain("CompA");
    expect(issueNames).toContain("CompB");
  });

  it("creates the Figma client with the provided access token and fetches the correct file", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [],
      },
    ]);

    const mockClient = setupMockClient(fileResponse);

    await checkDescriptionCoverage({
      accessToken: "my-secret-token",
      fileKey: "xyz789",
      pages: [],
    });

    expect(createFigmaClient).toHaveBeenCalledWith({
      accessToken: "my-secret-token",
    });
    expect(mockClient.getFile).toHaveBeenCalledWith("xyz789");
  });

  it("handles both component sets and standalone components across pages", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Mixed",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "ButtonSet",
            type: "COMPONENT_SET",
            description: "Button component set",
            children: [
              { id: "3:0", name: "Size=Small", type: "COMPONENT" },
              { id: "3:1", name: "Size=Large", type: "COMPONENT" },
            ],
          },
          {
            id: "2:1",
            name: "Divider",
            type: "COMPONENT",
            description: "",
          },
          {
            id: "2:2",
            name: "Avatar",
            type: "COMPONENT",
            description: "User avatar",
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    // ButtonSet (described) + Divider (missing) + Avatar (described) = 3 total
    expect(report.summary.totalComponents).toBe(3);
    expect(report.summary.withDescriptions).toBe(2);
    expect(report.summary.missingDescriptions).toBe(1);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].componentName).toBe("Divider");
    expect(report.issues[0].type).toBe("COMPONENT");
  });

  it("aggregates results from multiple pages", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page 1",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Button",
            type: "COMPONENT",
            description: "A button",
          },
          { id: "2:1", name: "Card", type: "COMPONENT", description: "" },
        ],
      },
      {
        id: "1:1",
        name: "Page 2",
        type: "CANVAS",
        children: [
          {
            id: "2:2",
            name: "Badge",
            type: "COMPONENT",
            description: "A badge",
          },
          { id: "2:3", name: "Tag", type: "COMPONENT" },
          { id: "2:4", name: "Chip", type: "COMPONENT", description: "A chip" },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(5);
    expect(report.summary.withDescriptions).toBe(3);
    expect(report.summary.missingDescriptions).toBe(2);
    expect(report.summary.coveragePercent).toBe(60);

    const issuePages = report.issues.map((i) => i.pageName);
    expect(issuePages).toContain("Page 1");
    expect(issuePages).toContain("Page 2");
  });

  it("issues contain correct pageName from their respective pages", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Atoms",
        type: "CANVAS",
        children: [
          { id: "2:0", name: "Dot", type: "COMPONENT", description: "" },
        ],
      },
      {
        id: "1:1",
        name: "Molecules",
        type: "CANVAS",
        children: [
          { id: "2:1", name: "SearchBar", type: "COMPONENT", description: "" },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    const dotIssue = report.issues.find((i) => i.componentName === "Dot");
    const searchIssue = report.issues.find(
      (i) => i.componentName === "SearchBar",
    );

    expect(dotIssue.pageName).toBe("Atoms");
    expect(searchIssue.pageName).toBe("Molecules");
  });

  it("issues contain the correct node IDs and types", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Library",
        type: "CANVAS",
        children: [
          {
            id: "10:20",
            name: "InputSet",
            type: "COMPONENT_SET",
            description: "",
            children: [
              { id: "11:0", name: "State=Default", type: "COMPONENT" },
            ],
          },
          {
            id: "10:30",
            name: "Tooltip",
            type: "COMPONENT",
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.issues).toHaveLength(2);

    const setIssue = report.issues.find((i) => i.componentName === "InputSet");
    expect(setIssue.nodeId).toBe("10:20");
    expect(setIssue.type).toBe("COMPONENT_SET");

    const compIssue = report.issues.find((i) => i.componentName === "Tooltip");
    expect(compIssue.nodeId).toBe("10:30");
    expect(compIssue.type).toBe("COMPONENT");

    expect(setIssue.figmaUrl).toBe(
      "https://www.figma.com/design/abc123/?node-id=10-20",
    );
    expect(compIssue.figmaUrl).toBe(
      "https://www.figma.com/design/abc123/?node-id=10-30",
    );
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

    await checkDescriptionCoverage({
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
          { id: "10:20", name: "Widget", type: "COMPONENT", description: "" },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await checkDescriptionCoverage({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
      pages: [],
    });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].figmaUrl).toBe(
      "https://www.figma.com/design/branchFile/?node-id=10-20",
    );
  });
});
