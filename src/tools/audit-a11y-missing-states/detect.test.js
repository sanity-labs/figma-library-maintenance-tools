import { describe, it, expect } from 'vitest'
import {
  extractStates,
  getMissingStateSeverity,
  getWcagForState,
  auditMissingStates,
  EXPECTED_STATES,
} from './detect.js'

describe('extractStates', () => {
  it('extracts unique state values from variant names', () => {
    const componentSet = {
      id: '1:0',
      name: 'Button',
      type: 'COMPONENT_SET',
      children: [
        { id: '2:0', name: 'state=enabled', type: 'COMPONENT' },
        { id: '2:1', name: 'state=hovered', type: 'COMPONENT' },
        { id: '2:2', name: 'state=focused', type: 'COMPONENT' },
        { id: '2:3', name: 'state=disabled', type: 'COMPONENT' },
      ],
    }

    const states = extractStates(componentSet)

    expect(states).toContain('enabled')
    expect(states).toContain('hovered')
    expect(states).toContain('focused')
    expect(states).toContain('disabled')
  })

  it('handles multi-property variant names', () => {
    const componentSet = {
      id: '1:0',
      name: 'TextInput',
      type: 'COMPONENT_SET',
      children: [
        { id: '2:0', name: 'font size=1, padding=2, state=enabled, placeholder=false', type: 'COMPONENT' },
        { id: '2:1', name: 'font size=1, padding=2, state=focused, placeholder=false', type: 'COMPONENT' },
        { id: '2:2', name: 'font size=1, padding=2, state=disabled, placeholder=false', type: 'COMPONENT' },
      ],
    }

    const states = extractStates(componentSet)

    expect(states).toEqual(['disabled', 'enabled', 'focused'])
  })

  it('returns empty array when no state property exists', () => {
    const componentSet = {
      id: '1:0',
      name: 'Checkbox',
      type: 'COMPONENT_SET',
      children: [
        { id: '2:0', name: 'value=true', type: 'COMPONENT' },
        { id: '2:1', name: 'value=false', type: 'COMPONENT' },
      ],
    }

    expect(extractStates(componentSet)).toEqual([])
  })

  it('returns empty array for component set with no children', () => {
    const componentSet = { id: '1:0', name: 'Empty', type: 'COMPONENT_SET' }
    expect(extractStates(componentSet)).toEqual([])
  })

  it('deduplicates state values across variants', () => {
    const componentSet = {
      id: '1:0',
      name: 'Button',
      type: 'COMPONENT_SET',
      children: [
        { id: '2:0', name: 'tone=default, state=enabled', type: 'COMPONENT' },
        { id: '2:1', name: 'tone=primary, state=enabled', type: 'COMPONENT' },
        { id: '2:2', name: 'tone=default, state=hovered', type: 'COMPONENT' },
      ],
    }

    const states = extractStates(componentSet)

    expect(states).toEqual(['enabled', 'hovered'])
  })

  it('skips non-COMPONENT children', () => {
    const componentSet = {
      id: '1:0',
      name: 'Button',
      type: 'COMPONENT_SET',
      children: [
        { id: '2:0', name: 'state=enabled', type: 'COMPONENT' },
        { id: '2:1', name: 'state=weird', type: 'FRAME' },
      ],
    }

    expect(extractStates(componentSet)).toEqual(['enabled'])
  })
})

describe('getMissingStateSeverity', () => {
  it('returns "high" for missing focused state', () => {
    expect(getMissingStateSeverity('focused')).toBe('high')
  })

  it('returns "medium" for missing disabled state', () => {
    expect(getMissingStateSeverity('disabled')).toBe('medium')
  })

  it('returns "medium" for missing invalid state', () => {
    expect(getMissingStateSeverity('invalid')).toBe('medium')
  })

  it('returns "low" for missing readOnly state', () => {
    expect(getMissingStateSeverity('readOnly')).toBe('low')
  })
})

