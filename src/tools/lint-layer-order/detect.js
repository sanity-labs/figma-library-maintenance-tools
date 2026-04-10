import { findComponents } from '../../shared/tree-traversal.js'

/**
 * Regex matching absolutely positioned background/border layer names.
 * These should appear at the bottom of the layer panel (first in the
 * children array) so they render behind all content.
 * @type {RegExp}
 */
export const BACKGROUND_LAYER_PATTERN = /^(border|background|bg|backdrop|fill|\.focusRing|card)$/i

/**
 * Regex matching absolutely positioned overlay layer names.
 * These should appear at the top of the layer panel (last in the
 * children array) so they render above all content.
 * @type {RegExp}
 */
export const OVERLAY_LAYER_PATTERN = /^(closeButton|overlay|close-button)$/i

/**
 * @typedef {Object} LayerOrderIssue
 * @property {string} componentName - Component set name
 * @property {string} variantName - Specific variant name
 * @property {string} nodeId - Figma node ID
 * @property {string} pageName - Page the component is on
 * @property {'variantInconsistency'|'backgroundPosition'|'overlayPosition'|'namingMismatch'|'variantOrder'} category
 * @property {string[]|string} expected - Expected state
 * @property {string[]|string} actual - Actual state
 * @property {string} [message] - Human-readable explanation
 */

/**
 * Extracts the ordered list of direct child layer names from a variant node.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} variantNode
 * @returns {string[]} Array of child layer names in order
 */
export function getChildNames(variantNode) {
  if (!variantNode.children) return []
  return variantNode.children.map((c) => c.name)
}

/**
 * Determines whether a child node is an absolutely positioned layer.
 *
 * Checks the `layoutPositioning` property returned by the Figma REST API.
 * In the Plugin API this is also `layoutPositioning`.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node
 * @returns {boolean}
 */
export function isAbsolutelyPositioned(node) {
  return node.layoutPositioning === 'ABSOLUTE'
}

/**
 * Tests whether a layer name matches the background layer naming pattern.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isBackgroundLayerName(name) {
  return BACKGROUND_LAYER_PATTERN.test(name)
}

/**
 * Tests whether a layer name matches the overlay layer naming pattern.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isOverlayLayerName(name) {
  return OVERLAY_LAYER_PATTERN.test(name)
}

/**
 * Compares the relative ordering of shared layer names between a
 * canonical order and a variant's order.
 *
 * Shared layers are those that appear in both the canonical and variant
 * children by name. The comparison checks whether those shared names
 * appear in the same relative sequence.
 *
 * @param {string[]} canonicalOrder - Layer names from the canonical (first) variant
 * @param {string[]} variantOrder - Layer names from the variant being checked
 * @returns {{ match: boolean, sharedCanonical: string[], sharedVariant: string[] }}
 */
export function compareSharedOrder(canonicalOrder, variantOrder) {
  const canonicalSet = new Set(canonicalOrder)
  const variantSet = new Set(variantOrder)

  const sharedCanonical = canonicalOrder.filter((n) => variantSet.has(n))
  const sharedVariant = variantOrder.filter((n) => canonicalSet.has(n))

  return {
    match: sharedCanonical.join(',') === sharedVariant.join(','),
    sharedCanonical,
    sharedVariant,
  }
}

/**
 * Detects whether a variant has names that don't match the canonical set,
 * indicating a structural naming mismatch rather than an ordering issue.
 *
 * @param {string[]} canonicalOrder - Layer names from the canonical variant
 * @param {string[]} variantOrder - Layer names from the variant being checked
 * @returns {{ hasMismatch: boolean, missingFromVariant: string[], extraInVariant: string[] }}
 */
export function detectNamingMismatch(canonicalOrder, variantOrder) {
  const canonicalSet = new Set(canonicalOrder)
  const variantSet = new Set(variantOrder)

  const missingFromVariant = canonicalOrder.filter((n) => !variantSet.has(n))
  const extraInVariant = variantOrder.filter((n) => !canonicalSet.has(n))

  return {
    hasMismatch: missingFromVariant.length > 0 || extraInVariant.length > 0,
    missingFromVariant,
    extraInVariant,
  }
}

