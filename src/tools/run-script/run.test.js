import { describe, it, expect } from 'vitest'
import { prepareScript } from './run.js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, unlinkSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('prepareScript', () => {
  it('reads a script file and returns its contents', () => {
    const tmp = resolve(__dirname, '__test-script.js')
    writeFileSync(tmp, 'return { ok: true }')
    try {
      const result = prepareScript(tmp)
      expect(result.code).toBe('return { ok: true }')
      expect(result.filePath).toBe(tmp)
    } finally { unlinkSync(tmp) }
  })

  it('throws when file does not exist', () => {
    expect(() => prepareScript('/nonexistent/file.js')).toThrow('Script file not found')
  })

  it('throws when file is empty', () => {
    const tmp = resolve(__dirname, '__test-empty.js')
    writeFileSync(tmp, '   ')
    try {
      expect(() => prepareScript(tmp)).toThrow('Script file is empty')
    } finally { unlinkSync(tmp) }
  })

  it('preserves the full script contents', () => {
    const tmp = resolve(__dirname, '__test-full.js')
    const code = `const rect = figma.createRectangle()
rect.name = 'test'
rect.resize(200, 100)
return { nodeId: rect.id }`
    writeFileSync(tmp, code)
    try {
      expect(prepareScript(tmp).code).toBe(code)
    } finally { unlinkSync(tmp) }
  })

  it('works with the example script', () => {
    const examplePath = resolve(__dirname, '..', '..', '..', 'examples', 'add-rectangle.js')
    const result = prepareScript(examplePath)
    expect(result.code).toContain('createRectangle')
    expect(result.code).toContain('return')
  })
})
