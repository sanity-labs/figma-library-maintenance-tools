import { describe, it, expect, vi } from "vitest";
import { scanPageHygiene } from "./index.js";

/**
 * Helper that builds a minimal Figma file response with the given pages.
 *
 * @param {Array<{ name: string, children?: Array<{ id: string, name: string, type: string }> }>} pages
 * @returns {{ document: { children: typeof pages } }}
 */
function buildFileResponse(pages) {
  return { document: { children: pages } };
}

vi.mock("../../shared/figma-client.js", () => ({
  /**
   * Mocked factory that captures the most recent call args and returns a
   * client whose `getFile` resolves with whatever `__setFileResponse` stored.
   *
   * @param {Object} opts
   * @returns {{ getFile: Function }}
   */
  createFigmaClient: vi.fn((opts) => {
    return {
      getFile: mockGetFile,
    };
  }),
}));

/** @type {import('vitest').Mock} */
const mockGetFile = vi.fn();

describe("scanPageHygiene orchestrator", () => {
  it("returns the correct report structure", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([
        {
          name: "Components",
          children: [{ id: "1:1", name: "Button", type: "COMPONENT_SET" }],
        },
      ]),
    );

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(report).toHaveProperty("title", "Page Hygiene Report");
    expect(report).toHaveProperty("summary");
    expect(report.summary).toHaveProperty("totalPages");
    expect(report.summary).toHaveProperty("totalItems");
    expect(report.summary).toHaveProperty("expectedItems");
    expect(report.summary).toHaveProperty("unexpectedItems");
    expect(report).toHaveProperty("issues");
    expect(Array.isArray(report.issues)).toBe(true);
  });

  it("counts expected and unexpected items correctly across pages", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([
        {
          name: "Page A",
          children: [
            { id: "1:1", name: "CardSet", type: "COMPONENT_SET" },
            { id: "1:2", name: "Standalone", type: "COMPONENT" },
            { id: "1:3", name: "Stray Frame", type: "FRAME" },
          ],
        },
        {
          name: "Page B",
          children: [
            { id: "2:1", name: "Organiser", type: "SECTION" },
            { id: "2:2", name: "Loose Text", type: "TEXT" },
            { id: "2:3", name: "Loose Rect", type: "RECTANGLE" },
          ],
        },
      ]),
    );

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(report.summary.totalPages).toBe(2);
    expect(report.summary.totalItems).toBe(6);
    expect(report.summary.expectedItems).toBe(3);
    expect(report.summary.unexpectedItems).toBe(3);
    expect(report.issues).toHaveLength(3);
  });

  it("filters pages by the pages allow-list", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([
        {
          name: "Icons",
          children: [
            { id: "1:1", name: "StarIcon", type: "COMPONENT" },
            { id: "1:2", name: "Guide", type: "LINE" },
          ],
        },
        {
          name: "Primitives",
          children: [{ id: "2:1", name: "Color Swatch", type: "FRAME" }],
        },
      ]),
    );

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: ["Icons"],
    });

    expect(report.summary.totalPages).toBe(1);
    expect(report.summary.totalItems).toBe(2);
    expect(report.summary.expectedItems).toBe(1);
    expect(report.summary.unexpectedItems).toBe(1);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].pageName).toBe("Icons");
  });

  it("includes all pages when pages array is empty", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([
        {
          name: "Page 1",
          children: [{ id: "1:1", name: "A", type: "COMPONENT" }],
        },
        {
          name: "Page 2",
          children: [{ id: "2:1", name: "B", type: "COMPONENT_SET" }],
        },
      ]),
    );

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(report.summary.totalPages).toBe(2);
  });

  it("returns zero counts when all items are expected", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([
        {
          name: "Clean",
          children: [
            { id: "1:1", name: "A", type: "COMPONENT" },
            { id: "1:2", name: "B", type: "COMPONENT_SET" },
            { id: "1:3", name: "C", type: "SECTION" },
          ],
        },
      ]),
    );

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(report.summary.unexpectedItems).toBe(0);
    expect(report.issues).toHaveLength(0);
    expect(report.summary.expectedItems).toBe(3);
  });

  it("returns zero expected when all items are unexpected", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([
        {
          name: "Messy",
          children: [
            { id: "1:1", name: "Frame 1", type: "FRAME" },
            { id: "1:2", name: "Group 1", type: "GROUP" },
          ],
        },
      ]),
    );

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(report.summary.expectedItems).toBe(0);
    expect(report.summary.unexpectedItems).toBe(2);
    expect(report.issues).toHaveLength(2);
  });

  it("handles pages with no children gracefully", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([{ name: "Empty", children: [] }]),
    );

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(report.summary.totalPages).toBe(1);
    expect(report.summary.totalItems).toBe(0);
    expect(report.summary.expectedItems).toBe(0);
    expect(report.summary.unexpectedItems).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  it("handles a file with no pages", async () => {
    mockGetFile.mockResolvedValueOnce(buildFileResponse([]));

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(report.summary.totalPages).toBe(0);
    expect(report.summary.totalItems).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  it("populates every issue with the correct fields", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([
        {
          name: "Widgets",
          children: [{ id: "9:42", name: "Stray Vector", type: "VECTOR" }],
        },
      ]),
    );

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(report.issues).toHaveLength(1);

    const issue = report.issues[0];
    expect(issue.pageName).toBe("Widgets");
    expect(issue.itemName).toBe("Stray Vector");
    expect(issue.itemType).toBe("VECTOR");
    expect(issue.nodeId).toBe("9:42");
    expect(issue.classification).toBe("unexpected");
    expect(issue.figmaUrl).toBe(
      "https://www.figma.com/design/file123/?node-id=9-42",
    );
  });

  it("only includes unexpected items in the issues array", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([
        {
          name: "Mixed",
          children: [
            { id: "1:1", name: "Good", type: "COMPONENT" },
            { id: "1:2", name: "Bad", type: "INSTANCE" },
            { id: "1:3", name: "Also Good", type: "SECTION" },
            { id: "1:4", name: "Also Bad", type: "ELLIPSE" },
          ],
        },
      ]),
    );

    const report = await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(report.issues).toHaveLength(2);
    for (const issue of report.issues) {
      expect(issue.classification).toBe("unexpected");
    }
    expect(report.issues.map((i) => i.itemName)).toEqual(["Bad", "Also Bad"]);
  });

  it("requests depth 2 from the Figma API", async () => {
    mockGetFile.mockResolvedValueOnce(buildFileResponse([]));

    await scanPageHygiene({
      accessToken: "fake-token",
      fileKey: "file123",
      pages: [],
    });

    expect(mockGetFile).toHaveBeenCalledWith("file123", { depth: 2 });
  });

  it("uses branchKey as the effective file key when provided", async () => {
    mockGetFile.mockResolvedValueOnce(buildFileResponse([]));

    await scanPageHygiene({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
      pages: [],
    });

    expect(mockGetFile).toHaveBeenCalledWith("branchFile", { depth: 2 });
  });

  it("includes branch key in figmaUrl when branchKey is provided", async () => {
    mockGetFile.mockResolvedValueOnce(
      buildFileResponse([
        {
          name: "Page",
          children: [{ id: "7:7", name: "Stray", type: "FRAME" }],
        },
      ]),
    );

    const report = await scanPageHygiene({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
      pages: [],
    });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].figmaUrl).toBe(
      "https://www.figma.com/design/branchFile/?node-id=7-7",
    );
  });
});