/**
 * Checks absolutely positioned background and overlay layers within a
 * single variant (or standalone component) for correct positioning.
 *
 * Background layers should be at the bottom of the layer panel (low
 * children array indices) so they render behind content. Overlay layers
 * should be at the top of the layer panel (high children array indices)
 * so they render above content.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentNode - A COMPONENT node
 * @param {string} componentName - Parent component set name
 * @param {string} pageName - Page name for the report
 * @returns {LayerOrderIssue[]}
 */
export function checkAbsolutePositioning(componentNode, componentName, pageName) {
  const children = componentNode.children
  if (!children || children.length < 2) return []

  const issues = []
  let lastBgIdx = -1
  let firstContentIdx = -1
  let firstOverlayIdx = children.length
  let lastContentIdx = -1

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const isAbsolute = isAbsolutelyPositioned(child)

    if (isAbsolute && isBackgroundLayerName(child.name)) {
      lastBgIdx = i
    } else if (isAbsolute && isOverlayLayerName(child.name)) {
      if (i < firstOverlayIdx) firstOverlayIdx = i
    } else {
      if (firstContentIdx === -1) firstContentIdx = i
      lastContentIdx = i
    }
  }

  if (lastBgIdx > -1 && firstContentIdx > -1 && lastBgIdx > firstContentIdx) {
    issues.push({
      componentName,
      variantName: componentNode.name,
      nodeId: componentNode.id,
      pageName,
      category: 'backgroundPosition',
      expected: 'Background/border layers (absolute) should be at the bottom of the layer panel (first in children array)',
      actual: `Background layer at index ${lastBgIdx}, content starts at index ${firstContentIdx}`,
    })
  }

  if (firstOverlayIdx < children.length && lastContentIdx > -1 && firstOverlayIdx < lastContentIdx) {
    issues.push({
      componentName,
      variantName: componentNode.name,
      nodeId: componentNode.id,
      pageName,
      category: 'overlayPosition',
      expected: 'Overlay layers (absolute) should be at the top of the layer panel (last in children array)',
      actual: `Overlay layer at index ${firstOverlayIdx}, content ends at index ${lastContentIdx}`,
    })
  }

  return issues
}

/**
 * Audits variant consistency within a single component set.
 *
 * Uses the first variant as canonical order. For each subsequent variant:
 * 1. Checks for naming mismatches (different layer names = structural issue)
 * 2. If names match, checks relative ordering of shared layers
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentSet - A COMPONENT_SET node
 * @param {string} pageName - Page name for the report
 * @returns {LayerOrderIssue[]}
 */
export function checkVariantConsistency(componentSet, pageName) {
  const variants = (componentSet.children || []).filter(
    (c) => c.type === 'COMPONENT'
  )
  if (variants.length < 2) return []

  const issues = []
  const canonicalOrder = getChildNames(variants[0])

  for (let v = 1; v < variants.length; v++) {
    const variant = variants[v]
    const variantOrder = getChildNames(variant)

    // First check for naming mismatches
    const naming = detectNamingMismatch(canonicalOrder, variantOrder)
    if (naming.hasMismatch) {
      issues.push({
        componentName: componentSet.name,
        variantName: variant.name,
        nodeId: variant.id,
        pageName,
        category: 'namingMismatch',
        expected: canonicalOrder,
        actual: variantOrder,
        message: `Layer names differ from canonical. Missing: [${naming.missingFromVariant.join(', ')}]. Extra: [${naming.extraInVariant.join(', ')}].`,
      })
      continue
    }

    // Names match — check ordering
    const ordering = compareSharedOrder(canonicalOrder, variantOrder)
    if (!ordering.match) {
      issues.push({
        componentName: componentSet.name,
        variantName: variant.name,
        nodeId: variant.id,
        pageName,
        category: 'variantInconsistency',
        expected: ordering.sharedCanonical,
        actual: ordering.sharedVariant,
      })
    }
  }

  return issues
}

