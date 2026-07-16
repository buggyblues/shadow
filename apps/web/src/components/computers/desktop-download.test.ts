import { describe, expect, it } from 'vitest'
import { desktopDownloadPath } from './desktop-download'

function computer(os: string, arch: string) {
  return {
    device: { class: 'unknown' as const, os, arch },
  }
}

describe('desktopDownloadPath', () => {
  it('does not confuse Darwin with Windows', () => {
    expect(desktopDownloadPath(computer('darwin', 'arm64'))).toBe('/desktop/download/macos-arm64')
  })

  it('selects the matching Windows and Linux packages', () => {
    expect(desktopDownloadPath(computer('win32', 'x64'))).toBe('/desktop/download/windows-x64')
    expect(desktopDownloadPath(computer('linux', 'x64'))).toBe('/desktop/download/linux-x64')
  })
})
