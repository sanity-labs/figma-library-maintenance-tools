import { describe, it, expect } from 'vitest'
import { auditA11yDescriptionCoverage } from './index.js'

function makeFileData(pages) {
  return { document: { children: pages } }
}

function makePage(name, children) {
  return { id: '0:1', name, type: 'CANVAS', children }
}

function makeComponentSet(name, description) {
  return {
    id: `cs:${name}`,
    name,
    type: 'COMPONENT_SET',
    description,
    children: [{ id: `v:${name}:0`, name: 'default', type: 'COMPONENT' }],
  }
}

describe('auditA11yDescriptionCoverage', () => {
  it('reports components missing a11y notes', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Dialog', 'A modal overlay for confirmations.'),
        makeComponentSet('Button', 'An action control.'),
      ]),
    ])

    const report = await auditA11yDescriptionCoverage({ fileKey: 'test', fileData })

    expect(report.title).toContain('Description Quality')
    expect(report.summary.totalChecked).toBe(2)
    expect(report.summary.missingA11yNotes).toBe(2)
    expect(report.summary.coveragePercent).toBe(0)
    expect(report.issues).toHaveLength(2)
  })

  it('passes components with a11y keywords in descriptions', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Dialog', 'A modal dialog. Focus is trapped. Escape to close.'),
      ]),
    ])

    const report = await auditA11yDescriptionCoverage({ fileKey: 'test', fileData })

    expect(report.summary.withA11yNotes).toBe(1)
    expect(report.summary.missingA11yNotes).toBe(0)
    expect(report.issues).toHaveLength(0)
  })

  it('calculates coverage percentage', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Dialog', 'Focus trapped inside. Uses role="dialog".'),
        makeComponentSet('Button', 'An action button.'),
      ]),
    ])

    const report = await auditA11yDescriptionCoverage({ fileKey: 'test', fileData })

    expect(report.summary.coveragePercent).toBe(50)
  })

  it('respects page filter', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Dialog', 'A modal.'),
      ]),
      makePage('Other', [
        makeComponentSet('Button', 'A button.'),
      ]),
    ])

    const report = await auditA11yDescriptionCoverage({
      fileKey: 'test',
      fileData,
      pages: ['Components'],
    })

    expect(report.summary.totalChecked).toBe(1)
    expect(report.issues[0].componentName).toBe('Dialog')
  })

  it('enriches issues with Figma URLs', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Toast', 'A notification.'),
      ]),
    ])

    const report = await auditA11yDescriptionCoverage({ fileKey: 'xyz789', fileData })

    expect(report.issues[0].figmaUrl).toContain('xyz789')
  })

  it('includes recommendations in issues', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Autocomplete', 'Search with dropdown.'),
      ]),
    ])

    const report = await auditA11yDescriptionCoverage({ fileKey: 'test', fileData })

    expect(report.issues[0].recommendation).toContain('combobox')
  })

  it('returns 100% coverage when no interactive components exist', async () => {
    const fileData = makeFileData([
      makePage('Components', [
        makeComponentSet('Stack', 'A layout component.'),
      ]),
    ])

    const report = await auditA11yDescriptionCoverage({ fileKey: 'test', fileData })

    expect(report.summary.totalChecked).toBe(0)
    expect(report.summary.coveragePercent).toBe(100)
  })
})
