import { describe, it, expect } from 'vitest'
import { lintVariants } from './index.js'

function cs(name, id, variantNames) {
  return { type: 'COMPONENT_SET', name, id, children: variantNames.map((vn, i) => ({ type: 'COMPONENT', name: vn, id: `${id}:${i + 1}` })) }
}
function pg(name, children) { return { type: 'CANVAS', name, id: '0:1', children } }
function fd(pages) { return { document: { children: pages } } }

describe('lintVariants', () => {
  it('detects single-value variants', async () => {
    const r = await lintVariants({ fileKey: 't', fileData: fd([pg('C', [cs('Badge', '1:1', ['font size=1, state=enabled, tone=default', 'font size=1, state=hovered, tone=primary'])])]) })
    expect(r.summary.singleValueVariants).toBe(1)
  })
  it('detects duplicate variant names', async () => {
    const r = await lintVariants({ fileKey: 't', fileData: fd([pg('C', [cs('Select', '2:1', ['s=1, st=e', 's=1, st=h', 's=1, st=e'])])]) })
    expect(r.summary.duplicateVariantNames).toBe(1)
  })
  it('detects coverage gaps when includeGaps is true', async () => {
    const r = await lintVariants({ fileKey: 't', fileData: fd([pg('C', [cs('TA', '3:1', ['s=1, st=e', 's=2, st=e', 's=2, st=h'])])]), includeGaps: true })
    expect(r.summary.coverageGaps).toBe(1)
  })
  it('does not include coverage gaps by default', async () => {
    const r = await lintVariants({ fileKey: 't', fileData: fd([pg('C', [cs('TA', '3:1', ['s=1, st=e', 's=2, st=e', 's=2, st=h'])])]) })
    expect(r.summary.coverageGaps).toBe(0)
  })
  it('respects pages filter', async () => {
    const r = await lintVariants({ fileKey: 't', fileData: fd([pg('C', [cs('B', '4:1', ['f=1, s=e'])]), pg('I', [])]), pages: ['I'] })
    expect(r.summary.totalComponentSets).toBe(0)
  })
  it('scans inside sections', async () => {
    const r = await lintVariants({ fileKey: 't', fileData: fd([pg('C', [{ type: 'SECTION', name: 'B', id: '6:0', children: [cs('B', '6:1', ['scheme=light, state=enabled'])] }])]) })
    expect(r.summary.singleValueVariants).toBe(2)
  })
  it('adds figmaUrl to issues', async () => {
    const r = await lintVariants({ fileKey: 'k', fileData: fd([pg('C', [cs('KBD', '7:1', ['p=1'])])]) })
    for (const i of r.issues) expect(i.figmaUrl).toContain('k')
  })
  it('returns clean report for healthy file', async () => {
    const r = await lintVariants({ fileKey: 't', fileData: fd([pg('C', [cs('Btn', '8:1', ['s=1, st=e', 's=1, st=h', 's=2, st=e', 's=2, st=h'])])]) })
    expect(r.summary.totalIssues).toBe(0)
  })
})
