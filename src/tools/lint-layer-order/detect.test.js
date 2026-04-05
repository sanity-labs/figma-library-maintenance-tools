import { describe, it, expect } from 'vitest'
import {
  getChildNames,
  isAbsolutelyPositioned,
  isBackgroundLayerName,
  isOverlayLayerName,
  compareSharedOrder,
  detectNamingMismatch,
  checkAbsolutePositioning,
  checkVariantConsistency,
  auditLayerOrder,
} from './detect.js'

function makeVariant(name, layerNames, opts = {}) {
  return {
    id: `v:${name}`,
    name,
    type: 'COMPONENT',
    children: layerNames.map((n, i) => ({
      id: `l:${name}:${i}`,
      name: n,
      type: 'FRAME',
      layoutPositioning: opts.absoluteLayers?.includes(n) ? 'ABSOLUTE' : 'AUTO',
    })),
  }
}

function makeComponentSet(name, variants) {
  return { id: `cs:${name}`, name, type: 'COMPONENT_SET', children: variants }
}

function makePage(name, children) {
  return { id: '0:1', name, type: 'CANVAS', children }
}

describe('getChildNames', () => {
  it('returns layer names in order', () => {
    const node = {
      children: [
        { name: 'border', type: 'RECTANGLE' },
        { name: 'flex-leading', type: 'FRAME' },
        { name: 'flex-content', type: 'FRAME' },
      ],
    }
    expect(getChildNames(node)).toEqual(['border', 'flex-leading', 'flex-content'])
  })

  it('returns empty array when no children', () => {
    expect(getChildNames({})).toEqual([])
    expect(getChildNames({ children: [] })).toEqual([])
  })
})

describe('isAbsolutelyPositioned', () => {
  it('returns true for ABSOLUTE', () => {
    expect(isAbsolutelyPositioned({ layoutPositioning: 'ABSOLUTE' })).toBe(true)
  })

  it('returns false for AUTO', () => {
    expect(isAbsolutelyPositioned({ layoutPositioning: 'AUTO' })).toBe(false)
  })

  it('returns false when property is missing', () => {
    expect(isAbsolutelyPositioned({})).toBe(false)
  })
})

describe('isBackgroundLayerName', () => {
  it('matches known background names', () => {
    expect(isBackgroundLayerName('border')).toBe(true)
    expect(isBackgroundLayerName('background')).toBe(true)
    expect(isBackgroundLayerName('bg')).toBe(true)
    expect(isBackgroundLayerName('backdrop')).toBe(true)
    expect(isBackgroundLayerName('fill')).toBe(true)
    expect(isBackgroundLayerName('.focusRing')).toBe(true)
    expect(isBackgroundLayerName('card')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isBackgroundLayerName('Border')).toBe(true)
    expect(isBackgroundLayerName('FILL')).toBe(true)
  })

  it('rejects non-background names', () => {
    expect(isBackgroundLayerName('flex-content')).toBe(false)
    expect(isBackgroundLayerName('icon')).toBe(false)
    expect(isBackgroundLayerName('border-radius')).toBe(false)
  })
})

describe('isOverlayLayerName', () => {
  it('matches known overlay names', () => {
    expect(isOverlayLayerName('closeButton')).toBe(true)
    expect(isOverlayLayerName('overlay')).toBe(true)
    expect(isOverlayLayerName('close-button')).toBe(true)
  })

  it('rejects non-overlay names', () => {
    expect(isOverlayLayerName('button')).toBe(false)
    expect(isOverlayLayerName('flex-trailing')).toBe(false)
  })
})

