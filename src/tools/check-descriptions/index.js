import { createFigmaClient } from "../../shared/figma-client.js";
import { getEffectiveFileKey } from "../../shared/cli-utils.js";
import { checkDescriptions } from "./detect.js";
import { enrichIssuesWithUrls } from "../../shared/figma-urls.js";

/**
 * @typedef {import('./detect.js').DescriptionIssue} DescriptionIssue
 */

/**
 * @typedef {Object} CheckDescriptionCoverageOptions
 * @property {string} accessToken - Figma personal access token
 * @property {string} fileKey - Figma file key to inspect
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 */

/**
 * @typedef {Object} CheckDescriptionCoverageSummary
 * @property {number} totalComponents - Total number of components and component sets inspected
 * @property {number} withDescriptions - Number of components that have descriptions
 * @property {number} missingDescriptions - Number of components missing descriptions
 * @property {number} coveragePercent - Percentage of components with descriptions (0–100, rounded to one decimal)
 */

/**
 * @typedef {Object} CheckDescriptionCoverageReport
 * @property {string} title - Human-readable report title
 * @property {CheckDescriptionCoverageSummary} summary - Aggregate coverage statistics
 * @property {DescriptionIssue[]} issues - Every component or component set that is missing a description
 */

/**
 * Determines whether a Figma page should be included in the analysis.
 *
 * When no page filter is provided (empty array or undefined), every page is
 * included.  Otherwise only pages whose name appears in the filter list are
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
 * Orchestrates the full description-coverage check for a Figma file.
 *
 * The function performs the following steps:
 * 1. Creates an authenticated Figma client and fetches the file.
 * 2. Iterates over every page (optionally filtered by name).
 * 3. For each page, calls {@link checkDescriptions} to evaluate every
 *    component set and standalone component on that page.
 * 4. Aggregates all results into a single report with coverage statistics.
 * 5. Returns a structured report whose `issues` array contains only the
 *    components that are missing descriptions.
 *
 * @param {CheckDescriptionCoverageOptions} options - Authentication and filtering options
 * @returns {Promise<CheckDescriptionCoverageReport>} The complete coverage report
 *
 * @example
 * const report = await checkDescriptionCoverage({
 *   accessToken: 'fig_...',
 *   fileKey: 'abc123XYZ',
 *   pages: ['Icons', 'Buttons'],
 * })
 * console.log(report.summary.coveragePercent)
 */
export async function checkDescriptionCoverage({
  accessToken,
  fileKey,
  branchKey,
  pages,
}) {
  const client = createFigmaClient({ accessToken });
  const effectiveKey = getEffectiveFileKey({ fileKey, branchKey });
  const file = await client.getFile(effectiveKey);

  /** @type {DescriptionIssue[]} */
  const allWithDescription = [];

  /** @type {DescriptionIssue[]} */
  const allMissingDescription = [];

  const documentPages = file.document.children || [];

  for (const page of documentPages) {
    if (!shouldIncludePage(page, pages)) continue;

    const { withDescription, missingDescription } = checkDescriptions(page);

    allWithDescription.push(...withDescription);
    allMissingDescription.push(...missingDescription);
  }

  const totalComponents =
    allWithDescription.length + allMissingDescription.length;
  const coveragePercent =
    totalComponents === 0
      ? 100
      : Math.round((allWithDescription.length / totalComponents) * 1000) / 10;

  const enrichedMissing = enrichIssuesWithUrls(
    allMissingDescription,
    effectiveKey,
  );

  return {
    title: "Component Description Coverage Report",
    summary: {
      totalComponents,
      withDescriptions: allWithDescription.length,
      missingDescriptions: allMissingDescription.length,
      coveragePercent,
    },
    issues: enrichedMissing,
  };
}
