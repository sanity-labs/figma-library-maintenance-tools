import { describe, it, expect } from 'vitest'
import { hasUppercase, toLowercase, isExempt, detectCasingIssues } from './detect.js'

describe('hasUppercase', () => {
  it('returns true for names with uppercase', () => { expect(hasUppercase('Value')).toBe(true) })
  it('returns false for lowercase names', () => { expect(hasUppercase('value')).toBe(false) })
  it('returns false for no letters', () => { expect(hasUppercase('123')).toBe(false) })
})

describe('toLowercase', () => {
  it('lowercases the name', () => { expect(toLowercase('Value')).toBe('value') })
  it('returns lowercase unchanged', () => { expect(toLowercase('value')).toBe('value') })
})

describe('isExempt', () => {
  it('exempts INSTANCE layers', () => { expect(isExempt('Badge', 'INSTANCE')).toBe(true) })
  it('does not exempt TEXT layers', () => { expect(isExempt('Badge', 'TEXT')).toBe(false) })
  it('does not exempt FRAME layers', () => { expect(isExempt('Container', 'FRAME')).toBe(false) })
})

describe('detectCasingIssues', () => {
  it('detects uppercase text layer names', () => {
    const node = { name: 'state=enabled', type: 'COMPONENT', id: '1:1', children: [
      { name: 'Value', type: 'TEXT', id: '1:2' },
      { name: 'label', type: 'TEXT', id: '1:3' },
    ] }
    const issues = detectCasingIssues(node, 'TextInput', 'state=enabled')
    expect(issues).toHaveLength(1)
    expect(issues[0].layerName).toBe('Value')
    expect(issues[0].expectedName).toBe('value')
    expect(issues[0].variantName).toBe('state=enabled')
  })
  it('skips INSTANCE layers', () => {
    const node = { name: 'root', type: 'COMPONENT', id: '2:1', children: [
      { name: 'Badge', type: 'INSTANCE', id: '2:2' },
      { name: 'Badge', type: 'TEXT', id: '2:3' },
    ] }
    const issues = detectCasingIssues(node, 'MenuItem', null)
    expect(issues).toHaveLength(1)
    expect(issues[0].layerType).toBe('TEXT')
  })
  it('checks all layers when textOnly is false', () => {
    const node = { name: 'component', type: 'COMPONENT', id: '3:1', children: [
      { name: 'Container', type: 'FRAME', id: '3:2' },
      { name: 'Label', type: 'TEXT', id: '3:3' },
    ] }
    expect(detectCasingIssues(node, 'Test', null, { textOnly: false })).toHaveLength(2)
  })
  it('skips the root component node', () => {
    const node = { name: 'ComponentName', type: 'COMPONENT', id: '5:1', children: [{ name: 'label', type: 'TEXT', id: '5:2' }] }
    expect(detectCasingIssues(node, 'ComponentName', null)).toHaveLength(0)
  })
  it('traverses nested children', () => {
    const node = { name: 'root', type: 'COMPONENT', id: '6:1', children: [
      { name: 'wrapper', type: 'FRAME', id: '6:2', children: [{ name: 'Title', type: 'TEXT', id: '6:3' }] },
    ] }
    expect(detectCasingIssues(node, 'Toast', 'status=info')).toHaveLength(1)
  })
  it('returns empty for clean component', () => {
    const node = { name: 'root', type: 'COMPONENT', id: '7:1', children: [
      { name: 'label', type: 'TEXT', id: '7:2' }, { name: 'description', type: 'TEXT', id: '7:3' },
    ] }
    expect(detectCasingIssues(node, 'Badge', null)).toHaveLength(0)
  })
  it('omits variantName when null', () => {
    const node = { name: 'standalone', type: 'COMPONENT', id: '8:1', children: [{ name: 'Title', type: 'TEXT', id: '8:2' }] }
    const issues = detectCasingIssues(node, 'TabList', null)
    expect(issues[0].variantName).toBeUndefined()
  })
})
