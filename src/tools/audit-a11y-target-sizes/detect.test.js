import { describe, it, expect } from 'vitest'
import {
  getTargetSizeSeverity,
  isInteractiveComponent,
  findSmallestVariant,
  auditTargetSizes,
  TARGET_SIZE_MINIMUM,
} from './detect.js'

describe('getTargetSizeSeverity', () => {
  it('returns "high" for dimensions below 17px', () => {
    expect(getTargetSizeSeverity(9)).toBe('high')
    expect(getTargetSizeSeverity(16)).toBe('high')
  })

  it('returns "medium" for dimensions between 17 and 23px', () => {
    expect(getTargetSizeSeverity(17)).toBe('medium')
    expect(getTargetSizeSeverity(23)).toBe('medium')
  })

  it('returns null for dimensions at or above 24px', () => {
    expect(getTargetSizeSeverity(24)).toBeNull()
    expect(getTargetSizeSeverity(44)).toBeNull()
    expect(getTargetSizeSeverity(100)).toBeNull()
  })

  it('returns "high" for zero dimension', () => {
    expect(getTargetSizeSeverity(0)).toBe('high')
  })
})

describe('isInteractiveComponent', () => {
  it('returns true for known interactive components', () => {
    expect(isInteractiveComponent('Button')).toBe(true)
    expect(isInteractiveComponent('Checkbox')).toBe(true)
    expect(isInteractiveComponent('Radio')).toBe(true)
    expect(isInteractiveComponent('Switch')).toBe(true)
    expect(isInteractiveComponent('Select')).toBe(true)
    expect(isInteractiveComponent('MenuItem')).toBe(true)
  })

  it('returns false for non-interactive components', () => {
    expect(isInteractiveComponent('Stack')).toBe(false)
    expect(isInteractiveComponent('Inline')).toBe(false)
    expect(isInteractiveComponent('Card')).toBe(false)
    expect(isInteractiveComponent('Spinner')).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(isInteractiveComponent('button')).toBe(false)
    expect(isInteractiveComponent('BUTTON')).toBe(false)
  })
})

describe('findSmallestVariant', () => {
  it('finds the variant with the smallest minimum dimension', () => {
    const componentSet = {
      id: '1:0',
      name: 'Button',
      type: 'COMPONENT_SET',
      children: [
        { id: '2:0', name: 'size=large', type: 'COMPONENT', absoluteBoundingBox: { width: 80, height: 40 } },
        { id: '2:1', name: 'size=small', type: 'COMPONENT', absoluteBoundingBox: { width: 58, height: 25 } },
        { id: '2:2', name: 'size=medium', type: 'COMPONENT', absoluteBoundingBox: { width: 66, height: 33 } },
      ],
    }

    const result = findSmallestVariant(componentSet)

    expect(result.variantName).toBe('size=small')
    expect(result.minDimension).toBe(25)
    expect(result.width).toBe(58)
    expect(result.height).toBe(25)
  })

  it('returns null for a component set with no children', () => {
    const componentSet = { id: '1:0', name: 'Empty', type: 'COMPONENT_SET', children: [] }
    expect(findSmallestVariant(componentSet)).toBeNull()
  })

  it('returns null for a component set with undefined children', () => {
    const componentSet = { id: '1:0', name: 'Empty', type: 'COMPONENT_SET' }
    expect(findSmallestVariant(componentSet)).toBeNull()
  })

  it('uses height as minDimension when height is smaller', () => {
    const componentSet = {
      id: '1:0',
      name: 'Switch',
      type: 'COMPONENT_SET',
      children: [
        { id: '2:0', name: 'v=true', type: 'COMPONENT', absoluteBoundingBox: { width: 25, height: 17 } },
      ],
    }

    const result = findSmallestVariant(componentSet)

    expect(result.minDimension).toBe(17)
  })

  it('skips non-COMPONENT children', () => {
    const componentSet = {
      id: '1:0',
      name: 'Button',
      type: 'COMPONENT_SET',
      children: [
        { id: '2:0', name: 'decoration', type: 'FRAME', absoluteBoundingBox: { width: 5, height: 5 } },
        { id: '2:1', name: 'size=sm', type: 'COMPONENT', absoluteBoundingBox: { width: 58, height: 25 } },
      ],
    }

    const result = findSmallestVariant(componentSet)

    expect(result.variantName).toBe('size=sm')
    expect(result.minDimension).toBe(25)
  })
})