describe('getWcagForState', () => {
  it('maps focused to 2.4.7', () => {
    expect(getWcagForState('focused')).toBe('2.4.7')
  })

  it('maps invalid to 3.3.1', () => {
    expect(getWcagForState('invalid')).toBe('3.3.1')
  })

  it('maps disabled to 4.1.2', () => {
    expect(getWcagForState('disabled')).toBe('4.1.2')
  })
})

describe('auditMissingStates', () => {
  it('reports missing focus state on Checkbox', () => {
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
            { id: '2:0', name: 'value=true', type: 'COMPONENT' },
            { id: '2:1', name: 'value=false', type: 'COMPONENT' },
          ],
        },
      ],
    }

    const result = auditMissingStates(page)

    expect(result.issues.length).toBeGreaterThan(0)
    const focusIssue = result.issues.find((i) => i.missingState === 'focused')
    expect(focusIssue).toBeDefined()
    expect(focusIssue.componentName).toBe('Checkbox')
    expect(focusIssue.severity).toBe('high')
  })

  it('reports complete when all expected states are present', () => {
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
            { id: '2:0', name: 'state=enabled', type: 'COMPONENT' },
            { id: '2:1', name: 'state=focused', type: 'COMPONENT' },
            { id: '2:2', name: 'state=disabled', type: 'COMPONENT' },
            { id: '2:3', name: 'state=hovered', type: 'COMPONENT' },
          ],
        },
      ],
    }

    const result = auditMissingStates(page)

    expect(result.complete).toContain('Button')
    const buttonIssues = result.issues.filter((i) => i.componentName === 'Button')
    expect(buttonIssues).toHaveLength(0)
  })

  it('skips components not in EXPECTED_STATES', () => {
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
            { id: '2:0', name: 'space=0', type: 'COMPONENT' },
          ],
        },
      ],
    }

    const result = auditMissingStates(page)

    expect(result.issues).toHaveLength(0)
    expect(result.complete).toHaveLength(0)
  })

  it('includes existing states in the issue for context', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'MenuItem',
          type: 'COMPONENT_SET',
          children: [
            { id: '2:0', name: 'state=enabled', type: 'COMPONENT' },
            { id: '2:1', name: 'state=hovered', type: 'COMPONENT' },
            { id: '2:2', name: 'state=pressed', type: 'COMPONENT' },
          ],
        },
      ],
    }

    const result = auditMissingStates(page)

    const issue = result.issues.find((i) => i.missingState === 'focused')
    expect(issue.existingStates).toContain('enabled')
    expect(issue.existingStates).toContain('hovered')
    expect(issue.existingStates).toContain('pressed')
  })

  it('reports multiple missing states per component', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'TextInput',
          type: 'COMPONENT_SET',
          children: [
            { id: '2:0', name: 'state=enabled', type: 'COMPONENT' },
          ],
        },
      ],
    }

    const result = auditMissingStates(page)

    const inputIssues = result.issues.filter((i) => i.componentName === 'TextInput')
    const missingNames = inputIssues.map((i) => i.missingState)

    expect(missingNames).toContain('focused')
    expect(missingNames).toContain('disabled')
    expect(missingNames).toContain('invalid')
    expect(missingNames).toContain('readOnly')
  })

  it('sets pageName on every issue', () => {
    const page = {
      id: '0:1',
      name: 'My Library',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Radio',
          type: 'COMPONENT_SET',
          children: [
            { id: '2:0', name: 'value=true', type: 'COMPONENT' },
          ],
        },
      ],
    }

    const result = auditMissingStates(page)

    for (const issue of result.issues) {
      expect(issue.pageName).toBe('My Library')
    }
  })

  it('finds component sets inside sections', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Controls',
          type: 'SECTION',
          children: [
            {
              id: '2:0',
              name: 'Switch',
              type: 'COMPONENT_SET',
              children: [
                { id: '3:0', name: 'value=true, state=enabled', type: 'COMPONENT' },
              ],
            },
          ],
        },
      ],
    }

    const result = auditMissingStates(page)

    const switchIssues = result.issues.filter((i) => i.componentName === 'Switch')
    expect(switchIssues.length).toBeGreaterThan(0)
  })
})
