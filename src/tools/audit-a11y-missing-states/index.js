import { createFigmaClient } from '../../shared/figma-client.js'
import { getEffectiveFileKey } from '../../shared/cli-utils.js'
import { auditMissingStates } from './detect.js'
import { enrichIssuesWithUrls } from '../../shared/figma-urls.js'

/**
 * @typedef {import('./detect.js').MissingStateIssue} MissingStateIssue
 */

/**
 * @typedef {Object} AuditMissingStatesOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key to inspect
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP or saved JSON)
 */

/**
 * @typedef {Object} AuditMissingStatesSummary
 * @property {number} totalChecked - Number of interactive component sets inspected
 * @property {number} complete - Number with all expected states
 * @property {number} incomplete - Number missing one or more states
 * @property {number} totalMissingStates - Total count of individual missing state variants
 * @property {number} highSeverity - Number of high-severity missing states (focused)
 * @property {number} mediumSeverity - Number of medium-severity missing states (disabled, invalid)
 * @property {number} lowSeverity - Number of low-severity missing states (readOnly)
 */

/**
 * @typedef {Object} AuditMissingStatesReport
 * @property {string} title - Human-readable report title
 * @property {AuditMissingStatesSummary} summary - Aggregate statistics
 * @property {MissingStateIssue[]} issues - Missing state details per component
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
 * Orchestrates the missing states audit for a Figma file.
 *
 * Fetches the file (or uses pre-fetched data), iterates over pages,
 * runs the detection function on each, and aggregates results.
 *
 * @param {AuditMissingStatesOptions} options
 * @returns {Promise<AuditMissingStatesReport>}
 */
export async function auditA11yMissingStates({
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

  /** @type {string[]} */
  const allComplete = []
  /** @type {MissingStateIssue[]} */
  const allIssues = []

  const documentPages = file.document.children || []

  for (const page of documentPages) {
    if (!shouldIncludePage(page, pages)) continue

    const { complete, issues } = auditMissingStates(page)
    allComplete.push(...complete)
    allIssues.push(...issues)
  }

  const incompleteComponents = new Set(allIssues.map((i) => i.componentName))
  const highSeverity = allIssues.filter((i) => i.severity === 'high').length
  const mediumSeverity = allIssues.filter((i) => i.severity === 'medium').length
  const lowSeverity = allIssues.filter((i) => i.severity === 'low').length

  const enrichedIssues = enrichIssuesWithUrls(allIssues, effectiveKey)

  return {
    title: 'Accessibility Audit: Missing Interactive States (WCAG 2.4.7, 3.3.1, 4.1.2)',
    summary: {
      totalChecked: allComplete.length + incompleteComponents.size,
      complete: allComplete.length,
      incomplete: incompleteComponents.size,
      totalMissingStates: allIssues.length,
      highSeverity,
      mediumSeverity,
      lowSeverity,
    },
    issues: enrichedIssues,
  }
}
