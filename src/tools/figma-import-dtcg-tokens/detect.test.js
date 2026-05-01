import { describe, it, expect } from 'vitest'
import {
  flattenDtcg,
  validateTokens,
  pathToFigmaName,
  mapType,
  parseHexColor,
  parseRgbColor,
  parseColorValue,
  parseDimensionValue,
  parseFontWeightValue,
  resolvePrimitiveValue,
  buildOperationPlan,
} from './detect.js'

// ---------------------------------------------------------------------------
// Inlined DTCG fixtures. Mirrors a realistic palette + light/dark theme shape.
// ---------------------------------------------------------------------------

function buildPaletteDtcg() {
  return {
    color: {
      palette: {
        $type: 'color',
        blue: {
          100: { $value: '#e6f0ff', $description: 'Lightest blue' },
          500: { $value: '#0066ff', $description: 'Primary blue' },
          900: { $value: '#001a4d' },
        },
        neutral: {
          0: { $value: '#ffffff' },
          100: { $value: '#f5f5f5' },
          500: { $value: '#808080' },
          900: { $value: '#1a1a1a' },
          1000: { $value: '#000000' },
        },
        red: {
          500: { $value: 'rgb(220, 38, 38)' },
        },
      },
    },
  }
}

function buildLightDtcg() {
  return {
    color: {
      semantic: {
        $type: 'color',
        bg: {
          default: { $value: '{color.palette.neutral.0}' },
          muted: { $value: '{color.palette.neutral.100}' },
        },
        fg: {
          default: { $value: '{color.palette.neutral.900}' },
          muted: { $value: '{color.palette.neutral.500}' },
        },
        action: {
          primary: { $value: '{color.palette.blue.500}' },
          'primary-emphasis': { $value: '{color.semantic.action.primary}' },
          danger: { $value: '{color.palette.red.500}' },
        },
      },
    },
  }
}

function buildDarkDtcg() {
  return {
    color: {
      semantic: {
        $type: 'color',
        bg: {
          default: { $value: '{color.palette.neutral.1000}' },
          muted: { $value: '{color.palette.neutral.900}' },
        },
        fg: {
          default: { $value: '{color.palette.neutral.0}' },
          muted: { $value: '{color.palette.neutral.500}' },
        },
        action: {
          primary: { $value: '{color.palette.blue.500}' },
          'primary-emphasis': { $value: '{color.semantic.action.primary}' },
          danger: { $value: '{color.palette.red.500}' },
        },
      },
    },
  }
}

/**
 * Tags a flattened DTCG map with collection + mode metadata, the way the
 * orchestrator would. Filters by tokenPrefix.
 */
