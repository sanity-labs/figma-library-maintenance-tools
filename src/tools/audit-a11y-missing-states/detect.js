import { findComponents } from '../../shared/tree-traversal.js'

/**
 * Defines expected states per component category.
 * Each entry maps a component name to the state values it should have.
 */
export const EXPECTED_STATES = {
  // Form controls: need focused, disabled, invalid
  TextInput: ['focused', 'disabled', 'invalid', 'readOnly'],
  TextArea: ['focused', 'disabled', 'invalid', 'readOnly'],
  Select: ['focused', 'disabled', 'readOnly'],
  Autocomplete: ['focused', 'disabled'],

  // Toggle controls: need focused, disabled
  Checkbox: ['focused', 'disabled'],
  Radio: ['focused', 'disabled'],
  Switch: ['focused', 'disabled'],

  // Action controls: need focused, disabled
  Button: ['focused', 'disabled'],
  MenuItem: ['focused', 'disabled'],

  // Navigation / display with interaction
  TabList: ['focused'],
  Badge: ['focused'],
  Avatar: ['focused', 'disabled'],
}

/**
 * @typedef {Object} MissingStateIssue
 * @property {string} componentName - Component set name
 * @property {string} nodeId - Figma node ID of the component set
 * @property {string} pageName - Page the component is on
 * @property {string} missingState - The state value that is missing (e.g. 'focused')
 * @property {string[]} existingStates - States that were found in the variant names
 * @property {'high'|'medium'|'low'} severity - Based on which state is missing
 * @property {string} wcag - Relevant WCAG criterion
 */

/**
 * Extracts unique state values from a component set's variant names.
 *
 * Variant names in Figma use the format `"prop=value, prop=value"`.
 * This function looks for any property named `state` and collects
 * its distinct values across all variants.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentSet - A COMPONENT_SET node
 * @returns {string[]} Sorted array of unique state values found
 *
 * @example
 * // Given variants: "state=enabled", "state=hovered", "state=focused"
 * extractStates(componentSet) // => ['enabled', 'focused', 'hovered']
 */
export function extractStates(componentSet) {
  if (!componentSet.children) return []

  const states = new Set()

  for (const variant of componentSet.children) {
    if (variant.type !== 'COMPONENT') continue

    // Parse "prop=value, prop=value" format
    const pairs = variant.name.split(',').map((p) => p.trim())
    for (const pair of pairs) {
      const [key, value] = pair.split('=').map((s) => s.trim())
      if (key === 'state' && value) {
        states.add(value)
      }
    }
  }

  return Array.from(states).sort()
}

/**
 * Determines severity for a missing state.
 *
 * - `focused` missing = **high** (WCAG 2.4.7 Focus Visible)
 * - `disabled` missing = **medium** (usability, WCAG 4.1.2)
 * - `invalid` missing = **medium** (WCAG 3.3.1 Error Identification)
 * - `readOnly` missing = **low** (usability)
 *
 * @param {string} stateName - The missing state
 * @returns {'high'|'medium'|'low'} Severity
 */
export function getMissingStateSeverity(stateName) {
  if (stateName === 'focused') return 'high'
  if (stateName === 'disabled' || stateName === 'invalid') return 'medium'
  return 'low'
}

/**
 * Returns the WCAG criterion most relevant to a missing state.
 *
 * @param {string} stateName - The missing state
 * @returns {string} WCAG criterion reference
 */
export function getWcagForState(stateName) {
  if (stateName === 'focused') return '2.4.7'
  if (stateName === 'invalid') return '3.3.1'
  if (stateName === 'disabled') return '4.1.2'
  return '—'
}

/**
 * Audits all interactive components on a page for missing state variants.
 *
 * For each interactive component set that appears in EXPECTED_STATES,
 * extracts the actual state values from variant names and compares
 * against the expected list.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A Figma page (CANVAS) node
 * @returns {{ complete: string[], issues: MissingStateIssue[] }}
 */
export function auditMissingStates(pageNode) {
  const complete = []
  const issues = []

  const { componentSets } = findComponents(pageNode)

  for (const componentSet of componentSets) {
    const expected = EXPECTED_STATES[componentSet.name]
    if (!expected) continue

    const existingStates = extractStates(componentSet)
    const missing = expected.filter((s) => !existingStates.includes(s))

    if (missing.length === 0) {
      complete.push(componentSet.name)
      continue
    }

    for (const missingState of missing) {
      issues.push({
        componentName: componentSet.name,
        nodeId: componentSet.id,
        pageName: pageNode.name,
        missingState,
        existingStates,
        severity: getMissingStateSeverity(missingState),
        wcag: getWcagForState(missingState),
      })
    }
  }

  return { complete, issues }
}
