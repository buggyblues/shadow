import { describe, expect, it } from 'vitest'
import { classifyConnectorDevice } from '../src/device-info'

describe('classifyConnectorDevice', () => {
  it('recognizes common Apple form factors', () => {
    expect(classifyConnectorDevice({ os: 'darwin', model: 'MacBookPro18,3' })).toBe('macbook')
    expect(classifyConnectorDevice({ os: 'darwin', model: 'MacBook Pro · MacBookPro18,3' })).toBe(
      'macbook',
    )
    expect(classifyConnectorDevice({ os: 'darwin', model: 'Macmini9,1' })).toBe('mac-mini')
    expect(classifyConnectorDevice({ os: 'darwin', model: 'iMac21,1' })).toBe('imac')
  })

  it('uses chassis metadata for generic computers', () => {
    expect(classifyConnectorDevice({ os: 'linux', chassisType: 10 })).toBe('laptop')
    expect(classifyConnectorDevice({ os: 'win32', chassisType: 3 })).toBe('desktop')
    expect(classifyConnectorDevice({ os: 'linux', chassisType: 23 })).toBe('server')
  })
})
