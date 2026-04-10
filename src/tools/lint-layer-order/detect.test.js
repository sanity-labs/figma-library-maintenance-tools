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
  getVariantPosition,
  checkVariantOrder,
  ROW_TOLERANCE,
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

  it('includes variantOrder issues when position data is available', () => {
    // Variants with positions in wrong order (top-left should be last in array)
    const page = makePage('Components', [
      makeComponentSet('Button', [
        makePositionedVariant('s=enabled', [], 0, 0),   // top-left — should be last
        makePositionedVariant('s=hovered', [], 100, 0),  // top-right — should be before last
      ]),
    ])
    const issues = auditLayerOrder(page)
    expect(issues.map((i) => i.category)).toContain('variantOrder')
  })
})

// ── Positioned variant helper ──────────────────────────────────────

function makePositionedVariant(name, layerNames, x, y, opts = {}) {
  return {
    id: `v:${name}`,
    name,
    type: 'COMPONENT',
    x,
    y,
    children: layerNames.map((n, i) => ({
      id: `l:${name}:${i}`,
      name: n,
      type: 'FRAME',
      layoutPositioning: opts.absoluteLayers?.includes(n) ? 'ABSOLUTE' : 'AUTO',
    })),
  }
}

// ── getVariantPosition ─────────────────────────────────────────────

describe('getVariantPosition', () => {
  it('reads x/y from direct properties (Plugin API format)', () => {
    expect(getVariantPosition({ x: 100, y: 200 })).toEqual({ x: 100, y: 200 })
  })

  it('reads x/y from absoluteBoundingBox (REST API format)', () => {
    expect(getVariantPosition({
      absoluteBoundingBox: { x: 50, y: 75, width: 100, height: 40 },
    })).toEqual({ x: 50, y: 75 })
  })

  it('prefers direct x/y over absoluteBoundingBox', () => {
    expect(getVariantPosition({
      x: 10, y: 20,
      absoluteBoundingBox: { x: 99, y: 99, width: 1, height: 1 },
    })).toEqual({ x: 10, y: 20 })
  })

  it('returns null when no position data is available', () => {
    expect(getVariantPosition({ id: 'v:1', name: 'v', type: 'COMPONENT' })).toBeNull()
  })

  it('returns null for partial position data (x only)', () => {
    expect(getVariantPosition({ x: 10 })).toBeNull()
  })
})

// ── checkVariantOrder ──────────────────────────────────────────────

describe('checkVariantOrder', () => {
  it('returns no issues when variants are in correct spatial order', () => {
    // Correct order: array should be y-desc, x-desc (so panel reads top-left first)
    // Canvas: A(0,0) B(100,0) C(0,50) D(100,50)
    // Panel should read: A B C D (top-left to bottom-right)
    // Array must be: D C B A (reversed)
    const cs = makeComponentSet('Button', [
      makePositionedVariant('D', [], 100, 50),  // array[0] = bottom-right
      makePositionedVariant('C', [], 0, 50),     // array[1]
      makePositionedVariant('B', [], 100, 0),    // array[2]
      makePositionedVariant('A', [], 0, 0),      // array[3] = top-left (top of panel)
    ])
    expect(checkVariantOrder(cs, 'Components')).toHaveLength(0)
  })

  it('flags variants not in spatial order', () => {
    // Array is in forward spatial order (wrong — should be reversed)
    const cs = makeComponentSet('Button', [
      makePositionedVariant('A', [], 0, 0),      // top-left first in array = wrong
      makePositionedVariant('B', [], 100, 0),
      makePositionedVariant('C', [], 0, 50),
      makePositionedVariant('D', [], 100, 50),    // bottom-right last = wrong
    ])
    const issues = checkVariantOrder(cs, 'Components')
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('variantOrder')
    expect(issues[0].componentName).toBe('Button')
    expect(issues[0].message).toContain('4')
  })

  it('reports the component set node ID, not a variant ID', () => {
    const cs = makeComponentSet('Badge', [
      makePositionedVariant('A', [], 0, 0),
      makePositionedVariant('B', [], 100, 0),
    ])
    const issues = checkVariantOrder(cs, 'Page')
    expect(issues).toHaveLength(1)
    expect(issues[0].nodeId).toBe('cs:Badge')
  })

  it('groups variants on the same row using tolerance', () => {
    // A and B are on the same row (y differs by 1px, within ROW_TOLERANCE)
    // C and D are on the next row
    // Correct array order: D, C, B, A (y-desc then x-desc)
    const cs = makeComponentSet('X', [
      makePositionedVariant('D', [], 100, 51),
      makePositionedVariant('C', [], 0, 50),
      makePositionedVariant('B', [], 100, 1),    // same row as A (within tolerance)
      makePositionedVariant('A', [], 0, 0),
    ])
    expect(checkVariantOrder(cs, 'P')).toHaveLength(0)
  })

  it('skips component sets with fewer than 2 variants', () => {
    const cs = makeComponentSet('Spinner', [
      makePositionedVariant('default', [], 0, 0),
    ])
    expect(checkVariantOrder(cs, 'P')).toHaveLength(0)
  })

  it('skips when position data is missing', () => {
    const cs = makeComponentSet('X', [
      makeVariant('a', ['one']),
      makeVariant('b', ['two']),
    ])
    expect(checkVariantOrder(cs, 'P')).toHaveLength(0)
  })

  it('works with absoluteBoundingBox (REST API format)', () => {
    const cs = makeComponentSet('Card', [
      {
        id: 'v:B', name: 'B', type: 'COMPONENT',
        absoluteBoundingBox: { x: 100, y: 0, width: 80, height: 40 },
        children: [],
      },
      {
        id: 'v:A', name: 'A', type: 'COMPONENT',
        absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 40 },
        children: [],
      },
    ])
    // B(100,0) then A(0,0) — y-desc tie, x-desc: B first, A second. Correct!
    expect(checkVariantOrder(cs, 'P')).toHaveLength(0)
  })

  it('handles a 3×2 grid correctly', () => {
    // Canvas grid (3 cols × 2 rows):
    //   A(0,0)   B(100,0)   C(200,0)
    //   D(0,50)  E(100,50)  F(200,50)
    //
    // Panel should read: A B C D E F
    // Array must be reversed: F E D C B A
    const cs = makeComponentSet('Grid', [
      makePositionedVariant('F', [], 200, 50),
      makePositionedVariant('E', [], 100, 50),
      makePositionedVariant('D', [], 0, 50),
      makePositionedVariant('C', [], 200, 0),
      makePositionedVariant('B', [], 100, 0),
      makePositionedVariant('A', [], 0, 0),
    ])
    expect(checkVariantOrder(cs, 'P')).toHaveLength(0)
  })

  it('flags a 3×2 grid with scrambled order', () => {
    const cs = makeComponentSet('Grid', [
      makePositionedVariant('A', [], 0, 0),      // wrong position
      makePositionedVariant('C', [], 200, 0),
      makePositionedVariant('B', [], 100, 0),
      makePositionedVariant('F', [], 200, 50),
      makePositionedVariant('E', [], 100, 50),
      makePositionedVariant('D', [], 0, 50),
    ])
    const issues = checkVariantOrder(cs, 'P')
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('variantOrder')
  })
})
