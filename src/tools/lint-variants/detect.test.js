import { describe, it, expect } from 'vitest'
import {
  parseVariantName, buildVariantName, extractPropertyValues,
  detectSingleValueVariants, detectDuplicateVariantNames,
  detectCoverageGaps, auditComponentSetVariants,
  isValidVariantValue, classifyInvalidVariantValue,
  detectVariantValueFormat,
} from './detect.js'

describe('parseVariantName', () => {
  it('parses a single property', () => {
    expect(parseVariantName('size=1')).toEqual({ size: '1' })
  })
  it('parses multiple properties', () => {
    expect(parseVariantName('size=1, state=enabled')).toEqual({ size: '1', state: 'enabled' })
  })
  it('handles extra whitespace', () => {
    expect(parseVariantName('size = 1 , state = enabled')).toEqual({ size: '1', state: 'enabled' })
  })
  it('handles values with equals signs', () => {
    expect(parseVariantName('label=a=b')).toEqual({ label: 'a=b' })
  })
  it('returns empty object for empty string', () => {
    expect(parseVariantName('')).toEqual({})
  })
  it('skips segments without equals', () => {
    expect(parseVariantName('size=1, broken, state=enabled')).toEqual({ size: '1', state: 'enabled' })
  })
})

describe('buildVariantName', () => {
  it('builds a sorted variant name string', () => {
    expect(buildVariantName({ state: 'enabled', size: '1' })).toBe('size=1, state=enabled')
  })
  it('handles single property', () => {
    expect(buildVariantName({ size: '1' })).toBe('size=1')
  })
  it('returns empty string for empty object', () => {
    expect(buildVariantName({})).toBe('')
  })
})

describe('extractPropertyValues', () => {
  it('extracts sorted unique values per property', () => {
    const parsed = [
      { size: '2', state: 'enabled' },
      { size: '1', state: 'enabled' },
      { size: '1', state: 'hovered' },
    ]
    expect(extractPropertyValues(parsed)).toEqual({ size: ['1', '2'], state: ['enabled', 'hovered'] })
  })
  it('returns empty object for empty array', () => {
    expect(extractPropertyValues([])).toEqual({})
  })
})

describe('detectSingleValueVariants', () => {
  it('detects properties with exactly one value', () => {
    const issues = detectSingleValueVariants('Badge', '1:2', {
      'font size': ['1'], state: ['enabled', 'hovered'], tone: ['default', 'primary'],
    })
    expect(issues).toHaveLength(1)
    expect(issues[0].propertyName).toBe('font size')
    expect(issues[0].singleValue).toBe('1')
    expect(issues[0].issueType).toBe('single-value-variant')
  })
  it('returns empty when all properties have multiple values', () => {
    const issues = detectSingleValueVariants('Button', '1:3', { size: ['1', '2'], state: ['enabled', 'hovered'] })
    expect(issues).toHaveLength(0)
  })
  it('detects multiple single-value properties', () => {
    const issues = detectSingleValueVariants('KBD', '1:4', { padding: ['1'], scheme: ['light'] })
    expect(issues).toHaveLength(2)
  })
})

describe('detectDuplicateVariantNames', () => {
  it('detects duplicate variant name strings', () => {
    const issues = detectDuplicateVariantNames('Select', '1:5', [
      { name: 'size=1, state=enabled', id: '1:6' },
      { name: 'size=1, state=hovered', id: '1:7' },
      { name: 'size=1, state=enabled', id: '1:8' },
    ])
    expect(issues).toHaveLength(1)
    expect(issues[0].duplicateName).toBe('size=1, state=enabled')
    expect(issues[0].count).toBe(2)
    expect(issues[0].duplicateNodeIds).toEqual(['1:6', '1:8'])
  })
  it('returns empty when all names are unique', () => {
    expect(detectDuplicateVariantNames('Button', '1:9', [
      { name: 'size=1', id: '1:10' }, { name: 'size=2', id: '1:11' },
    ])).toHaveLength(0)
  })
  it('detects multiple groups of duplicates', () => {
    const issues = detectDuplicateVariantNames('Component', '1:12', [
      { name: 'a=1', id: '1:13' }, { name: 'a=1', id: '1:14' },
      { name: 'b=2', id: '1:15' }, { name: 'b=2', id: '1:16' }, { name: 'b=2', id: '1:17' },
    ])
    expect(issues).toHaveLength(2)
  })
})

