import { createFigmaClient } from "../../shared/figma-client.js";
import { getEffectiveFileKey } from "../../shared/cli-utils.js";
import { findComponents } from "../../shared/tree-traversal.js";
import { detectUnboundValues, buildSpaceScale } from "./detect.js";
import { enrichIssuesWithUrls } from "../../shared/figma-urls.js";

/**
 * @typedef {import('./detect.js').UnboundValueIssue} UnboundValueIssue
 */

/**
 * @typedef {Object} LintAutolayoutValuesOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key to inspect
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP use_figma or saved JSON).
 *   When provided, the REST API is not called and accessToken is not required.
 * @property {Object} [variablesData] - Pre-fetched local variables data (from MCP use_figma).
 *   Required when using fileData — must match the shape of GET /v1/files/:key/variables/local.
 */

/**
 * @typedef {Object} LintAutolayoutValuesSummary
 * @property {number} totalComponents - Total number of components (including variants) inspected
 * @property {number} totalIssues - Total number of unbound value issues found
 * @property {number} bindable - Number of issues where the value exists in the space scale
 * @property {number} offScale - Number of issues where the value is not in the space scale
 * @property {number} exceptions - Number of issues with negative or otherwise exceptional values
 */

/**
 * @typedef {Object} LintAutolayoutValuesReport
 * @property {string} title - Human-readable report title
 * @property {LintAutolayoutValuesSummary} summary - Aggregate counts
 * @property {UnboundValueIssue[]} issues - Every unbound auto-layout value issue found
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
 * Orchestrates the full unbound auto-layout value lint pass for a Figma file.
 *
 * The function performs the following steps:
 * **Note:** This tool calls the Figma Local Variables API and requires a
 * token with the `file_variables:read` scope.  Personal access tokens
 * created via *Account Settings → Security → Personal access tokens* must
 * have this scope enabled, and OAuth apps must request it during the
 * authorization flow.
 *
 * 1. Creates an authenticated Figma client and fetches the file and local
 *    variables in parallel.
 * 2. Builds a space scale Map from the local variables response.
 * 3. Iterates over every page (optionally filtered by name).
 * 4. For each **component set** found on a page, iterates its variant
 *    children and runs {@link detectUnboundValues} on each variant.
 * 5. For each **standalone component** (not inside a component set), runs
 *    {@link detectUnboundValues} directly.
 * 6. Collects all issues, counts them by status, and returns a structured report.
 *
 * @param {LintAutolayoutValuesOptions} options - Authentication and filtering options
 * @returns {Promise<LintAutolayoutValuesReport>} The complete lint report
 *
 * @example
 * const report = await lintAutolayoutValues({
 *   accessToken: 'fig_...',
 *   fileKey: 'abc123XYZ',
 *   pages: ['Buttons', 'Cards'],
 * })
 * console.log(report.summary.totalIssues)
 */
export async function lintAutolayoutValues({
  accessToken,
  fileKey,
  branchKey,
  pages,
  fileData,
  variablesData,
}) {
  const effectiveKey = getEffectiveFileKey({ fileKey, branchKey });

  let file, variablesResponse;
  if (fileData) {
    file = fileData;
    variablesResponse = variablesData;
    if (!variablesResponse) {
      throw new Error(
        'The autolayout linter requires variable data. When using pre-fetched fileData, ' +
        'also provide variablesData (from the getLocalVariablesScript MCP script).',
      );
    }
  } else {
    const client = createFigmaClient({ accessToken });
    [file, variablesResponse] = await Promise.all([
      client.getFile(effectiveKey),
      client.getLocalVariables(effectiveKey),
    ]);
  }

  const spaceScale = buildSpaceScale(variablesResponse);

  /** @type {UnboundValueIssue[]} */
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
        const found = detectUnboundValues(
          variant,
          componentSet.name,
          variant.name,
          spaceScale,
        );
        if (found.length > 0) {
          issues.push(...found);
        }
      }
    }

    // --- Standalone components ------------------------------------------------
    for (const component of standaloneComponents) {
      totalComponents++;
      const found = detectUnboundValues(
        component,
        component.name,
        null,
        spaceScale,
      );
      if (found.length > 0) {
        issues.push(...found);
      }
    }
  }

  // Count issues by status
  let bindable = 0;
  let offScale = 0;
  let exceptions = 0;

  for (const issue of issues) {
    if (issue.status === "bindable") {
      bindable++;
    } else if (issue.status === "off-scale") {
      offScale++;
    } else if (issue.status === "exception") {
      exceptions++;
    }
  }

  const enrichedIssues = enrichIssuesWithUrls(issues, effectiveKey);

  return {
    title: "Unbound Auto-Layout Values Report",
    summary: {
      totalComponents,
      totalIssues: enrichedIssues.length,
      bindable,
      offScale,
      exceptions,
    },
    issues: enrichedIssues,
  };
}
