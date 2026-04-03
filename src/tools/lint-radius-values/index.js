import { createFigmaClient } from "../../shared/figma-client.js";
import { getEffectiveFileKey } from "../../shared/cli-utils.js";
import { findComponents } from "../../shared/tree-traversal.js";
import {
  detectUnboundRadiusValues,
  detectUnboundRadiusValuesOnPage,
  buildRadiusScale,
} from "./detect.js";
import { enrichIssuesWithUrls } from "../../shared/figma-urls.js";

/**
 * @typedef {Object} LintRadiusValuesOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 * @property {string[]} [excludePages] - Page names to exclude (takes precedence)
 * @property {'all'|'components'} [scope='all'] - Scan scope
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP or saved JSON)
 * @property {Object} [variablesData] - Pre-fetched local variables data
 */

/**
 * @typedef {Object} LintRadiusValuesReport
 * @property {string} title
 * @property {{ totalComponents: number, totalIssues: number, bindable: number, offScale: number, scope: string }} summary
 * @property {import('./detect.js').UnboundRadiusIssue[]} issues
 */

/**
 * Determines whether a page should be included in the analysis.
 *
 * @param {string} pageName
 * @param {string[]} [allowedPages]
 * @param {string[]} [excludedPages]
 * @returns {boolean}
 */
function shouldIncludePage(pageName, allowedPages, excludedPages) {
  if (excludedPages && excludedPages.length > 0 && excludedPages.includes(pageName)) {
    return false;
  }
  if (!allowedPages || allowedPages.length === 0) return true;
  return allowedPages.includes(pageName);
}

/**
 * Orchestrates the full unbound radius value lint pass for a Figma file.
 *
 * @param {LintRadiusValuesOptions} options
 * @returns {Promise<LintRadiusValuesReport>}
 */
export async function lintRadiusValues({
  accessToken,
  fileKey,
  branchKey,
  pages,
  excludePages,
  scope = "all",
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
        "The radius linter requires variable data. When using pre-fetched fileData, " +
        "also provide variablesData (from the getLocalVariablesScript MCP script).",
      );
    }
  } else {
    const client = createFigmaClient({ accessToken });
    [file, variablesResponse] = await Promise.all([
      client.getFile(effectiveKey),
      client.getLocalVariables(effectiveKey),
    ]);
  }

  const radiusScale = buildRadiusScale(variablesResponse);

  /** @type {import('./detect.js').UnboundRadiusIssue[]} */
  const issues = [];
  let totalComponents = 0;

  const documentPages = file.document.children || [];

  for (const page of documentPages) {
    if (!shouldIncludePage(page.name, pages, excludePages)) continue;

    if (scope === "all") {
      const pageIssues = detectUnboundRadiusValuesOnPage(page, radiusScale);
      issues.push(...pageIssues);
      // Count components for summary even in all mode
      const { componentSets, standaloneComponents } = findComponents(page);
      for (const cs of componentSets) {
        totalComponents += (cs.children || []).filter((c) => c.type === "COMPONENT").length;
      }
      totalComponents += standaloneComponents.length;
    } else {
      const { componentSets, standaloneComponents } = findComponents(page);

      for (const componentSet of componentSets) {
        const variants = (componentSet.children || []).filter(
          (child) => child.type === "COMPONENT",
        );
        for (const variant of variants) {
          totalComponents++;
          const found = detectUnboundRadiusValues(
            variant,
            componentSet.name,
            variant.name,
            radiusScale,
          );
          if (found.length > 0) issues.push(...found);
        }
      }

      for (const component of standaloneComponents) {
        totalComponents++;
        const found = detectUnboundRadiusValues(
          component,
          component.name,
          null,
          radiusScale,
        );
        if (found.length > 0) issues.push(...found);
      }
    }
  }

  let bindable = 0;
  let offScale = 0;
  for (const issue of issues) {
    if (issue.status === "bindable") bindable++;
    else if (issue.status === "off-scale") offScale++;
  }

  const enrichedIssues = enrichIssuesWithUrls(issues, effectiveKey);

  return {
    title: "Unbound Radius Values Report",
    summary: {
      totalComponents,
      totalIssues: enrichedIssues.length,
      bindable,
      offScale,
      scope,
    },
    issues: enrichedIssues,
  };
}
