/**
 * @typedef {Object} PropertyNamingIssue
 * @property {string} componentName - Component or component set name
 * @property {string} nodeId - Figma node ID
 * @property {string} propertyName - The clean property name (without hash)
 * @property {string} rawPropertyKey - The raw property key (with hash)
 * @property {string} propertyType - VARIANT, BOOLEAN, TEXT, INSTANCE_SWAP
 * @property {'capitalized'|'default-name'|'toggle-inconsistency'|'parens-in-name'} violationType
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
 * Tests whether a property name contains parentheses.
 *
 * Parenthetical qualifiers in property names (e.g. `"Icon (Left)"`,
 * `"Text (Primary)"`) should be restructured so the qualifier is part of
 * the name proper (`"icon left"`, `"primary text"`) or expressed with the
 * ↳ dependency prefix. Parens create parse ambiguity for automation and
 * conflict with the lowercase-alphanumeric-and-spaces convention.
 *
 * @param {string} cleanName - The clean property name (without hash suffix)
 * @returns {boolean} `true` if the name contains `(` or `)`
 *
 * @example
 * hasParens('Icon (Left)')   // true
 * hasParens('show icon')     // false
 * hasParens('size')          // false
 */
export function hasParens(cleanName) {
  return cleanName.includes('(') || cleanName.includes(')')
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
 * `componentPropertyDefinitions` and checks for four kinds of violations:
 *
 * 1. **default-name** — The property still has a Figma default name like "Property 1".
 * 2. **capitalized** — The property name starts with an uppercase letter,
 *    violating the convention that property names should be lowercase.
 * 3. **parens-in-name** — The property name contains parentheses. Parenthetical
 *    qualifiers (e.g. "Icon (Left)") should be restructured into the name proper
 *    or expressed with the ↳ dependency prefix.
 * 4. **toggle-inconsistency** — The library mixes `"show "` and `"with "` prefixes
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

      // Check for parentheses in names
      if (hasParens(cleanName)) {
        issues.push({
          componentName: component.name,
          nodeId: component.id,
          propertyName: cleanName,
          rawPropertyKey: rawKey,
          propertyType,
          violationType: 'parens-in-name',
          message: `Property "${cleanName}" in "${component.name}" contains parentheses. Restructure so the qualifier is part of the name (e.g. "icon left") or use the ↳ dependency prefix.`,
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

/**
 * @typedef {Object} PropertyConflictIssue
 * @property {string} componentName
 * @property {string} nodeId
 * @property {string} booleanName - The boolean property name
 * @property {string} variantProperty - The variant property containing a matching value
 * @property {string} conflictingValue - The variant value that matches the boolean name
 * @property {'boolean-variant-conflict'} violationType
 * @property {string} message
 */

/**
 * @typedef {Object} DependencyOrderIssue
 * @property {string} componentName
 * @property {string} nodeId
 * @property {string} dependentProperty - The property with `↳` prefix
 * @property {string} expectedParent - The expected parent toggle property
 * @property {'dependency-prefix-order'} violationType
 * @property {string} message
 */

/**
 * Detects when a boolean property name matches a value in one of
 * the component's variant properties — two controls for the same concept.
 *
 * @param {ComponentInput[]} components
 * @returns {PropertyConflictIssue[]}
 */
export function detectBooleanVariantConflicts(components) {
  /** @type {PropertyConflictIssue[]} */
  const issues = []

  for (const component of components) {
    const definitions = component.componentPropertyDefinitions
    if (!definitions) continue

    const entries = Object.entries(definitions)
    const booleanNames = []
    const variantProps = []

    for (const [rawKey, definition] of entries) {
      const name = cleanPropertyName(rawKey)
      if (definition.type === 'BOOLEAN') booleanNames.push(name)
      else if (definition.type === 'VARIANT' && definition.variantOptions) {
        variantProps.push({ name, values: definition.variantOptions })
      }
    }

    for (const boolName of booleanNames) {
      const normalizedBool = boolName.toLowerCase()
      for (const variant of variantProps) {
        const matchingValue = variant.values.find((v) => v.toLowerCase() === normalizedBool)
        if (matchingValue) {
          issues.push({
            componentName: component.name, nodeId: component.id,
            booleanName: boolName, variantProperty: variant.name,
            conflictingValue: matchingValue,
            violationType: 'boolean-variant-conflict',
            message: `Boolean property "${boolName}" in "${component.name}" conflicts with variant "${variant.name}" which includes value "${matchingValue}". Two controls for the same concept.`,
          })
        }
      }
    }
  }

  return issues
}

/**
 * Detects when a `↳` prefixed property appears before its parent
 * toggle in the property definitions — making the dependency hierarchy misleading.
 *
 * @param {ComponentInput[]} components
 * @returns {DependencyOrderIssue[]}
 */
export function detectDependencyPrefixOrder(components) {
  /** @type {DependencyOrderIssue[]} */
  const issues = []

  for (const component of components) {
    const definitions = component.componentPropertyDefinitions
    if (!definitions) continue

    const keys = Object.keys(definitions)
    const seenToggleElements = new Set()

    for (let i = 0; i < keys.length; i++) {
      const cleanName = cleanPropertyName(keys[i])
      const definition = definitions[keys[i]]

      if (definition.type === 'BOOLEAN' && cleanName.toLowerCase().startsWith('show ')) {
        seenToggleElements.add(cleanName.slice('show '.length).toLowerCase())
      }

      if (cleanName.startsWith('↳')) {
        const dependentElement = cleanName.slice('↳'.length).trim().toLowerCase()
        const expectedParent = `show ${dependentElement}`

        if (!seenToggleElements.has(dependentElement)) {
          const hasParentLater = keys.some((k, j) => {
            if (j <= i) return false
            return cleanPropertyName(k).toLowerCase() === expectedParent
          })

          if (hasParentLater) {
            issues.push({
              componentName: component.name, nodeId: component.id,
              dependentProperty: cleanName, expectedParent,
              violationType: 'dependency-prefix-order',
              message: `Property "${cleanName}" in "${component.name}" uses the ↳ dependency prefix but its parent toggle "${expectedParent}" appears after it. Reorder so the parent comes first.`,
            })
          }
        }
      }
    }
  }

  return issues
}

/**
 * @typedef {Object} OrphanDependencyIssue
 * @property {string} componentName
 * @property {string} nodeId
 * @property {string} dependentProperty - The property with `↳` prefix
 * @property {string} expectedParent - The parent toggle name that would justify the ↳ prefix
 * @property {'orphan-dependency-prefix'} violationType
 * @property {string} message
 */

/**
 * Detects `↳`-prefixed properties that have no matching `show X` boolean
 * parent **anywhere** in the component's property list.
 *
 * The ↳ prefix communicates that a property only makes sense when a paired
 * toggle is on — e.g. `↳ icon` paired with `show icon`. If no toggle exists,
 * the prefix is misleading: the property is always active, so the dependency
 * it implies isn't real.
 *
 * This is distinct from {@link detectDependencyPrefixOrder}, which only fires
 * when a parent toggle exists but appears *after* the dependent in the
 * property list. This detector catches the case where the parent is entirely
 * absent.
 *
 * Resolution is either (a) add the missing `show X` boolean, or (b) remove
 * the ↳ prefix and name the property without the dependency signal.
 *
 * @param {ComponentInput[]} components
 * @returns {OrphanDependencyIssue[]}
 *
 * @example
 * detectOrphanDependencyPrefix([{
 *   name: 'MenuItem', id: '1:1',
 *   componentPropertyDefinitions: {
 *     '↳ icon#111': { type: 'INSTANCE_SWAP' },
 *     'text#222': { type: 'TEXT' }
 *   }
 * }])
 * // → [{ violationType: 'orphan-dependency-prefix', dependentProperty: '↳ icon',
 * //      expectedParent: 'show icon', ... }]
 */
export function detectOrphanDependencyPrefix(components) {
  /** @type {OrphanDependencyIssue[]} */
  const issues = []

  for (const component of components) {
    const definitions = component.componentPropertyDefinitions
    if (!definitions) continue

    const entries = Object.entries(definitions)

    // First pass: collect every `show X` boolean name, lowercased
    const showBooleanElements = new Set()
    for (const [rawKey, definition] of entries) {
      if (definition.type !== 'BOOLEAN') continue
      const cleanName = cleanPropertyName(rawKey)
      if (cleanName.toLowerCase().startsWith('show ')) {
        showBooleanElements.add(cleanName.slice('show '.length).trim().toLowerCase())
      }
    }

    // Second pass: for every ↳-prefixed property, check if a matching show
    // boolean exists anywhere in the list (not just before it)
    for (const [rawKey] of entries) {
      const cleanName = cleanPropertyName(rawKey)
      if (!cleanName.startsWith('↳')) continue

      const dependentElement = cleanName.slice('↳'.length).trim().toLowerCase()
      if (dependentElement.length === 0) continue

      if (!showBooleanElements.has(dependentElement)) {
        issues.push({
          componentName: component.name,
          nodeId: component.id,
          dependentProperty: cleanName,
          expectedParent: `show ${dependentElement}`,
          violationType: 'orphan-dependency-prefix',
          message: `Property "${cleanName}" in "${component.name}" uses the ↳ dependency prefix but no "show ${dependentElement}" boolean exists. Either add the toggle or remove the ↳ prefix.`,
        })
      }
    }
  }

  return issues
}
