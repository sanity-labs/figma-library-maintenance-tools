import { createFigmaClient } from '../../shared/figma-client.js'
import { getEffectiveFileKey } from '../../shared/cli-utils.js'
import { findComponents } from '../../shared/tree-traversal.js'
import { detectCasingIssues } from './detect.js'
import { enrichIssuesWithUrls } from '../../shared/figma-urls.js'

/**
 * @typedef {Object} LintCasingOptions
 * @property {string} [accessToken]
 * @property {string} fileKey
 * @property {string} [branchKey]
 * @property {string[]} [pages]
 * @property {string[]} [excludePages]
 * @property {boolean} [textOnly=true]
 * @property {Object} [fileData]
 */

function shouldIncludePage(pageName, allowedPages, excludedPages) {
  if (excludedPages && excludedPages.length > 0 && excludedPages.includes(pageName)) return false
  if (!allowedPages || allowedPages.length === 0) return true
  return allowedPages.includes(pageName)
}

/**
 * Scans a Figma file for layer name casing violations inside components.
 *
 * @param {LintCasingOptions} options
 * @returns {Promise<Object>}
 */
export async function lintCasing({
  accessToken, fileKey, branchKey, pages, excludePages,
  textOnly = true, fileData,
}) {
  const effectiveKey = getEffectiveFileKey({ fileKey, branchKey })
  let file
  if (fileData) { file = fileData }
  else { const client = createFigmaClient({ accessToken }); file = await client.getFile(effectiveKey) }

  const issues = []
  let totalComponents = 0
  const filePages = (file.document && file.document.children) || []

  for (const page of filePages) {
    if (!shouldIncludePage(page.name, pages, excludePages)) continue
    const { componentSets, standaloneComponents } = findComponents(page)

    for (const componentSet of componentSets) {
      const variants = (componentSet.children || []).filter((c) => c.type === 'COMPONENT')
      totalComponents += variants.length
      for (const variant of variants) {
        issues.push(...detectCasingIssues(variant, componentSet.name, variant.name, { textOnly }))
      }
    }
    for (const component of standaloneComponents) {
      totalComponents++
      issues.push(...detectCasingIssues(component, component.name, null, { textOnly }))
    }
  }

  const enrichedIssues = enrichIssuesWithUrls(issues, effectiveKey)
  return {
    title: 'Layer Casing Lint',
    summary: { totalComponents, totalIssues: enrichedIssues.length, textOnly },
    issues: enrichedIssues,
  }
}
