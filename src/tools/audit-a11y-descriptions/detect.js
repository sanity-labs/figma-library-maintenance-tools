import { findComponents } from '../../shared/tree-traversal.js'

/**
 * Component names that should have accessibility notes in their descriptions.
 * These are interactive or complex widgets where designers need a11y context.
 */
export const A11Y_DESCRIPTION_REQUIRED = new Set([
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
  'Dialog',
  'Popover',
  'Tooltip',
  'Toast',
  'Menu',
])

/**
 * Keywords that indicate a description contains accessibility-relevant information.
 * Matched case-insensitively against the description text.
 */
export const A11Y_KEYWORDS = [
  'keyboard',
  'aria',
  'focus',
  'screen reader',
  'screenreader',
  'a11y',
  'accessibility',
  'accessible',
  'wcag',
  'tab order',
  'tabindex',
  'role=',
  'escape',
  'arrow key',
  'live region',
  'aria-live',
  'aria-label',
  'aria-expanded',
  'aria-describedby',
  'focus trap',
  'focus management',
  'announce',
]

/**
 * @typedef {Object} A11yDescriptionIssue
 * @property {string} componentName - Component or component set name
 * @property {string} nodeId - Figma node ID
 * @property {string} pageName - Page the component is on
 * @property {boolean} hasDescription - Whether any description exists
 * @property {boolean} hasA11yNotes - Whether the description mentions accessibility
 * @property {string} description - The current description text (for context)
 * @property {'high'|'medium'} severity - High for complex widgets, medium for simple controls
 * @property {string} recommendation - What kind of a11y info should be added
 */

/**
 * Components that are complex widgets requiring detailed accessibility documentation.
 * These get high severity when missing a11y notes.
 */
const COMPLEX_WIDGETS = new Set([
  'Autocomplete',
  'Dialog',
  'Menu',
  'Popover',
  'TabList',
  'Toast',
])

/**
 * Returns a recommendation string for what accessibility info should be added
 * to a component's description.
 *
 * @param {string} componentName
 * @returns {string}
 */
export function getRecommendation(componentName) {
  const recommendations = {
    Autocomplete: 'Add: combobox ARIA pattern, keyboard navigation (arrow keys to navigate, Enter to select, Escape to close), focus management on open/close.',
    Dialog: 'Add: dialog role, focus trapping, Escape to close, focus return to trigger on close.',
    Menu: 'Add: menu/menuitem roles, arrow key navigation, Escape to close, focus on first item when opened.',
    MenuItem: 'Add: menuitem role, keyboard activation (Enter/Space).',
    Popover: 'Add: focus management on open/close, Escape to dismiss, whether focus is trapped.',
    TabList: 'Add: tablist/tab/tabpanel roles, arrow key navigation between tabs, Tab key moves to panel.',
    Toast: 'Add: aria-live region (polite/assertive), auto-dismiss timing, pause on hover.',
    Tooltip: 'Add: tooltip role, trigger must be focusable, Escape to dismiss, appears on focus not just hover.',
    Button: 'Add: expected keyboard interaction (Enter/Space to activate).',
    Checkbox: 'Add: checkbox role, Space to toggle, label association required.',
    Radio: 'Add: radio/radiogroup roles, arrow keys to navigate within group.',
    Switch: 'Add: switch role, Space to toggle, label association required.',
    Select: 'Add: listbox/combobox pattern, keyboard navigation for options.',
    TextInput: 'Add: label association required, aria-invalid for error state, aria-describedby for helper text.',
    TextArea: 'Add: label association required, aria-invalid for error state, aria-describedby for helper text.',
  }

  return recommendations[componentName] || 'Add: keyboard interaction pattern and relevant ARIA role.'
}

/**
 * Checks whether a description contains accessibility-related information.
 *
 * @param {string} description - The component description text
 * @returns {boolean} True if at least one a11y keyword is found
 */
export function hasAccessibilityNotes(description) {
  if (!description || typeof description !== 'string') return false

  const lower = description.toLowerCase()

  return A11Y_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()))
}

/**
 * Audits interactive components on a page for accessibility documentation quality.
 *
 * For each interactive component set (and standalone component) in
 * A11Y_DESCRIPTION_REQUIRED, checks whether the description exists
 * and whether it contains accessibility-related keywords.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A Figma page (CANVAS) node
 * @returns {{ passing: A11yDescriptionIssue[], failing: A11yDescriptionIssue[] }}
 */
export function auditA11yDescriptions(pageNode) {
  const passing = []
  const failing = []

  const { componentSets, standaloneComponents } = findComponents(pageNode)

  /**
   * @param {import('../../shared/tree-traversal.js').FigmaNode} node
   */
  function checkNode(node) {
    if (!A11Y_DESCRIPTION_REQUIRED.has(node.name)) return

    const desc = node.description || ''
    const hasDesc = desc.trim().length > 0
    const hasA11y = hasAccessibilityNotes(desc)
    const isComplex = COMPLEX_WIDGETS.has(node.name)

    /** @type {A11yDescriptionIssue} */
    const issue = {
      componentName: node.name,
      nodeId: node.id,
      pageName: pageNode.name,
      hasDescription: hasDesc,
      hasA11yNotes: hasA11y,
      description: desc.slice(0, 200),
      severity: isComplex ? 'high' : 'medium',
      recommendation: getRecommendation(node.name),
    }

    if (hasA11y) {
      passing.push(issue)
    } else {
      failing.push(issue)
    }
  }

  for (const componentSet of componentSets) {
    checkNode(componentSet)
  }

  for (const component of standaloneComponents) {
    checkNode(component)
  }

  return { passing, failing }
}
