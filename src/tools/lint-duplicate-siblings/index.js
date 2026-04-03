import { createFigmaClient } from "../../shared/figma-client.js";
import { getEffectiveFileKey } from "../../shared/cli-utils.js";
import { findComponents } from "../../shared/tree-traversal.js";
import { detectDuplicateSiblings } from "./detect.js";
import { buildFigmaUrl } from "../../shared/figma-urls.js";

/**
 * @typedef {import('./detect.js').DuplicateSiblingIssue} DuplicateSiblingIssue
 */

/**
 * @typedef {Object} LintDuplicateSiblingsOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key to inspect
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP use_figma or saved JSON).
 *   When provided, the REST API is not called and accessToken is not required.
 */

/**
 * @typedef {Object} LintDuplicateSiblingsReport
 * @property {string} title - Human-readable report title
 * @property {{ totalComponents: number, totalIssues: number }} summary - Aggregate counts
 * @property {DuplicateSiblingIssue[]} issues - Every duplicate-sibling issue found
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
 * Orchestrates the full duplicate-sibling lint pass for a Figma file.
 *
 * The function performs the following steps:
 * 1. Creates an authenticated Figma client and fetches the file.
 * 2. Iterates over every page (optionally filtered by name).
 * 3. For each **component set** found on a page, iterates its variant
 *    children and runs {@link detectDuplicateSiblings} on each variant.
 * 4. For each **standalone component** (not inside a component set), runs
 *    {@link detectDuplicateSiblings} directly.
 * 5. Collects all issues and returns a structured report.
 *
 * @param {LintDuplicateSiblingsOptions} options - Authentication and filtering options
 * @returns {Promise<LintDuplicateSiblingsReport>} The complete lint report
 *
 * @example
 * const report = await lintDuplicateSiblings({
 *   accessToken: 'fig_...',
 *   fileKey: 'abc123XYZ',
 *   pages: ['Icons', 'Buttons'],
 * })
 * console.log(report.summary.totalIssues)
 */
export async function lintDuplicateSiblings({
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

  /** @type {DuplicateSiblingIssue[]} */
  const issues = [];
  let totalComponents = 0;

  const documentPages = file.document.children || [];

  for (const page of documentPages) {
    if (!shouldIncludePage(page, pages)) continue;

    const { componentSets, standaloneComponents } = findComponents(page);

    // --- Component sets (variants) -------------------------------------------
    for (const componentSet of componentSets) {
      const variants = (componentSet.children || []).filter(
        (child) => child.type === "COMPONENT",
      );

      for (const variant of variants) {
        totalComponents++;
        const found = detectDuplicateSiblings(
          variant,
          componentSet.name,
          variant.name,
        );
        if (found.length > 0) {
          issues.push(...found);
        }
      }
    }

    // --- Standalone components ------------------------------------------------
    for (const component of standaloneComponents) {
      totalComponents++;
      const found = detectDuplicateSiblings(
        component,
        component.name,
        undefined,
      );
      if (found.length > 0) {
        issues.push(...found);
      }
    }
  }

  const enrichedIssues = issues.map((issue) => ({
    ...issue,
    figmaUrl: buildFigmaUrl(effectiveKey, issue.parentId),
  }));

  return {
    title: "Duplicate Sibling Name Report",
    summary: {
      totalComponents,
      totalIssues: enrichedIssues.length,
    },
    issues: enrichedIssues,
  };
}
