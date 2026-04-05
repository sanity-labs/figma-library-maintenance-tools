import { describe, it, expect } from 'vitest'
import { auditA11yMissingStates } from './index.js'

function makeFileData(pages) {
  return { document: { children: pages } }
}

function makePage(name, children) {
  return { id: '0:1', name, type: 'CANVAS', children }
}

function makeComponentSet(name, variantNames) {
  return {
    id: `cs:${name}`,
    name,
    type: 'COMPONENT_SET',
    children: variantNames.map((v, i) => ({
      id: `v:${name}:${i}`,
      name: v,
      type: 'COMPONENT',
    })),
  }
}

describe('auditA11yMissingStates', () => {
  it('reports missing states in the summary', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Checkbox', ['value=true', 'value=false']),
      ]),
    ])

    const report = await auditA11yMissingStates({ fileKey: 'test', fileData })

    expect(report.title).toContain('Missing Interactive States')
    expect(report.summary.incomplete).toBe(1)
    expect(report.summary.totalMissingStates).toBeGreaterThan(0)
    expect(report.issues.length).toBeGreaterThan(0)
  })

  it('reports complete when all states are present', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Button', [
          'state=enabled',
          'state=hovered',
          'state=focused',
          'state=disabled',
          'state=pressed',
        ]),
      ]),
    ])

    const report = await auditA11yMissingStates({ fileKey: 'test', fileData })

    expect(report.summary.complete).toBe(1)
    expect(report.summary.incomplete).toBe(0)
    const buttonIssues = report.issues.filter((i) => i.componentName === 'Button')
    expect(buttonIssues).toHaveLength(0)
  })

  it('respects page filter', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Checkbox', ['value=true']),
      ]),
      makePage('Icons', [
        makeComponentSet('Radio', ['value=true']),
      ]),
    ])

    const report = await auditA11yMissingStates({
      fileKey: 'test',
      fileData,
      pages: ['Components'],
    })

    const componentNames = report.issues.map((i) => i.componentName)
    expect(componentNames).toContain('Checkbox')
    expect(componentNames).not.toContain('Radio')
  })

  it('enriches issues with Figma URLs', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Radio', ['value=true']),
      ]),
    ])

    const report = await auditA11yMissingStates({ fileKey: 'abc123', fileData })

    expect(report.issues[0].figmaUrl).toContain('abc123')
  })

  it('counts severity levels correctly', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        // Has state=enabled but missing focused (high) and disabled (medium)
        makeComponentSet('MenuItem', ['state=enabled', 'state=hovered']),
      ]),
    ])

    const report = await auditA11yMissingStates({ fileKey: 'test', fileData })

    expect(report.summary.highSeverity).toBeGreaterThan(0)
    expect(report.summary.mediumSeverity).toBeGreaterThan(0)
  })
})
