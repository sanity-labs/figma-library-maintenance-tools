import { describe, it, expect } from 'vitest'
import {
  isAutoLayoutNode,
  getUnboundProperties,
  classifyValue,
  buildSpaceScale,
  detectUnboundValues,
} from './detect.js'

describe('isAutoLayoutNode', () => {
  it('returns true for a node with layoutMode "HORIZONTAL"', () => {
    expect(isAutoLayoutNode({ layoutMode: 'HORIZONTAL' })).toBe(true)
  })

  it('returns true for a node with layoutMode "VERTICAL"', () => {
    expect(isAutoLayoutNode({ layoutMode: 'VERTICAL' })).toBe(true)
  })

  it('returns false for a node with layoutMode "NONE"', () => {
    expect(isAutoLayoutNode({ layoutMode: 'NONE' })).toBe(false)
  })

  it('returns false for a node with no layoutMode property', () => {
    expect(isAutoLayoutNode({})).toBe(false)
  })

  it('returns false for a node with layoutMode undefined', () => {
    expect(isAutoLayoutNode({ layoutMode: undefined })).toBe(false)
  })

  it('returns false for a node with layoutMode null', () => {
    expect(isAutoLayoutNode({ layoutMode: null })).toBe(false)
  })
})

describe('getUnboundProperties', () => {
  it('returns empty array when all properties are bound', () => {
    const node = {
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
      itemSpacing: 4,
      boundVariables: {
        paddingTop: { id: 'v1', type: 'VARIABLE_ALIAS' },
        paddingRight: { id: 'v2', type: 'VARIABLE_ALIAS' },
        paddingBottom: { id: 'v3', type: 'VARIABLE_ALIAS' },
        paddingLeft: { id: 'v4', type: 'VARIABLE_ALIAS' },
        itemSpacing: { id: 'v5', type: 'VARIABLE_ALIAS' },
      },
    }

    const result = getUnboundProperties(node)

    expect(result).toEqual([])
  })

  it('returns one entry when paddingTop is unbound but others are bound', () => {
    const node = {
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
      itemSpacing: 4,
      boundVariables: {
        paddingRight: { id: 'v2', type: 'VARIABLE_ALIAS' },
        paddingBottom: { id: 'v3', type: 'VARIABLE_ALIAS' },
        paddingLeft: { id: 'v4', type: 'VARIABLE_ALIAS' },
        itemSpacing: { id: 'v5', type: 'VARIABLE_ALIAS' },
      },
    }

    const result = getUnboundProperties(node)

    expect(result).toEqual([{ property: 'paddingTop', rawValue: 8 }])
  })

  it('returns all 5 properties when boundVariables is missing entirely', () => {
    const node = {
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
      itemSpacing: 4,
    }

    const result = getUnboundProperties(node)

    expect(result).toHaveLength(5)
    expect(result).toEqual([
      { property: 'paddingTop', rawValue: 8 },
      { property: 'paddingRight', rawValue: 16 },
      { property: 'paddingBottom', rawValue: 8 },
      { property: 'paddingLeft', rawValue: 16 },
      { property: 'itemSpacing', rawValue: 4 },
    ])
  })

  it('includes zero values that are unbound', () => {
    const node = {
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      itemSpacing: 0,
    }

    const result = getUnboundProperties(node)

    expect(result).toHaveLength(5)
    expect(result[0]).toEqual({ property: 'paddingTop', rawValue: 0 })
    expect(result[4]).toEqual({ property: 'itemSpacing', rawValue: 0 })
  })

  it('only returns properties that actually exist on the node', () => {
    const node = {
      paddingTop: 8,
      itemSpacing: 12,
    }

    const result = getUnboundProperties(node)

    expect(result).toHaveLength(2)
    expect(result).toEqual([
      { property: 'paddingTop', rawValue: 8 },
      { property: 'itemSpacing', rawValue: 12 },
    ])
  })

  it('returns empty array when boundVariables is present but node has no spacing properties', () => {
    const node = {
      boundVariables: {},
    }

    const result = getUnboundProperties(node)

    expect(result).toEqual([])
  })

  it('handles boundVariables with an empty object for a property as unbound', () => {
    const node = {
      paddingTop: 8,
      paddingRight: 16,
      boundVariables: {
        paddingTop: { id: 'v1', type: 'VARIABLE_ALIAS' },
        paddingRight: null,
      },
    }

    const result = getUnboundProperties(node)

    expect(result).toEqual([{ property: 'paddingRight', rawValue: 16 }])
  })
})

