import { describe, it, expect } from 'vitest'
import { planImport, formatPlanSummary } from './index.js'

function paletteBundle() {
  return {
    color: {
      palette: {
        $type: 'color',
        blue: { 500: { $value: '#0066ff' } },
        neutral: { 0: { $value: '#ffffff' }, 900: { $value: '#1a1a1a' } },
      },
    },
  }
}

function lightBundle() {
  return {
    color: {
      semantic: {
        $type: 'color',
        bg: { default: { $value: '{color.palette.neutral.0}' } },
        action: { primary: { $value: '{color.palette.blue.500}' } },
      },
    },
  }
}

function darkBundle() {
  return {
    color: {
      semantic: {
        $type: 'color',
        bg: { default: { $value: '{color.palette.neutral.900}' } },
        action: { primary: { $value: '{color.palette.blue.500}' } },
      },
    },
  }
}

const SAMPLE_CONFIG = {
  collections: [
    {
      name: 'Palette',
      tokenPrefix: 'color.palette',
      modes: [{ name: 'default', dtcg: paletteBundle() }],
    },
    {
      name: 'Theme',
      tokenPrefix: 'color.semantic',
      modes: [
        { name: 'light', dtcg: lightBundle() },
        { name: 'dark', dtcg: darkBundle() },
      ],
    },
  ],
}

describe('planImport', () => {
  it('produces a plan with no errors from a clean inline config', async () => {
    const { plan, declaredVarNames } = await planImport({ config: SAMPLE_CONFIG })
    expect(plan.errors).toEqual([])
    // Variables: 3 palette + 2 semantic = 5 unique names.
    expect(declaredVarNames).toHaveLength(5)
    expect(declaredVarNames).toContain('color/palette/blue/500')
    expect(declaredVarNames).toContain('color/semantic/action/primary')
  })

  it('orders palette primitives before semantic aliases that reference them', async () => {
    const { plan } = await planImport({ config: SAMPLE_CONFIG })
    const ops = plan.operations
    const blueIdx = ops.findIndex(
      (o) => o.kind === 'set-value' && o.name === 'color/palette/blue/500',
    )
    const primaryIdx = ops.findIndex(
      (o) =>
        o.kind === 'set-alias' &&
        o.name === 'color/semantic/action/primary' &&
        o.modeName === 'light',
    )
    expect(blueIdx).toBeGreaterThanOrEqual(0)
    expect(primaryIdx).toBeGreaterThanOrEqual(0)
    expect(blueIdx).toBeLessThan(primaryIdx)
  })

  it('falls back to readJson when modes specify file paths', async () => {
    const config = {
      collections: [
        {
          name: 'Palette',
          tokenPrefix: 'color.palette',
          modes: [{ name: 'default', file: 'palette.json' }],
        },
      ],
    }
    const readJson = async (filePath) => {
      if (filePath === 'palette.json') return paletteBundle()
      throw new Error(`unexpected file: ${filePath}`)
    }
    const { plan } = await planImport({ config, readJson })
    expect(plan.errors).toEqual([])
    expect(plan.operations.length).toBeGreaterThan(0)
  })

  it('errors when a mode has neither file nor dtcg', async () => {
    const config = {
      collections: [
        {
          name: 'X',
          tokenPrefix: 'color.x',
          modes: [{ name: 'default' }],
        },
      ],
    }
    await expect(planImport({ config })).rejects.toThrow(/neither dtcg nor file/)
  })
})

describe('formatPlanSummary', () => {
  it('reports counts for each operation kind', async () => {
    const { plan } = await planImport({ config: SAMPLE_CONFIG })
    const text = formatPlanSummary(plan)
    expect(text).toContain('create-variable:')
    expect(text).toContain('set-value:')
    expect(text).toContain('set-alias:')
    expect(text).toContain('errors:          0')
  })
})
