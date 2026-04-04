import { describe, it, expect } from 'vitest'
import { stripEsm, getTreeTraversalSource, getDetectSource, buildPreamble, emitScript } from './script-emitter.js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, unlinkSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('stripEsm', () => {
  it('removes import statements', () => {
    const tmp = resolve(__dirname, '__test-strip-1.js')
    writeFileSync(tmp, "import { foo } from './bar.js'\nfunction test() { return 1 }\n")
    try {
      const result = stripEsm(tmp)
      expect(result).not.toContain('import')
      expect(result).toContain('function test()')
    } finally { unlinkSync(tmp) }
  })

  it('converts export function to plain function', () => {
    const tmp = resolve(__dirname, '__test-strip-2.js')
    writeFileSync(tmp, 'export function myFunc() { return 2 }\n')
    try {
      const result = stripEsm(tmp)
      expect(result).not.toContain('export')
      expect(result).toContain('function myFunc()')
    } finally { unlinkSync(tmp) }
  })

  it('converts export const to plain const', () => {
    const tmp = resolve(__dirname, '__test-strip-3.js')
    writeFileSync(tmp, 'export const FOO = 42\n')
    try {
      const result = stripEsm(tmp)
      expect(result).not.toMatch(/^export\s/m)
      expect(result).toContain('const FOO = 42')
    } finally { unlinkSync(tmp) }
  })

  it('removes export blocks', () => {
    const tmp = resolve(__dirname, '__test-strip-4.js')
    writeFileSync(tmp, 'function a() {}\nexport { a }\n')
    try {
      expect(stripEsm(tmp)).not.toMatch(/^export\s/m)
    } finally { unlinkSync(tmp) }
  })
})

describe('getTreeTraversalSource', () => {
  it('returns a string containing traverseNodes', () => {
    const source = getTreeTraversalSource()
    expect(typeof source).toBe('string')
    expect(source).toContain('function traverseNodes')
  })

  it('strips ESM syntax', () => {
    const source = getTreeTraversalSource()
    expect(source).not.toMatch(/^import\s/m)
    expect(source).not.toMatch(/^export\s/m)
  })
})

describe('getDetectSource', () => {
  it('returns detect.js source for lint-canvas', () => {
    const source = getDetectSource('lint-canvas')
    expect(source).toContain('function auditPage')
  })

  it('strips ESM syntax from lint-casing', () => {
    const source = getDetectSource('lint-casing')
    expect(source).not.toMatch(/^import\s/m)
    expect(source).not.toMatch(/^export\s/m)
    expect(source).toContain('function detectCasingIssues')
  })
})

describe('buildPreamble', () => {
  it('includes page filter variables', () => {
    const p = buildPreamble({ pages: ['Components'], excludePages: ['.labs'] })
    expect(p).toContain('"Components"')
    expect(p).toContain('".labs"')
    expect(p).toContain('function shouldIncludePage')
  })

  it('defaults to null filters', () => {
    const p = buildPreamble()
    expect(p).toContain('PAGE_ALLOW = null')
    expect(p).toContain('PAGE_DENY = null')
  })
})

describe('emitScript', () => {
  it('produces a self-contained script without tree-traversal', () => {
    const script = emitScript('lint-canvas', 'return { ok: true };', {}, { treeTraversal: false })
    expect(script).toContain('function shouldIncludePage')
    expect(script).toContain('function auditPage')
    expect(script).toContain('return { ok: true }')
    expect(script).not.toContain('function traverseNodes')
  })

  it('includes tree-traversal when requested', () => {
    const script = emitScript('lint-casing', 'return {};', {}, { treeTraversal: true })
    expect(script).toContain('function traverseNodes')
    expect(script).toContain('function detectCasingIssues')
  })
})
