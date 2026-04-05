import { describe, it, expect } from 'vitest'
import { auditA11yTargetSizes } from './index.js'

/** Helper to build a minimal Figma file structure */
function makeFileData(pages) {
  return { document: { children: pages } }
}

function makePage(name, children) {
  return { id: '0:1', name, type: 'CANVAS', children }
}

function makeComponentSet(name, variants) {
  return {
    id: `cs:${name}`,
    name,
    type: 'COMPONENT_SET',
    children: variants.map((v, i) => ({
      id: `v:${name}:${i}`,
      name: v.name,
      type: 'COMPONENT',
      absoluteBoundingBox: { width: v.width, height: v.height },
    })),
  }
}

describe('auditA11yTargetSizes', () => {
  it('reports failing components in the summary', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Checkbox', [{ name: 'v=true', width: 17, height: 17 }]),
        makeComponentSet('Button', [{ name: 'size=md', width: 66, height: 33 }]),
      ]),
    ])

    const report = await auditA11yTargetSizes({ fileKey: 'test', fileData })

    expect(report.title).toContain('Target Sizes')
    expect(report.summary.totalChecked).toBe(2)
    expect(report.summary.passing).toBe(1)
    expect(report.summary.failing).toBe(1)
    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].componentName).toBe('Checkbox')
  })

  it('returns no issues when all components pass', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Button', [{ name: 'size=md', width: 66, height: 33 }]),
        makeComponentSet('Select', [{ name: 'size=md', width: 190, height: 33 }]),
      ]),
    ])

    const report = await auditA11yTargetSizes({ fileKey: 'test', fileData })

    expect(report.summary.failing).toBe(0)
    expect(report.issues).toHaveLength(0)
  })

  it('respects page filter', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Checkbox', [{ name: 'v=true', width: 17, height: 17 }]),
      ]),
      makePage('Icons', [
        makeComponentSet('Radio', [{ name: 'v=true', width: 17, height: 17 }]),
      ]),
    ])

    const report = await auditA11yTargetSizes({
      fileKey: 'test',
      fileData,
      pages: ['Components'],
    })

    expect(report.summary.totalChecked).toBe(1)
    expect(report.issues[0].componentName).toBe('Checkbox')
  })

  it('enriches issues with Figma URLs', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Radio', [{ name: 'v=true', width: 17, height: 17 }]),
      ]),
    ])

    const report = await auditA11yTargetSizes({ fileKey: 'abc123', fileData })

    expect(report.issues[0].figmaUrl).toContain('abc123')
    expect(report.issues[0].figmaUrl).toContain('node-id=')
  })

  it('counts severity levels correctly', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Checkbox', [{ name: 'v=true', width: 17, height: 17 }]),
        makeComponentSet('Radio', [{ name: 'v=true', width: 10, height: 10 }]),
      ]),
    ])

    const report = await auditA11yTargetSizes({ fileKey: 'test', fileData })

    expect(report.summary.highSeverity).toBe(1)
    expect(report.summary.mediumSeverity).toBe(1)
  })
})
