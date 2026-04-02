import { describe, it, expect, vi } from 'vitest'
import { traverseNodes, collectNodes, findComponents } from './tree-traversal.js'

describe('traverseNodes', () => {
  const tree = {
    id: '0:0',
    name: 'Root',
    type: 'DOCUMENT',
    children: [
      {
        id: '1:1',
        name: 'Child A',
        type: 'FRAME',
        children: [
          { id: '2:1', name: 'Grandchild A1', type: 'RECTANGLE' },
          { id: '2:2', name: 'Grandchild A2', type: 'TEXT' },
        ],
      },
      {
        id: '1:2',
        name: 'Child B',
        type: 'GROUP',
      },
    ],
  }

  it('visits every node depth-first', () => {
    const visited = []
    traverseNodes(tree, ({ node }) => visited.push(node.name))
    expect(visited).toEqual(['Root', 'Child A', 'Grandchild A1', 'Grandchild A2', 'Child B'])
  })

  it('provides correct parent references', () => {
    const parents = []
    traverseNodes(tree, ({ node, parent }) => {
      parents.push({ name: node.name, parent: parent?.name ?? null })
    })
    expect(parents).toEqual([
      { name: 'Root', parent: null },
      { name: 'Child A', parent: 'Root' },
      { name: 'Grandchild A1', parent: 'Child A' },
      { name: 'Grandchild A2', parent: 'Child A' },
      { name: 'Child B', parent: 'Root' },
    ])
  })

  it('provides correct depth values', () => {
    const depths = []
    traverseNodes(tree, ({ node, depth }) => depths.push({ name: node.name, depth }))
    expect(depths).toEqual([
      { name: 'Root', depth: 0 },
      { name: 'Child A', depth: 1 },
      { name: 'Grandchild A1', depth: 2 },
      { name: 'Grandchild A2', depth: 2 },
      { name: 'Child B', depth: 1 },
    ])
  })

  it('provides correct path arrays', () => {
    const paths = []
    traverseNodes(tree, ({ node, path }) => paths.push({ name: node.name, path }))
    expect(paths[2]).toEqual({ name: 'Grandchild A1', path: ['Root', 'Child A', 'Grandchild A1'] })
  })

  it('respects maxDepth option', () => {
    const visited = []
    traverseNodes(tree, ({ node }) => visited.push(node.name), { maxDepth: 1 })
    expect(visited).toEqual(['Root', 'Child A', 'Child B'])
  })

  it('handles a leaf node', () => {
    const leaf = { id: '0:1', name: 'Leaf', type: 'TEXT' }
    const visited = []
    traverseNodes(leaf, ({ node }) => visited.push(node.name))
    expect(visited).toEqual(['Leaf'])
  })
})

describe('collectNodes', () => {
  const tree = {
    id: '0:0',
    name: 'Root',
    type: 'FRAME',
    children: [
      { id: '1:1', name: 'Rect1', type: 'RECTANGLE' },
      {
        id: '1:2',
        name: 'Group',
        type: 'GROUP',
        children: [
          { id: '2:1', name: 'Rect2', type: 'RECTANGLE' },
          { id: '2:2', name: 'Text1', type: 'TEXT' },
        ],
      },
    ],
  }

  it('collects nodes matching predicate', () => {
    const rects = collectNodes(tree, ({ node }) => node.type === 'RECTANGLE')
    expect(rects).toHaveLength(2)
    expect(rects.map((r) => r.node.name)).toEqual(['Rect1', 'Rect2'])
  })

  it('returns empty array when nothing matches', () => {
    const matches = collectNodes(tree, ({ node }) => node.type === 'ELLIPSE')
    expect(matches).toEqual([])
  })
})

describe('findComponents', () => {
  const page = {
    id: '0:1',
    name: 'Components',
    type: 'CANVAS',
    children: [
      {
        id: '1:1',
        name: 'ButtonSet',
        type: 'COMPONENT_SET',
        children: [
          { id: '2:1', name: 'Default', type: 'COMPONENT' },
          { id: '2:2', name: 'Hover', type: 'COMPONENT' },
        ],
      },
      {
        id: '1:2',
        name: 'Divider',
        type: 'COMPONENT',
      },
      {
        id: '1:3',
        name: 'Misc Section',
        type: 'SECTION',
        children: [
          {
            id: '3:1',
            name: 'IconSet',
            type: 'COMPONENT_SET',
            children: [
              { id: '4:1', name: 'Icon1', type: 'COMPONENT' },
            ],
          },
          { id: '3:2', name: 'Badge', type: 'COMPONENT' },
        ],
      },
      {
        id: '1:4',
        name: 'StrayFrame',
        type: 'FRAME',
        children: [],
      },
    ],
  }

  it('finds component sets at the top level and inside sections', () => {
    const { componentSets } = findComponents(page)
    expect(componentSets.map((c) => c.name)).toEqual(['ButtonSet', 'IconSet'])
  })

  it('finds standalone components at the top level and inside sections', () => {
    const { standaloneComponents } = findComponents(page)
    expect(standaloneComponents.map((c) => c.name)).toEqual(['Divider', 'Badge'])
  })

  it('does not include variants nested inside component sets', () => {
    const { standaloneComponents } = findComponents(page)
    const names = standaloneComponents.map((c) => c.name)
    expect(names).not.toContain('Default')
    expect(names).not.toContain('Hover')
    expect(names).not.toContain('Icon1')
  })
})
