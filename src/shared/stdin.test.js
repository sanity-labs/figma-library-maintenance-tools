import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We can't easily mock process.stdin in a unit test, so we test the parsing
// logic by extracting the core behavior into testable pieces.  The actual
// stdin piping is a thin wrapper that's verified by integration tests.

describe('readStdin', () => {
  let originalStdin

  beforeEach(() => {
    originalStdin = process.stdin
  })

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true })
  })

  /**
   * Helper: creates a fake async-iterable stdin that yields the given string.
   */
  function mockStdin(content) {
    const chunks = [Buffer.from(content)]
    Object.defineProperty(process, 'stdin', {
      value: {
        [Symbol.asyncIterator]() {
          let i = 0
          return {
            next() {
              if (i < chunks.length) {
                return Promise.resolve({ value: chunks[i++], done: false })
              }
              return Promise.resolve({ done: true })
            },
          }
        },
      },
      writable: true,
    })
  }

  it('parses a wrapped payload with fileData', async () => {
    const payload = {
      fileData: { document: { id: '0:0', children: [] } },
    }
    mockStdin(JSON.stringify(payload))

    const { readStdin } = await import('./stdin.js')
    const result = await readStdin()

    expect(result.fileData).toEqual(payload.fileData)
  })

  it('parses a wrapped payload with fileData and variablesData', async () => {
    const payload = {
      fileData: { document: { id: '0:0', children: [] } },
      variablesData: { meta: { variables: {}, variableCollections: {} } },
    }
    mockStdin(JSON.stringify(payload))

    const { readStdin } = await import('./stdin.js')
    const result = await readStdin()

    expect(result.fileData).toEqual(payload.fileData)
    expect(result.variablesData).toEqual(payload.variablesData)
  })

  it('accepts a bare document object (direct MCP output)', async () => {
    const bare = { document: { id: '0:0', children: [] } }
    mockStdin(JSON.stringify(bare))

    const { readStdin } = await import('./stdin.js')
    const result = await readStdin()

    expect(result.fileData).toEqual(bare)
  })

  it('throws on empty stdin', async () => {
    mockStdin('')

    const { readStdin } = await import('./stdin.js')
    await expect(readStdin()).rejects.toThrow('No data received on stdin')
  })

  it('throws on invalid JSON', async () => {
    mockStdin('not json{{{')

    const { readStdin } = await import('./stdin.js')
    await expect(readStdin()).rejects.toThrow('Failed to parse stdin as JSON')
  })

  it('throws when payload has neither document nor fileData', async () => {
    mockStdin(JSON.stringify({ something: 'else' }))

    const { readStdin } = await import('./stdin.js')
    await expect(readStdin()).rejects.toThrow('Invalid stdin payload')
  })
})
