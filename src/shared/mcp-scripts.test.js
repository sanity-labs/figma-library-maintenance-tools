import { describe, it, expect } from 'vitest'
import { getFileScript, getLocalVariablesScript } from './mcp-scripts.js'

describe('getFileScript', () => {
  it('returns a non-empty string', () => {
    const script = getFileScript()
    expect(typeof script).toBe('string')
    expect(script.length).toBeGreaterThan(100)
  })

  it('contains figma.root reference for Plugin API', () => {
    const script = getFileScript()
    expect(script).toContain('figma.root')
  })

  it('returns a document structure in the return statement', () => {
    const script = getFileScript()
    expect(script).toContain('return { document: document }')
  })

  it('injects page filter when pageNames are provided', () => {
    const script = getFileScript({ pageNames: ['Components', 'Primitives'] })
    expect(script).toContain('"Components"')
    expect(script).toContain('"Primitives"')
  })

  it('sets PAGE_FILTER to null when no pageNames provided', () => {
    const script = getFileScript()
    expect(script).toContain('const PAGE_FILTER = null')
  })

  it('injects depth limit when provided', () => {
    const script = getFileScript({ depth: 3 })
    expect(script).toContain('const MAX_DEPTH = 3')
  })

  it('sets MAX_DEPTH to Infinity when no depth provided', () => {
    const script = getFileScript()
    expect(script).toContain('const MAX_DEPTH = Infinity')
  })

  it('extracts boundVariables with variable resolution', () => {
    const script = getFileScript()
    expect(script).toContain('boundVariables')
    expect(script).toContain('figma.variables.getVariableById')
  })

  it('extracts componentPropertyDefinitions with type guard', () => {
    const script = getFileScript()
    expect(script).toContain('componentPropertyDefinitions')
    // Should guard against accessing on variant components
    expect(script).toContain('COMPONENT_SET')
    expect(script).toContain('COMPONENT')
    expect(script).toContain('try')
  })

  it('extracts description field', () => {
    const script = getFileScript()
    expect(script).toContain('description')
  })

  it('extracts auto-layout properties', () => {
    const script = getFileScript()
    expect(script).toContain('layoutMode')
    expect(script).toContain('paddingTop')
    expect(script).toContain('itemSpacing')
  })
})

describe('getLocalVariablesScript', () => {
  it('returns a non-empty string', () => {
    const script = getLocalVariablesScript()
    expect(typeof script).toBe('string')
    expect(script.length).toBeGreaterThan(100)
  })

  it('returns data in the REST API shape with meta wrapper', () => {
    const script = getLocalVariablesScript()
    expect(script).toContain('return {')
    expect(script).toContain('meta:')
    expect(script).toContain('variableCollections:')
    expect(script).toContain('variables:')
  })

  it('uses getLocalVariableCollections from Plugin API', () => {
    const script = getLocalVariablesScript()
    expect(script).toContain('figma.variables.getLocalVariableCollections')
  })

  it('handles variable aliases', () => {
    const script = getLocalVariablesScript()
    expect(script).toContain('VARIABLE_ALIAS')
  })

  it('includes resolvedType for each variable', () => {
    const script = getLocalVariablesScript()
    expect(script).toContain('resolvedType')
  })

  it('sets COLLECTION_FILTER to null when no filter provided', () => {
    const script = getLocalVariablesScript()
    expect(script).toContain('const COLLECTION_FILTER = null')
  })

  it('injects collection filter pattern when provided', () => {
    const script = getLocalVariablesScript({ collectionFilter: 'spac(e|ing)' })
    expect(script).toContain('"spac(e|ing)"')
    expect(script).toContain('RegExp')
  })

  it('skips non-matching collections when filter is set', () => {
    const script = getLocalVariablesScript({ collectionFilter: 'space' })
    expect(script).toContain('continue')
  })
})