describe('classifyValue', () => {
  /**
   * Helper to build a standard space scale for tests.
   *
   * @returns {Map<number, string>} A space scale Map
   */
  function buildTestScale() {
    return new Map([
      [0, 'Space/0'],
      [4, 'Space/1'],
      [8, 'Space/2'],
      [12, 'Space/3'],
      [16, 'Space/4'],
      [24, 'Space/5'],
      [32, 'Space/6'],
    ])
  }

  it('returns bindable with suggestedVariable when value is in the scale', () => {
    const scale = buildTestScale()

    const result = classifyValue(8, scale)

    expect(result.status).toBe('bindable')
    expect(result.suggestedVariable).toBe('Space/2')
  })

  it('returns bindable for value 0 when 0 is in the scale', () => {
    const scale = buildTestScale()

    const result = classifyValue(0, scale)

    expect(result.status).toBe('bindable')
    expect(result.suggestedVariable).toBe('Space/0')
  })

  it('returns exception for negative values', () => {
    const scale = buildTestScale()

    const result = classifyValue(-4, scale)

    expect(result.status).toBe('exception')
    expect(result.suggestedVariable).toBeUndefined()
    expect(result.nearestVariables).toBeUndefined()
  })

  it('returns off-scale with nearest variables for value 10 between 8 and 12', () => {
    const scale = buildTestScale()

    const result = classifyValue(10, scale)

    expect(result.status).toBe('off-scale')
    expect(result.nearestVariables).toContain('8')
    expect(result.nearestVariables).toContain('12')
    expect(result.nearestVariables).toContain('Space/2')
    expect(result.nearestVariables).toContain('Space/3')
  })

  it('returns off-scale with nearest variables for a value larger than all scale entries', () => {
    const scale = buildTestScale()

    const result = classifyValue(40, scale)

    expect(result.status).toBe('off-scale')
    expect(result.nearestVariables).toContain('32')
    expect(result.nearestVariables).toContain('24')
  })

  it('returns off-scale with nearest variables for a value between 0 and the smallest positive entry', () => {
    const scale = buildTestScale()

    const result = classifyValue(2, scale)

    expect(result.status).toBe('off-scale')
    expect(result.nearestVariables).toContain('0')
    expect(result.nearestVariables).toContain('4')
  })

  it('handles an empty scale', () => {
    const scale = new Map()

    const result = classifyValue(8, scale)

    expect(result.status).toBe('off-scale')
    expect(result.nearestVariables).toBe('no variables in scale')
  })

  it('handles a scale with a single value', () => {
    const scale = new Map([[8, 'Space/2']])

    const result = classifyValue(10, scale)

    expect(result.status).toBe('off-scale')
    expect(result.nearestVariables).toContain('Space/2')
    expect(result.nearestVariables).toContain('8')
  })

  it('returns bindable for every exact scale value', () => {
    const scale = buildTestScale()

    for (const [value, name] of scale) {
      const result = classifyValue(value, scale)
      expect(result.status).toBe('bindable')
      expect(result.suggestedVariable).toBe(name)
    }
  })

  it('returns exception for large negative values', () => {
    const scale = buildTestScale()

    const result = classifyValue(-100, scale)

    expect(result.status).toBe('exception')
  })
})

