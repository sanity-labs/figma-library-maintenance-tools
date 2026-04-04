import { describe, it, expect } from 'vitest'
import { lintCasing } from './index.js'

function fd(pages) { return { document: { children: pages } } }
function pg(name, children) { return { type: 'CANVAS', name, id: '0:1', children } }

describe('lintCasing', () => {
  it('detects uppercase text layers in component sets', async () => {
    const r = await lintCasing({ fileKey: 't', fileData: fd([pg('C', [{
      type: 'COMPONENT_SET', name: 'TextInput', id: '1:1', children: [{
        type: 'COMPONENT', name: 'state=enabled', id: '1:2', children: [
          { name: 'Value', type: 'TEXT', id: '1:3' }, { name: 'label', type: 'TEXT', id: '1:4' },
        ],
      }],
    }])]) })
    expect(r.summary.totalIssues).toBe(1)
    expect(r.issues[0].layerName).toBe('Value')
  })
  it('detects in standalone components', async () => {
    const r = await lintCasing({ fileKey: 't', fileData: fd([pg('C', [{
      type: 'COMPONENT', name: 'TabList', id: '2:1', children: [{ name: 'Title', type: 'TEXT', id: '2:2' }],
    }])]) })
    expect(r.summary.totalIssues).toBe(1)
  })
  it('respects pages filter', async () => {
    const r = await lintCasing({ fileKey: 't', fileData: fd([pg('C', [{
      type: 'COMPONENT_SET', name: 'Badge', id: '3:1', children: [{
        type: 'COMPONENT', name: 'x', id: '3:2', children: [{ name: 'Badge', type: 'TEXT', id: '3:3' }],
      }],
    }]), pg('I', [])]), pages: ['I'] })
    expect(r.summary.totalIssues).toBe(0)
  })
  it('returns clean report when all lowercase', async () => {
    const r = await lintCasing({ fileKey: 't', fileData: fd([pg('C', [{
      type: 'COMPONENT_SET', name: 'Button', id: '4:1', children: [{
        type: 'COMPONENT', name: 'x', id: '4:2', children: [
          { name: 'label', type: 'TEXT', id: '4:3' }, { name: 'icon', type: 'INSTANCE', id: '4:4' },
        ],
      }],
    }])]) })
    expect(r.summary.totalIssues).toBe(0)
  })
  it('finds components inside sections', async () => {
    const r = await lintCasing({ fileKey: 't', fileData: fd([pg('C', [{
      type: 'SECTION', name: 'Badge', id: '5:0', children: [{
        type: 'COMPONENT_SET', name: 'Badge', id: '5:1', children: [{
          type: 'COMPONENT', name: 'x', id: '5:2', children: [{ name: 'Badge', type: 'TEXT', id: '5:3' }],
        }],
      }],
    }])]) })
    expect(r.summary.totalIssues).toBe(1)
  })
  it('adds figmaUrl', async () => {
    const r = await lintCasing({ fileKey: 'k', fileData: fd([pg('C', [{
      type: 'COMPONENT_SET', name: 'Toast', id: '6:1', children: [{
        type: 'COMPONENT', name: 'x', id: '6:2', children: [{ name: 'Title', type: 'TEXT', id: '6:3' }],
      }],
    }])]) })
    expect(r.issues[0].figmaUrl).toContain('k')
  })
})
