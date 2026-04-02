import { describe, it, expect } from 'vitest'
import { hasValidDescription, checkDescriptions } from './detect.js'

describe('hasValidDescription', () => {
  it('returns true for a node with a non-empty description', () => {
    const node = {
      id: '1:0',
      name: 'Button',
      type: 'COMPONENT',
      description: 'A button component',
    }

    expect(hasValidDescription(node)).toBe(true)
  })

  it('returns false for a node with an empty string description', () => {
    const node = {
      id: '1:1',
      name: 'Card',
      type: 'COMPONENT',
      description: '',
    }

    expect(hasValidDescription(node)).toBe(false)
  })

  it('returns false for a node with a whitespace-only description', () => {
    const node = {
      id: '1:2',
      name: 'Badge',
      type: 'COMPONENT',
      description: '   ',
    }

    expect(hasValidDescription(node)).toBe(false)
  })

  it('returns false for a node with description set to undefined', () => {
    const node = {
      id: '1:3',
      name: 'Tag',
      type: 'COMPONENT',
      description: undefined,
    }

    expect(hasValidDescription(node)).toBe(false)
  })

  it('returns false for a node with no description property at all', () => {
    const node = {
      id: '1:4',
      name: 'Chip',
      type: 'COMPONENT',
    }

    expect(hasValidDescription(node)).toBe(false)
  })

  it('returns true for a description with leading/trailing whitespace around real content', () => {
    const node = {
      id: '1:5',
      name: 'Tooltip',
      type: 'COMPONENT',
      description: '  A tooltip for contextual help  ',
    }

    expect(hasValidDescription(node)).toBe(true)
  })

  it('returns false for a node with description set to null', () => {
    const node = {
      id: '1:6',
      name: 'Divider',
      type: 'COMPONENT',
      description: null,
    }

    expect(hasValidDescription(node)).toBe(false)
  })

  it('returns true for a single-character description', () => {
    const node = {
      id: '1:7',
      name: 'Dot',
      type: 'COMPONENT',
      description: 'x',
    }

    expect(hasValidDescription(node)).toBe(true)
  })
})

