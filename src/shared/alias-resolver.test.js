import { describe, it, expect } from 'vitest'
import {
  isAlias,
  parseAlias,
  collectAliasEdges,
  topologicalSort,
  resolveLeaf,
} from './alias-resolver.js'

describe('isAlias', () => {
  it('recognizes braced references', () => {
    expect(isAlias('{color.brand.primary}')).toBe(true)
    expect(isAlias('  {color.brand.primary}  ')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isAlias('{not closed')).toBe(false)
    expect(isAlias('not opened}')).toBe(false)
    expect(isAlias('plain string')).toBe(false)
    expect(isAlias('#0066ff')).toBe(false)
    expect(isAlias(123)).toBe(false)
    expect(isAlias(null)).toBe(false)
    expect(isAlias(undefined)).toBe(false)
    expect(isAlias({})).toBe(false)
  })
})

describe('parseAlias', () => {
  it('extracts the dotted target', () => {
    expect(parseAlias('{color.brand.primary}')).toBe('color.brand.primary')
    expect(parseAlias('{a.b.c.d.e}')).toBe('a.b.c.d.e')
  })

  it('returns null for non-aliases', () => {
    expect(parseAlias('not an alias')).toBe(null)
    expect(parseAlias(null)).toBe(null)
  })
})

describe('collectAliasEdges', () => {
  it('produces edges only for aliasing tokens', () => {
    const tokens = {
      'color.blue.500': { $value: '#0066ff' },
      'color.brand.primary': { $value: '{color.blue.500}' },
      'color.brand.emphasis': { $value: '{color.brand.primary}' },
    }
    const edges = collectAliasEdges(tokens).sort()
    expect(edges).toEqual([
      ['color.brand.emphasis', 'color.brand.primary'],
      ['color.brand.primary', 'color.blue.500'],
    ])
  })
})

describe('topologicalSort', () => {
  it('orders primitives before aliases that reference them', () => {
    const paths = ['a.alias', 'a.primitive', 'a.deepalias']
    const edges = [
      ['a.alias', 'a.primitive'],
      ['a.deepalias', 'a.alias'],
    ]
    const sorted = topologicalSort(paths, edges)
    expect(sorted.indexOf('a.primitive')).toBeLessThan(sorted.indexOf('a.alias'))
    expect(sorted.indexOf('a.alias')).toBeLessThan(sorted.indexOf('a.deepalias'))
  })

  it('throws on cycles and names the involved nodes', () => {
    const paths = ['a', 'b', 'c']
    const edges = [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]
    expect(() => topologicalSort(paths, edges)).toThrow(/Cycle.*a.*b.*c/)
  })

  it('ignores edges to unknown targets (caller validates separately)', () => {
    const sorted = topologicalSort(['a'], [['a', 'nonexistent']])
    expect(sorted).toEqual(['a'])
  })
})

describe('resolveLeaf', () => {
  it('walks a chain to a primitive value', () => {
    const tokens = {
      'a.primitive': { $value: '#0066ff' },
      'a.alias': { $value: '{a.primitive}' },
      'a.deep': { $value: '{a.alias}' },
    }
    const result = resolveLeaf('a.deep', tokens)
    expect(result.resolved).toBe('#0066ff')
    expect(result.chain).toEqual(['a.deep', 'a.alias', 'a.primitive'])
  })

  it('reports missing target without throwing', () => {
    const result = resolveLeaf('a.alias', { 'a.alias': { $value: '{nonexistent}' } })
    expect(result.resolved).toBe(undefined)
    expect(result.missing).toBe('nonexistent')
  })

  it('throws on cycle', () => {
    expect(() =>
      resolveLeaf('a', { a: { $value: '{b}' }, b: { $value: '{a}' } }),
    ).toThrow(/Cycle/)
  })
})
