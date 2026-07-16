import { GlassPanel } from '@shadowob/ui'
import { Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../common/confirm-dialog'
import { RechargeModal } from '../recharge/recharge-modal'
import { FloatingVoiceCall } from '../voice/floating-voice-call'
import { SpaceAppApprovalModal, useAuthenticatedRuntime } from './authenticated-runtime'
import { CommandPalette } from './command-palette'

export function OsAppLayout() {
  return <OsAppLayoutInner />
}

function OsAppLayoutInner() {
  const { t } = useTranslation()
  const runtime = useAuthenticatedRuntime()

  return (
    <div className="desktop-app-shell os-app-shell relative flex h-dvh w-screen gap-0 overflow-hidden bg-transparent p-0">
      <div className="desktop-window-drag-strip" aria-hidden="true" />
      <div className="relative z-10 flex min-w-0 flex-1 select-none flex-col overflow-hidden">
        {runtime.isLoadingMe && !runtime.me ? (
          <GlassPanel className="flex flex-1 items-center justify-center">
            <div className="inline-flex items-center gap-2 text-sm text-white/50 animate-pulse">
              {t('common.loading')}
            </div>
          </GlassPanel>
        ) : (
          <Outlet />
        )}
      </div>
      <ConfirmDialog />
      <SpaceAppApprovalModal runtime={runtime} />
      <RechargeModal />
      <CommandPalette />
      <FloatingVoiceCall zIndex={2_147_483_000} />
    </div>
  )
}
