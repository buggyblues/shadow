import { beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from './ui.store'

describe('useUIStore command palette actions', () => {
  beforeEach(() => {
    useUIStore.setState({
      pendingAction: null,
      homeCommandPaletteRequestId: 0,
      homeCommandPaletteOpen: false,
      homeCommandPaletteQuery: '',
      homeCommandPaletteKeyboardHeight: 0,
    })
  })

  it('creates a fresh home command palette action for every request', () => {
    useUIStore.getState().requestHomeCommandPalette()
    const first = useUIStore.getState().pendingAction

    useUIStore.getState().requestHomeCommandPalette()
    const second = useUIStore.getState().pendingAction

    expect(first).toBe('open-home-command-palette:1')
    expect(second).toBe('open-home-command-palette:2')
    expect(second).not.toBe(first)
    expect(useUIStore.getState().homeCommandPaletteOpen).toBe(true)
    expect(useUIStore.getState().homeCommandPaletteQuery).toBe('')
  })

  it('clears query when the home command palette closes', () => {
    useUIStore.getState().requestHomeCommandPalette()
    useUIStore.getState().setHomeCommandPaletteQuery('Coffee')

    useUIStore.getState().setHomeCommandPaletteOpen(false)

    expect(useUIStore.getState().homeCommandPaletteOpen).toBe(false)
    expect(useUIStore.getState().homeCommandPaletteQuery).toBe('')
  })
})
