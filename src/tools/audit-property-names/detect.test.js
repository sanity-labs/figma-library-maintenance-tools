import { describe, it, expect } from 'vitest'
import {
  cleanPropertyName,
  isDefaultName,
  isCapitalized,
  categorizeBooleanPrefix,
  auditProperties,
} from './detect.js'

// ---------------------------------------------------------------------------
// cleanPropertyName
// ---------------------------------------------------------------------------
describe('cleanPropertyName', () => {
  it('strips the hash suffix from "size#12345"', () => {
    expect(cleanPropertyName('size#12345')).toBe('size')
  })

  it('strips the hash suffix from "Property 1#67890"', () => {
    expect(cleanPropertyName('Property 1#67890')).toBe('Property 1')
  })

  it('returns the key as-is when there is no hash', () => {
    expect(cleanPropertyName('nohash')).toBe('nohash')
  })

  it('handles a key with multiple hashes by splitting on the first one', () => {
    expect(cleanPropertyName('a#b#c')).toBe('a')
  })

  it('returns an empty string when the key starts with a hash', () => {
    expect(cleanPropertyName('#12345')).toBe('')
  })

  it('handles an empty string input', () => {
    expect(cleanPropertyName('')).toBe('')
  })

  it('preserves spaces and special characters before the hash', () => {
    expect(cleanPropertyName('↳ show icon#99999')).toBe('↳ show icon')
  })
})