describe('detectCoverageGaps', () => {
  it('finds missing combinations in a 2x2 matrix', () => {
    const gaps = detectCoverageGaps('TextArea', '1:20',
      { 'font size': ['1', '2'], state: ['enabled', 'hovered'] },
      new Set(['font size=1, state=enabled', 'font size=2, state=enabled', 'font size=2, state=hovered'])
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0].missingVariantName).toBe('font size=1, state=hovered')
  })
  it('returns empty when matrix is complete', () => {
    const gaps = detectCoverageGaps('Button', '1:21',
      { size: ['1', '2'], state: ['enabled'] },
      new Set(['size=1, state=enabled', 'size=2, state=enabled'])
    )
    expect(gaps).toHaveLength(0)
  })
  it('skips analysis for single-property component sets', () => {
    expect(detectCoverageGaps('Spinner', '1:22', { muted: ['true', 'false'] }, new Set(['muted=true']))).toHaveLength(0)
  })
})

describe('auditComponentSetVariants', () => {
  it('combines all checks on a component set node', () => {
    const node = {
      name: 'Badge', id: '1:30',
      children: [
        { name: 'font size=1, state=enabled', id: '1:31', type: 'COMPONENT' },
        { name: 'font size=1, state=hovered', id: '1:32', type: 'COMPONENT' },
      ],
    }
    const issues = auditComponentSetVariants(node)
    expect(issues.some((i) => i.issueType === 'single-value-variant')).toBe(true)
  })
  it('includes coverage gaps when option is set', () => {
    const node = {
      name: 'TextArea', id: '1:50',
      children: [
        { name: 'size=1, state=enabled', id: '1:51', type: 'COMPONENT' },
        { name: 'size=2, state=enabled', id: '1:52', type: 'COMPONENT' },
        { name: 'size=2, state=hovered', id: '1:53', type: 'COMPONENT' },
      ],
    }
    expect(auditComponentSetVariants(node, { includeGaps: true }).some((i) => i.issueType === 'coverage-gap')).toBe(true)
  })
  it('excludes coverage gaps by default', () => {
    const node = {
      name: 'TextArea', id: '1:50',
      children: [
        { name: 'size=1, state=enabled', id: '1:51', type: 'COMPONENT' },
        { name: 'size=2, state=enabled', id: '1:52', type: 'COMPONENT' },
        { name: 'size=2, state=hovered', id: '1:53', type: 'COMPONENT' },
      ],
    }
    expect(auditComponentSetVariants(node).some((i) => i.issueType === 'coverage-gap')).toBe(false)
  })
  it('returns empty for component set with no children', () => {
    expect(auditComponentSetVariants({ name: 'Empty', id: '1:60', children: [] })).toHaveLength(0)
  })
  it('filters to COMPONENT type children only', () => {
    const node = {
      name: 'Mixed', id: '1:70',
      children: [
        { name: 'size=1', id: '1:71', type: 'COMPONENT' },
        { name: 'size=2', id: '1:73', type: 'COMPONENT' },
        { name: 'some-frame', id: '1:72', type: 'FRAME' },
      ],
    }
    expect(auditComponentSetVariants(node)).toHaveLength(0)
  })

  it('runs the variant-value-format check by default', () => {
    const node = {
      name: 'Button', id: '1:80',
      children: [
        { name: 'state=Enabled', id: '1:81', type: 'COMPONENT' },
        { name: 'state=hovered', id: '1:82', type: 'COMPONENT' },
      ],
    }
    expect(auditComponentSetVariants(node).some((i) => i.issueType === 'variant-value-format')).toBe(true)
  })
})

