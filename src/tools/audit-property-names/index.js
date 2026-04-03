import { createFigmaClient } from "../../shared/figma-client.js";
import { getEffectiveFileKey } from "../../shared/cli-utils.js";
import { findComponents } from "../../shared/tree-traversal.js";
import { auditProperties } from "./detect.js";
import { enrichIssuesWithUrls } from "../../shared/figma-urls.js";

/**
 * @typedef {import('./detect.js').PropertyNamingIssue} PropertyNamingIssue
 * @typedef {import('./detect.js').ToggleConventionSummary} ToggleConventionSummary
 */

/**
 * @typedef {Object} AuditPropertyNamesOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key to inspect
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP use_figma or saved JSON).
 *   When provided, the REST API is not called and accessToken is not required.
 */

/**
 * @typedef {Object} AuditPropertyNamesReport
 * @property {string} title - Human-readable report title
 * @property {{ totalProperties: number, violations: number, toggleSummary: ToggleConventionSummary }} summary - Aggregate counts and toggle convention summary
 * @property {PropertyNamingIssue[]} issues - Every property naming issue found
 */

/**
 * Determines whether a Figma page should be included in the analysis.
 *
 * When no page filter is provided (empty array or undefined), every page is
 * included. Otherwise only pages whose name appears in the filter list are
 * processed.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A top-level page node from the Figma file
 * @param {string[]} [pages] - Optional allowlist of page names
 * @returns {boolean} `true` when the page should be scanned
 */
function shouldIncludePage(pageNode, pages) {
  if (!pages || pages.length === 0) return true;
  return pages.includes(pageNode.name);
}

/**
 * Counts the total number of property definitions across an array of
 * component objects.
 *
 * @param {{ componentPropertyDefinitions?: Object<string, { type: string }> | null }[]} components - Array of component objects
 * @returns {number} Total number of individual property definitions
 */
function countTotalProperties(components) {
  let total = 0;
  for (const component of components) {
    if (component.componentPropertyDefinitions) {
      total += Object.keys(component.componentPropertyDefinitions).length;
    }
  }
  return total;
}

/**
 * Orchestrates the full property naming convention audit for a Figma file.
 *
 * The function performs the following steps:
 * 1. Creates an authenticated Figma client and fetches the file.
 * 2. Iterates over every page (optionally filtered by name).
 * 3. For each **component set** found on a page, collects it along with its
 *    `componentPropertyDefinitions` for auditing.
 * 4. For each **standalone component** (not inside a component set), collects
 *    it along with its `componentPropertyDefinitions` for auditing.
 * 5. Runs the pure detection logic from {@link auditProperties} on the
 *    collected components.
 * 6. Returns a structured report with a summary and all detected issues.
 *
 * @param {AuditPropertyNamesOptions} options - Authentication and filtering options
 * @returns {Promise<AuditPropertyNamesReport>} The complete audit report
 *
 * @example
 * const report = await auditPropertyNames({
 *   accessToken: 'fig_...',
 *   fileKey: 'abc123XYZ',
 *   pages: ['Components'],
 * })
 * console.log(report.summary.violations)
 */
export async function auditPropertyNames({
  accessToken,
  fileKey,
  branchKey,
  pages,
  fileData,
}) {
  const effectiveKey = getEffectiveFileKey({ fileKey, branchKey });

  let file;
  if (fileData) {
    file = fileData;
  } else {
    const client = createFigmaClient({ accessToken });
    file = await client.getFile(effectiveKey);
  }

  /** @type {{ name: string, id: string, componentPropertyDefinitions?: Object<string, { type: string }> }[]} */
  const allComponents = [];

  const documentPages = file.document.children || [];

  for (const page of documentPages) {
    if (!shouldIncludePage(page, pages)) continue;

    const { componentSets, standaloneComponents } = findComponents(page);

    // Component sets own the property definitions for their variants
    for (const componentSet of componentSets) {
      allComponents.push({
        name: componentSet.name,
        id: componentSet.id,
        componentPropertyDefinitions:
          componentSet.componentPropertyDefinitions || undefined,
      });
    }

    // Standalone components may also have property definitions
    for (const component of standaloneComponents) {
      allComponents.push({
        name: component.name,
        id: component.id,
        componentPropertyDefinitions:
          component.componentPropertyDefinitions || undefined,
      });
    }
  }

  const totalProperties = countTotalProperties(allComponents);
  const { issues, toggleSummary } = auditProperties(allComponents);

  const enrichedIssues = enrichIssuesWithUrls(issues, effectiveKey);

  return {
    title: "Property Naming Convention Report",
    summary: {
      totalProperties,
      violations: enrichedIssues.length,
      toggleSummary,
    },
    issues: enrichedIssues,
  };
}
