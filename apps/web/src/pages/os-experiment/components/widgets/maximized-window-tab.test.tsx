import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OsWindowState } from '../../types'
import { OsMaximizedWindowTab } from './maximized-window-tab'

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))

const maximizedWindow: OsWindowState = {
  id: 'app-window',
  kind: 'app',
  title: 'Docs',
  subtitle: 'Application',
  appKey: 'docs',
  iconUrl: null,
  x: 80,
  y: 80,
  width: 960,
  height: 680,
  z: 21,
  minimized: false,
  maximized: true,
}

describe('OsMaximizedWindowTab', () => {
  it('presents the maximized header as an active tab with a stable dropdown control', () => {
    const onRestore = vi.fn()
    render(
      <OsMaximizedWindowTab
        item={maximizedWindow}
        headerTools={[]}
        headerSearches={[]}
        windowMenuItems={[]}
        onRestore={onRestore}
        onMinimize={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const tab = screen.getByRole('tab', { name: 'Docs' })
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(tab.getAttribute('data-maximized-window-tab')).toBe('true')
    expect(tab.querySelector('button')).toBe(screen.getByRole('button', { name: 'os.windowMenu' }))

    fireEvent.click(tab)
    fireEvent.click(screen.getByRole('button', { name: 'os.restoreWindow' }))
    expect(onRestore).toHaveBeenCalledOnce()
  })

  it('keeps search and header tools inline while window actions stay in the dropdown', () => {
    const onWindowAction = vi.fn()
    const onMinimize = vi.fn()
    render(
      <OsMaximizedWindowTab
        item={maximizedWindow}
        headerTools={[['sidebar', <button type="button">Toggle sidebar</button>]]}
        headerSearches={[['search', <button type="button">Search docs</button>]]}
        windowMenuItems={[
          {
            id: 'refresh',
            label: 'Refresh docs',
            onSelect: onWindowAction,
          },
        ]}
        onRestore={vi.fn()}
        onMinimize={onMinimize}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Search docs' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Search docs' }))
    expect(screen.queryByRole('button', { name: 'os.hide' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'os.windowMenu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh docs' }))
    expect(onWindowAction).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'os.windowMenu' }))
    fireEvent.click(screen.getByRole('button', { name: 'os.hide' }))
    expect(onMinimize).toHaveBeenCalledOnce()
  })
})