describe('isValidVariantValue', () => {
  it('accepts simple lowercase alphanumeric values', () => {
    expect(isValidVariantValue('enabled')).toBe(true)
    expect(isValidVariantValue('primary')).toBe(true)
    expect(isValidVariantValue('true')).toBe(true)
    expect(isValidVariantValue('false')).toBe(true)
  })

  it('accepts numeric values', () => {
    expect(isValidVariantValue('1')).toBe(true)
    expect(isValidVariantValue('42')).toBe(true)
  })

  it('accepts alphanumeric combinations', () => {
    expect(isValidVariantValue('size1')).toBe(true)
    expect(isValidVariantValue('v2')).toBe(true)
  })

  it('rejects capitalized values', () => {
    expect(isValidVariantValue('Enabled')).toBe(false)
    expect(isValidVariantValue('PRIMARY')).toBe(false)
  })

  it('rejects values with whitespace', () => {
    expect(isValidVariantValue('primary legacy')).toBe(false)
    expect(isValidVariantValue('enabled ')).toBe(false)
    expect(isValidVariantValue(' enabled')).toBe(false)
  })

  it('rejects values with hyphens or underscores', () => {
    expect(isValidVariantValue('primary-legacy')).toBe(false)
    expect(isValidVariantValue('size_1')).toBe(false)
  })

  it('rejects values with parentheses', () => {
    expect(isValidVariantValue('primary (legacy)')).toBe(false)
    expect(isValidVariantValue('enabled()')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidVariantValue('')).toBe(false)
  })
})

describe('classifyInvalidVariantValue', () => {
  it('returns "whitespace" for values containing spaces', () => {
    expect(classifyInvalidVariantValue('primary legacy')).toBe('whitespace')
    expect(classifyInvalidVariantValue('Primary Legacy')).toBe('whitespace') // whitespace wins over capitalized
  })

  it('returns "capitalized" for uppercase values without whitespace', () => {
    expect(classifyInvalidVariantValue('Enabled')).toBe('capitalized')
    expect(classifyInvalidVariantValue('PRIMARY')).toBe('capitalized')
  })

  it('returns "non-alphanumeric" for lowercase values with other non-alpha chars', () => {
    expect(classifyInvalidVariantValue('primary-legacy')).toBe('non-alphanumeric')
    expect(classifyInvalidVariantValue('size_1')).toBe('non-alphanumeric')
    expect(classifyInvalidVariantValue('primary(legacy)')).toBe('non-alphanumeric')
  })
})

describe('detectVariantValueFormat', () => {
  it('flags a capitalized value', () => {
    const issues = detectVariantValueFormat('Button', '1:1', { state: ['Enabled', 'hovered'] })
    expect(issues).toHaveLength(1)
    expect(issues[0].propertyName).toBe('state')
    expect(issues[0].invalidValue).toBe('Enabled')
    expect(issues[0].reason).toBe('capitalized')
    expect(issues[0].issueType).toBe('variant-value-format')
  })

  it('flags multiple invalid values across multiple properties', () => {
    const issues = detectVariantValueFormat('Button', '1:2', {
      state: ['Enabled', 'hovered'],
      tone: ['primary (legacy)', 'critical'],
    })
    expect(issues).toHaveLength(2)
    const values = issues.map((i) => i.invalidValue).sort()
    expect(values).toEqual(['Enabled', 'primary (legacy)'])
  })

  it('returns no issues when all values are valid', () => {
    const issues = detectVariantValueFormat('Button', '1:3', {
      state: ['enabled', 'hovered', 'pressed'],
      size: ['1', '2', '3'],
    })
    expect(issues).toHaveLength(0)
  })

  it('ignores empty-string values (caught upstream)', () => {
    // parseVariantName produces empty values for malformed inputs like 'size='.
    // The parser handles those; this detector shouldn't report on them.
    const issues = detectVariantValueFormat('Button', '1:4', { state: ['', 'hovered'] })
    expect(issues).toHaveLength(0)
  })

  it('classifies whitespace violations with the whitespace reason', () => {
    const issues = detectVariantValueFormat('Button', '1:5', { tone: ['primary legacy'] })
    expect(issues).toHaveLength(1)
    expect(issues[0].reason).toBe('whitespace')
  })

  it('returns empty for empty property-values map', () => {
    expect(detectVariantValueFormat('Empty', '1:6', {})).toHaveLength(0)
  })
})
