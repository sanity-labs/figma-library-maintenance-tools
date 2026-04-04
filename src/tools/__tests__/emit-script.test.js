import { describe, it, expect } from 'vitest'
import { getVariantLintScript } from '../lint-variants/script.js'
import { getCasingLintScript } from '../lint-casing/script.js'
import { getCanvasLintScript } from '../lint-canvas/script.js'

describe('emit-script integration', () => {
  describe('getVariantLintScript', () => {
    it('includes detection functions and page filtering', () => {
      const script = getVariantLintScript()
      expect(script).toContain('function auditComponentSetVariants')
      expect(script).toContain('function detectSingleValueVariants')
      expect(script).toContain('function detectDuplicateVariantNames')
      expect(script).toContain('function shouldIncludePage')
    })

    it('bakes in page filters', () => {
      const script = getVariantLintScript({ pages: ['Components'] })
      expect(script).toContain('"Components"')
    })

    it('bakes in includeGaps option', () => {
      expect(getVariantLintScript({ includeGaps: true })).toContain('INCLUDE_GAPS = true')
      expect(getVariantLintScript({ includeGaps: false })).toContain('INCLUDE_GAPS = false')
    })

    it('returns a report structure', () => {
      const script = getVariantLintScript()
      expect(script).toContain("title: 'Variant Lint'")
      expect(script).toContain('singleValueVariants')
    })

    it('does not include tree-traversal', () => {
      expect(getVariantLintScript()).not.toContain('function traverseNodes')
    })
  })

  describe('getCasingLintScript', () => {
    it('includes detection functions and tree-traversal', () => {
      const script = getCasingLintScript()
      expect(script).toContain('function detectCasingIssues')
      expect(script).toContain('function hasUppercase')
      expect(script).toContain('function traverseNodes')
    })

    it('bakes in textOnly option', () => {
      expect(getCasingLintScript({ textOnly: true })).toContain('TEXT_ONLY = true')
      expect(getCasingLintScript({ textOnly: false })).toContain('TEXT_ONLY = false')
    })
  })

  describe('getCanvasLintScript', () => {
    it('includes detection functions', () => {
      const script = getCanvasLintScript()
      expect(script).toContain('function auditPage')
      expect(script).toContain('function detectOriginDrift')
      expect(script).toContain('function detectPageNameWhitespace')
    })

    it('does not include tree-traversal', () => {
      expect(getCanvasLintScript()).not.toContain('function traverseNodes')
    })

    it('bakes in page filters', () => {
      expect(getCanvasLintScript({ excludePages: ['.labs'] })).toContain('".labs"')
    })
  })
})
