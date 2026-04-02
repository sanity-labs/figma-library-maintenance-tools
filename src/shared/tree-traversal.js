/**
 * @typedef {Object} FigmaNode
 * @property {string} id - Node ID
 * @property {string} name - Node name
 * @property {string} type - Node type (FRAME, GROUP, COMPONENT, COMPONENT_SET, etc.)
 * @property {FigmaNode[]} [children] - Child nodes
 */

/**
 * @typedef {Object} TraversalContext
 * @property {FigmaNode} node - The current node
 * @property {FigmaNode|null} parent - The parent node, or null for root
 * @property {number} depth - Current depth in the tree (0-based)
 * @property {string[]} path - Array of ancestor node names from root to current
 */

/**
 * Traverses a Figma node tree depth-first, calling a visitor function for each node.
 *
 * @param {FigmaNode} rootNode - The root node to start traversal from
 * @param {function(TraversalContext): void} visitor - Callback invoked for each node
 * @param {Object} [options] - Traversal options
 * @param {number} [options.maxDepth=Infinity] - Maximum depth to traverse
 *
 * @example
 * traverseNodes(fileDocument, ({ node, parent, depth }) => {
 *   if (node.type === 'FRAME') console.log(node.name)
 * })
 */
export function traverseNodes(rootNode, visitor, options = {}) {
  const { maxDepth = Infinity } = options

  /**
   * Internal recursive traversal function.
   *
   * @param {FigmaNode} node - Current node
   * @param {FigmaNode|null} parent - Parent node
   * @param {number} depth - Current depth
   * @param {string[]} path - Ancestor path
   */
  function walk(node, parent, depth, path) {
    if (depth > maxDepth) return

    visitor({ node, parent, depth, path: [...path, node.name] })

    if (node.children) {
      for (const child of node.children) {
        walk(child, node, depth + 1, [...path, node.name])
      }
    }
  }

  walk(rootNode, null, 0, [])
}

/**
 * Collects all nodes matching a predicate from a Figma node tree.
 *
 * @param {FigmaNode} rootNode - The root node to search from
 * @param {function(TraversalContext): boolean} predicate - Filter function returning true for matches
 * @param {Object} [options] - Traversal options
 * @param {number} [options.maxDepth=Infinity] - Maximum depth to traverse
 * @returns {TraversalContext[]} Array of matching traversal contexts
 *
 * @example
 * const components = collectNodes(page, ({ node }) => node.type === 'COMPONENT')
 */
export function collectNodes(rootNode, predicate, options = {}) {
  const results = []

  traverseNodes(
    rootNode,
    (context) => {
      if (predicate(context)) {
        results.push(context)
      }
    },
    options
  )

  return results
}

/**
 * Finds all component sets and standalone components in a page.
 * Standalone components are those not nested inside a component set.
 *
 * @param {FigmaNode} pageNode - A Figma page node
 * @returns {{ componentSets: FigmaNode[], standaloneComponents: FigmaNode[] }}
 */
export function findComponents(pageNode) {
  const componentSets = []
  const standaloneComponents = []

  /**
   * Recursively search for components. We look at top-level children
   * and within sections.
   *
   * @param {FigmaNode} node - Current node to inspect
   */
  function search(node) {
    if (!node.children) return

    for (const child of node.children) {
      if (child.type === 'COMPONENT_SET') {
        componentSets.push(child)
      } else if (child.type === 'COMPONENT') {
        standaloneComponents.push(child)
      } else if (child.type === 'SECTION' || child.type === 'FRAME') {
        search(child)
      }
    }
  }

  search(pageNode)
  return { componentSets, standaloneComponents }
}
