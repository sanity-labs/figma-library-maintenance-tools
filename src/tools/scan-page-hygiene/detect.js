/**
 * @typedef {Object} HygieneIssue
 * @property {string} pageName - Name of the page
 * @property {string} itemName - Name of the unexpected item
 * @property {string} itemType - Figma node type
 * @property {string} nodeId - Figma node ID
 * @property {'expected'|'unexpected'} classification - Whether the item belongs
 */

/**
 * Set of Figma node types that are expected at the top level of a published
 * library page. Everything outside this set is considered unexpected clutter.
 *
 * - `COMPONENT_SET` — a set of variants (always expected)
 * - `COMPONENT`     — a standalone component (always expected)
 * - `SECTION`       — used to organise components on the canvas (expected)
 *
 * @type {ReadonlySet<string>}
 */
const EXPECTED_TOP_LEVEL_TYPES = new Set([
  'COMPONENT_SET',
  'COMPONENT',
  'SECTION',
])

/**
 * Classifies a single top-level node as either `'expected'` or `'unexpected'`.
 *
 * A node is **expected** when its `type` is one of:
 * `COMPONENT_SET`, `COMPONENT`, or `SECTION`.
 * Every other type (`INSTANCE`, `FRAME`, `GROUP`, `TEXT`, `RECTANGLE`,
 * `VECTOR`, `ELLIPSE`, `LINE`, `BOOLEAN_OPERATION`, etc.) is **unexpected**.
 *
 * @param {{ type: string }} node - A Figma node with at least a `type` property
 * @returns {'expected'|'unexpected'} The classification result
 *
 * @example
 * classifyTopLevelItem({ type: 'COMPONENT' })    // 'expected'
 * classifyTopLevelItem({ type: 'FRAME' })         // 'unexpected'
 * classifyTopLevelItem({ type: 'TEXT' })           // 'unexpected'
 */
export function classifyTopLevelItem(node) {
  return EXPECTED_TOP_LEVEL_TYPES.has(node.type) ? 'expected' : 'unexpected'
}

/**
 * Scans a single Figma page node and classifies every direct child as either
 * expected or unexpected for a published component-library page.
 *
 * The function iterates over the page's immediate `children` array (top-level
 * items only — it does **not** recurse) and produces a {@link HygieneIssue}
 * for each child, placed into the appropriate bucket.
 *
 * @param {{ name: string, children?: Array<{ id: string, name: string, type: string }> }} pageNode
 *   A Figma page node containing at least `name` and optionally `children`.
 * @returns {{ pageName: string, expected: HygieneIssue[], unexpected: HygieneIssue[] }}
 *   An object with the page name and two arrays of classified issues.
 *
 * @example
 * const result = scanPage({
 *   name: 'Icons',
 *   children: [
 *     { id: '1:1', name: 'IconSet', type: 'COMPONENT_SET' },
 *     { id: '1:2', name: 'Stray Frame', type: 'FRAME' },
 *   ],
 * })
 * // result.expected.length === 1
 * // result.unexpected.length === 1
 */
export function scanPage(pageNode) {
  const pageName = pageNode.name
  /** @type {HygieneIssue[]} */
  const expected = []
  /** @type {HygieneIssue[]} */
  const unexpected = []

  const children = pageNode.children || []

  for (const child of children) {
    const classification = classifyTopLevelItem(child)

    /** @type {HygieneIssue} */
    const issue = {
      pageName,
      itemName: child.name,
      itemType: child.type,
      nodeId: child.id,
      classification,
    }

    if (classification === 'expected') {
      expected.push(issue)
    } else {
      unexpected.push(issue)
    }
  }

  return { pageName, expected, unexpected }
}
