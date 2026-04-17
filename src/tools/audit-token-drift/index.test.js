import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auditTokenDrift, SANITY_V4_COLLECTION_MAP } from './index.js'

vi.mock('../../shared/figma-client.js', () => ({
  createFigmaClient: vi.fn(),
}))

import { createFigmaClient } from '../../shared/figma-client.js'

function buildMatchingDataset() {
  return {
    meta: {
      variableCollections: {
        c1: { id: 'c1', name: 'Theme', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] },
      },
      variables: {
        v1: { id: 'v1', name: 'bg', variableCollectionId: 'c1', resolvedType: 'COLOR', valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } } },
      },
    },
  }
}

function buildDriftedDataset() {
  return {
    meta: {
      variableCollections: {
        c1: { id: 'c1', name: 'v4 Theme', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] },
      },
      variables: {
        v1: { id: 'v1', name: 'bg', variableCollectionId: 'c1', resolvedType: 'COLOR', valuesByMode: { m1: { r: 0, g: 0, b: 0, a: 1 } } },
      },
    },
  }
}

describe('auditTokenDrift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a report with the correct title', async () => {
    const report = await auditTokenDrift({
      sourceData: buildMatchingDataset(),
      targetData: buildMatchingDataset(),
      collectionMap: { Theme: 'Theme' },
    })
    expect(report.title).toBe('Token Drift Audit')
  })

  it('reports all match when source and target are identical', async () => {
    const report = await auditTokenDrift({
      sourceData: buildMatchingDataset(),
      targetData: buildMatchingDataset(),
      collectionMap: { Theme: 'Theme' },
    })
    expect(report.summary.totalCollections).toBe(1)
    expect(report.summary.matched).toBe(1)
    expect(report.summary.drifted).toBe(0)
    expect(report.summary.totalDrifts).toBe(0)
  })

  it('reports drift when target differs from source', async () => {
    const report = await auditTokenDrift({
      sourceData: buildMatchingDataset(),
      targetData: buildDriftedDataset(),
      collectionMap: { Theme: 'v4 Theme' },
    })
    expect(report.summary.drifted).toBe(1)
    expect(report.summary.totalDrifts).toBe(1)
    expect(report.issues[0].status).toBe('drift')
    expect(report.issues[0].drifts[0].name).toBe('bg')
  })

  it('uses the default SANITY_V4_COLLECTION_MAP when collectionMap is omitted', async () => {
    // Source has "Theme"; target doesn't have "v4 Theme" → missing-target expected
    const report = await auditTokenDrift({
      sourceData: buildMatchingDataset(),
      targetData: { meta: { variableCollections: {}, variables: {} } },
    })
    // The default map has 6 entries — all should come back as missing-target
    // (except Theme, which is missing-target). Actually: source has Theme but
    // not Palette/Color scheme/etc, so those are all missing-source with the
    // default map, and Theme is missing-target.
    expect(report.summary.totalCollections).toBe(Object.keys(SANITY_V4_COLLECTION_MAP).length)
  })

  it('fetches source and target via REST API when only keys are provided', async () => {
    const mockClient = {
      getLocalVariables: vi.fn()
        .mockResolvedValueOnce(buildMatchingDataset())
        .mockResolvedValueOnce(buildMatchingDataset()),
    }
    createFigmaClient.mockReturnValue(mockClient)

    const report = await auditTokenDrift({
      accessToken: 'tok',
      sourceFileKey: 'src123',
      targetFileKey: 'tgt456',
      collectionMap: { Theme: 'Theme' },
    })

    expect(createFigmaClient).toHaveBeenCalledWith({ accessToken: 'tok' })
    expect(mockClient.getLocalVariables).toHaveBeenCalledTimes(2)
    expect(mockClient.getLocalVariables).toHaveBeenNthCalledWith(1, 'src123')
    expect(mockClient.getLocalVariables).toHaveBeenNthCalledWith(2, 'tgt456')
    expect(report.summary.matched).toBe(1)
  })

  it('uses source branchKey as effective file key when provided', async () => {
    const mockClient = {
      getLocalVariables: vi.fn()
        .mockResolvedValueOnce(buildMatchingDataset())
        .mockResolvedValueOnce(buildMatchingDataset()),
    }
    createFigmaClient.mockReturnValue(mockClient)

    await auditTokenDrift({
      accessToken: 'tok',
      sourceFileKey: 'mainSource',
      sourceBranchKey: 'branchSource',
      targetFileKey: 'mainTarget',
      targetBranchKey: 'branchTarget',
      collectionMap: { Theme: 'Theme' },
    })

    expect(mockClient.getLocalVariables).toHaveBeenNthCalledWith(1, 'branchSource')
    expect(mockClient.getLocalVariables).toHaveBeenNthCalledWith(2, 'branchTarget')
  })

  it('supports mixed mode: pre-fetched source with REST-fetched target', async () => {
    const mockClient = {
      getLocalVariables: vi.fn().mockResolvedValue(buildMatchingDataset()),
    }
    createFigmaClient.mockReturnValue(mockClient)

    await auditTokenDrift({
      accessToken: 'tok',
      sourceData: buildMatchingDataset(),
      targetFileKey: 'tgt',
      collectionMap: { Theme: 'Theme' },
    })

    // Only target was fetched
    expect(mockClient.getLocalVariables).toHaveBeenCalledTimes(1)
    expect(mockClient.getLocalVariables).toHaveBeenCalledWith('tgt')
  })

  it('throws when neither accessToken nor full pre-fetched data are provided', async () => {
    await expect(
      auditTokenDrift({
        sourceFileKey: 'src',
        targetFileKey: 'tgt',
      })
    ).rejects.toThrow(/accessToken is required/)
  })

  it('throws when sourceFileKey is missing in REST mode', async () => {
    await expect(
      auditTokenDrift({
        accessToken: 'tok',
        targetFileKey: 'tgt',
      })
    ).rejects.toThrow(/sourceFileKey is required/)
  })

  it('throws when targetFileKey is missing in REST mode', async () => {
    await expect(
      auditTokenDrift({
        accessToken: 'tok',
        sourceFileKey: 'src',
      })
    ).rejects.toThrow(/targetFileKey is required/)
  })

  it('reports missing-source and missing-target independently', async () => {
    // Source has Theme only; target has v4 Palette only; map expects both
    const src = {
      meta: {
        variableCollections: {
          c1: { id: 'c1', name: 'Theme', modes: [{ modeId: 'm1', name: 'default' }], variableIds: [] },
        },
        variables: {},
      },
    }
    const tgt = {
      meta: {
        variableCollections: {
          c2: { id: 'c2', name: 'v4 Palette', modes: [{ modeId: 'm2', name: 'default' }], variableIds: [] },
        },
        variables: {},
      },
    }

    const report = await auditTokenDrift({
      sourceData: src,
      targetData: tgt,
      collectionMap: { Theme: 'v4 Theme', Palette: 'v4 Palette' },
    })

    expect(report.summary.missingTarget).toBe(1) // Theme → v4 Theme missing in target
    expect(report.summary.missingSource).toBe(1) // Palette missing in source
  })

  it('summary.totalDrifts counts drifts across all collections', async () => {
    const src = {
      meta: {
        variableCollections: {
          c1: { id: 'c1', name: 'Theme', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] },
          c2: { id: 'c2', name: 'Palette', modes: [{ modeId: 'm2', name: 'default' }], variableIds: ['v2'] },
        },
        variables: {
          v1: { id: 'v1', name: 'a', variableCollectionId: 'c1', resolvedType: 'FLOAT', valuesByMode: { m1: 1 } },
          v2: { id: 'v2', name: 'b', variableCollectionId: 'c2', resolvedType: 'FLOAT', valuesByMode: { m2: 2 } },
        },
      },
    }
    const tgt = {
      meta: {
        variableCollections: {
          c1: { id: 'c1', name: 'Theme', modes: [{ modeId: 'm1', name: 'default' }], variableIds: ['v1'] },
          c2: { id: 'c2', name: 'Palette', modes: [{ modeId: 'm2', name: 'default' }], variableIds: ['v2'] },
        },
        variables: {
          v1: { id: 'v1', name: 'a', variableCollectionId: 'c1', resolvedType: 'FLOAT', valuesByMode: { m1: 99 } },
          v2: { id: 'v2', name: 'b', variableCollectionId: 'c2', resolvedType: 'FLOAT', valuesByMode: { m2: 99 } },
        },
      },
    }

    const report = await auditTokenDrift({
      sourceData: src,
      targetData: tgt,
      collectionMap: { Theme: 'Theme', Palette: 'Palette' },
    })
    expect(report.summary.drifted).toBe(2)
    expect(report.summary.totalDrifts).toBe(2)
  })
})
