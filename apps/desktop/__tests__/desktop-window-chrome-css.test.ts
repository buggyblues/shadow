import { describe, expect, it } from 'vitest'
import {
  createDesktopCommunityWindowChromeCss,
  DESKTOP_COMMUNITY_WINDOW_CONTROL_INSET,
} from '../src/main/window-chrome-css'

describe('desktop community window chrome CSS', () => {
  it('reserves the macOS window controls in windowed mode', () => {
    const css = createDesktopCommunityWindowChromeCss('darwin')

    expect(css).toContain('desktop-window-windowed')
    expect(css).toContain(`${DESKTOP_COMMUNITY_WINDOW_CONTROL_INSET}px`)
    expect(css).toContain('padding-top: var(--desktop-community-window-control-inset) !important')
    expect(css).toContain('.desktop-os-top-bar')
    expect(css).toContain('header.absolute.left-0.right-0.top-0')
    expect(css).toContain('.desktop-os-main-surface')
    expect(css).toContain('main.absolute.inset-0')
    expect(css).toContain(
      'height: calc(2.5rem + var(--desktop-community-window-control-inset)) !important',
    )
  })

  it('removes the inset in native and HTML fullscreen modes', () => {
    const css = createDesktopCommunityWindowChromeCss('darwin')

    expect(css).toContain('desktop-window-fullscreen')
    expect(css).toContain('desktop-community-window:fullscreen')
    expect(css).toContain('padding-top: 0 !important')
  })

  it('does not add an overlay inset for Windows or Linux native title bars', () => {
    expect(createDesktopCommunityWindowChromeCss('win32')).toBe('')
    expect(createDesktopCommunityWindowChromeCss('linux')).toBe('')
  })
})
