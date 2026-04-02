import { describe, it, expect } from 'vitest'
import { classifyTopLevelItem, scanPage } from './detect.js'

describe('classifyTopLevelItem', () => {
  it('classifies COMPONENT_SET as expected', () => {
    expect(classifyTopLevelItem({ type: 'COMPONENT_SET' })).toBe('expected')
  })

  it('classifies COMPONENT as expected', () => {
    expect(classifyTopLevelItem({ type: 'COMPONENT' })).toBe('expected')
  })

  it('classifies SECTION as expected', () => {
    expect(classifyTopLevelItem({ type: 'SECTION' })).toBe('expected')
  })

  it('classifies INSTANCE as unexpected', () => {
    expect(classifyTopLevelItem({ type: 'INSTANCE' })).toBe('unexpected')
  })

  it('classifies FRAME as unexpected', () => {
    expect(classifyTopLevelItem({ type: 'FRAME' })).toBe('unexpected')
  })

  it('classifies GROUP as unexpected', () => {
    expect(classifyTopLevelItem({ type: 'GROUP' })).toBe('unexpected')
  })

  it('classifies TEXT as unexpected', () => {
    expect(classifyTopLevelItem({ type: 'TEXT' })).toBe('unexpected')
  })

  it('classifies RECTANGLE as unexpected', () => {
    expect(classifyTopLevelItem({ type: 'RECTANGLE' })).toBe('unexpected')
  })

  it('classifies VECTOR as unexpected', () => {
    expect(classifyTopLevelItem({ type: 'VECTOR' })).toBe('unexpected')
  })

  it('classifies ELLIPSE as unexpected', () => {
    expect(classifyTopLevelItem({ type: 'ELLIPSE' })).toBe('unexpected')
  })

  it('classifies LINE as unexpected', () => {
    expect(classifyTopLevelItem({ type: 'LINE' })).toBe('unexpected')
  })

  it('classifies BOOLEAN_OPERATION as unexpected', () => {
    expect(classifyTopLevelItem({ type: 'BOOLEAN_OPERATION' })).toBe('unexpected')
  })
})

describe('scanPage', () => {
  it('correctly classifies a mix of expected and unexpected items', () => {
    const page = {
      name: 'Components',
      children: [
        { id: '1:1', name: 'ButtonSet', type: 'COMPONENT_SET' },
        { id: '1:2', name: 'IconStar', type: 'COMPONENT' },
        { id: '1:3', name: 'Stray Frame', type: 'FRAME' },
        { id: '1:4', name: 'Loose Text', type: 'TEXT' },
        { id: '1:5', name: 'Foundations', type: 'SECTION' },
      ],
    }

    const result = scanPage(page)

    expect(result.pageName).toBe('Components')
    expect(result.expected).toHaveLength(3)
    expect(result.unexpected).toHaveLength(2)

    const expectedNames = result.expected.map((i) => i.itemName)
    expect(expectedNames).toEqual(['ButtonSet', 'IconStar', 'Foundations'])

    const unexpectedNames = result.unexpected.map((i) => i.itemName)
    expect(unexpectedNames).toEqual(['Stray Frame', 'Loose Text'])
  })

  it('returns empty unexpected array when page has only expected items', () => {
    const page = {
      name: 'Clean Page',
      children: [
        { id: '2:1', name: 'Buttons', type: 'COMPONENT_SET' },
        { id: '2:2', name: 'Divider', type: 'COMPONENT' },
        { id: '2:3', name: 'Layout Section', type: 'SECTION' },
      ],
    }

    const result = scanPage(page)

    expect(result.pageName).toBe('Clean Page')
    expect(result.expected).toHaveLength(3)
    expect(result.unexpected).toHaveLength(0)
  })

  it('returns empty expected array when page has only unexpected items', () => {
    const page = {
      name: 'Messy Page',
      children: [
        { id: '3:1', name: 'Frame 1', type: 'FRAME' },
        { id: '3:2', name: 'Group 1', type: 'GROUP' },
        { id: '3:3', name: 'Rectangle 1', type: 'RECTANGLE' },
      ],
    }

    const result = scanPage(page)

    expect(result.pageName).toBe('Messy Page')
    expect(result.expected).toHaveLength(0)
    expect(result.unexpected).toHaveLength(3)
  })

  it('returns both arrays empty when page has no children', () => {
    const page = {
      name: 'Empty Page',
      children: [],
    }

    const result = scanPage(page)

    expect(result.pageName).toBe('Empty Page')
    expect(result.expected).toHaveLength(0)
    expect(result.unexpected).toHaveLength(0)
  })

  it('returns both arrays empty when children property is missing', () => {
    const page = { name: 'No Children Prop' }

    const result = scanPage(page)

    expect(result.pageName).toBe('No Children Prop')
    expect(result.expected).toHaveLength(0)
    expect(result.unexpected).toHaveLength(0)
  })

  it('populates pageName on every issue', () => {
    const page = {
      name: 'Icons',
      children: [
        { id: '4:1', name: 'StarIcon', type: 'COMPONENT' },
        { id: '4:2', name: 'Annotation', type: 'TEXT' },
      ],
    }

    const result = scanPage(page)

    for (const issue of [...result.expected, ...result.unexpected]) {
      expect(issue.pageName).toBe('Icons')
    }
  })

  it('populates itemName, itemType, and nodeId correctly on each issue', () => {
    const page = {
      name: 'TestPage',
      children: [
        { id: '5:1', name: 'CardSet', type: 'COMPONENT_SET' },
        { id: '5:2', name: 'Decoration', type: 'ELLIPSE' },
      ],
    }

    const result = scanPage(page)

    const expectedItem = result.expected[0]
    expect(expectedItem.itemName).toBe('CardSet')
    expect(expectedItem.itemType).toBe('COMPONENT_SET')
    expect(expectedItem.nodeId).toBe('5:1')
    expect(expectedItem.classification).toBe('expected')

    const unexpectedItem = result.unexpected[0]
    expect(unexpectedItem.itemName).toBe('Decoration')
    expect(unexpectedItem.itemType).toBe('ELLIPSE')
    expect(unexpectedItem.nodeId).toBe('5:2')
    expect(unexpectedItem.classification).toBe('unexpected')
  })

  it('sets classification to expected for expected items', () => {
    const page = {
      name: 'Page',
      children: [{ id: '6:1', name: 'MyComponent', type: 'COMPONENT' }],
    }

    const result = scanPage(page)

    expect(result.expected[0].classification).toBe('expected')
  })

  it('sets classification to unexpected for unexpected items', () => {
    const page = {
      name: 'Page',
      children: [{ id: '7:1', name: 'Instance 1', type: 'INSTANCE' }],
    }

    const result = scanPage(page)

    expect(result.unexpected[0].classification).toBe('unexpected')
  })
})
