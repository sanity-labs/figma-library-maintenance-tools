import { createFigmaClient } from "../../shared/figma-client.js";
import { getEffectiveFileKey } from "../../shared/cli-utils.js";
import { findComponents } from "../../shared/tree-traversal.js";
import {
  detectHardcodedText,
  detectHardcodedTextOnPage,
  buildTextStyleMap,
} from "./detect.js";
import { enrichIssuesWithUrls } from "../../shared/figma-urls.js";

/**
 * @typedef {Object} LintTextStylesOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 * @property {string[]} [excludePages] - Page names to exclude (takes precedence)
 * @property {'all'|'components'} [scope='all'] - Scan scope
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP or saved JSON)
 * @property {Object[]} [textStylesData] - Pre-fetched text styles array (from MCP getLocalTextStyles).
 *   Optional — used for suggesting the closest matching style for hardcoded text.
 */

/**
 * @typedef {Object} LintTextStylesReport
 * @property {string} title
 * @property {{ totalComponents: number, totalIssues: number, scope: string }} summary
 * @property {import('./detect.js').HardcodedTextIssue[]} issues
 */

/**
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
 * Orchestrates the full hardcoded text style lint pass for a Figma file.
 *
 * Scans text nodes for missing text style bindings. Text nodes that have
 * no `textStyleId` applied are flagged as hardcoded.
 *
 * @param {LintTextStylesOptions} options
 * @returns {Promise<LintTextStylesReport>}
 */
export async function lintTextStyles({
  accessToken,
  fileKey,
  branchKey,
  pages,
  excludePages,
  scope = "all",
  fileData,
  textStylesData,
}) {
  const effectiveKey = getEffectiveFileKey({ fileKey, branchKey });

  let file;
  if (fileData) {
    file = fileData;
  } else {
    const client = createFigmaClient({ accessToken });
    file = await client.getFile(effectiveKey);
  }

  // Build the text style map for suggestions (optional — works without it)
  const textStyleMap = buildTextStyleMap(textStylesData || []);

  /** @type {import('./detect.js').HardcodedTextIssue[]} */
  const issues = [];
  let totalComponents = 0;

  const documentPages = file.document.children || [];

  for (const page of documentPages) {
    if (!shouldIncludePage(page.name, pages, excludePages)) continue;

    if (scope === "all") {
      const pageIssues = detectHardcodedTextOnPage(page, textStyleMap);
      issues.push(...pageIssues);
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
          const found = detectHardcodedText(
            variant,
            componentSet.name,
            variant.name,
            textStyleMap,
          );
          if (found.length > 0) issues.push(...found);
        }
      }

      for (const component of standaloneComponents) {
        totalComponents++;
        const found = detectHardcodedText(
          component,
          component.name,
          null,
          textStyleMap,
        );
        if (found.length > 0) issues.push(...found);
      }
    }
  }

  const enrichedIssues = enrichIssuesWithUrls(issues, effectiveKey);

  return {
    title: "Hardcoded Text Styles Report",
    summary: {
      totalComponents,
      totalIssues: enrichedIssues.length,
      scope,
    },
    issues: enrichedIssues,
  };
}
