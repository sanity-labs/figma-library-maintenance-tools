import { findComponents } from '../../shared/tree-traversal.js'

/**
 * @typedef {Object} DescriptionIssue
 * @property {string} componentName - Component or component set name
 * @property {string} nodeId - Figma node ID
 * @property {string} type - 'COMPONENT' or 'COMPONENT_SET'
 * @property {string} pageName - Page the component is on
 * @property {boolean} hasDescription - Whether a non-empty description exists
 */

/**
 * Checks whether a Figma node has a valid (non-empty, non-whitespace) description.
 *
 * A description is considered valid when the node's `description` property is a
 * string that contains at least one non-whitespace character after trimming.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node - A Figma node to inspect
 * @returns {boolean} `true` when the node has a non-empty trimmed description, `false` otherwise
 *
 * @example
 * hasValidDescription({ id: '1', name: 'Button', description: 'A primary button' })
 * // => true
 *
 * @example
 * hasValidDescription({ id: '2', name: 'Card', description: '   ' })
 * // => false
 */
export function hasValidDescription(node) {
  if (typeof node.description !== 'string') {
    return false
  }

  return node.description.trim().length > 0
}

/**
 * Checks all published components and component sets on a page for description coverage.
 *
 * Uses {@link findComponents} from the shared tree-traversal module to locate
 * component sets and standalone components on the given page node. Each found
 * node is tested with {@link hasValidDescription} and sorted into either the
 * `withDescription` or `missingDescription` bucket.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A Figma page (CANVAS) node to scan
 * @returns {{ withDescription: DescriptionIssue[], missingDescription: DescriptionIssue[] }}
 *   An object with two arrays: components that have descriptions and those that are missing them
 *
 * @example
 * const page = { id: '1:0', name: 'Components', type: 'CANVAS', children: [...] }
 * const result = checkDescriptions(page)
 * console.log(result.missingDescription.length) // number of components without descriptions
 */
export function checkDescriptions(pageNode) {
  /** @type {DescriptionIssue[]} */
  const withDescription = []

  /** @type {DescriptionIssue[]} */
  const missingDescription = []

  const { componentSets, standaloneComponents } = findComponents(pageNode)

  /**
   * Evaluates a single node's description and adds it to the appropriate bucket.
   *
   * @param {import('../../shared/tree-traversal.js').FigmaNode} node - The component or component set node
   * @param {string} type - The node type label ('COMPONENT' or 'COMPONENT_SET')
   */
  function categorise(node, type) {
    const described = hasValidDescription(node)

    /** @type {DescriptionIssue} */
    const issue = {
      componentName: node.name,
      nodeId: node.id,
      type,
      pageName: pageNode.name,
      hasDescription: described,
    }

    if (described) {
      withDescription.push(issue)
    } else {
      missingDescription.push(issue)
    }
  }

  for (const componentSet of componentSets) {
    categorise(componentSet, 'COMPONENT_SET')
  }

  for (const component of standaloneComponents) {
    categorise(component, 'COMPONENT')
  }

  return { withDescription, missingDescription }
}