/**
 * Row tolerance in pixels for grouping variants on the same visual row.
 * Variants within this y-distance of each other are considered to be in
 * the same row on the canvas.
 * @type {number}
 */
export const ROW_TOLERANCE = 3

/**
 * Extracts the x/y position of a variant node.
 *
 * Handles both the REST API format (absoluteBoundingBox.x/y) and
 * the Plugin API format (node.x/y directly).
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node
 * @returns {{ x: number, y: number } | null}
 */
export function getVariantPosition(node) {
  if (typeof node.x === 'number' && typeof node.y === 'number') {
    return { x: node.x, y: node.y }
  }
  if (node.absoluteBoundingBox) {
    return { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y }
  }
  return null
}

/**
 * Checks whether variants within a component set are ordered so the
 * layer panel reads in canvas spatial order: top-left at top of panel,
 * bottom-right at bottom.
 *
 * Since Figma's layer panel reverses the children array, the expected
 * array order is y DESCENDING then x DESCENDING — bottom-right variant
 * first in the array (bottom of panel), top-left variant last (top of
 * panel).
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentSet - A COMPONENT_SET node
 * @param {string} pageName - Page name for the report
 * @returns {LayerOrderIssue[]}
 */
export function checkVariantOrder(componentSet, pageName) {
  const variants = (componentSet.children || []).filter(
    (c) => c.type === 'COMPONENT'
  )
  if (variants.length < 2) return []

  // Check that position data is available
  const positions = variants.map((v) => ({ node: v, pos: getVariantPosition(v) }))
  if (positions.some((p) => p.pos === null)) return []

  // Build the expected order: y descending, then x descending
  // (so the layer panel, which reverses the array, reads top-left → bottom-right)
  const sorted = [...positions].sort((a, b) => {
    const rowA = Math.round(a.pos.y / ROW_TOLERANCE)
    const rowB = Math.round(b.pos.y / ROW_TOLERANCE)
    if (rowA !== rowB) return rowB - rowA
    return b.pos.x - a.pos.x
  })

  const expectedIds = sorted.map((p) => p.node.id)
  const actualIds = variants.map((v) => v.id)

  // Compare
  const isCorrect = expectedIds.every((id, i) => id === actualIds[i])
  if (isCorrect) return []

  // Count how many are misplaced
  let misplaced = 0
  for (let i = 0; i < expectedIds.length; i++) {
    if (expectedIds[i] !== actualIds[i]) misplaced++
  }

  return [{
    componentName: componentSet.name,
    variantName: componentSet.name,
    nodeId: componentSet.id,
    pageName,
    category: 'variantOrder',
    expected: `Variants sorted by canvas position (top-left first in layer panel)`,
    actual: `${misplaced} of ${variants.length} variants out of spatial order`,
    message: `Layer panel should read in canvas grid order: top-left at top, bottom-right at bottom. ${misplaced} variants are misplaced.`,
  }]
}

/**
 * Audits all component sets on a page for layer ordering issues.
 *
 * Runs three checks per component set:
 * 1. Variant consistency (shared layer ordering across variants)
 * 2. Absolute positioning (background at bottom of panel, overlay at top) per variant
 * 3. Variant order (canvas spatial ordering within the component set)
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A Figma page (CANVAS) node
 * @returns {LayerOrderIssue[]}
 */
export function auditLayerOrder(pageNode) {
  const issues = []
  const { componentSets, standaloneComponents } = findComponents(pageNode)

  for (const componentSet of componentSets) {
    const consistencyIssues = checkVariantConsistency(componentSet, pageNode.name)
    issues.push(...consistencyIssues)

    const orderIssues = checkVariantOrder(componentSet, pageNode.name)
    issues.push(...orderIssues)

    for (const variant of componentSet.children || []) {
      if (variant.type !== 'COMPONENT') continue
      const posIssues = checkAbsolutePositioning(
        variant,
        componentSet.name,
        pageNode.name
      )
      issues.push(...posIssues)
    }
  }

  for (const component of standaloneComponents) {
    const posIssues = checkAbsolutePositioning(
      component,
      component.name,
      pageNode.name
    )
    issues.push(...posIssues)
  }

  return issues
}
