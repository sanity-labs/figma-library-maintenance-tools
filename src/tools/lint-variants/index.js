import { createFigmaClient } from '../../shared/figma-client.js'
import { getEffectiveFileKey } from '../../shared/cli-utils.js'
import { findComponents } from '../../shared/tree-traversal.js'
import { auditComponentSetVariants } from './detect.js'
import { enrichIssuesWithUrls } from '../../shared/figma-urls.js'

/**
 * @typedef {Object} LintVariantsOptions
 * @property {string} [accessToken] - Figma personal access token
 * @property {string} fileKey - Figma file key
 * @property {string} [branchKey] - Optional branch key
 * @property {string[]} [pages] - Page names to include
 * @property {string[]} [excludePages] - Page names to exclude
 * @property {boolean} [includeGaps=false] - Check coverage gaps (--matrix)
 * @property {Object} [fileData] - Pre-fetched Figma file data
 */

/**
 * Determines whether a page should be included in the scan.
 *
 * @param {string} pageName
 * @param {string[]} allowedPages
 * @param {string[]} excludedPages
 * @returns {boolean}
 */
function shouldIncludePage(pageName, allowedPages, excludedPages) {
  if (excludedPages && excludedPages.length > 0 && excludedPages.includes(pageName)) return false
  if (!allowedPages || allowedPages.length === 0) return true
  return allowedPages.includes(pageName)
}

/**
 * Scans a Figma file for variant-related issues in component sets.
 *
 * @param {LintVariantsOptions} options
 * @returns {Promise<Object>} Report with summary and issues
 */
export async function lintVariants({
  accessToken, fileKey, branchKey, pages, excludePages,
  includeGaps = false, fileData,
}) {
  const effectiveKey = getEffectiveFileKey({ fileKey, branchKey })
  let file
  if (fileData) { file = fileData }
  else {
    const client = createFigmaClient({ accessToken })
    file = await client.getFile(effectiveKey)
  }

  const issues = []
  let totalComponentSets = 0
  const filePages = (file.document && file.document.children) || []

  for (const page of filePages) {
    if (!shouldIncludePage(page.name, pages, excludePages)) continue
    const { componentSets } = findComponents(page)
    for (const componentSet of componentSets) {
      totalComponentSets++
      issues.push(...auditComponentSetVariants(componentSet, { includeGaps }))
    }
  }

  const enrichedIssues = enrichIssuesWithUrls(issues, effectiveKey)

  return {
    title: 'Variant Lint',
    summary: {
      totalComponentSets,
      totalIssues: enrichedIssues.length,
      singleValueVariants: enrichedIssues.filter((i) => i.issueType === 'single-value-variant').length,
      duplicateVariantNames: enrichedIssues.filter((i) => i.issueType === 'duplicate-variant-name').length,
      coverageGaps: enrichedIssues.filter((i) => i.issueType === 'coverage-gap').length,
    },
    issues: enrichedIssues,
  }
}
