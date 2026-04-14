import { createFigmaClient } from "../../shared/figma-client.js";
import { getEffectiveFileKey } from "../../shared/cli-utils.js";
import { findComponents } from "../../shared/tree-traversal.js";
import {
  buildLocalVariableIdSet,
  buildLocalVariablesByName,
  detectRemoteBindings,
  detectRemoteBindingsOnPage,
} from "./detect.js";
import { enrichIssuesWithUrls } from "../../shared/figma-urls.js";

/**
 * @typedef {Object} RemapRemoteVariablesOptions
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
 * @typedef {Object} RemapRemoteVariablesReport
 * @property {string} title
 * @property {{ totalComponents: number, totalIssues: number, remappable: number, missingLocal: number, scope: string }} summary
 * @property {import('./detect.js').RemoteBindingIssue[]} issues
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
 * Orchestrates the full remote variable binding scan for a Figma file.
 *
 * Detects all variable bindings that reference external (remote) variables
 * and classifies each as `remappable` (a local variable with the same name
 * exists) or `missing-local` (no local match found).
 *
 * The report is detection-only — it does not modify the file. Use the
 * companion `fix-script.js` Plugin API script via `use_figma` to perform
 * the actual rebinding.
 *
 * @param {RemapRemoteVariablesOptions} options
 * @returns {Promise<RemapRemoteVariablesReport>}
 */
export async function remapRemoteVariables({
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
        "The remote variable detector requires variable data. When using " +
        "pre-fetched fileData, also provide variablesData (from the " +
        "getLocalVariablesScript MCP script).",
      );
    }
  } else {
    const client = createFigmaClient({ accessToken });
    [file, variablesResponse] = await Promise.all([
      client.getFile(effectiveKey),
      client.getLocalVariables(effectiveKey),
    ]);
  }

  const localIds = buildLocalVariableIdSet(variablesResponse);
  const localByName = buildLocalVariablesByName(variablesResponse);

  /** @type {import('./detect.js').RemoteBindingIssue[]} */
  const issues = [];
  let totalComponents = 0;

  const documentPages = file.document.children || [];

  for (const page of documentPages) {
    if (!shouldIncludePage(page.name, pages, excludePages)) continue;

    if (scope === "all") {
      const pageIssues = detectRemoteBindingsOnPage(
        page,
        localIds,
        localByName,
        variablesResponse,
      );
      issues.push(...pageIssues);
      const { componentSets, standaloneComponents } = findComponents(page);
      for (const cs of componentSets) {
        totalComponents += (cs.children || []).filter(
          (c) => c.type === "COMPONENT",
        ).length;
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
          const found = detectRemoteBindings(
            variant,
            componentSet.name,
            variant.name,
            localIds,
            localByName,
            variablesResponse,
          );
          if (found.length > 0) issues.push(...found);
        }
      }

      for (const component of standaloneComponents) {
        totalComponents++;
        const found = detectRemoteBindings(
          component,
          component.name,
          null,
          localIds,
          localByName,
          variablesResponse,
        );
        if (found.length > 0) issues.push(...found);
      }
    }
  }

  let remappable = 0;
  let missingLocal = 0;
  for (const issue of issues) {
    if (issue.status === "remappable") remappable++;
    else if (issue.status === "missing-local") missingLocal++;
  }

  const enrichedIssues = enrichIssuesWithUrls(issues, effectiveKey);

  return {
    title: "Remote Variable Bindings Report",
    summary: {
      totalComponents,
      totalIssues: enrichedIssues.length,
      remappable,
      missingLocal,
      scope,
    },
    issues: enrichedIssues,
  };
}