describe('auditTargetSizes', () => {
  it('flags interactive components below 24px as failing', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Checkbox',
          type: 'COMPONENT_SET',
          children: [
            { id: '2:0', name: 'value=true', type: 'COMPONENT', absoluteBoundingBox: { width: 17, height: 17 } },
            { id: '2:1', name: 'value=false', type: 'COMPONENT', absoluteBoundingBox: { width: 17, height: 17 } },
          ],
        },
      ],
    }

    const result = auditTargetSizes(page)

    expect(result.failing).toHaveLength(1)
    expect(result.failing[0].componentName).toBe('Checkbox')
    expect(result.failing[0].severity).toBe('medium')
    expect(result.failing[0].wcag).toBe('2.5.8')
    expect(result.passing).toHaveLength(0)
  })

  it('passes interactive components at or above 24px', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Button',
          type: 'COMPONENT_SET',
          children: [
            { id: '2:0', name: 'size=md', type: 'COMPONENT', absoluteBoundingBox: { width: 66, height: 33 } },
          ],
        },
      ],
    }

    const result = auditTargetSizes(page)

    expect(result.passing).toHaveLength(1)
    expect(result.passing[0].componentName).toBe('Button')
    expect(result.failing).toHaveLength(0)
  })

  it('skips non-interactive components', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Stack',
          type: 'COMPONENT_SET',
          children: [
            { id: '2:0', name: 'space=0', type: 'COMPONENT', absoluteBoundingBox: { width: 10, height: 10 } },
          ],
        },
      ],
    }

    const result = auditTargetSizes(page)

    expect(result.passing).toHaveLength(0)
    expect(result.failing).toHaveLength(0)
  })

  it('checks standalone interactive components', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Button',
          type: 'COMPONENT',
          absoluteBoundingBox: { width: 20, height: 20 },
        },
      ],
    }

    const result = auditTargetSizes(page)

    expect(result.failing).toHaveLength(1)
    expect(result.failing[0].severity).toBe('medium')
  })

  it('sets pageName on every issue', () => {
    const page = {
      id: '0:1',
      name: 'My Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Radio',
          type: 'COMPONENT_SET',
          children: [
            { id: '2:0', name: 'value=true', type: 'COMPONENT', absoluteBoundingBox: { width: 17, height: 17 } },
          ],
        },
      ],
    }

    const result = auditTargetSizes(page)

    for (const issue of [...result.passing, ...result.failing]) {
      expect(issue.pageName).toBe('My Components')
    }
  })

  it('finds components inside sections', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Form Controls',
          type: 'SECTION',
          children: [
            {
              id: '2:0',
              name: 'Checkbox',
              type: 'COMPONENT_SET',
              children: [
                { id: '3:0', name: 'v=true', type: 'COMPONENT', absoluteBoundingBox: { width: 17, height: 17 } },
              ],
            },
          ],
        },
      ],
    }

    const result = auditTargetSizes(page)

    expect(result.failing).toHaveLength(1)
    expect(result.failing[0].componentName).toBe('Checkbox')
  })

  it('assigns high severity for very small components', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Badge',
          type: 'COMPONENT_SET',
          children: [
            { id: '2:0', name: 'size=xs', type: 'COMPONENT', absoluteBoundingBox: { width: 12, height: 12 } },
          ],
        },
      ],
    }

    const result = auditTargetSizes(page)

    expect(result.failing[0].severity).toBe('high')
  })
})
