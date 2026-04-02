import { traverseNodes } from '../../shared/tree-traversal.js'

/**
 * @typedef {Object} DuplicateSiblingIssue
 * @property {string} componentName - Name of the containing component or component set
 * @property {string} [variantName] - Variant name if inside a component set
 * @property {string} parentName - Name of the parent node containing the duplicates
 * @property {string} parentId - Node ID of the parent
 * @property {string} duplicatedName - The name that appears multiple times
 * @property {number} count - How many times the name appears
 * @property {Array<{type: string, id: string, index: number}>} occurrences - Details of each duplicate occurrence
 */

/**
 * @typedef {Object} DuplicateGroup
 * @property {string} name - The duplicated child name
 * @property {number} count - How many children share this name
 * @property {Array<import('../../shared/tree-traversal.js').FigmaNode>} children - The child nodes that share the name
 */

/**
 * Checks a single parent node's direct children for duplicate names.
 *
 * Groups children by name and returns only those groups where more than
 * one child shares the same name. Returns an empty array when the node
 * has no children or all children have unique names.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} parentNode - A Figma node whose direct children will be inspected
 * @returns {DuplicateGroup[]} Array of duplicate groups, each containing the shared name, occurrence count, and the matching child nodes
 *
 * @example
 * const node = { id: '1', name: 'Frame', type: 'FRAME', children: [
 *   { id: '2', name: 'flex', type: 'FRAME' },
 *   { id: '3', name: 'flex', type: 'FRAME' },
 *   { id: '4', name: 'icon', type: 'INSTANCE' },
 * ]}
 * findDuplicateSiblings(node)
 * // => [{ name: 'flex', count: 2, children: [...] }]
 */
export function findDuplicateSiblings(parentNode) {
  if (!parentNode.children || parentNode.children.length === 0) {
    return []
  }

  /** @type {Map<string, Array<import('../../shared/tree-traversal.js').FigmaNode>>} */
  const nameMap = new Map()

  for (const child of parentNode.children) {
    const name = child.name
    if (!nameMap.has(name)) {
      nameMap.set(name, [])
    }
    nameMap.get(name).push(child)
  }

  /** @type {DuplicateGroup[]} */
  const duplicates = []

  for (const [name, children] of nameMap) {
    if (children.length > 1) {
      duplicates.push({ name, count: children.length, children })
    }
  }

  return duplicates
}

/**
 * Traverses an entire component tree and detects all duplicate sibling names
 * at every level of nesting.
 *
 * For every node that has children, calls {@link findDuplicateSiblings} and
 * collects the results into an array of {@link DuplicateSiblingIssue} objects
 * annotated with the component name and optional variant name.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentNode - The root node of a component or variant to inspect
 * @param {string} componentName - Display name of the containing component or component set
 * @param {string} [variantName] - Variant name when the component lives inside a component set
 * @returns {DuplicateSiblingIssue[]} Array of all duplicate sibling issues found throughout the tree
 *
 * @example
 * const issues = detectDuplicateSiblings(variantNode, 'Button', 'Size=Large')
 */
export function detectDuplicateSiblings(componentNode, componentName, variantName) {
  /** @type {DuplicateSiblingIssue[]} */
  const issues = []

  traverseNodes(componentNode, ({ node }) => {
    const duplicateGroups = findDuplicateSiblings(node)

    for (const group of duplicateGroups) {
      /** @type {Array<{type: string, id: string, index: number}>} */
      const occurrences = group.children.map((child) => {
        const index = node.children.indexOf(child)
        return { type: child.type, id: child.id, index }
      })

      /** @type {DuplicateSiblingIssue} */
      const issue = {
        componentName,
        parentName: node.name,
        parentId: node.id,
        duplicatedName: group.name,
        count: group.count,
        occurrences,
      }

      if (variantName !== undefined) {
        issue.variantName = variantName
      }

      issues.push(issue)
    }
  })

  return issues
}
