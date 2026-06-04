import { Button, cn } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { RuntimeIcon, RuntimeInstallHint } from './agent-dialogs'
import { DesktopConnectorDownloadCard } from './desktop-connector-download-card'
import {
  type Agent,
  type ConnectorComputer,
  type ConnectorRuntimeInfo,
  connectorRuntimeDisplayDetail,
} from './types'

type ConnectorBootstrapResult = {
  computer: ConnectorComputer
  command: string
}

type ConnectorConfigureResult = {
  agent: Agent
  job: { id: string; status: string; type: string } | null
}

function runtimeSortKey(runtime: ConnectorRuntimeInfo) {
  const priority: Record<string, number> = {
    openclaw: 0,
    hermes: 1,
    'claude-code': 2,
    codex: 3,
    opencode: 4,
  }
  return priority[runtime.id] ?? 50
}

export function DaemonConnectionGuide({ agent, t }: { agent: Agent; t: TFunction }) {
  const queryClient = useQueryClient()
  const [connectorCommand, setConnectorCommand] = useState<string | null>(null)
  const [selectedRuntimeKey, setSelectedRuntimeKey] = useState<string | null>(null)
  const [queuedRuntimeId, setQueuedRuntimeId] = useState<string | null>(null)
  const [isWaitingForDesktopConnector, setIsWaitingForDesktopConnector] = useState(false)
  const bootstrapStartedRef = useRef(false)

  const { data: connectorData, isFetching } = useQuery({
    queryKey: ['connector-computers'],
    queryFn: () => fetchApi<{ computers: ConnectorComputer[] }>('/api/connector/computers'),
    refetchInterval: isWaitingForDesktopConnector ? 3000 : false,
  })

  const connectorComputers = connectorData?.computers ?? []
  const runtimeOptions = useMemo(
    () =>
      connectorComputers
        .filter((computer) => computer.status === 'online')
        .flatMap((computer) =>
          computer.runtimes
            .filter((runtime) => runtime.id !== 'gemini')
            .map((runtime) => ({
              key: `${computer.id}:${runtime.id}`,
              computer,
              runtime,
            })),
        )
        .sort(
          (a, b) =>
            runtimeSortKey(a.runtime) - runtimeSortKey(b.runtime) ||
            a.runtime.label.localeCompare(b.runtime.label),
        ),
    [connectorComputers],
  )
  const firstAvailableRuntimeOption =
    runtimeOptions.find((option) => option.runtime.status === 'available') ?? null
  const selectedRuntimeOption =
    runtimeOptions.find(
      (option) => option.key === selectedRuntimeKey && option.runtime.status === 'available',
    ) ??
    firstAvailableRuntimeOption ??
    null
  const runtimeOptionKeys = runtimeOptions.map((option) => option.key).join('\u0000')
  const canConfigure = Boolean(selectedRuntimeOption)

  const connectorBootstrap = useMutation({
    mutationFn: () =>
      fetchApi<ConnectorBootstrapResult>('/api/connector/computers/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          serverUrl: window.location.origin,
          name: t('agentMgmt.connectorDefaultComputerName'),
        }),
      }),
    onSuccess: (result) => {
      setConnectorCommand(result.command)
      queryClient.invalidateQueries({ queryKey: ['connector-computers'] })
    },
    onError: (error: Error) => {
      showToast(error.message || t('agentMgmt.connectorCreateFailed'), 'error')
    },
  })

  const configureMutation = useMutation({
    mutationFn: () => {
      if (!selectedRuntimeOption) {
        throw new Error(t('agentMgmt.connectorNoRuntime'))
      }
      return fetchApi<ConnectorConfigureResult>(
        `/api/connector/computers/${selectedRuntimeOption.computer.id}/buddies/${agent.id}/configure`,
        {
          method: 'POST',
          body: JSON.stringify({
            runtimeId: selectedRuntimeOption.runtime.id,
            serverUrl: window.location.origin,
          }),
        },
      )
    },
    onSuccess: () => {
      setQueuedRuntimeId(selectedRuntimeOption?.runtime.id ?? null)
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      showToast(t('agentMgmt.connectorJobQueuedTitle'), 'success')
    },
    onError: (error: Error) => {
      showToast(error.message || t('agentMgmt.connectorCreateFailed'), 'error')
    },
  })

  useEffect(() => {
    if (!runtimeOptionKeys) {
      if (selectedRuntimeKey) setSelectedRuntimeKey(null)
      return
    }
    if (
      !selectedRuntimeKey ||
      !runtimeOptions.some(
        (option) => option.key === selectedRuntimeKey && option.runtime.status === 'available',
      )
    ) {
      setSelectedRuntimeKey(firstAvailableRuntimeOption?.key ?? null)
    }
  }, [firstAvailableRuntimeOption, runtimeOptionKeys, runtimeOptions, selectedRuntimeKey])

  useEffect(() => {
    setQueuedRuntimeId(null)
    setSelectedRuntimeKey(null)
    setIsWaitingForDesktopConnector(false)
  }, [agent.id])

  useEffect(() => {
    if (runtimeOptions.length > 0 && isWaitingForDesktopConnector) {
      setIsWaitingForDesktopConnector(false)
    }
  }, [isWaitingForDesktopConnector, runtimeOptions.length])

  useEffect(() => {
    if (connectorData === undefined || runtimeOptions.length > 0 || connectorCommand) return
    if (connectorBootstrap.isPending || bootstrapStartedRef.current) return
    bootstrapStartedRef.current = true
    connectorBootstrap.mutate()
  }, [connectorBootstrap, connectorCommand, connectorData, runtimeOptions.length])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-subtle/70 bg-bg-primary/40 px-3 py-2.5">
        <p className="text-sm leading-6 text-text-secondary">
          {t('agentMgmt.connectorExistingGuideDesc')}
        </p>
      </div>

      {runtimeOptions.length === 0 && (
        <DesktopConnectorDownloadCard
          connectorCommand={connectorCommand}
          isWaitingForConnector={isWaitingForDesktopConnector}
          onWaitingForConnectorChange={setIsWaitingForDesktopConnector}
          t={t}
        />
      )}

      {runtimeOptions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              {t('agentMgmt.connectorRuntime')}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['connector-computers'] })}
              disabled={isFetching}
              className="h-8 rounded-full"
            >
              <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
              {t('common.refresh')}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {runtimeOptions.map((option) => {
              const available = option.runtime.status === 'available'
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={selectedRuntimeOption?.key === option.key}
                  disabled={!available}
                  onClick={() => {
                    if (!available) return
                    setSelectedRuntimeKey(option.key)
                    setQueuedRuntimeId(null)
                  }}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-left transition',
                    !available
                      ? 'border-border-subtle bg-bg-tertiary/20 opacity-75'
                      : selectedRuntimeOption?.key === option.key
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border-subtle bg-bg-tertiary/40 hover:bg-bg-tertiary/70',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-deep/50">
                      <RuntimeIcon
                        iconId={option.runtime.iconId}
                        runtimeId={option.runtime.id}
                        label={option.runtime.label}
                        className="h-5 w-5"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-text-primary">
                        {option.runtime.label}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block text-xs text-text-muted',
                          available ? 'truncate' : 'leading-5',
                        )}
                      >
                        {available ? (
                          connectorRuntimeDisplayDetail(option.computer, option.runtime)
                        ) : (
                          <RuntimeInstallHint runtimeId={option.runtime.id} t={t} />
                        )}
                      </span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border-subtle/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {queuedRuntimeId ? (
          <div className="flex min-w-0 items-start gap-2 text-xs leading-5 text-success">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              <span className="block font-semibold text-success">
                {t('agentMgmt.connectorJobQueuedTitle')}
              </span>
              <span className="text-text-muted">{t('agentMgmt.connectorJobQueuedDesc')}</span>
            </span>
          </div>
        ) : (
          <p className="text-xs leading-5 text-text-muted">
            {runtimeOptions.length > 0
              ? t('agentMgmt.connectorSelectRuntimeHint')
              : t('agentMgmt.connectorNoRuntime')}
          </p>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => configureMutation.mutate()}
          disabled={!canConfigure || configureMutation.isPending}
          className="h-9 rounded-full px-4"
        >
          {configureMutation.isPending
            ? t('agentMgmt.connectorConfiguringTitle')
            : t('agentMgmt.connectorConfigureAction')}
        </Button>
      </div>
    </div>
  )
}
