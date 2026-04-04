import { traverseNodes } from '../../shared/tree-traversal.js'

/**
 * @typedef {Object} CasingIssue
 * @property {string} componentName
 * @property {string} [variantName]
 * @property {string} layerName - The layer name with casing violations
 * @property {string} expectedName - The corrected name
 * @property {string} layerType
 * @property {string} nodeId
 * @property {string} message
 */

/**
 * Tests whether a name contains any uppercase ASCII letters.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function hasUppercase(name) {
  return /[A-Z]/.test(name)
}

/**
 * Converts a name to lowercase.
 *
 * @param {string} name
 * @returns {string}
 */
export function toLowercase(name) {
  return name.toLowerCase()
}

/**
 * Tests whether a layer is exempt from casing rules.
 * Instance layers use PascalCase component names and are exempt.
 *
 * @param {string} name
 * @param {string} layerType
 * @returns {boolean}
 */
export function isExempt(name, layerType) {
  return layerType === 'INSTANCE'
}

/**
 * Detects layers with non-lowercase names inside a component.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentNode
 * @param {string} componentName
 * @param {string|null} variantName
 * @param {Object} [options]
 * @param {boolean} [options.textOnly=true] - Only check TEXT layers
 * @returns {CasingIssue[]}
 */
export function detectCasingIssues(componentNode, componentName, variantName, options = {}) {
  const { textOnly = true } = options
  /** @type {CasingIssue[]} */
  const issues = []

  traverseNodes(componentNode, ({ node, depth }) => {
    if (depth === 0) return
    if (textOnly && node.type !== 'TEXT') return
    if (isExempt(node.name, node.type)) return

    if (hasUppercase(node.name)) {
      /** @type {CasingIssue} */
      const issue = {
        componentName,
        layerName: node.name,
        expectedName: toLowercase(node.name),
        layerType: node.type,
        nodeId: node.id,
        message: `Text layer "${node.name}" in "${componentName}" should be lowercase: "${toLowercase(node.name)}".`,
      }
      if (variantName != null) issue.variantName = variantName
      issues.push(issue)
    }
  })

  return issues
}
