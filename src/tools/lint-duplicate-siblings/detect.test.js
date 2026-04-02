import { describe, it, expect } from 'vitest'
import { findDuplicateSiblings, detectDuplicateSiblings } from './detect.js'

describe('findDuplicateSiblings', () => {
  it('returns 1 entry for "flex" with count 3 when parent has children ["flex", "flex", "flex", "icon"]', () => {
    const parent = {
      id: 'parent-1',
      name: 'Container',
      type: 'FRAME',
      children: [
        { id: 'c1', name: 'flex', type: 'FRAME' },
        { id: 'c2', name: 'flex', type: 'FRAME' },
        { id: 'c3', name: 'flex', type: 'FRAME' },
        { id: 'c4', name: 'icon', type: 'INSTANCE' },
      ],
    }

    const result = findDuplicateSiblings(parent)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('flex')
    expect(result[0].count).toBe(3)
    expect(result[0].children).toHaveLength(3)
    expect(result[0].children.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('returns empty array when parent has all unique child names', () => {
    const parent = {
      id: 'parent-2',
      name: 'Unique Container',
      type: 'FRAME',
      children: [
        { id: 'c1', name: 'header', type: 'FRAME' },
        { id: 'c2', name: 'body', type: 'FRAME' },
        { id: 'c3', name: 'footer', type: 'FRAME' },
      ],
    }

    const result = findDuplicateSiblings(parent)

    expect(result).toEqual([])
  })

  it('returns 2 entries when parent has multiple groups of duplicates', () => {
    const parent = {
      id: 'parent-3',
      name: 'Multi Dup',
      type: 'FRAME',
      children: [
        { id: 'c1', name: 'flex', type: 'FRAME' },
        { id: 'c2', name: 'flex', type: 'FRAME' },
        { id: 'c3', name: 'text', type: 'TEXT' },
        { id: 'c4', name: 'text', type: 'TEXT' },
      ],
    }

    const result = findDuplicateSiblings(parent)

    expect(result).toHaveLength(2)

    const flexEntry = result.find((e) => e.name === 'flex')
    const textEntry = result.find((e) => e.name === 'text')

    expect(flexEntry).toBeDefined()
    expect(flexEntry.count).toBe(2)
    expect(flexEntry.children).toHaveLength(2)

    expect(textEntry).toBeDefined()
    expect(textEntry.count).toBe(2)
    expect(textEntry.children).toHaveLength(2)
  })

  it('returns empty array when node has no children', () => {
    const leaf = {
      id: 'leaf-1',
      name: 'Leaf',
      type: 'TEXT',
    }

    const result = findDuplicateSiblings(leaf)

    expect(result).toEqual([])
  })

  it('returns empty array when children array is empty', () => {
    const parent = {
      id: 'empty-1',
      name: 'Empty',
      type: 'FRAME',
      children: [],
    }

    const result = findDuplicateSiblings(parent)

    expect(result).toEqual([])
  })

  it('preserves original child node references in children array', () => {
    const child1 = { id: 'c1', name: 'item', type: 'FRAME' }
    const child2 = { id: 'c2', name: 'item', type: 'GROUP' }
    const parent = {
      id: 'p1',
      name: 'Parent',
      type: 'FRAME',
      children: [child1, child2],
    }

    const result = findDuplicateSiblings(parent)

    expect(result).toHaveLength(1)
    expect(result[0].children[0]).toBe(child1)
    expect(result[0].children[1]).toBe(child2)
  })
})

describe('detectDuplicateSiblings', () => {
  it('finds duplicates at multiple levels in a component tree', () => {
    const component = {
      id: 'comp-1',
      name: 'Button',
      type: 'COMPONENT',
      children: [
        {
          id: 'frame-1',
          name: 'container',
          type: 'FRAME',
          children: [
            { id: 'n1', name: 'icon', type: 'INSTANCE' },
            { id: 'n2', name: 'icon', type: 'INSTANCE' },
            {
              id: 'frame-2',
              name: 'label-wrap',
              type: 'FRAME',
              children: [
                { id: 'n3', name: 'label', type: 'TEXT' },
                { id: 'n4', name: 'label', type: 'TEXT' },
              ],
            },
          ],
        },
      ],
    }

    const issues = detectDuplicateSiblings(component, 'Button', undefined)

    expect(issues).toHaveLength(2)

    const containerIssue = issues.find((i) => i.parentId === 'frame-1')
    expect(containerIssue).toBeDefined()
    expect(containerIssue.componentName).toBe('Button')
    expect(containerIssue.variantName).toBeUndefined()
    expect(containerIssue.parentName).toBe('container')
    expect(containerIssue.duplicatedName).toBe('icon')
    expect(containerIssue.count).toBe(2)
    expect(containerIssue.occurrences).toHaveLength(2)

    const labelIssue = issues.find((i) => i.parentId === 'frame-2')
    expect(labelIssue).toBeDefined()
    expect(labelIssue.duplicatedName).toBe('label')
    expect(labelIssue.count).toBe(2)
  })

  it('returns empty array when component tree has no duplicates', () => {
    const component = {
      id: 'comp-2',
      name: 'Icon',
      type: 'COMPONENT',
      children: [
        {
          id: 'frame-1',
          name: 'wrapper',
          type: 'FRAME',
          children: [
            { id: 'n1', name: 'path-1', type: 'VECTOR' },
            { id: 'n2', name: 'path-2', type: 'VECTOR' },
          ],
        },
      ],
    }

    const issues = detectDuplicateSiblings(component, 'Icon', undefined)

    expect(issues).toEqual([])
  })

  it('finds deeply nested duplicates', () => {
    const component = {
      id: 'comp-3',
      name: 'Card',
      type: 'COMPONENT',
      children: [
        {
          id: 'l1',
          name: 'outer',
          type: 'FRAME',
          children: [
            {
              id: 'l2',
              name: 'middle',
              type: 'FRAME',
              children: [
                {
                  id: 'l3',
                  name: 'inner',
                  type: 'FRAME',
                  children: [
                    { id: 'd1', name: 'dot', type: 'ELLIPSE' },
                    { id: 'd2', name: 'dot', type: 'ELLIPSE' },
                    { id: 'd3', name: 'dot', type: 'ELLIPSE' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const issues = detectDuplicateSiblings(component, 'Card', undefined)

    expect(issues).toHaveLength(1)
    expect(issues[0].parentId).toBe('l3')
    expect(issues[0].parentName).toBe('inner')
    expect(issues[0].duplicatedName).toBe('dot')
    expect(issues[0].count).toBe(3)
    expect(issues[0].occurrences).toHaveLength(3)
  })

  it('returns correct componentName and variantName in each issue', () => {
    const variant = {
      id: 'var-1',
      name: 'State=Hover',
      type: 'COMPONENT',
      children: [
        {
          id: 'frame-1',
          name: 'content',
          type: 'FRAME',
          children: [
            { id: 'n1', name: 'text', type: 'TEXT' },
            { id: 'n2', name: 'text', type: 'TEXT' },
          ],
        },
      ],
    }

    const issues = detectDuplicateSiblings(variant, 'ButtonSet', 'State=Hover')

    expect(issues).toHaveLength(1)
    expect(issues[0].componentName).toBe('ButtonSet')
    expect(issues[0].variantName).toBe('State=Hover')
  })

  it('includes correct occurrence details with type, id, and index', () => {
    const component = {
      id: 'comp-4',
      name: 'Badge',
      type: 'COMPONENT',
      children: [
        { id: 'a1', name: 'shape', type: 'RECTANGLE' },
        { id: 'a2', name: 'label', type: 'TEXT' },
        { id: 'a3', name: 'shape', type: 'ELLIPSE' },
        { id: 'a4', name: 'shape', type: 'VECTOR' },
      ],
    }

    const issues = detectDuplicateSiblings(component, 'Badge', undefined)

    expect(issues).toHaveLength(1)
    expect(issues[0].duplicatedName).toBe('shape')
    expect(issues[0].count).toBe(3)
    expect(issues[0].occurrences).toEqual([
      { type: 'RECTANGLE', id: 'a1', index: 0 },
      { type: 'ELLIPSE', id: 'a3', index: 2 },
      { type: 'VECTOR', id: 'a4', index: 3 },
    ])
  })

  it('detects duplicates at the root component level (direct children of the component)', () => {
    const component = {
      id: 'comp-5',
      name: 'Simple',
      type: 'COMPONENT',
      children: [
        { id: 'r1', name: 'layer', type: 'FRAME' },
        { id: 'r2', name: 'layer', type: 'FRAME' },
      ],
    }

    const issues = detectDuplicateSiblings(component, 'Simple', undefined)

    expect(issues).toHaveLength(1)
    expect(issues[0].parentId).toBe('comp-5')
    expect(issues[0].parentName).toBe('Simple')
    expect(issues[0].duplicatedName).toBe('layer')
    expect(issues[0].count).toBe(2)
  })

  it('handles a component with no children', () => {
    const component = {
      id: 'comp-empty',
      name: 'Empty',
      type: 'COMPONENT',
    }

    const issues = detectDuplicateSiblings(component, 'Empty', undefined)

    expect(issues).toEqual([])
  })

  it('generates separate issues for different duplicate groups at the same parent', () => {
    const component = {
      id: 'comp-6',
      name: 'Mixed',
      type: 'COMPONENT',
      children: [
        { id: 'x1', name: 'bg', type: 'RECTANGLE' },
        { id: 'x2', name: 'bg', type: 'RECTANGLE' },
        { id: 'x3', name: 'icon', type: 'INSTANCE' },
        { id: 'x4', name: 'icon', type: 'INSTANCE' },
        { id: 'x5', name: 'unique', type: 'TEXT' },
      ],
    }

    const issues = detectDuplicateSiblings(component, 'Mixed', undefined)

    expect(issues).toHaveLength(2)

    const bgIssue = issues.find((i) => i.duplicatedName === 'bg')
    const iconIssue = issues.find((i) => i.duplicatedName === 'icon')

    expect(bgIssue).toBeDefined()
    expect(bgIssue.count).toBe(2)
    expect(iconIssue).toBeDefined()
    expect(iconIssue.count).toBe(2)
  })
})