describe('compareSharedOrder', () => {
  it('returns match=true when shared layers are in same order', () => {
    const canonical = ['border', 'flex-leading', 'flex-content', 'flex-trailing']
    const variant = ['border', 'flex-leading', 'flex-content', 'flex-trailing']
    const result = compareSharedOrder(canonical, variant)
    expect(result.match).toBe(true)
  })

  it('returns match=true when variant has subset in same order', () => {
    const canonical = ['border', 'flex-leading', 'flex-content', 'flex-trailing']
    const variant = ['border', 'flex-leading', 'flex-content']
    const result = compareSharedOrder(canonical, variant)
    expect(result.match).toBe(true)
  })

  it('returns match=false when shared layers are reordered', () => {
    const canonical = ['border', 'flex-leading', 'flex-content', 'flex-trailing']
    const variant = ['border', 'flex-content', 'flex-leading', 'flex-trailing']
    const result = compareSharedOrder(canonical, variant)
    expect(result.match).toBe(false)
    expect(result.sharedCanonical).toEqual(['border', 'flex-leading', 'flex-content', 'flex-trailing'])
    expect(result.sharedVariant).toEqual(['border', 'flex-content', 'flex-leading', 'flex-trailing'])
  })

  it('handles no shared layers', () => {
    const result = compareSharedOrder(['a', 'b'], ['c', 'd'])
    expect(result.match).toBe(true)
    expect(result.sharedCanonical).toEqual([])
  })
})

describe('detectNamingMismatch', () => {
  it('returns no mismatch when names are identical', () => {
    const order = ['border', 'flex-leading', 'flex-content']
    expect(detectNamingMismatch(order, order).hasMismatch).toBe(false)
  })

  it('detects missing layers', () => {
    const result = detectNamingMismatch(
      ['border', 'flex-leading', 'flex-content', 'Badge'],
      ['border', 'flex-leading', 'flex-content']
    )
    expect(result.hasMismatch).toBe(true)
    expect(result.missingFromVariant).toEqual(['Badge'])
  })

  it('detects extra layers', () => {
    const result = detectNamingMismatch(
      ['border', 'flex-leading'],
      ['border', 'flex-leading', 'extra-layer']
    )
    expect(result.hasMismatch).toBe(true)
    expect(result.extraInVariant).toEqual(['extra-layer'])
  })

  it('detects renamed layers (missing + extra)', () => {
    const result = detectNamingMismatch(
      ['border', 'flex-leading', 'flex-content'],
      ['border', 'Frame 1-wrapper', 'container']
    )
    expect(result.hasMismatch).toBe(true)
    expect(result.missingFromVariant).toEqual(['flex-leading', 'flex-content'])
    expect(result.extraInVariant).toEqual(['Frame 1-wrapper', 'container'])
  })
})

describe('checkAbsolutePositioning', () => {
  it('returns no issues when background layers are first', () => {
    const variant = makeVariant('v1', ['border', 'flex-leading', 'flex-content'], {
      absoluteLayers: ['border'],
    })
    expect(checkAbsolutePositioning(variant, 'Button', 'Components')).toHaveLength(0)
  })

  it('flags background layers that appear after content', () => {
    const variant = makeVariant('v1', ['flex-leading', 'border', 'flex-content'], {
      absoluteLayers: ['border'],
    })
    const issues = checkAbsolutePositioning(variant, 'Button', 'Components')
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('backgroundPosition')
    expect(issues[0].componentName).toBe('Button')
  })

  it('flags overlay layers that appear before content', () => {
    const variant = makeVariant('v1', ['border', 'closeButton', 'flex-content'], {
      absoluteLayers: ['border', 'closeButton'],
    })
    const issues = checkAbsolutePositioning(variant, 'Dialog', 'Components')
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('overlayPosition')
  })

  it('returns no issues when overlay is last', () => {
    const variant = makeVariant('v1', ['border', 'flex-content', 'closeButton'], {
      absoluteLayers: ['border', 'closeButton'],
    })
    expect(checkAbsolutePositioning(variant, 'Dialog', 'Components')).toHaveLength(0)
  })

  it('ignores non-absolute layers with background names', () => {
    const variant = makeVariant('v1', ['flex-leading', 'border', 'flex-content'], {
      absoluteLayers: [],
    })
    expect(checkAbsolutePositioning(variant, 'Card', 'Components')).toHaveLength(0)
  })

  it('returns empty for variants with fewer than 2 children', () => {
    expect(checkAbsolutePositioning(makeVariant('v1', ['only-child']), 'X', 'P')).toHaveLength(0)
  })
})

