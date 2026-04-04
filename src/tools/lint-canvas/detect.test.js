import { describe, it, expect } from 'vitest'
import { hasWhitespacePadding, calculateOriginOffset, detectOriginDrift, detectPageNameWhitespace, auditPage } from './detect.js'

describe('hasWhitespacePadding', () => {
  it('detects trailing whitespace', () => { expect(hasWhitespacePadding('Icons ')).toBe(true) })
  it('detects leading whitespace', () => { expect(hasWhitespacePadding(' Icons')).toBe(true) })
  it('returns false for clean names', () => { expect(hasWhitespacePadding('Icons')).toBe(false) })
  it('returns false for empty string', () => { expect(hasWhitespacePadding('')).toBe(false) })
})

describe('calculateOriginOffset', () => {
  it('returns minimum x and y', () => {
    expect(calculateOriginOffset([{ x: 100, y: 50 }, { x: -200, y: 0 }, { x: 0, y: -100 }]))
      .toEqual({ offsetX: -200, offsetY: -100 })
  })
  it('returns (0,0) when at origin', () => {
    expect(calculateOriginOffset([{ x: 0, y: 0 }, { x: 100, y: 200 }]))
      .toEqual({ offsetX: 0, offsetY: 0 })
  })
  it('returns null for empty array', () => { expect(calculateOriginOffset([])).toBeNull() })
  it('returns null for undefined', () => { expect(calculateOriginOffset(undefined)).toBeNull() })
  it('handles single child', () => {
    expect(calculateOriginOffset([{ x: 500, y: 300 }])).toEqual({ offsetX: 500, offsetY: 300 })
  })
  it('defaults missing x/y to 0', () => {
    expect(calculateOriginOffset([{ x: 10 }, { y: 20 }])).toEqual({ offsetX: 0, offsetY: 0 })
  })
})

describe('detectOriginDrift', () => {
  it('returns issue when not at origin', () => {
    const issue = detectOriginDrift({ name: 'Icons', id: '0:1', children: [{ x: -500, y: -200 }] })
    expect(issue).not.toBeNull()
    expect(issue.issueType).toBe('origin-drift')
    expect(issue.offsetX).toBe(-500)
  })
  it('returns null when at origin', () => {
    expect(detectOriginDrift({ name: 'C', id: '0:2', children: [{ x: 0, y: 0 }] })).toBeNull()
  })
  it('returns null for divider pages', () => {
    expect(detectOriginDrift({ name: '---', id: '0:3', children: [] })).toBeNull()
  })
  it('returns null for empty pages', () => {
    expect(detectOriginDrift({ name: 'Empty', id: '0:4', children: [] })).toBeNull()
  })
  it('returns null for missing children', () => {
    expect(detectOriginDrift({ name: 'Bare', id: '0:5' })).toBeNull()
  })
})

describe('detectPageNameWhitespace', () => {
  it('detects trailing space', () => {
    const issue = detectPageNameWhitespace({ name: 'Icons ', id: '0:1' })
    expect(issue).not.toBeNull()
    expect(issue.trimmedName).toBe('Icons')
  })
  it('returns null for clean names', () => {
    expect(detectPageNameWhitespace({ name: 'Icons', id: '0:2' })).toBeNull()
  })
})

describe('auditPage', () => {
  it('combines both checks', () => {
    const issues = auditPage({ name: 'Icons ', id: '0:1', children: [{ x: -100, y: -50 }] })
    expect(issues).toHaveLength(2)
    expect(issues.map((i) => i.issueType).sort()).toEqual(['origin-drift', 'page-name-whitespace'])
  })
  it('returns empty for healthy page', () => {
    expect(auditPage({ name: 'Components', id: '0:2', children: [{ x: 0, y: 0 }] })).toHaveLength(0)
  })
})
