import { describe, it, expect } from 'vitest'
import { lintLayerOrder } from './index.js'

function makeVariant(name, layerNames, opts = {}) {
  return {
    id: `v:${name}`, name, type: 'COMPONENT',
    children: layerNames.map((n, i) => ({
      id: `l:${name}:${i}`, name: n, type: 'FRAME',
      layoutPositioning: opts.absoluteLayers?.includes(n) ? 'ABSOLUTE' : 'AUTO',
    })),
  }
}

function makeComponentSet(name, variants) {
  return { id: `cs:${name}`, name, type: 'COMPONENT_SET', children: variants }
}

function makeFileData(pages) { return { document: { children: pages } } }
function makePage(name, children) { return { id: '0:1', name, type: 'CANVAS', children } }

describe('lintLayerOrder', () => {
  it('reports variant inconsistency with correct summary counts', async () => {
    const fileData = makeFileData([makePage('Components', [
      makeComponentSet('MenuItem', [
        makeVariant('s=enabled', ['border', 'flex-leading', 'flex-content', 'flex-trailing']),
        makeVariant('s=hovered', ['border', 'flex-content', 'flex-leading', 'flex-trailing']),
      ]),
    ])])
    const report = await lintLayerOrder({ fileKey: 'test', fileData })
    expect(report.title).toBe('Layer Ordering Lint')
    expect(report.summary.totalIssues).toBe(1)
    expect(report.summary.variantInconsistency).toBe(1)
  })

  it('separates naming mismatches from ordering issues', async () => {
    const fileData = makeFileData([makePage('Components', [
      makeComponentSet('MenuItem', [
        makeVariant('s=enabled', ['border', 'flex-leading', 'flex-content']),
        makeVariant('s=hovered', ['border', 'Frame 1-wrapper', 'container']),
      ]),
    ])])
    const report = await lintLayerOrder({ fileKey: 'test', fileData })
    expect(report.summary.namingMismatch).toBe(1)
    expect(report.summary.variantInconsistency).toBe(0)
  })

  it('reports background and overlay positioning issues', async () => {
    const fileData = makeFileData([makePage('Components', [
      makeComponentSet('Dialog', [
        makeVariant('w=0', ['closeButton', 'flex-content', 'border'], { absoluteLayers: ['border', 'closeButton'] }),
        makeVariant('w=1', ['closeButton', 'flex-content', 'border'], { absoluteLayers: ['border', 'closeButton'] }),
      ]),
    ])])
    const report = await lintLayerOrder({ fileKey: 'test', fileData })
    expect(report.summary.backgroundPosition).toBeGreaterThan(0)
    expect(report.summary.overlayPosition).toBeGreaterThan(0)
  })

  it('returns no issues for a clean file', async () => {
    const fileData = makeFileData([makePage('Components', [
      makeComponentSet('Button', [
        makeVariant('s=enabled', ['border', 'label'], { absoluteLayers: ['border'] }),
        makeVariant('s=hovered', ['border', 'label'], { absoluteLayers: ['border'] }),
      ]),
    ])])
    const report = await lintLayerOrder({ fileKey: 'test', fileData })
    expect(report.summary.totalIssues).toBe(0)
  })

  it('respects page filter', async () => {
    const fileData = makeFileData([
      makePage('Components', [makeComponentSet('A', [
        makeVariant('v1', ['x', 'y']), makeVariant('v2', ['y', 'x']),
      ])]),
      makePage('Icons', [makeComponentSet('B', [
        makeVariant('v1', ['a', 'b']), makeVariant('v2', ['b', 'a']),
      ])]),
    ])
    const report = await lintLayerOrder({ fileKey: 'test', fileData, pages: ['Components'] })
    expect(report.issues.map((i) => i.componentName)).not.toContain('B')
  })

  it('enriches issues with Figma URLs', async () => {
    const fileData = makeFileData([makePage('Components', [
      makeComponentSet('X', [makeVariant('v1', ['a', 'b']), makeVariant('v2', ['b', 'a'])]),
    ])])
    const report = await lintLayerOrder({ fileKey: 'abc123', fileData })
    expect(report.issues[0].figmaUrl).toContain('abc123')
  })

  it('includes variantOrder in summary', async () => {
    const fileData = makeFileData([makePage('Components', [
      makeComponentSet('Button', [
        makePositionedVariant('s=enabled', ['label'], 0, 0),
        makePositionedVariant('s=hovered', ['label'], 100, 0),
      ]),
    ])])
    const report = await lintLayerOrder({ fileKey: 'test', fileData })
    expect(report.summary).toHaveProperty('variantOrder')
    // Array is forward spatial order (wrong), so variantOrder should be 1
    expect(report.summary.variantOrder).toBe(1)
  })

  it('reports variantOrder 0 when variants are in correct spatial order', async () => {
    const fileData = makeFileData([makePage('Components', [
      makeComponentSet('Button', [
        // Correct: y-desc, x-desc (bottom-right first in array)
        makePositionedVariant('s=hovered', ['label'], 100, 0),
        makePositionedVariant('s=enabled', ['label'], 0, 0),
      ]),
    ])])
    const report = await lintLayerOrder({ fileKey: 'test', fileData })
    expect(report.summary.variantOrder).toBe(0)
  })
})

function makePositionedVariant(name, layerNames, x, y, opts = {}) {
  return {
    id: `v:${name}`, name, type: 'COMPONENT', x, y,
    children: layerNames.map((n, i) => ({
      id: `l:${name}:${i}`, name: n, type: 'FRAME',
      layoutPositioning: opts.absoluteLayers?.includes(n) ? 'ABSOLUTE' : 'AUTO',
    })),
  }
}
