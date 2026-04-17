import { describe, it, expect } from 'vitest'
import {
  serializeColor,
  resolveValue,
  contentHash,
  buildSnapshot,
  diffSnapshots,
} from './detect.js'

/**
 * Builds a minimal dataset fixture. Collections is an array of shape:
 *   { id, name, modes: [{ modeId, name }], variableIds }
 * Variables is an array of shape:
 *   { id, name, variableCollectionId, resolvedType, valuesByMode }
 */
function buildDataset(collections, variables) {
  /** @type {Record<string, any>} */
  const vc = {}
  for (const c of collections) vc[c.id] = c
  /** @type {Record<string, any>} */
  const v = {}
  for (const x of variables) v[x.id] = x
  return { meta: { variableCollections: vc, variables: v } }
}

// ---------------------------------------------------------------------------
// serializeColor
// ---------------------------------------------------------------------------
describe('serializeColor', () => {
  it('serializes an opaque color', () => {
    expect(serializeColor({ r: 1, g: 0.5, b: 0 })).toBe('1,0.5,0,1')
  })

  it('serializes a color with alpha', () => {
    expect(serializeColor({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('0,0,0,0.5')
  })

  it('rounds floating-point noise to six decimal places', () => {
    // 0.1 + 0.2 in JS is 0.30000000000000004 — should round to 0.3
    expect(serializeColor({ r: 0.1 + 0.2, g: 0, b: 0 })).toBe('0.3,0,0,1')
  })
})

// ---------------------------------------------------------------------------
// contentHash
// ---------------------------------------------------------------------------
describe('contentHash', () => {
  it('returns a stable hex string for the same input', () => {
    expect(contentHash('hello')).toBe(contentHash('hello'))
  })

  it('returns different hashes for different inputs', () => {
    expect(contentHash('hello')).not.toBe(contentHash('world'))
  })

  it('handles an empty string', () => {
    expect(contentHash('')).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// resolveValue
// ---------------------------------------------------------------------------
describe('resolveValue', () => {
  it('resolves a direct color value', () => {
    const coll = { id: 'c1', name: 'P', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] }
    const v1 = {
      id: 'v1', name: 'blue', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { r: 0, g: 0, b: 1, a: 1 } },
    }
    const dataset = buildDataset([coll], [v1])
    expect(resolveValue(v1, 'm1', dataset)).toBe('C:0,0,1,1')
  })

  it('resolves a FLOAT value', () => {
    const coll = { id: 'c1', name: 'S', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] }
    const v1 = {
      id: 'v1', name: '3', variableCollectionId: 'c1', resolvedType: 'FLOAT',
      valuesByMode: { m1: 12 },
    }
    const dataset = buildDataset([coll], [v1])
    expect(resolveValue(v1, 'm1', dataset)).toBe('V:F:12')
  })

  it('resolves a BOOLEAN value', () => {
    const coll = { id: 'c1', name: 'F', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] }
    const v1 = {
      id: 'v1', name: 'flag', variableCollectionId: 'c1', resolvedType: 'BOOLEAN',
      valuesByMode: { m1: true },
    }
    const dataset = buildDataset([coll], [v1])
    expect(resolveValue(v1, 'm1', dataset)).toBe('V:B:true')
  })

  it('walks an alias chain to a leaf value (same collection)', () => {
    const coll = { id: 'c1', name: 'P', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1', 'v2'] }
    const v1 = {
      id: 'v1', name: 'blue', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { r: 0, g: 0, b: 1, a: 1 } },
    }
    const v2 = {
      id: 'v2', name: 'primary', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'v1' } },
    }
    const dataset = buildDataset([coll], [v1, v2])
    expect(resolveValue(v2, 'm1', dataset)).toBe('C:0,0,1,1')
  })

  it('walks an alias chain crossing collections (uses target default mode)', () => {
    const palette = { id: 'cP', name: 'Palette', modes: [{ modeId: 'mPdefault', name: 'default' }], variableIds: ['vBlue'] }
    const theme = { id: 'cT', name: 'Theme', modes: [{ modeId: 'mLight', name: 'light' }, { modeId: 'mDark', name: 'dark' }], variableIds: ['vPrimary'] }
    const vBlue = {
      id: 'vBlue', name: 'blue/500', variableCollectionId: 'cP', resolvedType: 'COLOR',
      valuesByMode: { mPdefault: { r: 0, g: 0, b: 1 } },
    }
    const vPrimary = {
      id: 'vPrimary', name: 'primary', variableCollectionId: 'cT', resolvedType: 'COLOR',
      valuesByMode: {
        mLight: { type: 'VARIABLE_ALIAS', id: 'vBlue' },
        mDark: { type: 'VARIABLE_ALIAS', id: 'vBlue' },
      },
    }
    const dataset = buildDataset([palette, theme], [vBlue, vPrimary])
    // Crossing collections uses the target's first mode, regardless of source mode
    expect(resolveValue(vPrimary, 'mLight', dataset)).toBe('C:0,0,1,1')
    expect(resolveValue(vPrimary, 'mDark', dataset)).toBe('C:0,0,1,1')
  })

  it('returns ERR:missing_target when alias points to a non-existent variable', () => {
    const coll = { id: 'c1', name: 'P', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] }
    const v1 = {
      id: 'v1', name: 'orphan', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'vGhost' } },
    }
    const dataset = buildDataset([coll], [v1])
    expect(resolveValue(v1, 'm1', dataset)).toBe('ERR:missing_target')
  })

  it('returns ERR:cycle when alias chain is self-referential', () => {
    const coll = { id: 'c1', name: 'P', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1', 'v2'] }
    const v1 = {
      id: 'v1', name: 'a', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'v2' } },
    }
    const v2 = {
      id: 'v2', name: 'b', variableCollectionId: 'c1', resolvedType: 'COLOR',
      valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'v1' } },
    }
    const dataset = buildDataset([coll], [v1, v2])
    expect(resolveValue(v1, 'm1', dataset)).toBe('ERR:cycle')
  })

  it('returns ERR:no_value when the mode is not defined on the variable', () => {
    const coll = { id: 'c1', name: 'P', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] }
    const v1 = {
      id: 'v1', name: 'x', variableCollectionId: 'c1', resolvedType: 'FLOAT', valuesByMode: {},
    }
    const dataset = buildDataset([coll], [v1])
    expect(resolveValue(v1, 'm1', dataset)).toBe('ERR:no_value')
  })
})

