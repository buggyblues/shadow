/**
 * Gateway Guard — Token-based theming
 * Prompts the user to wake up the gateway.
 */

import { AlertCircle, Loader2, Power } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GatewayStatus } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import { OpenClawIcon } from './openclaw-brand'

export function GatewayGuard({
  status,
  onGoToDashboard,
}: {
  status: GatewayStatus | null
  onGoToDashboard: () => void
}) {
  const { t } = useTranslation()
  const [starting, setStarting] = useState(false)

  const state = status?.state ?? 'offline'
  const isTransient = state === 'starting' || state === 'bootstrapping' || state === 'installing'
  const isError = state === 'error'

  const handleStart = async () => {
    setStarting(true)
    try {
      if (state === 'offline') await openClawApi.startGateway()
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full">
      <div className="max-w-md w-full flex flex-col items-center gap-6">
        {/* Icon */}
        <div className="relative">
          <div className="bg-bg-secondary p-8 rounded-[40px] border border-border-subtle">
            {isTransient ? (
              <Loader2 size={64} className="text-primary animate-spin" strokeWidth={2} />
            ) : isError ? (
              <AlertCircle size={64} className="text-danger" strokeWidth={2} />
            ) : (
              <div className="opacity-60 grayscale">
                <OpenClawIcon size={80} />
              </div>
            )}
          </div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-bg-tertiary px-4 py-1.5 rounded-full text-xs font-bold text-text-muted border border-border-subtle whitespace-nowrap">
            {state.toUpperCase()}
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <h2 className="text-2xl font-black text-text-primary tracking-tight">
            {isTransient
              ? t('openclaw.guard.starting', '正在唤醒...')
              : isError
                ? t('openclaw.guard.error', '出了点问题')
                : t('openclaw.guard.offline', '龙虾服务正在休息')}
          </h2>
          <p className="text-text-muted font-medium leading-relaxed">
            {isTransient
              ? t('openclaw.guard.startingDesc', '正在准备你的 AI 工作区，请稍候。')
              : isError
                ? status?.error || t('openclaw.guard.errorDesc', '请检查龙虾服务页面获取详情。')
                : t('openclaw.guard.offlineDesc', '启动龙虾服务以访问此功能。')}
          </p>
        </div>

        {state === 'offline' && (
          <button
            type="button"
            onClick={handleStart}
            disabled={starting}
            className="flex items-center justify-center gap-2 px-8 py-4 w-full rounded-2xl bg-primary text-white font-bold text-lg hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-50"
          >
            {starting ? <Loader2 size={24} className="animate-spin" /> : <Power size={24} />}
            <span>{t('openclaw.guard.startGateway', '唤醒龙虾服务')}</span>
          </button>
        )}

        {isError && (
          <button
            type="button"
            onClick={onGoToDashboard}
            className="text-sm font-semibold text-text-muted hover:text-text-primary underline underline-offset-4 transition-colors"
          >
            {t('openclaw.guard.goToDashboard', '前往仪表盘')}
          </button>
        )}
      </div>
    </div>
  )
}
