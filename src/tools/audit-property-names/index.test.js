import { describe, it, expect, vi, beforeEach } from "vitest";
import { auditPropertyNames } from "./index.js";

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

describe("auditPropertyNames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a report with the correct title", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.title).toBe("Property Naming Convention Report");
  });

  it("creates the Figma client with the provided access token and fetches the file", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Page",
        type: "CANVAS",
        children: [],
      },
    ]);

    const mockClient = setupMockClient(fileResponse);

    await auditPropertyNames({
      accessToken: "my-secret-token",
      fileKey: "xyz789",
      pages: [],
    });

    expect(createFigmaClient).toHaveBeenCalledWith({
      accessToken: "my-secret-token",
    });
    expect(mockClient.getFile).toHaveBeenCalledWith("xyz789");
  });

  it("counts total properties across all components", async () => {
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
            componentPropertyDefinitions: {
              "size#100": { type: "VARIANT" },
              "label#101": { type: "TEXT" },
            },
            children: [
              { id: "2:1", name: "Size=sm", type: "COMPONENT", children: [] },
            ],
          },
          {
            id: "3:0",
            name: "Icon",
            type: "COMPONENT",
            componentPropertyDefinitions: {
              "color#200": { type: "VARIANT" },
            },
            children: [],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalProperties).toBe(3);
  });

  it("detects default-name violations in component set properties", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Card",
            type: "COMPONENT_SET",
            componentPropertyDefinitions: {
              "Property 1#100": { type: "TEXT" },
              "size#101": { type: "VARIANT" },
            },
            children: [
              { id: "2:1", name: "Size=sm", type: "COMPONENT", children: [] },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.violations).toBeGreaterThan(0);
    const defaultIssue = report.issues.find(
      (i) => i.violationType === "default-name",
    );
    expect(defaultIssue).toBeDefined();
    expect(defaultIssue.componentName).toBe("Card");
    expect(defaultIssue.propertyName).toBe("Property 1");
  });

  it("detects capitalized violations in standalone component properties", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Badge",
            type: "COMPONENT",
            componentPropertyDefinitions: {
              "Label#300": { type: "TEXT" },
              "color#301": { type: "VARIANT" },
            },
            children: [],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    const capIssue = report.issues.find(
      (i) => i.violationType === "capitalized",
    );
    expect(capIssue).toBeDefined();
    expect(capIssue.componentName).toBe("Badge");
    expect(capIssue.propertyName).toBe("Label");
  });

  it("returns zero violations for correctly named properties", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Tag",
            type: "COMPONENT",
            componentPropertyDefinitions: {
              "size#400": { type: "VARIANT" },
              "label#401": { type: "TEXT" },
              "icon#402": { type: "INSTANCE_SWAP" },
            },
            children: [],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.violations).toBe(0);
    expect(report.issues).toEqual([]);
    expect(report.summary.totalProperties).toBe(3);
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
            componentPropertyDefinitions: {
              "Property 1#500": { type: "TEXT" },
            },
            children: [],
          },
        ],
      },
      {
        id: "1:1",
        name: "Buttons",
        type: "CANVAS",
        children: [
          {
            id: "3:0",
            name: "PrimaryButton",
            type: "COMPONENT",
            componentPropertyDefinitions: {
              "Property 2#501": { type: "TEXT" },
            },
            children: [],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: ["Buttons"],
    });

    // Only the Buttons page should be processed
    expect(report.summary.totalProperties).toBe(1);
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
            componentPropertyDefinitions: {
              "Property 1#600": { type: "VARIANT" },
            },
            children: [],
          },
        ],
      },
      {
        id: "1:1",
        name: "Page B",
        type: "CANVAS",
        children: [
          {
            id: "3:0",
            name: "CompB",
            type: "COMPONENT",
            componentPropertyDefinitions: {
              "Property 2#601": { type: "VARIANT" },
            },
            children: [],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalProperties).toBe(2);
    const compNames = report.issues.map((i) => i.componentName);
    expect(compNames).toContain("CompA");
    expect(compNames).toContain("CompB");
  });

  it("includes toggleSummary in the report summary", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Card",
            type: "COMPONENT_SET",
            componentPropertyDefinitions: {
              "show icon#700": { type: "BOOLEAN" },
              "show label#701": { type: "BOOLEAN" },
              "disabled#702": { type: "BOOLEAN" },
            },
            children: [
              { id: "2:1", name: "V=default", type: "COMPONENT", children: [] },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.toggleSummary).toBeDefined();
    expect(report.summary.toggleSummary.showCount).toBe(2);
    expect(report.summary.toggleSummary.withCount).toBe(0);
    expect(report.summary.toggleSummary.otherCount).toBe(1);
    expect(report.summary.toggleSummary.showProperties).toEqual([
      "show icon",
      "show label",
    ]);
    expect(report.summary.toggleSummary.withProperties).toEqual([]);
  });

  it("generates toggle-inconsistency issues across components", async () => {
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
            componentPropertyDefinitions: {
              "show icon#800": { type: "BOOLEAN" },
              "show label#801": { type: "BOOLEAN" },
              "show badge#802": { type: "BOOLEAN" },
            },
            children: [],
          },
          {
            id: "3:0",
            name: "Avatar",
            type: "COMPONENT",
            componentPropertyDefinitions: {
              "with status#803": { type: "BOOLEAN" },
            },
            children: [],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    const toggleIssues = report.issues.filter(
      (i) => i.violationType === "toggle-inconsistency",
    );
    // "with" is the minority (1 vs 3), so it gets flagged
    expect(toggleIssues).toHaveLength(1);
    expect(toggleIssues[0].propertyName).toBe("with status");
    expect(toggleIssues[0].componentName).toBe("Avatar");
  });

  it("handles components with no componentPropertyDefinitions gracefully", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Divider",
            type: "COMPONENT",
            children: [],
          },
          {
            id: "3:0",
            name: "Spacer",
            type: "COMPONENT_SET",
            children: [
              { id: "3:1", name: "Size=sm", type: "COMPONENT", children: [] },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalProperties).toBe(0);
    expect(report.summary.violations).toBe(0);
    expect(report.issues).toEqual([]);
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
            componentPropertyDefinitions: {
              "Property 1#900": { type: "TEXT" },
            },
            children: [],
          },
          {
            id: "3:0",
            name: "CardSet",
            type: "COMPONENT_SET",
            componentPropertyDefinitions: {
              "Size#901": { type: "VARIANT" },
            },
            children: [
              { id: "3:1", name: "Size=sm", type: "COMPONENT", children: [] },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalProperties).toBe(2);
    expect(report.summary.violations).toBeGreaterThanOrEqual(2);

    const standaloneIssue = report.issues.find(
      (i) => i.componentName === "Standalone",
    );
    const setIssue = report.issues.find((i) => i.componentName === "CardSet");
    expect(standaloneIssue).toBeDefined();
    expect(setIssue).toBeDefined();
  });

  it("discovers components nested inside sections and frames", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Inputs Section",
            type: "SECTION",
            children: [
              {
                id: "3:0",
                name: "TextField",
                type: "COMPONENT",
                componentPropertyDefinitions: {
                  "Property 3#1000": { type: "TEXT" },
                },
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.totalProperties).toBe(1);
    const defaultIssue = report.issues.find(
      (i) => i.violationType === "default-name",
    );
    expect(defaultIssue).toBeDefined();
    expect(defaultIssue.componentName).toBe("TextField");
  });

  it("sets violations count to match the number of issues in the array", async () => {
    const fileResponse = buildFakeFileResponse([
      {
        id: "1:0",
        name: "Components",
        type: "CANVAS",
        children: [
          {
            id: "2:0",
            name: "Widget",
            type: "COMPONENT",
            componentPropertyDefinitions: {
              "Property 1#1100": { type: "TEXT" },
              "Size#1101": { type: "VARIANT" },
              "color#1102": { type: "VARIANT" },
            },
            children: [],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "fake-token",
      fileKey: "abc123",
      pages: [],
    });

    expect(report.summary.violations).toBe(report.issues.length);
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

    await auditPropertyNames({
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
            id: "5:0",
            name: "Widget",
            type: "COMPONENT",
            componentPropertyDefinitions: {
              "Property 1#999": { type: "TEXT" },
            },
            children: [],
          },
        ],
      },
    ]);

    setupMockClient(fileResponse);

    const report = await auditPropertyNames({
      accessToken: "tok",
      fileKey: "mainFile",
      branchKey: "branchFile",
      pages: [],
    });

    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues[0].figmaUrl).toBe(
      "https://www.figma.com/design/branchFile/?node-id=5-0",
    );
  });
});
