import { createFigmaClient } from '../../shared/figma-client.js'
import { getEffectiveFileKey } from '../../shared/cli-utils.js'
import { auditTargetSizes } from './detect.js'
import { enrichIssuesWithUrls } from '../../shared/figma-urls.js'

/**
 * @typedef {import('./detect.js').TargetSizeIssue} TargetSizeIssue
 */

/**
 * @typedef {Object} AuditTargetSizesOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key to inspect
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP or saved JSON)
 */

/**
 * @typedef {Object} AuditTargetSizesSummary
 * @property {number} totalChecked - Number of interactive components inspected
 * @property {number} passing - Number meeting the 24×24px minimum
 * @property {number} failing - Number below the minimum
 * @property {number} highSeverity - Number below 17px
 * @property {number} mediumSeverity - Number between 17–23px
 */

/**
 * @typedef {Object} AuditTargetSizesReport
 * @property {string} title - Human-readable report title
 * @property {AuditTargetSizesSummary} summary - Aggregate statistics
 * @property {TargetSizeIssue[]} issues - Components failing the target size check
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
 * Orchestrates the target size audit for a Figma file.
 *
 * Fetches the file (or uses pre-fetched data), iterates over pages,
 * runs the detection function on each, and aggregates results into
 * a structured report.
 *
 * @param {AuditTargetSizesOptions} options
 * @returns {Promise<AuditTargetSizesReport>}
 */
export async function auditA11yTargetSizes({
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

  /** @type {TargetSizeIssue[]} */
  const allPassing = []
  /** @type {TargetSizeIssue[]} */
  const allFailing = []

  const documentPages = file.document.children || []

  for (const page of documentPages) {
    if (!shouldIncludePage(page, pages)) continue

    const { passing, failing } = auditTargetSizes(page)
    allPassing.push(...passing)
    allFailing.push(...failing)
  }

  const totalChecked = allPassing.length + allFailing.length
  const highSeverity = allFailing.filter((i) => i.severity === 'high').length
  const mediumSeverity = allFailing.filter((i) => i.severity === 'medium').length

  const enrichedFailing = enrichIssuesWithUrls(allFailing, effectiveKey)

  return {
    title: 'Accessibility Audit: Target Sizes (WCAG 2.5.8)',
    summary: {
      totalChecked,
      passing: allPassing.length,
      failing: allFailing.length,
      highSeverity,
      mediumSeverity,
    },
    issues: enrichedFailing,
  }
}
