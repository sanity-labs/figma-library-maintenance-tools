import { createFigmaClient } from '../../shared/figma-client.js'
import { getEffectiveFileKey } from '../../shared/cli-utils.js'
import { auditA11yDescriptions } from './detect.js'
import { enrichIssuesWithUrls } from '../../shared/figma-urls.js'

/**
 * @typedef {import('./detect.js').A11yDescriptionIssue} A11yDescriptionIssue
 */

/**
 * @typedef {Object} AuditA11yDescriptionsOptions
 * @property {string} [accessToken] - Figma personal access token (not required when fileData is provided)
 * @property {string} fileKey - Figma file key to inspect
 * @property {string} [branchKey] - Optional Figma branch key
 * @property {string[]} [pages] - Optional list of page names to restrict analysis to
 * @property {Object} [fileData] - Pre-fetched Figma file data (from MCP or saved JSON)
 */

/**
 * @typedef {Object} AuditA11yDescriptionsSummary
 * @property {number} totalChecked - Number of interactive components inspected
 * @property {number} withA11yNotes - Number with accessibility documentation
 * @property {number} missingA11yNotes - Number without accessibility documentation
 * @property {number} coveragePercent - Percentage of components with a11y notes (0–100, one decimal)
 * @property {number} highSeverity - Complex widgets missing a11y notes
 * @property {number} mediumSeverity - Simple controls missing a11y notes
 */

/**
 * @typedef {Object} AuditA11yDescriptionsReport
 * @property {string} title - Human-readable report title
 * @property {AuditA11yDescriptionsSummary} summary - Aggregate statistics
 * @property {A11yDescriptionIssue[]} issues - Components missing a11y documentation
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
 * Orchestrates the a11y description quality audit for a Figma file.
 *
 * @param {AuditA11yDescriptionsOptions} options
 * @returns {Promise<AuditA11yDescriptionsReport>}
 */
export async function auditA11yDescriptionCoverage({
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

  /** @type {A11yDescriptionIssue[]} */
  const allPassing = []
  /** @type {A11yDescriptionIssue[]} */
  const allFailing = []

  const documentPages = file.document.children || []

  for (const page of documentPages) {
    if (!shouldIncludePage(page, pages)) continue

    const { passing, failing } = auditA11yDescriptions(page)
    allPassing.push(...passing)
    allFailing.push(...failing)
  }

  const totalChecked = allPassing.length + allFailing.length
  const coveragePercent =
    totalChecked === 0
      ? 100
      : Math.round((allPassing.length / totalChecked) * 1000) / 10

  const highSeverity = allFailing.filter((i) => i.severity === 'high').length
  const mediumSeverity = allFailing.filter((i) => i.severity === 'medium').length

  const enrichedFailing = enrichIssuesWithUrls(allFailing, effectiveKey)

  return {
    title: 'Accessibility Audit: Description Quality',
    summary: {
      totalChecked,
      withA11yNotes: allPassing.length,
      missingA11yNotes: allFailing.length,
      coveragePercent,
      highSeverity,
      mediumSeverity,
    },
    issues: enrichedFailing,
  }
}
