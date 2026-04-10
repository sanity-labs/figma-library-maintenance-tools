import { createFigmaClient } from '../../shared/figma-client.js'
import { getEffectiveFileKey } from '../../shared/cli-utils.js'
import { auditLayerOrder } from './detect.js'
import { enrichIssuesWithUrls } from '../../shared/figma-urls.js'

/**
 * @typedef {import('./detect.js').LayerOrderIssue} LayerOrderIssue
 */

/**
 * @typedef {Object} LintLayerOrderOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key to inspect
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP or saved JSON)
 */

/**
 * @typedef {Object} LintLayerOrderSummary
 * @property {number} totalIssues - Total number of issues found
 * @property {number} variantInconsistency - Shared layers in wrong relative order
 * @property {number} backgroundPosition - Background layers not first
 * @property {number} overlayPosition - Overlay layers not last
 * @property {number} namingMismatch - Variants with different layer names from canonical
 * @property {number} variantOrder - Variants not in canvas spatial order
 */

/**
 * @typedef {Object} LintLayerOrderReport
 * @property {string} title - Human-readable report title
 * @property {LintLayerOrderSummary} summary - Aggregate statistics by category
 * @property {LayerOrderIssue[]} issues - All detected issues
 */

/**
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode
 * @param {string[]} [pages]
 * @returns {boolean}
 */
function shouldIncludePage(pageNode, pages) {
  if (!pages || pages.length === 0) return true
  return pages.includes(pageNode.name)
}

/**
 * Orchestrates the layer ordering lint for a Figma file.
 *
 * Fetches the file (or uses pre-fetched data), iterates over pages,
 * runs the detection function on each, and aggregates results into
 * a structured report with per-category counts.
 *
 * @param {LintLayerOrderOptions} options
 * @returns {Promise<LintLayerOrderReport>}
 */
export async function lintLayerOrder({
  accessToken,
  fileKey,
  branchKey,
  pages,
  fileData,
}) {
  const effectiveKey = getEffectiveFileKey({ fileKey, branchKey })

  let file
  if (fileData) {
    file = fileData
  } else {
    const client = createFigmaClient({ accessToken })
    file = await client.getFile(effectiveKey)
  }

  /** @type {LayerOrderIssue[]} */
  const allIssues = []

  const documentPages = file.document.children || []

  for (const page of documentPages) {
    if (!shouldIncludePage(page, pages)) continue
    const issues = auditLayerOrder(page)
    allIssues.push(...issues)
  }

  const enrichedIssues = enrichIssuesWithUrls(allIssues, effectiveKey)

  const summary = {
    totalIssues: allIssues.length,
    variantInconsistency: 0,
    backgroundPosition: 0,
    overlayPosition: 0,
    namingMismatch: 0,
    variantOrder: 0,
  }

  for (const issue of allIssues) {
    if (issue.category in summary) {
      summary[issue.category]++
    }
  }

  return {
    title: 'Layer Ordering Lint',
    summary,
    issues: enrichedIssues,
  }
}
