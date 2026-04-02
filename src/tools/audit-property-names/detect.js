/**
 * @typedef {Object} PropertyNamingIssue
 * @property {string} componentName - Component or component set name
 * @property {string} nodeId - Figma node ID
 * @property {string} propertyName - The clean property name (without hash)
 * @property {string} rawPropertyKey - The raw property key (with hash)
 * @property {string} propertyType - VARIANT, BOOLEAN, TEXT, INSTANCE_SWAP
 * @property {'capitalized'|'default-name'|'toggle-inconsistency'} violationType
 * @property {string} message - Human-readable description of the violation
 */

/**
 * @typedef {Object} ToggleConventionSummary
 * @property {number} showCount - Number of boolean properties using "show " prefix
 * @property {number} withCount - Number of boolean properties using "with " prefix
 * @property {number} otherCount - Number of boolean properties using other prefixes
 * @property {string[]} showProperties - Names of "show " properties
 * @property {string[]} withProperties - Names of "with " properties
 */

/**
 * @typedef {Object} ComponentInput
 * @property {string} name - Component or component set name
 * @property {string} id - Figma node ID
 * @property {Object<string, { type: string }>} [componentPropertyDefinitions] - Property definitions keyed by "name#hash"
 */

/**
 * @typedef {Object} AuditResult
 * @property {PropertyNamingIssue[]} issues - All detected naming issues
 * @property {ToggleConventionSummary} toggleSummary - Summary of boolean toggle prefix usage
 */

/**
 * Strips the `#hash` suffix from a Figma component property key.
 *
 * Figma stores component property definitions with keys in the format
 * `propertyName#hashSuffix` (e.g., `"size#12345"`). This function
 * extracts just the property name portion before the `#`.
 * If there is no `#` in the key, the key is returned as-is.
 *
 * @param {string} rawKey - The raw property key from Figma's API (e.g., "size#12345")
 * @returns {string} The clean property name without the hash suffix
 *
 * @example
 * cleanPropertyName('size#12345')       // "size"
 * cleanPropertyName('Property 1#67890') // "Property 1"
 * cleanPropertyName('nohash')           // "nohash"
 */
export function cleanPropertyName(rawKey) {
  const hashIndex = rawKey.indexOf('#')
  if (hashIndex === -1) {
    return rawKey
  }
  return rawKey.slice(0, hashIndex)
}

/**
 * Tests whether a property name is a Figma default/placeholder name.
 *
 * Default names follow the pattern `Property N` where N is one or more
 * digits (e.g., "Property 1", "Property 23"). These indicate the designer
 * never gave the property a meaningful name.
 *
 * @param {string} cleanName - The clean property name (without hash suffix)
 * @returns {boolean} `true` if the name matches the default pattern `Property N`
 *
 * @example
 * isDefaultName('Property 1')    // true
 * isDefaultName('Property 23')   // true
 * isDefaultName('size')          // false
 * isDefaultName('My Property 1') // false
 */
export function isDefaultName(cleanName) {
  return /^Property\s+\d+$/.test(cleanName)
}

/**
 * Tests whether a property name starts with an uppercase letter (A-Z).
 *
 * Names beginning with the Figma nested-property indicator `↳` are handled
 * specially: the check applies to the first alphabetic character after `↳`
 * (and any optional space). So `"↳ Size"` is capitalized, `"↳ size"` is not.
 *
 * Non-letter first characters (e.g., digits) cause the function to return `false`.
 *
 * @param {string} cleanName - The clean property name (without hash suffix)
 * @returns {boolean} `true` if the effective first letter is uppercase A-Z
 *
 * @example
 * isCapitalized('Size')    // true
 * isCapitalized('size')    // false
 * isCapitalized('↳ Size')  // true
 * isCapitalized('↳ size')  // false
 * isCapitalized('123abc')  // false
 */
export function isCapitalized(cleanName) {
  let name = cleanName
  if (name.startsWith('↳')) {
    name = name.slice('↳'.length).trimStart()
  }
  if (name.length === 0) {
    return false
  }
  const firstChar = name[0]
  return firstChar >= 'A' && firstChar <= 'Z'
}

/**
 * Categorizes the prefix convention used by a boolean property name.
 *
 * Many design systems prefix boolean/toggle properties with either
 * `"show "` or `"with "` to indicate visibility or inclusion. This function
 * performs a case-insensitive check for these prefixes.
 *
 * @param {string} cleanName - The clean property name (without hash suffix)
 * @returns {'show'|'with'|'other'} The detected prefix category
 *
 * @example
 * categorizeBooleanPrefix('show icon')  // "show"
 * categorizeBooleanPrefix('Show Icon')  // "show"
 * categorizeBooleanPrefix('with avatar') // "with"
 * categorizeBooleanPrefix('disabled')   // "other"
 */