function tagTokens(flatTokens, collectionName, modeName, tokenPrefix) {
  const out = {}
  for (const [path, token] of Object.entries(flatTokens)) {
    if (!path.startsWith(tokenPrefix + '.') && path !== tokenPrefix) continue
    out[`${collectionName}::${modeName}::${path}`] = {
      ...token,
      collectionName,
      modeName,
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// flattenDtcg
// ---------------------------------------------------------------------------

describe('flattenDtcg', () => {
  it('produces dotted paths for leaf tokens', () => {
    const flat = flattenDtcg({
      color: { blue: { 500: { $type: 'color', $value: '#0066ff' } } },
    })
    expect(Object.keys(flat)).toEqual(['color.blue.500'])
    expect(flat['color.blue.500'].$type).toBe('color')
    expect(flat['color.blue.500'].$value).toBe('#0066ff')
  })

  it('inherits $type from group level', () => {
    const flat = flattenDtcg({
      color: {
        blue: {
          $type: 'color',
          500: { $value: '#0066ff' },
          900: { $value: '#001a4d' },
        },
      },
    })
    expect(flat['color.blue.500'].$type).toBe('color')
    expect(flat['color.blue.900'].$type).toBe('color')
  })

  it('lets token-level $type override group-level', () => {
    const flat = flattenDtcg({
      space: {
        $type: 'dimension',
        base: { $value: '8px' },
        ratio: { $type: 'number', $value: 1.5 },
      },
    })
    expect(flat['space.base'].$type).toBe('dimension')
    expect(flat['space.ratio'].$type).toBe('number')
  })

  it('captures $description', () => {
    const flat = flattenDtcg(buildPaletteDtcg())
    expect(flat['color.palette.blue.500'].$description).toBe('Primary blue')
  })
})

// ---------------------------------------------------------------------------
// validateTokens
// ---------------------------------------------------------------------------

describe('validateTokens', () => {
  it('flags missing $type as fatal', () => {
    const issues = validateTokens({ 'color.x': { $value: '#fff', path: 'color.x' } })
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('fatal')
    expect(issues[0].code).toBe('missing-type')
  })

  it('flags whitespace and reserved chars in paths', () => {
    const issues = validateTokens({
      'has space': { $type: 'color', $value: '#fff', path: 'has space' },
      'has/slash': { $type: 'color', $value: '#fff', path: 'has/slash' },
    })
    const codes = issues.map((i) => i.code).sort()
    expect(codes).toEqual(['invalid-path-reserved', 'invalid-path-whitespace'])
  })
})

// ---------------------------------------------------------------------------
// pathToFigmaName + mapType
// ---------------------------------------------------------------------------

describe('pathToFigmaName', () => {
  it('converts dots to slashes', () => {
    expect(pathToFigmaName('color.blue.500')).toBe('color/blue/500')
    expect(pathToFigmaName('single')).toBe('single')
  })
})

describe('mapType', () => {
  it('handles supported types', () => {
    expect(mapType('color')).toEqual({ status: 'supported', figmaType: 'COLOR' })
    expect(mapType('dimension')).toEqual({ status: 'supported', figmaType: 'FLOAT' })
    expect(mapType('number')).toEqual({ status: 'supported', figmaType: 'FLOAT' })
    expect(mapType('fontWeight')).toEqual({ status: 'supported', figmaType: 'FLOAT' })
    expect(mapType('fontFamily')).toEqual({ status: 'supported', figmaType: 'STRING' })
    expect(mapType('boolean')).toEqual({ status: 'supported', figmaType: 'BOOLEAN' })
  })

  it('skips composite and motion types with a reason', () => {
    for (const t of ['shadow', 'gradient', 'typography', 'duration', 'cubicBezier']) {
      const m = mapType(t)
      expect(m.status).toBe('skip')
      expect(m.reason).toBeTruthy()
    }
  })

  it('skips unknown types with a reason', () => {
    const m = mapType('definitelyNotAType')
    expect(m.status).toBe('skip')
    expect(m.reason).toMatch(/Unknown/)
  })
})

// ---------------------------------------------------------------------------
// Color, dimension, font-weight parsing
// ---------------------------------------------------------------------------

describe('parseHexColor', () => {
  it('handles 3, 6, and 8 char hex', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    expect(parseHexColor('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    const halfAlpha = parseHexColor('#0066ff80')
    expect(Math.abs(halfAlpha.a - 0x80 / 255)).toBeLessThan(1e-9)
  })

  it('returns null for malformed input', () => {
    expect(parseHexColor('#zzzzzz')).toBe(null)
    expect(parseHexColor('not a hex')).toBe(null)
    expect(parseHexColor('#12345')).toBe(null)
    expect(parseHexColor(123)).toBe(null)
  })
})

describe('parseRgbColor', () => {
  it('handles rgb and rgba', () => {
    expect(parseRgbColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(parseRgbColor('rgba(0, 102, 255, 0.5)').a).toBe(0.5)
  })
})

describe('parseColorValue', () => {
  it('prefers hex, falls through to rgb, returns null for OKLCH', () => {
    expect(parseColorValue('#0066ff')).toEqual({ r: 0, g: 102 / 255, b: 1, a: 1 })
    expect(parseColorValue('rgb(0, 102, 255)')).toBeTruthy()
    expect(parseColorValue('oklch(0.5 0.2 220)')).toBe(null)
  })
})

describe('parseDimensionValue', () => {
  it('strips unit and returns number', () => {
    expect(parseDimensionValue('16px')).toBe(16)
    expect(parseDimensionValue('1rem')).toBe(1)
    expect(parseDimensionValue('0.5')).toBe(0.5)
    expect(parseDimensionValue(24)).toBe(24)
    expect(parseDimensionValue('-8px')).toBe(-8)
    expect(parseDimensionValue('not a number')).toBe(null)
  })
})

describe('parseFontWeightValue', () => {
  it('accepts numbers and numeric strings, rejects names', () => {
    expect(parseFontWeightValue(400)).toBe(400)
    expect(parseFontWeightValue('700')).toBe(700)
    expect(parseFontWeightValue('bold')).toBe(null)
    expect(parseFontWeightValue('')).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// resolvePrimitiveValue
// ---------------------------------------------------------------------------

describe('resolvePrimitiveValue', () => {
  it('handles each supported type', () => {
    const cases = [
      { token: { $type: 'color', $value: '#0066ff', path: 'c' }, ok: true },
      { token: { $type: 'dimension', $value: '8px', path: 'c' }, ok: true, expect: 8 },
      { token: { $type: 'number', $value: 1.5, path: 'c' }, ok: true, expect: 1.5 },
      { token: { $type: 'fontWeight', $value: 600, path: 'c' }, ok: true, expect: 600 },
      { token: { $type: 'fontFamily', $value: 'Inter', path: 'c' }, ok: true, expect: 'Inter' },
      { token: { $type: 'boolean', $value: true, path: 'c' }, ok: true, expect: true },
    ]
    for (const c of cases) {
      const r = resolvePrimitiveValue(c.token)
      expect(r.ok).toBe(c.ok)
      if (c.expect !== undefined) expect(r.value).toEqual(c.expect)
    }
  })

  it('returns clean error for named font weights', () => {
    const r = resolvePrimitiveValue({ $type: 'fontWeight', $value: 'bold', path: 'x' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('named-font-weight')
  })

  it('refuses to resolve aliases (caller does pass 2)', () => {
    const r = resolvePrimitiveValue({ $type: 'color', $value: '{color.x}', path: 'y' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('is-alias')
  })
})

// ---------------------------------------------------------------------------
// buildOperationPlan
// ---------------------------------------------------------------------------

describe('buildOperationPlan', () => {
  it('creates ops in dependency order', () => {
    const tokens = {
      'Palette::default::color.blue.500': {
        $type: 'color',
        $value: '#0066ff',
        path: 'color.blue.500',
        collectionName: 'Palette',
        modeName: 'default',
      },
      'Theme::light::color.action.primary': {
        $type: 'color',
        $value: '{color.blue.500}',
        path: 'color.action.primary',
        collectionName: 'Theme',
        modeName: 'light',
      },
    }
    const { operations, errors, skipped } = buildOperationPlan({
      tokens,
      existingVarsByName: new Map(),
    })
    expect(errors).toEqual([])
    expect(skipped).toEqual([])
    const setValueIdx = operations.findIndex((o) => o.kind === 'set-value')
    const setAliasIdx = operations.findIndex((o) => o.kind === 'set-alias')
    expect(setValueIdx).toBeGreaterThanOrEqual(0)
    expect(setAliasIdx).toBeGreaterThan(setValueIdx)
  })

  it('reports cycles as errors', () => {
    const tokens = {
      'C::default::a': { $type: 'color', $value: '{b}', path: 'a', collectionName: 'C', modeName: 'default' },
      'C::default::b': { $type: 'color', $value: '{a}', path: 'b', collectionName: 'C', modeName: 'default' },
    }
    const { errors } = buildOperationPlan({ tokens, existingVarsByName: new Map() })
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('cycle')
  })

  it('skips unsupported types instead of erroring', () => {
    const tokens = {
      'C::default::motion.fade': {
        $type: 'duration',
        $value: '300ms',
        path: 'motion.fade',
        collectionName: 'C',
        modeName: 'default',
      },
    }
    const { operations, skipped, errors } = buildOperationPlan({
      tokens,
      existingVarsByName: new Map(),
    })
    expect(operations).toEqual([])
    expect(errors).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0].code).toBe('unsupported-type')
  })

  it('errors on type change for existing variable', () => {
    const tokens = {
      'C::default::x': { $type: 'color', $value: '#fff', path: 'x', collectionName: 'C', modeName: 'default' },
    }
    const existingVarsByName = new Map([
      ['x', { id: 'VAR:1', type: 'FLOAT', collectionId: 'COL:1' }],
    ])
    const { errors } = buildOperationPlan({ tokens, existingVarsByName })
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('type-change')
  })

  it('handles a realistic palette + light/dark theme with alias chains', () => {
    const palette = flattenDtcg(buildPaletteDtcg())
    const light = flattenDtcg(buildLightDtcg())
    const dark = flattenDtcg(buildDarkDtcg())

    const tokens = {
      ...tagTokens(palette, 'Palette', 'default', 'color.palette'),
      ...tagTokens(light, 'Theme', 'light', 'color.semantic'),
      ...tagTokens(dark, 'Theme', 'dark', 'color.semantic'),
    }

    const { operations, errors, skipped } = buildOperationPlan({
      tokens,
      existingVarsByName: new Map(),
    })
    expect(errors).toEqual([])
    expect(skipped).toEqual([])

    const created = operations.filter((o) => o.kind === 'create-variable')
    const setValue = operations.filter((o) => o.kind === 'set-value')
    const setAlias = operations.filter((o) => o.kind === 'set-alias')

    // 9 palette primitives + 7 semantic aliases = 16 unique variables.
    expect(created).toHaveLength(16)
    // Palette primitives get one set-value each.
    expect(setValue).toHaveLength(9)
    // Semantic tokens get one set-alias per mode (7 × 2).
    expect(setAlias).toHaveLength(14)

    // Topological order: blue.500 before primary before primary-emphasis.
    const blue500Idx = operations.findIndex(
      (o) => o.kind === 'set-value' && o.name === 'color/palette/blue/500',
    )
    const primaryAliasIdx = operations.findIndex(
      (o) =>
        o.kind === 'set-alias' &&
        o.name === 'color/semantic/action/primary' &&
        o.modeName === 'light',
    )
    const emphasisAliasIdx = operations.findIndex(
      (o) =>
        o.kind === 'set-alias' &&
        o.name === 'color/semantic/action/primary-emphasis' &&
        o.modeName === 'light',
    )
    expect(blue500Idx).toBeLessThan(primaryAliasIdx)
    expect(primaryAliasIdx).toBeLessThan(emphasisAliasIdx)

    // Alias chain is preserved — emphasis points at primary, not at blue.500.
    expect(operations[emphasisAliasIdx].targetName).toBe('color/semantic/action/primary')
  })
})
