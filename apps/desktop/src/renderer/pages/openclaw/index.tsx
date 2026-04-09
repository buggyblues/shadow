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
import { HelpPage } from './help'
import { ModelsPage } from './models'
import { OnboardPage } from './onboard'
import { OpenClawLayout, type OpenClawPage as OpenClawPageId } from './openclaw-layout'
import { SkillHubPage } from './skillhub'

export type { OpenClawPageId }

export interface NavContext {
  initialAgentId?: string
  returnTo?: OpenClawPageId
}

export function OpenClawPage() {
  const [activePage, setActivePage] = useState<OpenClawPageId>('dashboard')
  const [navContext, setNavContext] = useState<NavContext | null>(null)
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null)
  const [initialChecked, setInitialChecked] = useState(false)

  const navigate = useCallback((page: OpenClawPageId, ctx?: NavContext) => {
    setNavContext(ctx ?? null)
    setActivePage(page)
  }, [])

  const loadStatus = useCallback(async () => {
    if (!openClawApi.isAvailable) return
    try {
      const s = await openClawApi.getGatewayStatus()
      setGatewayStatus(s)
    } catch {
      /* ignore */
    }
  }, [])

  // Check if onboarding is needed (no agents and no providers configured)
  useEffect(() => {
    if (!openClawApi.isAvailable || initialChecked) return
    Promise.all([openClawApi.listAgents(), openClawApi.listModels()])
      .then(([agents, models]) => {
        const hasAgents = agents.length > 0
        const hasProviders = Object.keys(models).length > 0
        if (!hasAgents && !hasProviders) {
          setActivePage('onboard')
        }
      })
      .catch(() => {})
      .finally(() => setInitialChecked(true))
  }, [initialChecked])

  useEffect(() => {
    loadStatus()
    if (!openClawApi.isAvailable) return
    const unsub = openClawApi.onGatewayStatusChanged((s) => setGatewayStatus(s))
    return unsub
  }, [loadStatus])

  return (
    <OpenClawLayout activePage={activePage} onNavigate={navigate} gatewayStatus={gatewayStatus}>
      {activePage === 'dashboard' ? (
        <OpenClawDashboard onNavigate={navigate} />
      ) : activePage === 'skillhub' ? (
        <SkillHubPage />
      ) : activePage === 'channels' ? (
        <ChannelsPage />
      ) : activePage === 'models' ? (
        <ModelsPage />
      ) : activePage === 'agents' ? (
        <AgentsPage onNavigate={navigate} />
      ) : activePage === 'cron' ? (
        <CronPage />
      ) : activePage === 'buddy' ? (
        <BuddyPage navContext={navContext} onNavigate={navigate} />
      ) : activePage === 'help' ? (
        <HelpPage onNavigate={navigate} />
      ) : activePage === 'debug' ? (
        <DebugPage />
      ) : activePage === 'onboard' ? (
        <OnboardPage onNavigate={navigate} />
      ) : null}
    </OpenClawLayout>
  )
}