describe('buildSpaceScale', () => {
  it('correctly extracts Space collection variables into a Map', () => {
    const response = {
      meta: {
        variableCollections: {
          coll1: {
            id: 'coll1',
            name: 'Space',
            modes: [{ modeId: 'm1', name: 'Default' }],
          },
        },
        variables: {
          v1: {
            name: 'Space/0',
            resolvedType: 'FLOAT',
            variableCollectionId: 'coll1',
            valuesByMode: { m1: 0 },
          },
          v2: {
            name: 'Space/1',
            resolvedType: 'FLOAT',
            variableCollectionId: 'coll1',
            valuesByMode: { m1: 4 },
          },
          v3: {
            name: 'Space/2',
            resolvedType: 'FLOAT',
            variableCollectionId: 'coll1',
            valuesByMode: { m1: 8 },
          },
        },
      },
    }

    const scale = buildSpaceScale(response)

    expect(scale).toBeInstanceOf(Map)
    expect(scale.size).toBe(3)
    expect(scale.get(0)).toBe('Space/0')
    expect(scale.get(4)).toBe('Space/1')
    expect(scale.get(8)).toBe('Space/2')
  })

  it('returns empty Map for empty variables response', () => {
    const response = {
      meta: {
        variableCollections: {},
        variables: {},
      },
    }

    const scale = buildSpaceScale(response)

    expect(scale).toBeInstanceOf(Map)
    expect(scale.size).toBe(0)
  })

  it('returns empty Map when there is no Space collection', () => {
    const response = {
      meta: {
        variableCollections: {
          coll1: {
            id: 'coll1',
            name: 'Color',
            modes: [{ modeId: 'm1', name: 'Light' }],
          },
        },
        variables: {
          v1: {
            name: 'Color/Primary',
            resolvedType: 'COLOR',
            variableCollectionId: 'coll1',
            valuesByMode: { m1: { r: 1, g: 0, b: 0 } },
          },
        },
      },
    }

    const scale = buildSpaceScale(response)

    expect(scale).toBeInstanceOf(Map)
    expect(scale.size).toBe(0)
  })

  it('matches collection name case-insensitively', () => {
    const response = {
      meta: {
        variableCollections: {
          coll1: {
            id: 'coll1',
            name: 'SPACING',
            modes: [{ modeId: 'm1', name: 'Default' }],
          },
        },
        variables: {
          v1: {
            name: 'SPACING/sm',
            resolvedType: 'FLOAT',
            variableCollectionId: 'coll1',
            valuesByMode: { m1: 4 },
          },
        },
      },
    }

    const scale = buildSpaceScale(response)

    expect(scale.size).toBe(1)
    expect(scale.get(4)).toBe('SPACING/sm')
  })

  it('ignores non-FLOAT variables in the Space collection', () => {
    const response = {
      meta: {
        variableCollections: {
          coll1: {
            id: 'coll1',
            name: 'Space',
            modes: [{ modeId: 'm1', name: 'Default' }],
          },
        },
        variables: {
          v1: {
            name: 'Space/0',
            resolvedType: 'FLOAT',
            variableCollectionId: 'coll1',
            valuesByMode: { m1: 0 },
          },
          v2: {
            name: 'Space/Color',
            resolvedType: 'COLOR',
            variableCollectionId: 'coll1',
            valuesByMode: { m1: { r: 1, g: 0, b: 0 } },
          },
        },
      },
    }

    const scale = buildSpaceScale(response)

    expect(scale.size).toBe(1)
    expect(scale.get(0)).toBe('Space/0')
  })

  it('ignores variables from other collections', () => {
    const response = {
      meta: {
        variableCollections: {
          coll1: {
            id: 'coll1',
            name: 'Space',
            modes: [{ modeId: 'm1', name: 'Default' }],
          },
          coll2: {
            id: 'coll2',
            name: 'Radius',
            modes: [{ modeId: 'm2', name: 'Default' }],
          },
        },
        variables: {
          v1: {
            name: 'Space/0',
            resolvedType: 'FLOAT',
            variableCollectionId: 'coll1',
            valuesByMode: { m1: 0 },
          },
          v2: {
            name: 'Radius/sm',
            resolvedType: 'FLOAT',
            variableCollectionId: 'coll2',
            valuesByMode: { m2: 4 },
          },
        },
      },
    }

    const scale = buildSpaceScale(response)

    expect(scale.size).toBe(1)
    expect(scale.get(0)).toBe('Space/0')
    expect(scale.has(4)).toBe(false)
  })

  it('returns empty Map when response is null or undefined', () => {
    expect(buildSpaceScale(null).size).toBe(0)
    expect(buildSpaceScale(undefined).size).toBe(0)
  })

  it('returns empty Map when meta is missing', () => {
    const scale = buildSpaceScale({})

    expect(scale.size).toBe(0)
  })

  it('uses the first mode value when multiple modes exist', () => {
    const response = {
      meta: {
        variableCollections: {
          coll1: {
            id: 'coll1',
            name: 'Space',
            modes: [
              { modeId: 'mode-default', name: 'Default' },
              { modeId: 'mode-compact', name: 'Compact' },
            ],
          },
        },
        variables: {
          v1: {
            name: 'Space/md',
            resolvedType: 'FLOAT',
            variableCollectionId: 'coll1',
            valuesByMode: {
              'mode-default': 16,
              'mode-compact': 8,
            },
          },
        },
      },
    }

    const scale = buildSpaceScale(response)

    expect(scale.size).toBe(1)
    expect(scale.get(16)).toBe('Space/md')
    expect(scale.has(8)).toBe(false)
  })
})