describe('checkDescriptions', () => {
  it('correctly splits a page with a mix of described and undescribed components', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '2:0',
          name: 'Button',
          type: 'COMPONENT',
          description: 'Primary action button',
        },
        {
          id: '2:1',
          name: 'Card',
          type: 'COMPONENT',
          description: '',
        },
        {
          id: '2:2',
          name: 'Badge',
          type: 'COMPONENT',
          description: 'Status indicator badge',
        },
        {
          id: '2:3',
          name: 'Chip',
          type: 'COMPONENT',
        },
      ],
    }

    const result = checkDescriptions(page)

    expect(result.withDescription).toHaveLength(2)
    expect(result.missingDescription).toHaveLength(2)

    const describedNames = result.withDescription.map((i) => i.componentName)
    expect(describedNames).toContain('Button')
    expect(describedNames).toContain('Badge')

    const missingNames = result.missingDescription.map((i) => i.componentName)
    expect(missingNames).toContain('Card')
    expect(missingNames).toContain('Chip')
  })

  it('returns empty missingDescription when all components have descriptions', () => {
    const page = {
      id: '0:1',
      name: 'All Described',
      type: 'CANVAS',
      children: [
        {
          id: '2:0',
          name: 'Button',
          type: 'COMPONENT',
          description: 'A button',
        },
        {
          id: '2:1',
          name: 'Input',
          type: 'COMPONENT',
          description: 'A text input',
        },
      ],
    }

    const result = checkDescriptions(page)

    expect(result.withDescription).toHaveLength(2)
    expect(result.missingDescription).toEqual([])
  })

  it('returns empty withDescription when no components have descriptions', () => {
    const page = {
      id: '0:1',
      name: 'None Described',
      type: 'CANVAS',
      children: [
        {
          id: '2:0',
          name: 'Button',
          type: 'COMPONENT',
          description: '',
        },
        {
          id: '2:1',
          name: 'Card',
          type: 'COMPONENT',
        },
      ],
    }

    const result = checkDescriptions(page)

    expect(result.withDescription).toEqual([])
    expect(result.missingDescription).toHaveLength(2)
  })

  it('checks both component sets and standalone components', () => {
    const page = {
      id: '0:1',
      name: 'Mixed',
      type: 'CANVAS',
      children: [
        {
          id: '2:0',
          name: 'ButtonSet',
          type: 'COMPONENT_SET',
          description: 'A set of button variants',
          children: [
            { id: '3:0', name: 'Size=Small', type: 'COMPONENT', description: '' },
            { id: '3:1', name: 'Size=Large', type: 'COMPONENT', description: '' },
          ],
        },
        {
          id: '2:1',
          name: 'Divider',
          type: 'COMPONENT',
          description: '',
        },
      ],
    }

    const result = checkDescriptions(page)

    const allItems = [...result.withDescription, ...result.missingDescription]
    const types = allItems.map((i) => i.type)

    expect(types).toContain('COMPONENT_SET')
    expect(types).toContain('COMPONENT')

    const setIssue = allItems.find((i) => i.componentName === 'ButtonSet')
    expect(setIssue).toBeDefined()
    expect(setIssue.type).toBe('COMPONENT_SET')
    expect(setIssue.hasDescription).toBe(true)

    const dividerIssue = allItems.find((i) => i.componentName === 'Divider')
    expect(dividerIssue).toBeDefined()
    expect(dividerIssue.type).toBe('COMPONENT')
    expect(dividerIssue.hasDescription).toBe(false)
  })

  it('sets pageName correctly on every issue', () => {
    const page = {
      id: '0:1',
      name: 'Icons Page',
      type: 'CANVAS',
      children: [
        {
          id: '2:0',
          name: 'StarIcon',
          type: 'COMPONENT',
          description: 'A star icon',
        },
        {
          id: '2:1',
          name: 'HeartIcon',
          type: 'COMPONENT',
          description: '',
        },
      ],
    }

    const result = checkDescriptions(page)

    const allItems = [...result.withDescription, ...result.missingDescription]

    expect(allItems).toHaveLength(2)
    for (const item of allItems) {
      expect(item.pageName).toBe('Icons Page')
    }
  })

  it('returns correct issue structure for each item', () => {
    const page = {
      id: '0:1',
      name: 'Primitives',
      type: 'CANVAS',
      children: [
        {
          id: '5:10',
          name: 'Avatar',
          type: 'COMPONENT',
          description: 'User avatar image',
        },
      ],
    }

    const result = checkDescriptions(page)

    expect(result.withDescription).toHaveLength(1)
    const issue = result.withDescription[0]

    expect(issue).toEqual({
      componentName: 'Avatar',
      nodeId: '5:10',
      type: 'COMPONENT',
      pageName: 'Primitives',
      hasDescription: true,
    })
  })

  it('returns both arrays empty when page has no components', () => {
    const page = {
      id: '0:1',
      name: 'Empty Page',
      type: 'CANVAS',
      children: [
        {
          id: '2:0',
          name: 'Just a frame',
          type: 'FRAME',
          children: [
            { id: '3:0', name: 'Rectangle', type: 'RECTANGLE' },
          ],
        },
      ],
    }

    const result = checkDescriptions(page)

    expect(result.withDescription).toEqual([])
    expect(result.missingDescription).toEqual([])
  })

  it('categorises a described component set and an undescribed standalone component correctly', () => {
    const page = {
      id: '0:1',
      name: 'Buttons',
      type: 'CANVAS',
      children: [
        {
          id: '2:0',
          name: 'ToggleSet',
          type: 'COMPONENT_SET',
          description: 'Toggle switch component with on/off states',
          children: [
            { id: '3:0', name: 'State=On', type: 'COMPONENT' },
            { id: '3:1', name: 'State=Off', type: 'COMPONENT' },
          ],
        },
        {
          id: '2:1',
          name: 'IconButton',
          type: 'COMPONENT',
        },
      ],
    }

    const result = checkDescriptions(page)

    expect(result.withDescription).toHaveLength(1)
    expect(result.withDescription[0].componentName).toBe('ToggleSet')
    expect(result.withDescription[0].type).toBe('COMPONENT_SET')
    expect(result.withDescription[0].hasDescription).toBe(true)

    expect(result.missingDescription).toHaveLength(1)
    expect(result.missingDescription[0].componentName).toBe('IconButton')
    expect(result.missingDescription[0].type).toBe('COMPONENT')
    expect(result.missingDescription[0].hasDescription).toBe(false)
  })

  it('finds components nested inside sections and frames', () => {
    const page = {
      id: '0:1',
      name: 'Library',
      type: 'CANVAS',
      children: [
        {
          id: '2:0',
          name: 'Actions',
          type: 'SECTION',
          children: [
            {
              id: '3:0',
              name: 'SubmitButton',
              type: 'COMPONENT',
              description: 'Submits the form',
            },
            {
              id: '3:1',
              name: 'CancelButton',
              type: 'COMPONENT',
              description: '',
            },
          ],
        },
      ],
    }

    const result = checkDescriptions(page)

    expect(result.withDescription).toHaveLength(1)
    expect(result.withDescription[0].componentName).toBe('SubmitButton')

    expect(result.missingDescription).toHaveLength(1)
    expect(result.missingDescription[0].componentName).toBe('CancelButton')
  })

  it('treats whitespace-only descriptions as missing', () => {
    const page = {
      id: '0:1',
      name: 'Whitespace',
      type: 'CANVAS',
      children: [
        {
          id: '2:0',
          name: 'Spacer',
          type: 'COMPONENT',
          description: '   \t\n  ',
        },
      ],
    }

    const result = checkDescriptions(page)

    expect(result.withDescription).toEqual([])
    expect(result.missingDescription).toHaveLength(1)
    expect(result.missingDescription[0].componentName).toBe('Spacer')
    expect(result.missingDescription[0].hasDescription).toBe(false)
  })
})