describe('checkVariantConsistency', () => {
  it('returns no issues when all variants have same order', () => {
    const cs = makeComponentSet('Button', [
      makeVariant('s=enabled', ['border', 'flex-leading', 'label', 'flex-trailing']),
      makeVariant('s=hovered', ['border', 'flex-leading', 'label', 'flex-trailing']),
      makeVariant('s=focused', ['border', 'flex-leading', 'label', 'flex-trailing']),
    ])
    expect(checkVariantConsistency(cs, 'Components')).toHaveLength(0)
  })

  it('flags variants with reordered shared layers', () => {
    const cs = makeComponentSet('MenuItem', [
      makeVariant('s=enabled', ['border', 'flex-leading', 'flex-content', 'flex-actions', 'flex-trailing']),
      makeVariant('s=hovered', ['border', 'flex-leading', 'flex-content', 'flex-trailing', 'flex-actions']),
    ])
    const issues = checkVariantConsistency(cs, 'Components')
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('variantInconsistency')
    expect(issues[0].variantName).toBe('s=hovered')
  })

  it('reports namingMismatch instead of ordering when names differ', () => {
    const cs = makeComponentSet('MenuItem', [
      makeVariant('s=enabled', ['border', 'flex-leading', 'flex-content']),
      makeVariant('s=hovered', ['border', 'Frame 1-wrapper', 'container']),
    ])
    const issues = checkVariantConsistency(cs, 'Components')
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('namingMismatch')
    expect(issues[0].message).toContain('Frame 1-wrapper')
  })

  it('skips component sets with fewer than 2 variants', () => {
    const cs = makeComponentSet('Spinner', [makeVariant('default', ['icon'])])
    expect(checkVariantConsistency(cs, 'Components')).toHaveLength(0)
  })

  it('sets pageName on every issue', () => {
    const cs = makeComponentSet('X', [
      makeVariant('a', ['one', 'two']),
      makeVariant('b', ['two', 'one']),
    ])
    for (const issue of checkVariantConsistency(cs, 'My Page')) {
      expect(issue.pageName).toBe('My Page')
    }
  })
})

describe('auditLayerOrder', () => {
  it('combines variant consistency and positioning issues', () => {
    const page = makePage('Components', [
      makeComponentSet('MenuItem', [
        makeVariant('s=enabled', ['border', 'flex-leading', 'flex-content'], { absoluteLayers: ['border'] }),
        makeVariant('s=hovered', ['border', 'flex-content', 'flex-leading'], { absoluteLayers: ['border'] }),
      ]),
    ])
    expect(auditLayerOrder(page).map((i) => i.category)).toContain('variantInconsistency')
  })

  it('finds component sets inside sections', () => {
    const page = makePage('Components', [
      {
        id: 's:1', name: 'Controls', type: 'SECTION',
        children: [
          makeComponentSet('Switch', [
            makeVariant('v=true', ['bg', 'thumb']),
            makeVariant('v=false', ['thumb', 'bg']),
          ]),
        ],
      },
    ])
    const issues = auditLayerOrder(page)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].componentName).toBe('Switch')
  })

  it('checks standalone components for absolute positioning', () => {
    const page = makePage('Components', [
      {
        id: 'sc:1', name: 'Menu', type: 'COMPONENT',
        children: [
          { id: 'l:1', name: 'closeButton', type: 'FRAME', layoutPositioning: 'ABSOLUTE' },
          { id: 'l:2', name: 'flex-content', type: 'FRAME', layoutPositioning: 'AUTO' },
        ],
      },
    ])
    const issues = auditLayerOrder(page)
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('overlayPosition')
  })

  it('returns empty for a page with no issues', () => {
    const page = makePage('Components', [
      makeComponentSet('Button', [
        makeVariant('s=enabled', ['border', 'label'], { absoluteLayers: ['border'] }),
        makeVariant('s=hovered', ['border', 'label'], { absoluteLayers: ['border'] }),
      ]),
    ])
    expect(auditLayerOrder(page)).toHaveLength(0)
  })
})
