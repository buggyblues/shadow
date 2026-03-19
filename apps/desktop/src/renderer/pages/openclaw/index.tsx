/**
 * OpenClaw Root Page
 *
 * Main entry point for the OpenClaw section of the desktop app.
 * Uses the OpenClawLayout sidebar for navigation and manages
 * page state within the OpenClaw feature area.
 *
 * Includes a gateway guard: if the gateway is not running,
 * non-dashboard pages show a prompt to start it first.
 */

import { useCallback, useEffect, useState } from 'react'
import type { GatewayStatus } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import { AgentsPage } from './agents'
import { BuddyPage } from './buddy'
import { ChannelsPage } from './channels'
import { CronPage } from './cron'
import { OpenClawDashboard } from './dashboard'
import { DebugPage } from './debug'
import { GatewayGuard } from './gateway-guard'
import { HelpPage } from './help'
import { ModelsPage } from './models'
import { OpenClawLayout, type OpenClawPage as OpenClawPageId } from './openclaw-layout'
import { SkillHubPage } from './skillhub'

export type { OpenClawPageId }

export function OpenClawPage() {
  const [activePage, setActivePage] = useState<OpenClawPageId>('dashboard')
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null)

  const loadStatus = useCallback(async () => {
    if (!openClawApi.isAvailable) return
    try {
      const s = await openClawApi.getGatewayStatus()
      setGatewayStatus(s)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    loadStatus()
    if (!openClawApi.isAvailable) return
    const unsub = openClawApi.onGatewayStatusChanged((s) => setGatewayStatus(s))
    return unsub
  }, [loadStatus])

  // Dashboard, Debug, and Help are always accessible
  const isRunning = gatewayStatus?.state === 'running'
  const needsGuard =
    activePage !== 'dashboard' && activePage !== 'debug' && activePage !== 'help' && !isRunning

  return (
    <OpenClawLayout activePage={activePage} onNavigate={setActivePage}>
      {needsGuard ? (
        <GatewayGuard status={gatewayStatus} onGoToDashboard={() => setActivePage('dashboard')} />
      ) : activePage === 'dashboard' ? (
        <OpenClawDashboard onNavigate={setActivePage} />
      ) : activePage === 'skillhub' ? (
        <SkillHubPage />
      ) : activePage === 'channels' ? (
        <ChannelsPage />
      ) : activePage === 'models' ? (
        <ModelsPage />
      ) : activePage === 'agents' ? (
        <AgentsPage />
      ) : activePage === 'cron' ? (
        <CronPage />
      ) : activePage === 'buddy' ? (
        <BuddyPage />
      ) : activePage === 'help' ? (
        <HelpPage onNavigate={setActivePage} />
      ) : activePage === 'debug' ? (
        <DebugPage />
      ) : null}
    </OpenClawLayout>
  )
}
