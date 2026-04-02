import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFigmaClient } from './figma-client.js'

describe('createFigmaClient', () => {
  it('throws if no access token is provided', () => {
    expect(() => createFigmaClient()).toThrow('Figma access token is required')
    expect(() => createFigmaClient({})).toThrow('Figma access token is required')
    expect(() => createFigmaClient({ accessToken: '' })).toThrow('Figma access token is required')
  })

  it('creates a client with required methods', () => {
    const client = createFigmaClient({ accessToken: 'test-token' })
    expect(client).toHaveProperty('getFile')
    expect(client).toHaveProperty('getFileNodes')
    expect(client).toHaveProperty('getFileComponents')
    expect(client).toHaveProperty('getLocalVariables')
  })

  describe('API requests', () => {
    let client

    beforeEach(() => {
      client = createFigmaClient({ accessToken: 'test-token' })
      global.fetch = vi.fn()
    })

    it('getFile makes correct request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document: {} }),
      })

      const result = await client.getFile('abc123')
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123',
        { headers: { 'X-Figma-Token': 'test-token' } }
      )
      expect(result).toEqual({ document: {} })
    })

    it('getFile passes query params', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ document: {} }),
      })

      await client.getFile('abc123', { depth: 2 })
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123?depth=2',
        expect.any(Object)
      )
    })

    it('getFileNodes makes correct request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ nodes: {} }),
      })

      await client.getFileNodes('abc123', ['1:2', '3:4'])
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/files/abc123/nodes?ids='),
        expect.any(Object)
      )
    })

    it('getFileComponents makes correct request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ meta: { components: [] } }),
      })

      await client.getFileComponents('abc123')
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/components',
        expect.any(Object)
      )
    })

    it('getLocalVariables makes correct request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ meta: { variables: {} } }),
      })

      await client.getLocalVariables('abc123')
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/abc123/variables/local',
        expect.any(Object)
      )
    })

    it('throws on API error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      })

      await expect(client.getFile('abc123')).rejects.toThrow('Figma API error (403): Forbidden')
    })
  })
})
