import { createFigmaClient } from "../../shared/figma-client.js";
import { getEffectiveFileKey } from "../../shared/cli-utils.js";
import { scanPage, auditSectionNaming } from "./detect.js";
import { enrichIssuesWithUrls } from "../../shared/figma-urls.js";

/**
 * @typedef {Object} ScanPageHygieneOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key to analyse
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Page names to restrict the scan to (empty or omitted = all pages)
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP use_figma or saved JSON).
 *   When provided, the REST API is not called and accessToken is not required.
 */

/**
 * @typedef {Object} ScanPageHygieneReport
 * @property {string} title - Human-readable report title
 * @property {{ totalPages: number, totalItems: number, expectedItems: number, unexpectedItems: number }} summary
 *   Aggregate counts across all scanned pages
 * @property {import('./detect.js').HygieneIssue[]} issues - Every unexpected top-level item detected
 */

/**
 * Determines whether a page should be included in the scan.
 *
 * If the caller supplied a non-empty `pages` allow-list the page name must
 * appear in that list.  Otherwise every page is included.
 *
 * @param {string} pageName - The name of the page under consideration
 * @param {string[]} allowedPages - Allow-list supplied by the caller (may be empty)
 * @returns {boolean} `true` when the page should be scanned
 */
function shouldIncludePage(pageName, allowedPages) {
  if (!allowedPages || allowedPages.length === 0) {
    return true;
  }
  return allowedPages.includes(pageName);
}

/**
 * Scans a Figma file for non-component items sitting at the top level of
 * published library pages.
 *
 * The function fetches the file tree (depth 2 — pages and their direct
 * children) via the Figma REST API, walks every matching page, and delegates
 * to {@link scanPage} for the actual classification of each top-level node.
 *
 * Items whose type is `COMPONENT_SET`, `COMPONENT`, or `SECTION` are
 * considered **expected**.  Everything else (`FRAME`, `GROUP`, `INSTANCE`,
 * `TEXT`, `RECTANGLE`, `VECTOR`, etc.) is flagged as **unexpected** and
 * included in the returned `issues` array.
 *
 * @param {ScanPageHygieneOptions} options - Access credentials and scan scope
 * @returns {Promise<ScanPageHygieneReport>} A report containing all detected issues
 *
 * @example
 * const report = await scanPageHygiene({
 *   accessToken: 'fig_...',
 *   fileKey: 'abc123XYZ',
 *   pages: ['Icons', 'Components'],
 * })
 * console.log(report.summary.unexpectedItems) // number of stray items
 */
export async function scanPageHygiene({
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
    file = await client.getFile(effectiveKey, { depth: 2 });
  }

  /** @type {import('./detect.js').HygieneIssue[]} */
  const allIssues = [];
  let totalPages = 0;
  let totalItems = 0;
  let expectedItems = 0;
  let unexpectedItems = 0;

  const filePages = (file.document && file.document.children) || [];

  for (const page of filePages) {
    if (!shouldIncludePage(page.name, pages)) {
      continue;
    }

    totalPages += 1;

    const result = scanPage(page);

    totalItems += result.expected.length + result.unexpected.length;
    expectedItems += result.expected.length;
    unexpectedItems += result.unexpected.length;

    allIssues.push(...result.unexpected);

    const children = page.children || [];
    for (const child of children) {
      if (child.type === 'SECTION') {
        const sectionIssue = auditSectionNaming(child, page.name);
        if (sectionIssue) allIssues.push(sectionIssue);
      }
    }
  }

  const enrichedIssues = enrichIssuesWithUrls(allIssues, effectiveKey);
  const sectionNamingIssues = enrichedIssues.filter(
    (i) => i.issueType === 'section-name-mismatch'
  ).length;

  return {
    title: "Page Hygiene Report",
    summary: {
      totalPages,
      totalItems,
      expectedItems,
      unexpectedItems,
      sectionNamingIssues,
    },
    issues: enrichedIssues,
  };
}
