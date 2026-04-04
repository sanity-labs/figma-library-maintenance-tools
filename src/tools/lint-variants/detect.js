import { traverseNodes } from '../../shared/tree-traversal.js'

/**
 * @typedef {Object} SingleValueVariantIssue
 * @property {string} componentName - Component set name
 * @property {string} nodeId - Figma node ID
 * @property {string} propertyName - The variant property with only one value
 * @property {string} singleValue - The lone value
 * @property {'single-value-variant'} issueType
 * @property {string} message
 */

/**
 * @typedef {Object} DuplicateVariantIssue
 * @property {string} componentName - Component set name
 * @property {string} nodeId - Figma node ID
 * @property {string} duplicateName - The variant name string that appears more than once
 * @property {number} count - How many times it appears
 * @property {string[]} duplicateNodeIds - Node IDs of the duplicate variants
 * @property {'duplicate-variant-name'} issueType
 * @property {string} message
 */

/**
 * @typedef {Object} CoverageGap
 * @property {string} componentName - Component set name
 * @property {string} nodeId - Figma node ID
 * @property {Object<string, string>} missingCombination - The property:value pairs that don't exist
 * @property {string} missingVariantName - The variant name string that would fill the gap
 * @property {'coverage-gap'} issueType
 * @property {string} message
 */

/**
 * @typedef {Object} VariantIssue
 * @property {string} componentName
 * @property {string} nodeId
 * @property {string} issueType
 * @property {string} message
 */

/**
 * Parses a Figma variant name string into a property:value map.
 *
 * @param {string} variantName - e.g. "size=1, state=enabled"
 * @returns {Object<string, string>} Map of property names to values
 */
export function parseVariantName(variantName) {
  const props = {}
  const segments = variantName.split(',').map((s) => s.trim())
  for (const segment of segments) {
    const eqIndex = segment.indexOf('=')
    if (eqIndex === -1) continue
    const key = segment.slice(0, eqIndex).trim()
    const value = segment.slice(eqIndex + 1).trim()
    if (key) props[key] = value
  }
  return props
}

/**
 * Builds a canonical variant name string from a property:value map.
 * Properties are sorted alphabetically.
 *
 * @param {Object<string, string>} props
 * @returns {string}
 */
export function buildVariantName(props) {
  return Object.entries(props)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')
}

/**
 * Extracts sorted unique values per variant property.
 *
 * @param {Object<string, string>[]} parsedVariants
 * @returns {Object<string, string[]>}
 */
export function extractPropertyValues(parsedVariants) {
  /** @type {Object<string, Set<string>>} */
  const valueSets = {}
  for (const props of parsedVariants) {
    for (const [key, value] of Object.entries(props)) {
      if (!valueSets[key]) valueSets[key] = new Set()
      valueSets[key].add(value)
    }
  }
  /** @type {Object<string, string[]>} */
  const result = {}
  for (const [key, valueSet] of Object.entries(valueSets)) {
    result[key] = Array.from(valueSet).sort()
  }
  return result
}

/**
 * Detects variant properties with only a single possible value.
 *
 * @param {string} componentName
 * @param {string} nodeId
 * @param {Object<string, string[]>} propertyValues
 * @returns {SingleValueVariantIssue[]}
 */
export function detectSingleValueVariants(componentName, nodeId, propertyValues) {
  /** @type {SingleValueVariantIssue[]} */
  const issues = []
  for (const [propertyName, values] of Object.entries(propertyValues)) {
    if (values.length === 1) {
      issues.push({
        componentName, nodeId, propertyName,
        singleValue: values[0],
        issueType: 'single-value-variant',
        message: `Variant property "${propertyName}" in "${componentName}" has only one value: "${values[0]}". Remove it or add more values.`,
      })
    }
  }
  return issues
}

/**
 * Detects duplicate variant name strings within a component set.
 *
 * @param {string} componentName
 * @param {string} nodeId
 * @param {{ name: string, id: string }[]} variants
 * @returns {DuplicateVariantIssue[]}
 */
export function detectDuplicateVariantNames(componentName, nodeId, variants) {
  /** @type {Map<string, string[]>} */
  const nameToIds = new Map()
  for (const variant of variants) {
    const existing = nameToIds.get(variant.name)
    if (existing) existing.push(variant.id)
    else nameToIds.set(variant.name, [variant.id])
  }
  /** @type {DuplicateVariantIssue[]} */
  const issues = []
  for (const [name, ids] of nameToIds) {
    if (ids.length > 1) {
      issues.push({
        componentName, nodeId, duplicateName: name,
        count: ids.length, duplicateNodeIds: ids,
        issueType: 'duplicate-variant-name',
        message: `Variant name "${name}" appears ${ids.length} times in "${componentName}". Duplicate variant names break API access.`,
      })
    }
  }
  return issues
}

/**
 * Generates the full combinatorial matrix and identifies missing combinations.
 * Only runs when the component has 2+ variant properties.
 *
 * @param {string} componentName
 * @param {string} nodeId
 * @param {Object<string, string[]>} propertyValues
 * @param {Set<string>} existingNames - Set of canonical variant name strings
 * @returns {CoverageGap[]}
 */
export function detectCoverageGaps(componentName, nodeId, propertyValues, existingNames) {
  const propertyEntries = Object.entries(propertyValues)
  if (propertyEntries.length < 2) return []

  /** @type {CoverageGap[]} */
  const gaps = []

  function generateCombinations(index, current) {
    if (index === propertyEntries.length) {
      const name = buildVariantName(current)
      if (!existingNames.has(name)) {
        gaps.push({
          componentName, nodeId,
          missingCombination: { ...current },
          missingVariantName: name,
          issueType: 'coverage-gap',
          message: `Missing variant "${name}" in "${componentName}".`,
        })
      }
      return
    }
    const [propName, propValues] = propertyEntries[index]
    for (const value of propValues) {
      current[propName] = value
      generateCombinations(index + 1, current)
    }
    delete current[propName]
  }

  generateCombinations(0, {})
  return gaps
}

/**
 * Runs all variant checks on a single component set node.
 *
 * @param {{ name: string, id: string, children?: { name: string, id: string, type: string }[] }} componentSetNode
 * @param {Object} [options]
 * @param {boolean} [options.includeGaps=false] - Whether to check coverage gaps
 * @returns {VariantIssue[]}
 */
export function auditComponentSetVariants(componentSetNode, options = {}) {
  const { includeGaps = false } = options
  const componentName = componentSetNode.name
  const nodeId = componentSetNode.id
  const variants = (componentSetNode.children || []).filter(
    (child) => child.type === 'COMPONENT'
  )
  if (variants.length === 0) return []

  /** @type {VariantIssue[]} */
  const issues = []

  issues.push(...detectDuplicateVariantNames(componentName, nodeId, variants))

  const parsedVariants = variants.map((v) => parseVariantName(v.name))
  const propertyValues = extractPropertyValues(parsedVariants)
  issues.push(...detectSingleValueVariants(componentName, nodeId, propertyValues))

  if (includeGaps) {
    const existingCanonical = new Set(parsedVariants.map((pv) => buildVariantName(pv)))
    issues.push(...detectCoverageGaps(componentName, nodeId, propertyValues, existingCanonical))
  }

  return issues
}
