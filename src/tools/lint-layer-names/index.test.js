import { describe, it, expect, vi, beforeEach } from "vitest";
import { lintLayerNames } from "./index.js";

// ---------------------------------------------------------------------------
// Mock the Figma client — we never hit the real API during tests
// ---------------------------------------------------------------------------
const mockGetFile = vi.fn();

vi.mock("../../shared/figma-client.js", () => ({
  createFigmaClient: vi.fn(() => ({
    getFile: mockGetFile,
    getFileNodes: vi.fn(),
    getFileComponents: vi.fn(),
    getLocalVariables: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers — tiny factory functions for building fake Figma file responses
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Figma page node.
 *
 * @param {string} name - Page name
 * @param {import('../../shared/tree-traversal.js').FigmaNode[]} children - Direct children
 * @returns {import('../../shared/tree-traversal.js').FigmaNode}
 */
function makePage(name, children = []) {
  return { id: `page:${name}`, name, type: "CANVAS", children };
}

/**
 * Creates a standalone COMPONENT node.
 *
 * @param {string} name - Component name
 * @param {import('../../shared/tree-traversal.js').FigmaNode[]} children - Layer children
 * @returns {import('../../shared/tree-traversal.js').FigmaNode}
 */
function makeComponent(name, children = []) {
  return { id: `comp:${name}`, name, type: "COMPONENT", children };
}

/**
 * Creates a COMPONENT_SET node containing variant COMPONENT children.
 *
 * @param {string} name - Component set name
 * @param {import('../../shared/tree-traversal.js').FigmaNode[]} variants - Variant components
 * @returns {import('../../shared/tree-traversal.js').FigmaNode}
 */
function makeComponentSet(name, variants = []) {
  return { id: `set:${name}`, name, type: "COMPONENT_SET", children: variants };
}

/**
 * Creates a generic layer node.
 *
 * @param {string} id - Node ID
 * @param {string} name - Layer name
 * @param {string} type - Figma node type
 * @param {import('../../shared/tree-traversal.js').FigmaNode[]} [children] - Child nodes
 * @returns {import('../../shared/tree-traversal.js').FigmaNode}
 */
function makeLayer(id, name, type, children = []) {
  return { id, name, type, children };
}

/**
 * Wraps pages in a Figma file response envelope.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode[]} pages - Page nodes
 * @returns {{ document: { children: import('../../shared/tree-traversal.js').FigmaNode[] } }}
 */
function makeFileResponse(pages) {
  return { document: { children: pages } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe("lintLayerNames", () => {
  it("returns a report with the expected shape when there are no issues", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeComponent("Button", [
            makeLayer("1:1", "label", "TEXT"),
            makeLayer("1:2", "icon", "INSTANCE"),
          ]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    expect(report).toEqual({
      title: "Generic Layer Name Lint",
      summary: { totalComponents: 1, totalIssues: 0, scope: "all" },
      issues: [],
    });
  });

  it("detects generic names inside a standalone component", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeComponent("Card", [
            makeLayer("2:1", "Frame 1", "FRAME", [
              makeLayer("2:2", "title", "TEXT"),
            ]),
            makeLayer("2:3", "Rectangle 3", "RECTANGLE"),
          ]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(report.summary.totalIssues).toBe(2);
    expect(report.issues).toHaveLength(2);

    expect(report.issues[0]).toMatchObject({
      componentName: "Card",
      layerName: "Frame 1",
      layerType: "FRAME",
      nodeId: "2:1",
    });
    expect(report.issues[0]).not.toHaveProperty("variantName");

    expect(report.issues[1]).toMatchObject({
      componentName: "Card",
      layerName: "Rectangle 3",
      layerType: "RECTANGLE",
      nodeId: "2:3",
    });

    expect(report.issues[0].figmaUrl).toBe(
      "https://www.figma.com/design/test-file/?node-id=2-1",
    );
    expect(report.issues[1].figmaUrl).toBe(
      "https://www.figma.com/design/test-file/?node-id=2-3",
    );
  });

  it("detects generic names inside component set variants", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeComponentSet("Button", [
            makeComponent("State=Default", [
              makeLayer("3:1", "label", "TEXT"),
              makeLayer("3:2", "Frame 1", "FRAME"),
            ]),
            makeComponent("State=Hover", [
              makeLayer("3:3", "Vector", "VECTOR"),
              makeLayer("3:4", "background", "RECTANGLE"),
            ]),
          ]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.summary.totalIssues).toBe(2);

    expect(report.issues[0]).toMatchObject({
      componentName: "Button",
      variantName: "State=Default",
      layerName: "Frame 1",
    });

    expect(report.issues[1]).toMatchObject({
      componentName: "Button",
      variantName: "State=Hover",
      layerName: "Vector",
    });
  });

  it("filters pages when the pages option is provided", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Icons", [
          makeComponent("StarIcon", [makeLayer("4:1", "Vector", "VECTOR")]),
        ]),
        makePage("Components", [
          makeComponent("Badge", [makeLayer("4:2", "Ellipse 1", "ELLIPSE")]),
        ]),
        makePage("Deprecated", [
          makeComponent("OldButton", [makeLayer("4:3", "Group 2", "GROUP")]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      pages: ["Icons", "Components"],
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.summary.totalIssues).toBe(2);

    const layerNames = report.issues.map((i) => i.layerName);
    expect(layerNames).toContain("Vector");
    expect(layerNames).toContain("Ellipse 1");
    expect(layerNames).not.toContain("Group 2");
  });

  it("excludes pages listed in excludePages", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeComponent("Button", [makeLayer("11:1", "Vector", "VECTOR")]),
        ]),
        makePage(".explorations", [
          makeComponent("LoginMock", [makeLayer("11:2", "Frame 1", "FRAME")]),
        ]),
        makePage(".archive", [
          makeComponent("OldCard", [makeLayer("11:3", "Group 1", "GROUP")]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      excludePages: [".explorations", ".archive"],
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0].layerName).toBe("Vector");
  });

  it("excludePages takes precedence over pages allow-list", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeComponent("Button", [makeLayer("12:1", "Vector", "VECTOR")]),
        ]),
        makePage(".explorations", [
          makeComponent("Mock", [makeLayer("12:2", "Frame 1", "FRAME")]),
        ]),
      ]),
    );

    // Both allow and exclude list the same page — exclude wins
    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      pages: ["Components", ".explorations"],
      excludePages: [".explorations"],
    });

    expect(report.summary.totalComponents).toBe(1);
    const pageNames = report.issues.map((i) => i.componentName);
    expect(pageNames).not.toContain("Mock");
  });

  it("scans all non-excluded pages when pages allow-list is empty", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Icons", [
          makeComponent("Star", [makeLayer("13:1", "Vector", "VECTOR")]),
        ]),
        makePage(".explorations", [
          makeComponent("Draft", [makeLayer("13:2", "Frame 1", "FRAME")]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      excludePages: [".explorations"],
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(report.issues[0].componentName).toBe("Star");
  });

  it("scans all pages when excludePages is empty", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Page A", [
          makeComponent("CompA", [makeLayer("5:1", "Frame 1", "FRAME")]),
        ]),
        makePage("Page B", [
          makeComponent("CompB", [makeLayer("5:2", "Line 5", "LINE")]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      pages: [],
    });

    expect(report.summary.totalComponents).toBe(2);
    expect(report.summary.totalIssues).toBe(2);
  });

  it("handles a mix of component sets and standalone components on the same page", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Library", [
          makeComponentSet("Toggle", [
            makeComponent("State=On", [
              makeLayer("6:1", "Boolean 1", "BOOLEAN_OPERATION"),
            ]),
            makeComponent("State=Off", [
              makeLayer("6:2", "track", "RECTANGLE"),
            ]),
          ]),
          makeComponent("Divider", [makeLayer("6:3", "Line 1", "LINE")]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    // 2 variants + 1 standalone = 3 components
    expect(report.summary.totalComponents).toBe(3);
    // Boolean 1 + Line 1 = 2 issues (track is fine)
    expect(report.summary.totalIssues).toBe(2);

    expect(report.issues[0]).toMatchObject({
      componentName: "Toggle",
      variantName: "State=On",
      layerName: "Boolean 1",
    });

    expect(report.issues[1]).toMatchObject({
      componentName: "Divider",
      layerName: "Line 1",
    });
    expect(report.issues[1]).not.toHaveProperty("variantName");
  });

  it("handles a file with no pages gracefully", async () => {
    mockGetFile.mockResolvedValue(makeFileResponse([]));

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    expect(report.summary.totalComponents).toBe(0);
    expect(report.summary.totalIssues).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it("handles a page with no components gracefully", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Empty Page", [makeLayer("7:1", "just a frame", "FRAME")]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    expect(report.summary.totalComponents).toBe(0);
    expect(report.summary.totalIssues).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it("finds components nested inside SECTION nodes", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Design System", [
          {
            id: "section:1",
            name: "Inputs",
            type: "SECTION",
            children: [
              makeComponent("TextField", [
                makeLayer("8:1", "Rectangle 1", "RECTANGLE"),
                makeLayer("8:2", "placeholder", "TEXT"),
              ]),
            ],
          },
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    expect(report.summary.totalComponents).toBe(1);
    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0]).toMatchObject({
      componentName: "TextField",
      layerName: "Rectangle 1",
    });
  });

  it("counts deeply nested generic names across multiple variants", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeComponentSet("Chip", [
            makeComponent("Size=Small", [
              makeLayer("9:1", "content", "FRAME", [
                makeLayer("9:2", "Group 1", "GROUP", [
                  makeLayer("9:3", "Image", "IMAGE"),
                ]),
              ]),
            ]),
            makeComponent("Size=Large", [
              makeLayer("9:4", "content", "FRAME", [
                makeLayer("9:5", "Star 1", "STAR"),
              ]),
            ]),
          ]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    expect(report.summary.totalComponents).toBe(2);
    // Group 1 + Image (nested inside Group 1) + Star 1 = 3 issues
    expect(report.summary.totalIssues).toBe(3);

    const layerNames = report.issues.map((i) => i.layerName);
    expect(layerNames).toContain("Group 1");
    expect(layerNames).toContain("Image");
    expect(layerNames).toContain("Star 1");
  });

  it('always sets the report title to "Generic Layer Name Lint"', async () => {
    mockGetFile.mockResolvedValue(makeFileResponse([]));

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    expect(report.title).toBe("Generic Layer Name Lint");
  });

  it("passes the fileKey to the Figma client getFile call", async () => {
    mockGetFile.mockResolvedValue(makeFileResponse([]));

    await lintLayerNames({
      accessToken: "test-token",
      fileKey: "my-special-file-key",
    });

    expect(mockGetFile).toHaveBeenCalledTimes(1);
    expect(mockGetFile).toHaveBeenCalledWith("my-special-file-key");
  });

  it("uses branchKey as the effective file key when provided", async () => {
    mockGetFile.mockResolvedValue(makeFileResponse([]));

    await lintLayerNames({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
      pages: [],
    });

    expect(mockGetFile).toHaveBeenCalledTimes(1);
    expect(mockGetFile).toHaveBeenCalledWith("branchFile");
  });

  it("includes branch key in figmaUrl when branchKey is provided", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeComponent("Card", [makeLayer("10:1", "Frame 1", "FRAME")]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
    });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].figmaUrl).toBe(
      "https://www.figma.com/design/branchFile/?node-id=10-1",
    );
  });

  // -------------------------------------------------------------------------
  // Scope tests
  // -------------------------------------------------------------------------

  it("defaults scope to all and includes it in the summary", async () => {
    mockGetFile.mockResolvedValue(makeFileResponse([]));

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
    });

    expect(report.summary.scope).toBe("all");
  });

  it("reports scope as components when explicitly set", async () => {
    mockGetFile.mockResolvedValue(makeFileResponse([]));

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      scope: "components",
    });

    expect(report.summary.scope).toBe("components");
  });

  it("scope all: catches generic names outside of components", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          // A stray frame sitting on the page, not inside any component
          makeLayer("20:1", "Frame 1", "FRAME"),
          makeLayer("20:2", "Group 2", "GROUP"),
          // A properly named frame
          makeLayer("20:3", "toolbar", "FRAME"),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      scope: "all",
    });

    expect(report.summary.totalIssues).toBe(2);
    const layerNames = report.issues.map((i) => i.layerName);
    expect(layerNames).toContain("Frame 1");
    expect(layerNames).toContain("Group 2");
    expect(layerNames).not.toContain("toolbar");
  });

  it("scope all: uses page name as componentName for non-component nodes", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Building blocks", [makeLayer("21:1", "Vector", "VECTOR")]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      scope: "all",
    });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].componentName).toBe("Building blocks");
    expect(report.issues[0]).not.toHaveProperty("variantName");
  });

  it("scope all: preserves component context for nodes inside components", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeComponent("Card", [
            makeLayer("22:1", "Rectangle 1", "RECTANGLE"),
          ]),
          // Also a stray generic frame on the page
          makeLayer("22:2", "Frame 1", "FRAME"),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      scope: "all",
    });

    expect(report.summary.totalIssues).toBe(2);

    const insideComponent = report.issues.find((i) => i.nodeId === "22:1");
    expect(insideComponent.componentName).toBe("Card");

    const outsideComponent = report.issues.find((i) => i.nodeId === "22:2");
    expect(outsideComponent.componentName).toBe("Components");
  });

  it("scope all: does not report duplicate issues for nodes inside components", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeComponent("Icon", [
            makeLayer("23:1", "Vector", "VECTOR"),
            makeLayer("23:2", "Ellipse 1", "ELLIPSE"),
          ]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      scope: "all",
    });

    // Each node should only appear once despite both passes finding them
    expect(report.summary.totalIssues).toBe(2);
    const nodeIds = report.issues.map((i) => i.nodeId);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
  });

  it("scope components: ignores generic names outside of components", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          // Stray generic-named frames NOT inside a component
          makeLayer("24:1", "Frame 1", "FRAME"),
          makeLayer("24:2", "Rectangle 3", "RECTANGLE"),
          // A component with a clean interior
          makeComponent("Button", [makeLayer("24:3", "label", "TEXT")]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      scope: "components",
    });

    expect(report.summary.totalIssues).toBe(0);
    expect(report.summary.scope).toBe("components");
    expect(report.issues).toEqual([]);
  });

  it("scope components: still catches generic names inside components", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Components", [
          makeLayer("25:1", "Frame 1", "FRAME"),
          makeComponent("Card", [makeLayer("25:2", "Group 1", "GROUP")]),
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      scope: "components",
    });

    // Only the issue inside the component, not the stray Frame 1
    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0]).toMatchObject({
      componentName: "Card",
      layerName: "Group 1",
      nodeId: "25:2",
    });
  });

  it("scope all: finds generic names nested inside sections outside components", async () => {
    mockGetFile.mockResolvedValue(
      makeFileResponse([
        makePage("Primitives", [
          {
            id: "section:1",
            name: "Colors",
            type: "SECTION",
            children: [
              makeLayer("26:1", "Rectangle 1", "RECTANGLE"),
              makeLayer("26:2", "swatch", "FRAME"),
            ],
          },
        ]),
      ]),
    );

    const report = await lintLayerNames({
      accessToken: "test-token",
      fileKey: "test-file",
      scope: "all",
    });

    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0]).toMatchObject({
      componentName: "Primitives",
      layerName: "Rectangle 1",
      nodeId: "26:1",
    });
  });
});
