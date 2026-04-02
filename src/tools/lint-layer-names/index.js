import { createFigmaClient } from "../../shared/figma-client.js";
import { getEffectiveFileKey } from "../../shared/cli-utils.js";
import { findComponents } from "../../shared/tree-traversal.js";
import { detectGenericNames, detectGenericNamesOnPage } from "./detect.js";
import { enrichIssuesWithUrls } from "../../shared/figma-urls.js";

/**
 * @typedef {Object} LintLayerNamesOptions
 * @property {string} accessToken - Figma personal access token
 * @property {string} fileKey - Figma file key to analyse
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Page names to restrict the scan to (empty or omitted = all pages)
 * @property {string[]} [excludePages] - Page names to skip entirely (takes precedence over the pages allow-list)
 * @property {'all'|'components'} [scope='all'] - Scan scope:
 *   - `'all'` (default) — scans every node on every page, including nodes
 *     outside of components.  Nodes inside components still receive full
 *     component/variant context; nodes outside components are reported with
 *     the page name as context.
 *   - `'components'` — only scans layers inside component sets and standalone
 *     components (the original behaviour).
 */

/**
 * @typedef {Object} LintLayerNamesReport
 * @property {string} title - Human-readable report title
 * @property {Object} summary - Aggregate counts
 * @property {number} summary.totalComponents - Number of component variants and standalone components inspected
 * @property {number} summary.totalIssues - Total generic-name issues found
 * @property {'all'|'components'} summary.scope - The scope that was used for this run
 * @property {import('./detect.js').GenericNameIssue[]} issues - Every detected generic-name issue
 */

/**
 * Determines whether a page should be included in the scan.
 *
 * Exclusions take precedence: if the page name appears in `excludedPages` it
 * is always skipped regardless of the allow-list.  If a non-empty `allowedPages`
 * list is provided the page must also appear there to be included.  When both
 * lists are empty every page is scanned.
 *
 * @param {string} pageName - The name of the page under consideration
 * @param {string[]} allowedPages - Allow-list supplied by the caller (may be empty)
 * @param {string[]} excludedPages - Deny-list supplied by the caller (may be empty)
 * @returns {boolean} `true` when the page should be scanned
 */
function shouldIncludePage(pageName, allowedPages, excludedPages) {
  if (excludedPages && excludedPages.length > 0 && excludedPages.includes(pageName)) {
    return false;
  }
  if (!allowedPages || allowedPages.length === 0) {
    return true;
  }
  return allowedPages.includes(pageName);
}

/**
 * Runs the component-scoped detection pass.
 *
 * Locates every component set and standalone component on the page, then
 * calls {@link detectGenericNames} on each variant / component.  Issues
 * carry full component and variant context.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} page - A page node
 * @returns {{ issues: import('./detect.js').GenericNameIssue[], totalComponents: number }}
 */
function scanComponents(page) {
  const { componentSets, standaloneComponents } = findComponents(page);

  /** @type {import('./detect.js').GenericNameIssue[]} */
  const issues = [];
  let totalComponents = 0;

  for (const componentSet of componentSets) {
    const variants = (componentSet.children || []).filter(
      (child) => child.type === "COMPONENT",
    );

    totalComponents += variants.length;

    for (const variant of variants) {
      const variantIssues = detectGenericNames(
        variant,
        componentSet.name,
        variant.name,
      );
      issues.push(...variantIssues);
    }
  }

  for (const component of standaloneComponents) {
    totalComponents += 1;

    const componentIssues = detectGenericNames(component, component.name, null);
    issues.push(...componentIssues);
  }

  return { issues, totalComponents };
}

/**
 * Scans a Figma file for layers that still carry generic / default names
 * (e.g. "Frame 1", "Group 2", "Vector").
 *
 * Two scan scopes are supported:
 *
 * - **`all`** (default) — first runs a component-scoped pass so that nodes
 *   inside components carry rich component/variant context, then runs a
 *   page-wide pass and merges any additional hits that live outside
 *   components.  Duplicates (same `nodeId`) are removed automatically.
 * - **`components`** — only scans layers inside component sets and standalone
 *   components.
 *
 * @param {LintLayerNamesOptions} options - Access credentials and scan scope
 * @returns {Promise<LintLayerNamesReport>} A report containing all detected issues
 *
 * @example
 * const report = await lintLayerNames({
 *   accessToken: 'fig_...',
 *   fileKey: 'abc123XYZ',
 *   pages: ['Icons', 'Components'],
 *   scope: 'all',
 * })
 * console.log(report.summary.totalIssues)
 */
export async function lintLayerNames({
  accessToken,
  fileKey,
  branchKey,
  pages,
  excludePages,
  scope = "all",
}) {
  const client = createFigmaClient({ accessToken });
  const effectiveKey = getEffectiveFileKey({ fileKey, branchKey });
  const file = await client.getFile(effectiveKey);

  /** @type {import('./detect.js').GenericNameIssue[]} */
  const issues = [];
  let totalComponents = 0;

  const filePages = (file.document && file.document.children) || [];

  for (const page of filePages) {
    if (!shouldIncludePage(page.name, pages, excludePages)) {
      continue;
    }

    // --- Component-scoped pass (always runs) ---------------------------------
    const componentResult = scanComponents(page);
    issues.push(...componentResult.issues);
    totalComponents += componentResult.totalComponents;

    // --- Page-wide pass (scope: 'all' only) ----------------------------------
    if (scope === "all") {
      // Collect nodeIds already reported by the component pass so we can
      // skip them in the page-wide pass and avoid duplicates.
      const seenNodeIds = new Set(componentResult.issues.map((i) => i.nodeId));

      const pageIssues = detectGenericNamesOnPage(page, page.name);

      for (const issue of pageIssues) {
        if (!seenNodeIds.has(issue.nodeId)) {
          issues.push(issue);
        }
      }
    }
  }

  const enrichedIssues = enrichIssuesWithUrls(issues, effectiveKey);

  return {
    title: "Generic Layer Name Lint",
    summary: {
      totalComponents,
      totalIssues: enrichedIssues.length,
      scope,
    },
    issues: enrichedIssues,
  };
}
