import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OsDockBar } from './dock-bar'
import type { ServerEntry } from './types'

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../components/server/server-icon', () => ({
  ServerIcon: () => <span data-testid="server-icon" />,
}))

const selectedServer: ServerEntry = {
  server: {
    id: 'server-1',
    name: 'Test Space',
    description: null,
    slug: 'test-space',
    iconUrl: null,
    bannerUrl: null,
  },
  member: { role: 'owner' },
}

function renderDock(onOpenDesktopSettings?: () => void) {
  render(
    <OsDockBar
      activeBuiltinWindows={new Set()}
      dockAppStackEntries={[]}
      focusedWindowId={null}
      hasInstalledDockApps={false}
      hasQuickStacks={false}
      isAppsLoading={false}
      minimizedWindowStack={[]}
      selectedServer={selectedServer}
      topAppWindows={[]}
      visibleBuiltinDockApps={[]}
      visibleDockApps={[]}
      workspaceFileStack={[]}
      onFocusWindow={vi.fn()}
      onOpenAppWindow={vi.fn()}
      onOpenBuiltinWindow={vi.fn()}
      onOpenDesktopSettings={onOpenDesktopSettings}
      onOpenDockIconContextMenu={vi.fn()}
      onOpenSpaceContextMenu={vi.fn()}
    />,
  )
}

describe('OsDockBar desktop settings', () => {
  it('opens desktop settings from the Dock when the desktop bridge is available', () => {
    const onOpenDesktopSettings = vi.fn()
    renderDock(onOpenDesktopSettings)

    fireEvent.click(screen.getByRole('button', { name: 'os.desktopSettings' }))

    expect(onOpenDesktopSettings).toHaveBeenCalledOnce()
  })

  it('does not render the desktop-only entry without a desktop bridge', () => {
    renderDock()

    expect(screen.queryByRole('button', { name: 'os.desktopSettings' })).toBeNull()
  })
})