// ---------------------------------------------------------------------------
// buildSnapshot
// ---------------------------------------------------------------------------
describe('buildSnapshot', () => {
  it('returns one entry per collection, keyed by name', () => {
    const coll = { id: 'c1', name: 'Space', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] }
    const v1 = {
      id: 'v1', name: '3', variableCollectionId: 'c1', resolvedType: 'FLOAT',
      valuesByMode: { m1: 12 },
    }
    const dataset = buildDataset([coll], [v1])
    const snap = buildSnapshot(dataset)
    expect(Object.keys(snap)).toEqual(['Space'])
    expect(snap['Space'].collectionName).toBe('Space')
    expect(snap['Space'].variableCount).toBe(1)
    expect(snap['Space'].modeNames).toEqual(['default'])
  })

  it('indexes variables by name so cross-file comparison works', () => {
    const coll = { id: 'c1', name: 'Space', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] }
    const v1 = {
      id: 'v1', name: '3', variableCollectionId: 'c1', resolvedType: 'FLOAT',
      valuesByMode: { m1: 12 },
    }
    const dataset = buildDataset([coll], [v1])
    const snap = buildSnapshot(dataset)
    expect(snap['Space'].variables['3']).toEqual({
      type: 'FLOAT',
      modes: { default: 'V:F:12' },
    })
  })

  it('produces the same hash for identical datasets with different ids', () => {
    // Two datasets with different underlying Figma ids but the same variable
    // names + values — this is the realistic case when comparing two files.
    const d1 = buildDataset(
      [{ id: 'coll_aaa', name: 'Space', modes: [{ modeId: 'mode_xxx', name: 'default' }], variableIds: ['var_111'] }],
      [{ id: 'var_111', name: '3', variableCollectionId: 'coll_aaa', resolvedType: 'FLOAT', valuesByMode: { mode_xxx: 12 } }],
    )
    const d2 = buildDataset(
      [{ id: 'coll_bbb', name: 'Space', modes: [{ modeId: 'mode_yyy', name: 'default' }], variableIds: ['var_222'] }],
      [{ id: 'var_222', name: '3', variableCollectionId: 'coll_bbb', resolvedType: 'FLOAT', valuesByMode: { mode_yyy: 12 } }],
    )
    expect(buildSnapshot(d1)['Space'].contentHash).toBe(buildSnapshot(d2)['Space'].contentHash)
  })

  it('produces different hashes when values differ', () => {
    const coll = { id: 'c1', name: 'Space', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] }
    const d1 = buildDataset(
      [coll],
      [{ id: 'v1', name: '3', variableCollectionId: 'c1', resolvedType: 'FLOAT', valuesByMode: { m1: 12 } }],
    )
    const d2 = buildDataset(
      [coll],
      [{ id: 'v1', name: '3', variableCollectionId: 'c1', resolvedType: 'FLOAT', valuesByMode: { m1: 16 } }],
    )
    expect(buildSnapshot(d1)['Space'].contentHash).not.toBe(buildSnapshot(d2)['Space'].contentHash)
  })

  it('handles an empty dataset', () => {
    expect(buildSnapshot({ meta: { variableCollections: {}, variables: {} } })).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// diffSnapshots
// ---------------------------------------------------------------------------
describe('diffSnapshots', () => {
  function mkSnap(variables, hash, modes = ['default']) {
    return {
      collectionName: 'test',
      variableCount: Object.keys(variables).length,
      modeNames: modes,
      contentHash: hash,
      variables,
    }
  }

  it('reports match when hashes are identical', () => {
    const src = { Theme: mkSnap({ a: { type: 'FLOAT', modes: { default: 'V:F:1' } } }, 'abc') }
    const tgt = { 'v4 Theme': mkSnap({ a: { type: 'FLOAT', modes: { default: 'V:F:1' } } }, 'abc') }
    const diff = diffSnapshots(src, tgt, { Theme: 'v4 Theme' })
    expect(diff).toHaveLength(1)
    expect(diff[0].status).toBe('match')
    expect(diff[0].sourceHash).toBe('abc')
    expect(diff[0].targetHash).toBe('abc')
  })

  it('reports value drift when hashes differ', () => {
    const src = { Theme: mkSnap({ a: { type: 'FLOAT', modes: { default: 'V:F:1' } } }, 'hash_source') }
    const tgt = { 'v4 Theme': mkSnap({ a: { type: 'FLOAT', modes: { default: 'V:F:2' } } }, 'hash_target') }
    const diff = diffSnapshots(src, tgt, { Theme: 'v4 Theme' })
    expect(diff).toHaveLength(1)
    expect(diff[0].status).toBe('drift')
    expect(diff[0].driftCount).toBe(1)
    expect(diff[0].drifts[0]).toEqual({
      name: 'a',
      mode: 'default',
      expected: 'V:F:1',
      actual: 'V:F:2',
      kind: 'value',
    })
  })

  it('flags variables present in source but missing in target', () => {
    const src = { Theme: mkSnap({
      a: { type: 'FLOAT', modes: { default: 'V:F:1' } },
      b: { type: 'FLOAT', modes: { default: 'V:F:2' } },
    }, 'h1') }
    const tgt = { 'v4 Theme': mkSnap({
      a: { type: 'FLOAT', modes: { default: 'V:F:1' } },
    }, 'h2') }
    const diff = diffSnapshots(src, tgt, { Theme: 'v4 Theme' })
    expect(diff[0].status).toBe('drift')
    const missing = diff[0].drifts.find((d) => d.kind === 'missing-in-target')
    expect(missing).toBeDefined()
    expect(missing.name).toBe('b')
  })

  it('flags variables extra in target', () => {
    const src = { Theme: mkSnap({
      a: { type: 'FLOAT', modes: { default: 'V:F:1' } },
    }, 'h1') }
    const tgt = { 'v4 Theme': mkSnap({
      a: { type: 'FLOAT', modes: { default: 'V:F:1' } },
      z: { type: 'FLOAT', modes: { default: 'V:F:99' } },
    }, 'h2') }
    const diff = diffSnapshots(src, tgt, { Theme: 'v4 Theme' })
    expect(diff[0].status).toBe('drift')
    const extra = diff[0].drifts.find((d) => d.kind === 'extra-in-target')
    expect(extra).toBeDefined()
    expect(extra.name).toBe('z')
  })

  it('flags type-mismatch independently of value', () => {
    const src = { Theme: mkSnap({ a: { type: 'FLOAT', modes: { default: 'V:F:1' } } }, 'h1') }
    const tgt = { 'v4 Theme': mkSnap({ a: { type: 'STRING', modes: { default: 'V:S:"1"' } } }, 'h2') }
    const diff = diffSnapshots(src, tgt, { Theme: 'v4 Theme' })
    expect(diff[0].status).toBe('drift')
    const tm = diff[0].drifts.find((d) => d.kind === 'type-mismatch')
    expect(tm).toBeDefined()
    expect(tm.expected).toBe('FLOAT')
    expect(tm.actual).toBe('STRING')
  })

  it('reports missing-target when a mapped collection is absent from target', () => {
    const src = { Theme: mkSnap({ a: { type: 'FLOAT', modes: { default: 'V:F:1' } } }, 'h1') }
    const tgt = {}
    const diff = diffSnapshots(src, tgt, { Theme: 'v4 Theme' })
    expect(diff[0].status).toBe('missing-target')
  })

  it('reports missing-source when a mapped collection is absent from source', () => {
    const src = {}
    const tgt = { 'v4 Theme': mkSnap({ a: { type: 'FLOAT', modes: { default: 'V:F:1' } } }, 'h1') }
    const diff = diffSnapshots(src, tgt, { Theme: 'v4 Theme' })
    expect(diff[0].status).toBe('missing-source')
  })

  it('returns empty when collection map is empty', () => {
    expect(diffSnapshots({}, {}, {})).toEqual([])
  })

  it('processes multiple collections independently', () => {
    const src = {
      Theme: mkSnap({ a: { type: 'FLOAT', modes: { default: 'V:F:1' } } }, 'h1'),
      Palette: mkSnap({ b: { type: 'FLOAT', modes: { default: 'V:F:2' } } }, 'h2'),
    }
    const tgt = {
      'v4 Theme': mkSnap({ a: { type: 'FLOAT', modes: { default: 'V:F:1' } } }, 'h1'),
      'v4 Palette': mkSnap({ b: { type: 'FLOAT', modes: { default: 'V:F:99' } } }, 'hDiff'),
    }
    const diff = diffSnapshots(src, tgt, { Theme: 'v4 Theme', Palette: 'v4 Palette' })
    expect(diff).toHaveLength(2)
    const themeStatus = diff.find((d) => d.collection === 'v4 Theme').status
    const paletteStatus = diff.find((d) => d.collection === 'v4 Palette').status
    expect(themeStatus).toBe('match')
    expect(paletteStatus).toBe('drift')
  })
})
