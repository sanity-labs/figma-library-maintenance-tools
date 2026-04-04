import { describe, it, expect } from 'vitest'
import { lintCanvas } from './index.js'

function fd(pages) { return { document: { children: pages } } }

describe('lintCanvas', () => {
  it('detects pages not at origin', async () => {
    const r = await lintCanvas({ fileKey: 't', fileData: fd([
      { name: 'Icons', id: '0:1', children: [{ x: -500, y: -200 }] },
      { name: 'Components', id: '0:2', children: [{ x: 0, y: 0 }] },
    ]) })
    expect(r.summary.totalPages).toBe(2)
    expect(r.summary.originDrift).toBe(1)
  })
  it('detects page name whitespace', async () => {
    const r = await lintCanvas({ fileKey: 't', fileData: fd([
      { name: 'Icons ', id: '0:1', children: [{ x: 0, y: 0 }] },
    ]) })
    expect(r.summary.nameWhitespace).toBe(1)
  })
  it('skips divider pages', async () => {
    const r = await lintCanvas({ fileKey: 't', fileData: fd([
      { name: '---', id: '0:1', children: [] },
      { name: 'Components', id: '0:2', children: [{ x: 0, y: 0 }] },
    ]) })
    expect(r.summary.totalPages).toBe(1)
  })
  it('respects pages filter', async () => {
    const r = await lintCanvas({ fileKey: 't', fileData: fd([
      { name: 'Icons', id: '0:1', children: [{ x: -100, y: -50 }] },
      { name: 'Components', id: '0:2', children: [{ x: 0, y: 0 }] },
    ]), pages: ['Components'] })
    expect(r.summary.originDrift).toBe(0)
  })
  it('returns clean report for healthy file', async () => {
    const r = await lintCanvas({ fileKey: 't', fileData: fd([
      { name: 'Tokens', id: '0:1', children: [{ x: 0, y: 0 }] },
      { name: 'Icons', id: '0:2', children: [{ x: 0, y: 0 }] },
    ]) })
    expect(r.summary.totalIssues).toBe(0)
  })
  it('combines both issue types', async () => {
    const r = await lintCanvas({ fileKey: 't', fileData: fd([
      { name: 'Icons ', id: '0:1', children: [{ x: -300, y: -100 }] },
    ]) })
    expect(r.summary.totalIssues).toBe(2)
  })
})