export function categorizeBooleanPrefix(cleanName) {
  const lower = cleanName.toLowerCase()
  if (lower.startsWith('show ')) {
    return 'show'
  }
  if (lower.startsWith('with ')) {
    return 'with'
  }
  return 'other'
}

/**
 * Audits an array of components for property naming convention violations.
 *
 * This function inspects every property in each component's
 * `componentPropertyDefinitions` and checks for three kinds of violations:
 *
 * 1. **default-name** — The property still has a Figma default name like "Property 1".
 * 2. **capitalized** — The property name starts with an uppercase letter,
 *    violating the convention that property names should be lowercase.
 * 3. **toggle-inconsistency** — The library mixes `"show "` and `"with "` prefixes
 *    for boolean properties. Whichever convention is in the minority gets flagged.
 *
 * @param {ComponentInput[]} components - Array of component objects with property definitions
 * @returns {AuditResult} Object containing detected issues and a toggle convention summary
 *
 * @example
 * const result = auditProperties([
 *   {
 *     name: 'Button',
 *     id: '1:2',
 *     componentPropertyDefinitions: {
 *       'Property 1#111': { type: 'TEXT' },
 *       'size#222': { type: 'VARIANT' },
 *     },
 *   },
 * ])
 * // result.issues → [{ violationType: 'default-name', propertyName: 'Property 1', ... }]
 */
export function auditProperties(components) {
  /** @type {PropertyNamingIssue[]} */
  const issues = []

  /** @type {{ cleanName: string, rawKey: string, componentName: string, nodeId: string, type: string }[]} */
  const showBooleans = []

  /** @type {{ cleanName: string, rawKey: string, componentName: string, nodeId: string, type: string }[]} */
  const withBooleans = []

  /** @type {ToggleConventionSummary} */
  const toggleSummary = {
    showCount: 0,
    withCount: 0,
    otherCount: 0,
    showProperties: [],
    withProperties: [],
  }

  for (const component of components) {
    const definitions = component.componentPropertyDefinitions
    if (!definitions) {
      continue
    }

    const entries = Object.entries(definitions)

    for (const [rawKey, definition] of entries) {
      const cleanName = cleanPropertyName(rawKey)
      const propertyType = definition.type

      // Check for default names
      if (isDefaultName(cleanName)) {
        issues.push({
          componentName: component.name,
          nodeId: component.id,
          propertyName: cleanName,
          rawPropertyKey: rawKey,
          propertyType,
          violationType: 'default-name',
          message: `Property "${cleanName}" in "${component.name}" still uses a Figma default name. Give it a descriptive name.`,
        })
      }

      // Check for capitalized names
      if (isCapitalized(cleanName)) {
        issues.push({
          componentName: component.name,
          nodeId: component.id,
          propertyName: cleanName,
          rawPropertyKey: rawKey,
          propertyType,
          violationType: 'capitalized',
          message: `Property "${cleanName}" in "${component.name}" starts with an uppercase letter. Use lowercase naming.`,
        })
      }

      // Categorize boolean prefixes
      if (propertyType === 'BOOLEAN') {
        const prefix = categorizeBooleanPrefix(cleanName)
        if (prefix === 'show') {
          toggleSummary.showCount++
          toggleSummary.showProperties.push(cleanName)
          showBooleans.push({
            cleanName,
            rawKey,
            componentName: component.name,
            nodeId: component.id,
            type: propertyType,
          })
        } else if (prefix === 'with') {
          toggleSummary.withCount++
          toggleSummary.withProperties.push(cleanName)
          withBooleans.push({
            cleanName,
            rawKey,
            componentName: component.name,
            nodeId: component.id,
            type: propertyType,
          })
        } else {
          toggleSummary.otherCount++
        }
      }
    }
  }

  // If both "show" and "with" are used, flag the minority convention
  if (toggleSummary.showCount > 0 && toggleSummary.withCount > 0) {
    const minorityIsShow = toggleSummary.showCount <= toggleSummary.withCount
    const minorityList = minorityIsShow ? showBooleans : withBooleans
    const majorityPrefix = minorityIsShow ? 'with' : 'show'

    for (const entry of minorityList) {
      issues.push({
        componentName: entry.componentName,
        nodeId: entry.nodeId,
        propertyName: entry.cleanName,
        rawPropertyKey: entry.rawKey,
        propertyType: entry.type,
        violationType: 'toggle-inconsistency',
        message: `Boolean property "${entry.cleanName}" in "${entry.componentName}" uses a minority prefix. The library predominantly uses "${majorityPrefix}" — consider renaming for consistency.`,
      })
    }
  }

  return { issues, toggleSummary }
}
