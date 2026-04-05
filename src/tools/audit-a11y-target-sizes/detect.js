import { findComponents } from '../../shared/tree-traversal.js'

/**
 * Minimum target sizes in pixels per WCAG 2.5.8 (Level AA).
 * The recommended mobile target (44×44) is tracked but not used for severity.
 */
export const TARGET_SIZE_MINIMUM = 24
export const TARGET_SIZE_RECOMMENDED = 44

/**
 * Component names that are expected to be interactive.
 * Only these are checked — layout and display-only components are skipped.
 */
export const INTERACTIVE_COMPONENTS = new Set([
  'Button',
  'Checkbox',
  'Radio',
  'Switch',
  'Select',
  'TextInput',
  'TextArea',
  'MenuItem',
  'Autocomplete',
  'TabList',
  'Avatar',
  'Badge',
  'Toast',
])

/**
 * @typedef {Object} TargetSizeIssue
 * @property {string} componentName - Component set name
 * @property {string} variantName - Specific variant name
 * @property {string} nodeId - Figma node ID
 * @property {string} pageName - Page the component is on
 * @property {number} width - Variant width in px
 * @property {number} height - Variant height in px
 * @property {number} minDimension - The smaller of width/height
 * @property {'high'|'medium'|'low'} severity - Based on how far below minimum
 * @property {string} wcag - Relevant WCAG criterion
 */

/**
 * Determines the severity of a target size violation.
 *
 * - **high**: below 17px (completely unusable for many users)
 * - **medium**: 17–23px (below AA minimum)
 * - **low**: 24–43px (meets AA but below recommended 44px mobile target)
 *
 * Returns `null` when the minimum dimension is >= 24px (passes AA).
 *
 * @param {number} minDimension - The smaller of width/height
 * @returns {'high'|'medium'|null} Severity level or null if passing
 */
export function getTargetSizeSeverity(minDimension) {
  if (minDimension < 17) return 'high'
  if (minDimension < TARGET_SIZE_MINIMUM) return 'medium'
  return null
}

/**
 * Checks whether a component set name represents an interactive component.
 *
 * @param {string} name - Component set name
 * @returns {boolean} True if the component is expected to be interactive
 */
export function isInteractiveComponent(name) {
  return INTERACTIVE_COMPONENTS.has(name)
}

/**
 * Finds the smallest variant in a component set by minimum dimension.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentSet - A COMPONENT_SET node
 * @returns {{ width: number, height: number, minDimension: number, variantName: string, nodeId: string }|null}
 */
export function findSmallestVariant(componentSet) {
  if (!componentSet.children || componentSet.children.length === 0) return null

  let smallest = null

  for (const variant of componentSet.children) {
    if (variant.type !== 'COMPONENT') continue

    const w = variant.absoluteBoundingBox?.width ?? variant.size?.x ?? 0
    const h = variant.absoluteBoundingBox?.height ?? variant.size?.y ?? 0
    const minDim = Math.min(w, h)

    if (smallest === null || minDim < smallest.minDimension) {
      smallest = {
        width: w,
        height: h,
        minDimension: minDim,
        variantName: variant.name,
        nodeId: variant.id,
      }
    }
  }

  return smallest
}

/**
 * Audits all interactive components on a page for target size compliance.
 *
 * For each interactive component set, finds the smallest variant and checks
 * whether its minimum dimension meets the WCAG 2.5.8 threshold (24×24px).
 * Standalone interactive components are checked directly.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A Figma page (CANVAS) node
 * @returns {{ passing: TargetSizeIssue[], failing: TargetSizeIssue[] }}
 */
export function auditTargetSizes(pageNode) {
  const passing = []
  const failing = []

  const { componentSets, standaloneComponents } = findComponents(pageNode)

  for (const componentSet of componentSets) {
    if (!isInteractiveComponent(componentSet.name)) continue

    const smallest = findSmallestVariant(componentSet)
    if (!smallest) continue

    const severity = getTargetSizeSeverity(smallest.minDimension)

    /** @type {TargetSizeIssue} */
    const issue = {
      componentName: componentSet.name,
      variantName: smallest.variantName,
      nodeId: smallest.nodeId,
      pageName: pageNode.name,
      width: smallest.width,
      height: smallest.height,
      minDimension: smallest.minDimension,
      severity: severity || 'pass',
      wcag: '2.5.8',
    }

    if (severity) {
      failing.push(issue)
    } else {
      passing.push(issue)
    }
  }

  for (const component of standaloneComponents) {
    if (!isInteractiveComponent(component.name)) continue

    const w = component.absoluteBoundingBox?.width ?? component.size?.x ?? 0
    const h = component.absoluteBoundingBox?.height ?? component.size?.y ?? 0
    const minDim = Math.min(w, h)
    const severity = getTargetSizeSeverity(minDim)

    /** @type {TargetSizeIssue} */
    const issue = {
      componentName: component.name,
      variantName: component.name,
      nodeId: component.id,
      pageName: pageNode.name,
      width: w,
      height: h,
      minDimension: minDim,
      severity: severity || 'pass',
      wcag: '2.5.8',
    }

    if (severity) {
      failing.push(issue)
    } else {
      passing.push(issue)
    }
  }

  return { passing, failing }
}
