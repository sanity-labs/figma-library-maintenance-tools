import { createFigmaClient } from '../../shared/figma-client.js'
import { getEffectiveFileKey } from '../../shared/cli-utils.js'
import { auditPage } from './detect.js'

/**
 * @typedef {Object} LintCanvasOptions
 * @property {string} [accessToken]
 * @property {string} fileKey
 * @property {string} [branchKey]
 * @property {string[]} [pages]
 * @property {string[]} [excludePages]
 * @property {Object} [fileData]
 */

function shouldIncludePage(pageName, allowedPages, excludedPages) {
  if (excludedPages && excludedPages.length > 0 && excludedPages.includes(pageName)) return false
  if (!allowedPages || allowedPages.length === 0) return true
  return allowedPages.includes(pageName)
}

/**
 * Scans a Figma file for canvas-level hygiene issues:
 * origin drift and page name whitespace.
 *
 * @param {LintCanvasOptions} options
 * @returns {Promise<Object>}
 */
export async function lintCanvas({
  accessToken, fileKey, branchKey, pages, excludePages, fileData,
}) {
  const effectiveKey = getEffectiveFileKey({ fileKey, branchKey })
  let file
  if (fileData) { file = fileData }
  else { const client = createFigmaClient({ accessToken }); file = await client.getFile(effectiveKey) }

  const issues = []
  let totalPages = 0
  const filePages = (file.document && file.document.children) || []

  for (const page of filePages) {
    if (page.name === '---') continue
    if (!shouldIncludePage(page.name, pages, excludePages)) continue
    totalPages++
    issues.push(...auditPage(page))
  }

  return {
    title: 'Canvas Hygiene Lint',
    summary: {
      totalPages,
      totalIssues: issues.length,
      originDrift: issues.filter((i) => i.issueType === 'origin-drift').length,
      nameWhitespace: issues.filter((i) => i.issueType === 'page-name-whitespace').length,
    },
    issues,
  }
}
