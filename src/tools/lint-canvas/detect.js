/**
 * @typedef {Object} CanvasIssue
 * @property {string} pageName
 * @property {string} nodeId
 * @property {string} issueType
 * @property {string} message
 */

/**
 * Tests whether a page name has leading or trailing whitespace.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function hasWhitespacePadding(name) {
  return name !== name.trim()
}

/**
 * Calculates the origin offset for a page — the minimum x and y
 * across all direct children. Returns null for empty/missing children.
 *
 * @param {{ x?: number, y?: number }[]} children
 * @returns {{ offsetX: number, offsetY: number } | null}
 */
export function calculateOriginOffset(children) {
  if (!children || children.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  for (const child of children) {
    const x = child.x ?? 0
    const y = child.y ?? 0
    if (x < minX) minX = x
    if (y < minY) minY = y
  }
  return { offsetX: minX, offsetY: minY }
}

/**
 * Checks a single page for origin drift.
 * Divider pages (name === '---') and empty pages are skipped.
 *
 * @param {{ name: string, id: string, children?: { x?: number, y?: number }[] }} pageNode
 * @returns {CanvasIssue | null}
 */
export function detectOriginDrift(pageNode) {
  if (pageNode.name === '---') return null
  const offset = calculateOriginOffset(pageNode.children)
  if (offset === null) return null
  if (offset.offsetX === 0 && offset.offsetY === 0) return null
  return {
    pageName: pageNode.name, nodeId: pageNode.id,
    offsetX: offset.offsetX, offsetY: offset.offsetY,
    issueType: 'origin-drift',
    message: `Page "${pageNode.name}" is not anchored at origin. Content starts at (${offset.offsetX}, ${offset.offsetY}).`,
  }
}

/**
 * Checks a page for whitespace in its name.
 *
 * @param {{ name: string, id: string }} pageNode
 * @returns {CanvasIssue | null}
 */
export function detectPageNameWhitespace(pageNode) {
  if (!hasWhitespacePadding(pageNode.name)) return null
  return {
    pageName: pageNode.name, trimmedName: pageNode.name.trim(),
    nodeId: pageNode.id, issueType: 'page-name-whitespace',
    message: `Page "${pageNode.name}" has leading or trailing whitespace. Should be "${pageNode.name.trim()}".`,
  }
}

/**
 * Runs all canvas-level checks on a single page.
 *
 * @param {{ name: string, id: string, children?: { x?: number, y?: number }[] }} pageNode
 * @returns {CanvasIssue[]}
 */
export function auditPage(pageNode) {
  const issues = []
  const drift = detectOriginDrift(pageNode)
  if (drift) issues.push(drift)
  const ws = detectPageNameWhitespace(pageNode)
  if (ws) issues.push(ws)
  return issues
}