describe('detectUnboundValues', () => {
  /**
   * Builds a standard space scale for integration tests.
   *
   * @returns {Map<number, string>} A space scale Map
   */
  function buildTestScale() {
    return new Map([
      [0, 'Space/0'],
      [4, 'Space/1'],
      [8, 'Space/2'],
      [12, 'Space/3'],
      [16, 'Space/4'],
    ])
  }

  it('returns only unbound issues for a component with mixed bound and unbound values', () => {
    const scale = buildTestScale()
    const component = {
      id: 'comp-1',
      name: 'Button',
      type: 'COMPONENT',
      children: [
        {
          id: 'frame-1',
          name: 'Container',
          type: 'FRAME',
          layoutMode: 'HORIZONTAL',
          paddingTop: 8,
          paddingRight: 16,
          paddingBottom: 8,
          paddingLeft: 16,
          itemSpacing: 4,
          boundVariables: {
            paddingTop: { id: 'v1', type: 'VARIABLE_ALIAS' },
            paddingBottom: { id: 'v3', type: 'VARIABLE_ALIAS' },
          },
        },
      ],
    }

    const issues = detectUnboundValues(component, 'Button', null, scale)

    expect(issues).toHaveLength(3)
    const properties = issues.map((i) => i.property)
    expect(properties).toContain('paddingRight')
    expect(properties).toContain('paddingLeft')
    expect(properties).toContain('itemSpacing')
    expect(properties).not.toContain('paddingTop')
    expect(properties).not.toContain('paddingBottom')
  })

  it('returns empty array for a component with no auto-layout nodes', () => {
    const scale = buildTestScale()
    const component = {
      id: 'comp-2',
      name: 'Icon',
      type: 'COMPONENT',
      children: [
        {
          id: 'rect-1',
          name: 'Background',
          type: 'RECTANGLE',
        },
        {
          id: 'vec-1',
          name: 'Shape',
          type: 'VECTOR',
        },
      ],
    }

    const issues = detectUnboundValues(component, 'Icon', null, scale)

    expect(issues).toEqual([])
  })

  it('checks nested auto-layout nodes at all depths', () => {
    const scale = buildTestScale()
    const component = {
      id: 'comp-3',
      name: 'Card',
      type: 'COMPONENT',
      children: [
        {
          id: 'outer-1',
          name: 'Outer',
          type: 'FRAME',
          layoutMode: 'VERTICAL',
          paddingTop: 16,
          paddingRight: 16,
          paddingBottom: 16,
          paddingLeft: 16,
          itemSpacing: 8,
          children: [
            {
              id: 'inner-1',
              name: 'Inner',
              type: 'FRAME',
              layoutMode: 'HORIZONTAL',
              paddingTop: 4,
              paddingRight: 4,
              paddingBottom: 4,
              paddingLeft: 4,
              itemSpacing: 12,
            },
          ],
        },
      ],
    }

    const issues = detectUnboundValues(component, 'Card', null, scale)

    // Both frames have no boundVariables, so all 10 properties are unbound
    expect(issues).toHaveLength(10)

    const outerIssues = issues.filter((i) => i.nodeId === 'outer-1')
    const innerIssues = issues.filter((i) => i.nodeId === 'inner-1')

    expect(outerIssues).toHaveLength(5)
    expect(innerIssues).toHaveLength(5)
  })

  it('populates issue fields correctly for a standalone component', () => {
    const scale = buildTestScale()
    const component = {
      id: 'comp-4',
      name: 'Badge',
      type: 'COMPONENT',
      children: [
        {
          id: 'frame-1',
          name: 'Content',
          type: 'FRAME',
          layoutMode: 'HORIZONTAL',
          paddingTop: 4,
          itemSpacing: 8,
        },
      ],
    }

    const issues = detectUnboundValues(component, 'Badge', null, scale)

    expect(issues).toHaveLength(2)

    const paddingIssue = issues.find((i) => i.property === 'paddingTop')
    expect(paddingIssue).toBeDefined()
    expect(paddingIssue.componentName).toBe('Badge')
    expect(paddingIssue.layerName).toBe('Content')
    expect(paddingIssue.nodeId).toBe('frame-1')
    expect(paddingIssue.rawValue).toBe(4)
    expect(paddingIssue.status).toBe('bindable')
    expect(paddingIssue.suggestedVariable).toBe('Space/1')
    expect(paddingIssue.variantName).toBeUndefined()
  })

  it('populates variantName when provided', () => {
    const scale = buildTestScale()
    const variant = {
      id: 'var-1',
      name: 'Size=Large',
      type: 'COMPONENT',
      children: [
        {
          id: 'frame-1',
          name: 'Wrapper',
          type: 'FRAME',
          layoutMode: 'VERTICAL',
          paddingTop: 12,
        },
      ],
    }

    const issues = detectUnboundValues(variant, 'ButtonSet', 'Size=Large', scale)

    expect(issues).toHaveLength(1)
    expect(issues[0].componentName).toBe('ButtonSet')
    expect(issues[0].variantName).toBe('Size=Large')
  })

  it('classifies off-scale values correctly', () => {
    const scale = buildTestScale()
    const component = {
      id: 'comp-5',
      name: 'Widget',
      type: 'COMPONENT',
      children: [
        {
          id: 'frame-1',
          name: 'Body',
          type: 'FRAME',
          layoutMode: 'HORIZONTAL',
          paddingTop: 10,
        },
      ],
    }

    const issues = detectUnboundValues(component, 'Widget', null, scale)

    expect(issues).toHaveLength(1)
    expect(issues[0].status).toBe('off-scale')
    expect(issues[0].nearestVariables).toContain('8')
    expect(issues[0].nearestVariables).toContain('12')
  })

  it('classifies negative values as exceptions', () => {
    const scale = buildTestScale()
    const component = {
      id: 'comp-6',
      name: 'Overlap',
      type: 'COMPONENT',
      children: [
        {
          id: 'frame-1',
          name: 'Stack',
          type: 'FRAME',
          layoutMode: 'HORIZONTAL',
          itemSpacing: -8,
        },
      ],
    }

    const issues = detectUnboundValues(component, 'Overlap', null, scale)

    expect(issues).toHaveLength(1)
    expect(issues[0].status).toBe('exception')
    expect(issues[0].rawValue).toBe(-8)
  })

  it('returns empty array for a component with no children', () => {
    const scale = buildTestScale()
    const component = {
      id: 'comp-7',
      name: 'Empty',
      type: 'COMPONENT',
    }

    const issues = detectUnboundValues(component, 'Empty', null, scale)

    expect(issues).toEqual([])
  })

  it('skips non-auto-layout nodes and only reports auto-layout ones', () => {
    const scale = buildTestScale()
    const component = {
      id: 'comp-8',
      name: 'Mixed',
      type: 'COMPONENT',
      children: [
        {
          id: 'non-al',
          name: 'Static',
          type: 'FRAME',
          layoutMode: 'NONE',
          paddingTop: 999,
        },
        {
          id: 'al-frame',
          name: 'AutoFrame',
          type: 'FRAME',
          layoutMode: 'VERTICAL',
          paddingTop: 8,
        },
      ],
    }

    const issues = detectUnboundValues(component, 'Mixed', null, scale)

    expect(issues).toHaveLength(1)
    expect(issues[0].nodeId).toBe('al-frame')
    expect(issues[0].layerName).toBe('AutoFrame')
  })

  it('also checks the component root node if it is auto-layout', () => {
    const scale = buildTestScale()
    const component = {
      id: 'comp-9',
      name: 'RootAL',
      type: 'COMPONENT',
      layoutMode: 'HORIZONTAL',
      paddingTop: 4,
      itemSpacing: 8,
    }

    const issues = detectUnboundValues(component, 'RootAL', null, scale)

    expect(issues).toHaveLength(2)
    expect(issues[0].nodeId).toBe('comp-9')
    expect(issues[1].nodeId).toBe('comp-9')
  })
})
