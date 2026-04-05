import { describe, it, expect } from 'vitest'
import {
  hasAccessibilityNotes,
  getRecommendation,
  auditA11yDescriptions,
} from './detect.js'

describe('hasAccessibilityNotes', () => {
  it('returns true for description mentioning keyboard', () => {
    expect(hasAccessibilityNotes('Supports keyboard navigation with arrow keys.')).toBe(true)
  })

  it('returns true for description mentioning ARIA', () => {
    expect(hasAccessibilityNotes('Uses role="dialog" and aria-labelledby.')).toBe(true)
  })

  it('returns true for description mentioning focus', () => {
    expect(hasAccessibilityNotes('Focus is trapped inside the dialog.')).toBe(true)
  })

  it('returns true for description mentioning screen reader', () => {
    expect(hasAccessibilityNotes('Announces changes to screen reader users.')).toBe(true)
  })

  it('returns true for description mentioning WCAG', () => {
    expect(hasAccessibilityNotes('Meets WCAG 2.2 AA requirements.')).toBe(true)
  })

  it('returns false for a generic description with no a11y keywords', () => {
    expect(hasAccessibilityNotes('A button component for actions.')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(hasAccessibilityNotes('')).toBe(false)
  })

  it('returns false for null', () => {
    expect(hasAccessibilityNotes(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(hasAccessibilityNotes(undefined)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(hasAccessibilityNotes('KEYBOARD navigation supported')).toBe(true)
    expect(hasAccessibilityNotes('Aria-label provided')).toBe(true)
  })

  it('detects escape key mention', () => {
    expect(hasAccessibilityNotes('Press Escape to close.')).toBe(true)
  })

  it('detects focus trap mention', () => {
    expect(hasAccessibilityNotes('Implements focus trap when open.')).toBe(true)
  })

  it('detects aria-live mention', () => {
    expect(hasAccessibilityNotes('Uses aria-live="polite" for updates.')).toBe(true)
  })
})

describe('getRecommendation', () => {
  it('returns specific guidance for Dialog', () => {
    const rec = getRecommendation('Dialog')
    expect(rec).toContain('focus')
    expect(rec).toContain('Escape')
  })

  it('returns specific guidance for Autocomplete', () => {
    const rec = getRecommendation('Autocomplete')
    expect(rec).toContain('combobox')
    expect(rec).toContain('arrow')
  })

  it('returns generic guidance for unknown component', () => {
    const rec = getRecommendation('UnknownWidget')
    expect(rec).toContain('keyboard')
    expect(rec).toContain('ARIA')
  })
})

describe('auditA11yDescriptions', () => {
  it('flags interactive components without a11y notes as failing', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Dialog',
          type: 'COMPONENT_SET',
          description: 'A modal overlay container for confirmations.',
          children: [
            { id: '2:0', name: 'width=0', type: 'COMPONENT' },
          ],
        },
      ],
    }

    const result = auditA11yDescriptions(page)

    expect(result.failing).toHaveLength(1)
    expect(result.failing[0].componentName).toBe('Dialog')
    expect(result.failing[0].severity).toBe('high')
    expect(result.failing[0].recommendation).toContain('focus')
    expect(result.passing).toHaveLength(0)
  })

  it('passes components whose descriptions mention accessibility', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Dialog',
          type: 'COMPONENT_SET',
          description: 'A modal dialog. Focus is trapped inside. Press Escape to close. Uses role="dialog".',
          children: [
            { id: '2:0', name: 'width=0', type: 'COMPONENT' },
          ],
        },
      ],
    }

    const result = auditA11yDescriptions(page)

    expect(result.passing).toHaveLength(1)
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
          description: 'Layout utility.',
          children: [
            { id: '2:0', name: 'space=0', type: 'COMPONENT' },
          ],
        },
      ],
    }

    const result = auditA11yDescriptions(page)

    expect(result.passing).toHaveLength(0)
    expect(result.failing).toHaveLength(0)
  })

  it('assigns high severity to complex widgets, medium to simple controls', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Autocomplete',
          type: 'COMPONENT_SET',
          description: 'A search input with dropdown.',
          children: [{ id: '2:0', name: 'open=false', type: 'COMPONENT' }],
        },
        {
          id: '1:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          description: 'An action button.',
          children: [{ id: '2:1', name: 'state=enabled', type: 'COMPONENT' }],
        },
      ],
    }

    const result = auditA11yDescriptions(page)

    const autoIssue = result.failing.find((i) => i.componentName === 'Autocomplete')
    const btnIssue = result.failing.find((i) => i.componentName === 'Button')

    expect(autoIssue.severity).toBe('high')
    expect(btnIssue.severity).toBe('medium')
  })

  it('handles components with no description at all', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Button',
          type: 'COMPONENT_SET',
          children: [{ id: '2:0', name: 'state=enabled', type: 'COMPONENT' }],
        },
      ],
    }

    const result = auditA11yDescriptions(page)

    expect(result.failing).toHaveLength(1)
    expect(result.failing[0].hasDescription).toBe(false)
    expect(result.failing[0].hasA11yNotes).toBe(false)
  })

  it('sets pageName on every issue', () => {
    const page = {
      id: '0:1',
      name: 'My Page',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Select',
          type: 'COMPONENT_SET',
          description: 'A dropdown.',
          children: [{ id: '2:0', name: 'state=enabled', type: 'COMPONENT' }],
        },
      ],
    }

    const result = auditA11yDescriptions(page)

    for (const issue of [...result.passing, ...result.failing]) {
      expect(issue.pageName).toBe('My Page')
    }
  })

  it('finds components nested inside sections', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Overlays',
          type: 'SECTION',
          children: [
            {
              id: '2:0',
              name: 'Toast',
              type: 'COMPONENT_SET',
              description: 'A notification message.',
              children: [{ id: '3:0', name: 'status=info', type: 'COMPONENT' }],
            },
          ],
        },
      ],
    }

    const result = auditA11yDescriptions(page)

    expect(result.failing).toHaveLength(1)
    expect(result.failing[0].componentName).toBe('Toast')
  })

  it('checks standalone components too', () => {
    const page = {
      id: '0:1',
      name: 'Components',
      type: 'CANVAS',
      children: [
        {
          id: '1:0',
          name: 'Menu',
          type: 'COMPONENT',
          description: 'A context menu.',
        },
      ],
    }

    const result = auditA11yDescriptions(page)

    expect(result.failing).toHaveLength(1)
    expect(result.failing[0].componentName).toBe('Menu')
  })
})