// ---------------------------------------------------------------------------
// isDefaultName
// ---------------------------------------------------------------------------
describe('isDefaultName', () => {
  it('returns true for "Property 1"', () => {
    expect(isDefaultName('Property 1')).toBe(true)
  })

  it('returns true for "Property 23"', () => {
    expect(isDefaultName('Property 23')).toBe(true)
  })

  it('returns true for "Property 100"', () => {
    expect(isDefaultName('Property 100')).toBe(true)
  })

  it('returns false for a descriptive name like "size"', () => {
    expect(isDefaultName('size')).toBe(false)
  })

  it('returns false for "My Property 1" (has a prefix)', () => {
    expect(isDefaultName('My Property 1')).toBe(false)
  })

  it('returns false for "Property" without a number', () => {
    expect(isDefaultName('Property')).toBe(false)
  })

  it('returns false for "property 1" (lowercase p)', () => {
    expect(isDefaultName('property 1')).toBe(false)
  })

  it('returns false for "Property 1 extra" (trailing text)', () => {
    expect(isDefaultName('Property 1 extra')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isDefaultName('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isCapitalized
// ---------------------------------------------------------------------------
describe('isCapitalized', () => {
  it('returns true for "Size"', () => {
    expect(isCapitalized('Size')).toBe(true)
  })

  it('returns false for "size"', () => {
    expect(isCapitalized('size')).toBe(false)
  })

  it('returns true for "↳ Size" (nested indicator with uppercase)', () => {
    expect(isCapitalized('↳ Size')).toBe(true)
  })

  it('returns false for "↳ size" (nested indicator with lowercase)', () => {
    expect(isCapitalized('↳ size')).toBe(false)
  })

  it('returns false for "123abc" (starts with a digit)', () => {
    expect(isCapitalized('123abc')).toBe(false)
  })

  it('returns true for "A" (single uppercase letter)', () => {
    expect(isCapitalized('A')).toBe(true)
  })

  it('returns false for "a" (single lowercase letter)', () => {
    expect(isCapitalized('a')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isCapitalized('')).toBe(false)
  })

  it('returns false for "↳" alone (nothing after the indicator)', () => {
    expect(isCapitalized('↳')).toBe(false)
  })

  it('returns false for "↳ " (indicator with only space)', () => {
    expect(isCapitalized('↳ ')).toBe(false)
  })

  it('returns true for "↳Icon" (no space after indicator, uppercase)', () => {
    expect(isCapitalized('↳Icon')).toBe(true)
  })

  it('returns false for "↳icon" (no space after indicator, lowercase)', () => {
    expect(isCapitalized('↳icon')).toBe(false)
  })

  it('returns true for "Show Icon" (uppercase, multi-word)', () => {
    expect(isCapitalized('Show Icon')).toBe(true)
  })

  it('returns false for "show icon" (all lowercase)', () => {
    expect(isCapitalized('show icon')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// categorizeBooleanPrefix
// ---------------------------------------------------------------------------
describe('categorizeBooleanPrefix', () => {
  it('returns "show" for "show icon"', () => {
    expect(categorizeBooleanPrefix('show icon')).toBe('show')
  })

  it('returns "with" for "with avatar"', () => {
    expect(categorizeBooleanPrefix('with avatar')).toBe('with')
  })

  it('returns "other" for "disabled"', () => {
    expect(categorizeBooleanPrefix('disabled')).toBe('other')
  })

  it('returns "show" for "Show Icon" (case-insensitive)', () => {
    expect(categorizeBooleanPrefix('Show Icon')).toBe('show')
  })

  it('returns "with" for "With Avatar" (case-insensitive)', () => {
    expect(categorizeBooleanPrefix('With Avatar')).toBe('with')
  })

  it('returns "other" for "shown" (no trailing space after "show")', () => {
    expect(categorizeBooleanPrefix('shown')).toBe('other')
  })

  it('returns "other" for "without" (no trailing space after "with")', () => {
    expect(categorizeBooleanPrefix('without')).toBe('other')
  })

  it('returns "show" for "SHOW ICON" (all caps)', () => {
    expect(categorizeBooleanPrefix('SHOW ICON')).toBe('show')
  })

  it('returns "other" for an empty string', () => {
    expect(categorizeBooleanPrefix('')).toBe('other')
  })

  it('returns "other" for "is visible"', () => {
    expect(categorizeBooleanPrefix('is visible')).toBe('other')
  })
})

// ---------------------------------------------------------------------------
// auditProperties
// ---------------------------------------------------------------------------
describe('auditProperties', () => {
  it('flags a component with a default-named property', () => {
    const components = [
      {
        name: 'Button',
        id: '1:1',
        componentPropertyDefinitions: {
          'Property 1#111': { type: 'TEXT' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    expect(issues.length).toBeGreaterThanOrEqual(1)
    const defaultIssue = issues.find((i) => i.violationType === 'default-name')
    expect(defaultIssue).toBeDefined()
    expect(defaultIssue.componentName).toBe('Button')
    expect(defaultIssue.nodeId).toBe('1:1')
    expect(defaultIssue.propertyName).toBe('Property 1')
    expect(defaultIssue.rawPropertyKey).toBe('Property 1#111')
    expect(defaultIssue.propertyType).toBe('TEXT')
    expect(defaultIssue.message).toContain('Property 1')
  })

  it('flags a component with a capitalized property name', () => {
    const components = [
      {
        name: 'Card',
        id: '2:1',
        componentPropertyDefinitions: {
          'Size#222': { type: 'VARIANT' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    const capIssue = issues.find((i) => i.violationType === 'capitalized')
    expect(capIssue).toBeDefined()
    expect(capIssue.componentName).toBe('Card')
    expect(capIssue.propertyName).toBe('Size')
    expect(capIssue.propertyType).toBe('VARIANT')
  })

  it('reports no issues for correct lowercase property names', () => {
    const components = [
      {
        name: 'Badge',
        id: '3:1',
        componentPropertyDefinitions: {
          'size#300': { type: 'VARIANT' },
          'label#301': { type: 'TEXT' },
          'icon#302': { type: 'INSTANCE_SWAP' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    expect(issues).toEqual([])
  })

  it('generates toggle-inconsistency issues when both "show" and "with" are used', () => {
    const components = [
      {
        name: 'Card',
        id: '4:1',
        componentPropertyDefinitions: {
          'show icon#400': { type: 'BOOLEAN' },
          'show label#401': { type: 'BOOLEAN' },
          'show badge#402': { type: 'BOOLEAN' },
          'with avatar#403': { type: 'BOOLEAN' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    const toggleIssues = issues.filter(
      (i) => i.violationType === 'toggle-inconsistency'
    )
    // "with" is the minority (1 vs 3), so it should be flagged
    expect(toggleIssues).toHaveLength(1)
    expect(toggleIssues[0].propertyName).toBe('with avatar')
  })

  it('does not generate toggle-inconsistency issues when only "show" is used', () => {
    const components = [
      {
        name: 'Button',
        id: '5:1',
        componentPropertyDefinitions: {
          'show icon#500': { type: 'BOOLEAN' },
          'show label#501': { type: 'BOOLEAN' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    const toggleIssues = issues.filter(
      (i) => i.violationType === 'toggle-inconsistency'
    )
    expect(toggleIssues).toHaveLength(0)
  })

  it('does not generate toggle-inconsistency issues when only "with" is used', () => {
    const components = [
      {
        name: 'Avatar',
        id: '6:1',
        componentPropertyDefinitions: {
          'with badge#600': { type: 'BOOLEAN' },
          'with status#601': { type: 'BOOLEAN' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    const toggleIssues = issues.filter(
      (i) => i.violationType === 'toggle-inconsistency'
    )
    expect(toggleIssues).toHaveLength(0)
  })

  it('returns correct toggle summary counts', () => {
    const components = [
      {
        name: 'Widget',
        id: '7:1',
        componentPropertyDefinitions: {
          'show icon#700': { type: 'BOOLEAN' },
          'show label#701': { type: 'BOOLEAN' },
          'with avatar#702': { type: 'BOOLEAN' },
          'disabled#703': { type: 'BOOLEAN' },
        },
      },
    ]

    const { toggleSummary } = auditProperties(components)

    expect(toggleSummary.showCount).toBe(2)
    expect(toggleSummary.withCount).toBe(1)
    expect(toggleSummary.otherCount).toBe(1)
    expect(toggleSummary.showProperties).toEqual(['show icon', 'show label'])
    expect(toggleSummary.withProperties).toEqual(['with avatar'])
  })

  it('returns an empty toggle summary when there are no boolean properties', () => {
    const components = [
      {
        name: 'Text',
        id: '8:1',
        componentPropertyDefinitions: {
          'size#800': { type: 'VARIANT' },
          'content#801': { type: 'TEXT' },
        },
      },
    ]

    const { toggleSummary } = auditProperties(components)

    expect(toggleSummary.showCount).toBe(0)
    expect(toggleSummary.withCount).toBe(0)
    expect(toggleSummary.otherCount).toBe(0)
    expect(toggleSummary.showProperties).toEqual([])
    expect(toggleSummary.withProperties).toEqual([])
  })

  it('handles components with no componentPropertyDefinitions', () => {
    const components = [
      { name: 'Empty', id: '9:1' },
      { name: 'Null', id: '9:2', componentPropertyDefinitions: null },
      { name: 'Undef', id: '9:3', componentPropertyDefinitions: undefined },
    ]

    const { issues, toggleSummary } = auditProperties(components)

    expect(issues).toEqual([])
    expect(toggleSummary.showCount).toBe(0)
  })

  it('handles an empty components array', () => {
    const { issues, toggleSummary } = auditProperties([])

    expect(issues).toEqual([])
    expect(toggleSummary.showCount).toBe(0)
    expect(toggleSummary.withCount).toBe(0)
    expect(toggleSummary.otherCount).toBe(0)
  })

  it('can flag a single property for both default-name and capitalized violations', () => {
    // "Property 1" is both a default name AND starts with uppercase
    const components = [
      {
        name: 'Box',
        id: '10:1',
        componentPropertyDefinitions: {
          'Property 1#1000': { type: 'VARIANT' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    const defaultIssue = issues.find((i) => i.violationType === 'default-name')
    const capIssue = issues.find((i) => i.violationType === 'capitalized')
    expect(defaultIssue).toBeDefined()
    expect(capIssue).toBeDefined()
  })

  it('flags "show" as minority when "with" is more common', () => {
    const components = [
      {
        name: 'Panel',
        id: '11:1',
        componentPropertyDefinitions: {
          'with icon#1100': { type: 'BOOLEAN' },
          'with badge#1101': { type: 'BOOLEAN' },
          'with avatar#1102': { type: 'BOOLEAN' },
          'show label#1103': { type: 'BOOLEAN' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    const toggleIssues = issues.filter(
      (i) => i.violationType === 'toggle-inconsistency'
    )
    expect(toggleIssues).toHaveLength(1)
    expect(toggleIssues[0].propertyName).toBe('show label')
    expect(toggleIssues[0].message).toContain('with')
  })

  it('flags "show" as minority when counts are equal', () => {
    // When equal, showCount <= withCount is true, so "show" is treated as minority
    const components = [
      {
        name: 'EqualComp',
        id: '12:1',
        componentPropertyDefinitions: {
          'show icon#1200': { type: 'BOOLEAN' },
          'with badge#1201': { type: 'BOOLEAN' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    const toggleIssues = issues.filter(
      (i) => i.violationType === 'toggle-inconsistency'
    )
    expect(toggleIssues).toHaveLength(1)
    expect(toggleIssues[0].propertyName).toBe('show icon')
  })

  it('does not categorize non-BOOLEAN properties for toggle analysis', () => {
    const components = [
      {
        name: 'Comp',
        id: '13:1',
        componentPropertyDefinitions: {
          'show header#1300': { type: 'TEXT' },
          'with footer#1301': { type: 'TEXT' },
        },
      },
    ]

    const { toggleSummary } = auditProperties(components)

    expect(toggleSummary.showCount).toBe(0)
    expect(toggleSummary.withCount).toBe(0)
  })

  it('collects issues across multiple components', () => {
    const components = [
      {
        name: 'Alpha',
        id: '14:1',
        componentPropertyDefinitions: {
          'Property 1#1400': { type: 'TEXT' },
        },
      },
      {
        name: 'Beta',
        id: '14:2',
        componentPropertyDefinitions: {
          'Label#1401': { type: 'TEXT' },
        },
      },
    ]

    const { issues } = auditProperties(components)

    const alphaIssues = issues.filter((i) => i.componentName === 'Alpha')
    const betaIssues = issues.filter((i) => i.componentName === 'Beta')
    expect(alphaIssues.length).toBeGreaterThanOrEqual(1)
    expect(betaIssues.length).toBeGreaterThanOrEqual(1)
  })

  it('toggle summary aggregates across multiple components', () => {
    const components = [
      {
        name: 'Comp1',
        id: '15:1',
        componentPropertyDefinitions: {
          'show icon#1500': { type: 'BOOLEAN' },
        },
      },
      {
        name: 'Comp2',
        id: '15:2',
        componentPropertyDefinitions: {
          'show label#1501': { type: 'BOOLEAN' },
          'with badge#1502': { type: 'BOOLEAN' },
        },
      },
    ]

    const { toggleSummary } = auditProperties(components)

    expect(toggleSummary.showCount).toBe(2)
    expect(toggleSummary.withCount).toBe(1)
    expect(toggleSummary.showProperties).toEqual(['show icon', 'show label'])
    expect(toggleSummary.withProperties).toEqual(['with badge'])
  })
})
