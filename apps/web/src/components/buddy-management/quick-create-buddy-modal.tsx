import {
  Button,
  cn,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cloud, PawPrint, RefreshCw, Terminal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import {
  CLOUD_RUNTIME_LABELS,
  type CloudBuddyRuntimeId,
  CreateAgentDialog,
  RuntimeIcon,
  RuntimeInstallHelpButton,
} from './agent-dialogs'
import { ConfigCodeBlock } from './config-code-block'
import {
  type Agent,
  type ConnectorComputer,
  type ConnectorRuntimeInfo,
  connectorComputerDisplayName,
  connectorRuntimeDisplayDetail,
} from './types'

type QuickBuddyStep = 'basic' | 'advanced'
type CreateBuddyTarget = 'local' | 'cloud'

type ConnectorBootstrapResult = {
  computer: ConnectorComputer
  command: string
}

const CLOUD_BUDDY_RUNTIME_OPTIONS: Array<{
  id: CloudBuddyRuntimeId
  label: string
  descriptionKey: string
}> = [
  {
    id: 'openclaw',
    label: CLOUD_RUNTIME_LABELS.openclaw,
    descriptionKey: 'agentMgmt.cloudRuntimeOpenClawDesc',
  },
  {
    id: 'hermes',
    label: CLOUD_RUNTIME_LABELS.hermes,
    descriptionKey: 'agentMgmt.cloudRuntimeHermesDesc',
  },
  {
    id: 'claude-code',
    label: CLOUD_RUNTIME_LABELS['claude-code'],
    descriptionKey: 'agentMgmt.cloudRuntimeClaudeCodeDesc',
  },
  {
    id: 'codex',
    label: CLOUD_RUNTIME_LABELS.codex,
    descriptionKey: 'agentMgmt.cloudRuntimeCodexDesc',
  },
  {
    id: 'opencode',
    label: CLOUD_RUNTIME_LABELS.opencode,
    descriptionKey: 'agentMgmt.cloudRuntimeOpenCodeDesc',
  },
  {
    id: 'gemini',
    label: CLOUD_RUNTIME_LABELS.gemini,
    descriptionKey: 'agentMgmt.cloudRuntimeGeminiDesc',
  },
]

function runtimeSortKey(runtime: ConnectorRuntimeInfo) {
  const priority: Record<string, number> = {
    openclaw: 0,
    hermes: 1,
    'claude-code': 2,
    codex: 3,
    opencode: 4,
    gemini: 5,
  }
  return priority[runtime.id] ?? 50
}

export function QuickCreateBuddyModal({
  open,
  onClose,
  onSuccess,
  landing,
}: {
  open: boolean
  onClose: () => void
  onSuccess: (agent: Agent) => void | Promise<void>
  landing?: {
    title?: string
    description?: string
  }
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [quickBuddyStep, setQuickBuddyStep] = useState<QuickBuddyStep>('basic')
  const [createBuddyTarget, setCreateBuddyTarget] = useState<CreateBuddyTarget>('local')
  const [selectedCloudRuntimeId, setSelectedCloudRuntimeId] =
    useState<CloudBuddyRuntimeId>('openclaw')
  const [selectedConnectorComputerId, setSelectedConnectorComputerId] = useState<string | null>(
    null,
  )
  const [selectedConnectorRuntimeId, setSelectedConnectorRuntimeId] = useState<string | null>(null)
  const [connectorSelectionConfirmed, setConnectorSelectionConfirmed] = useState(false)
  const [connectorCommand, setConnectorCommand] = useState<string | null>(null)
  const connectorBootstrapStartedRef = useRef(false)

  const reset = useCallback(() => {
    setQuickBuddyStep('basic')
    setCreateBuddyTarget('local')
    setSelectedCloudRuntimeId('openclaw')
    setSelectedConnectorComputerId(null)
    setSelectedConnectorRuntimeId(null)
    setConnectorSelectionConfirmed(false)
    setConnectorCommand(null)
    connectorBootstrapStartedRef.current = false
  }, [])

  const close = useCallback(() => {
    reset()
    onClose()
  }, [onClose, reset])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const { data: connectorData, isFetching: isConnectorFetching } = useQuery({
    queryKey: ['connector-computers'],
    queryFn: () => fetchApi<{ computers: ConnectorComputer[] }>('/api/connector/computers'),
    enabled: open && createBuddyTarget === 'local',
    refetchInterval: open && createBuddyTarget === 'local' ? 5000 : false,
  })

  const connectorComputers = connectorData?.computers ?? []
  const connectorRuntimeOptions = useMemo(
    () =>
      connectorComputers
        .flatMap((computer) =>
          computer.runtimes.map((runtime) => ({
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
  const availableConnectorRuntimeOptions = connectorRuntimeOptions.filter(
    (option) => option.runtime.status === 'available',
  )
  const selectedConnectorRuntimeOption =
    availableConnectorRuntimeOptions.find(
      (option) =>
        option.computer.id === selectedConnectorComputerId &&
        option.runtime.id === selectedConnectorRuntimeId,
    ) ??
    availableConnectorRuntimeOptions[0] ??
    null
  const selectedConnectorComputer = selectedConnectorRuntimeOption?.computer ?? null
  const selectedConnectorRuntime = selectedConnectorRuntimeOption?.runtime ?? null
  const connectorRuntimeOptionKeys = connectorRuntimeOptions
    .map((option) => option.key)
    .join('\u0000')
  const selectedCloudRuntime =
    CLOUD_BUDDY_RUNTIME_OPTIONS.find((option) => option.id === selectedCloudRuntimeId) ??
    CLOUD_BUDDY_RUNTIME_OPTIONS[0]
  const canContinueCreateBuddy =
    createBuddyTarget === 'cloud'
      ? Boolean(selectedCloudRuntime)
      : Boolean(selectedConnectorRuntimeOption)
  const isCreateBuddyDetailsStep = connectorSelectionConfirmed && canContinueCreateBuddy
  const isQuickBuddyAdvanced = quickBuddyStep === 'advanced'

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

  useEffect(() => {
    if (!open || createBuddyTarget !== 'local' || connectorData === undefined) return
    if (
      availableConnectorRuntimeOptions.length > 0 ||
      connectorCommand ||
      connectorBootstrap.isPending ||
      connectorBootstrapStartedRef.current
    ) {
      return
    }
    connectorBootstrapStartedRef.current = true
    connectorBootstrap.mutate()
  }, [
    connectorBootstrap,
    connectorCommand,
    connectorData,
    availableConnectorRuntimeOptions.length,
    createBuddyTarget,
    open,
  ])

  useEffect(() => {
    if (!open || createBuddyTarget !== 'local') return
    if (!availableConnectorRuntimeOptions.length) {
      if (selectedConnectorComputerId) setSelectedConnectorComputerId(null)
      if (selectedConnectorRuntimeId) setSelectedConnectorRuntimeId(null)
      return
    }
    if (!selectedConnectorRuntimeOption) return
    if (selectedConnectorComputerId !== selectedConnectorRuntimeOption.computer.id) {
      setSelectedConnectorComputerId(selectedConnectorRuntimeOption.computer.id)
    }
    if (selectedConnectorRuntimeId !== selectedConnectorRuntimeOption.runtime.id) {
      setSelectedConnectorRuntimeId(selectedConnectorRuntimeOption.runtime.id)
    }
  }, [
    availableConnectorRuntimeOptions.length,
    connectorRuntimeOptionKeys,
    createBuddyTarget,
    selectedConnectorComputerId,
    selectedConnectorRuntimeId,
    selectedConnectorRuntimeOption,
    open,
  ])

  return (
    <Modal open={open} onClose={close}>
      <ModalContent
        maxWidth={isQuickBuddyAdvanced || !isCreateBuddyDetailsStep ? 'max-w-2xl' : 'max-w-[560px]'}
        className={cn(
          'transition-[max-width,height] duration-300 ease-out max-h-[calc(100vh-48px)]',
          !isCreateBuddyDetailsStep
            ? createBuddyTarget === 'cloud'
              ? 'h-[560px]'
              : 'h-[520px]'
            : isQuickBuddyAdvanced
              ? 'h-[520px]'
              : 'h-[760px]',
        )}
      >
        <ModalHeader
          icon={<PawPrint size={18} strokeWidth={2.5} />}
          title={t('agentMgmt.createTitle')}
          closeLabel={t('common.close')}
          onClose={close}
        />
        {isCreateBuddyDetailsStep ? (
          <CreateAgentDialog
            onClose={close}
            onSuccess={(agent) => {
              queryClient.invalidateQueries({ queryKey: ['agents'] })
              queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
              queryClient.invalidateQueries({ queryKey: ['cloud-saas'] })
              setQuickBuddyStep('basic')
              showToast(t('agentMgmt.createSuccess'), 'success')
              void Promise.resolve(onSuccess(agent)).catch((error: Error) => {
                showToast(error.message || t('agentMgmt.createFailed'), 'error')
              })
            }}
            onError={(message) => showToast(message || t('agentMgmt.createFailed'), 'error')}
            t={t}
            embedded
            quick
            hideTitle
            modalSections
            onBack={() => {
              setConnectorSelectionConfirmed(false)
              setQuickBuddyStep('basic')
            }}
            onQuickStepChange={setQuickBuddyStep}
            connectorComputerId={
              createBuddyTarget === 'local' ? selectedConnectorComputer?.id : undefined
            }
            connectorRuntimeId={
              createBuddyTarget === 'local' ? selectedConnectorRuntime?.id : undefined
            }
            connectorRuntimeLabel={
              createBuddyTarget === 'local' ? selectedConnectorRuntime?.label : undefined
            }
            serverUrl={createBuddyTarget === 'local' ? window.location.origin : undefined}
            cloudRuntimeId={createBuddyTarget === 'cloud' ? selectedCloudRuntime?.id : undefined}
            cloudRuntimeLabel={
              createBuddyTarget === 'cloud' ? selectedCloudRuntime?.label : undefined
            }
          />
        ) : (
          <>
            <ModalBody className="min-h-0 space-y-5 overflow-y-auto py-5">
              {landing?.title || landing?.description ? (
                <div className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-4">
                  {landing.title ? (
                    <div className="text-sm font-black text-text-primary">{landing.title}</div>
                  ) : null}
                  {landing.description ? (
                    <div className="mt-1 text-xs leading-5 text-text-muted">
                      {landing.description}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div
                role="tablist"
                aria-label={t('agentMgmt.createRunTarget')}
                className="grid grid-cols-2 rounded-2xl border border-border-subtle bg-bg-deep/40 p-1"
              >
                {(['local', 'cloud'] as const).map((target) => {
                  const selected = createBuddyTarget === target
                  const Icon = target === 'cloud' ? Cloud : Terminal
                  return (
                    <button
                      key={target}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => {
                        setCreateBuddyTarget(target)
                        setConnectorSelectionConfirmed(false)
                        setQuickBuddyStep('basic')
                      }}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition',
                        selected
                          ? 'bg-primary/15 text-primary shadow-sm'
                          : 'text-text-muted hover:bg-bg-tertiary/60 hover:text-text-primary',
                      )}
                    >
                      <Icon size={16} />
                      <span>
                        {t(
                          target === 'cloud'
                            ? 'agentMgmt.createRunTargetCloud'
                            : 'agentMgmt.createRunTargetLocal',
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>

              {createBuddyTarget === 'local' ? (
                <>
                  {connectorRuntimeOptions.length === 0 && (
                    <div className="rounded-2xl border border-border-subtle bg-bg-tertiary/40 px-4 py-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                          <Terminal size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-text-primary">
                            {t('agentMgmt.connectorDaemonTitle')}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4">
                        {connectorCommand ? (
                          <ConfigCodeBlock content={connectorCommand} mode="single" t={t} />
                        ) : (
                          <div className="rounded-2xl border border-border-subtle bg-bg-deep/40 px-4 py-3 text-xs leading-5 text-text-muted">
                            {t('agentMgmt.connectorCreating')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {connectorComputers.some((computer) => computer.runtimes.length > 0) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                          {t('agentMgmt.connectorRuntime')}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            queryClient.invalidateQueries({ queryKey: ['connector-computers'] })
                          }
                          disabled={isConnectorFetching}
                        >
                          <RefreshCw
                            size={14}
                            className={cn(isConnectorFetching && 'animate-spin')}
                          />
                          {t('common.refresh')}
                        </Button>
                      </div>
                      {connectorComputers.map((computer) => {
                        const runtimes = [...computer.runtimes].sort(
                          (a, b) =>
                            runtimeSortKey(a) - runtimeSortKey(b) || a.label.localeCompare(b.label),
                        )
                        if (runtimes.length === 0) return null
                        return (
                          <div key={computer.id} className="space-y-2">
                            <div className="text-xs font-black text-text-secondary">
                              {connectorComputerDisplayName(computer)}
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {runtimes.map((runtime) => {
                                const optionKey = `${computer.id}:${runtime.id}`
                                const selected = selectedConnectorRuntimeOption?.key === optionKey
                                const available = runtime.status === 'available'
                                return (
                                  <div
                                    key={optionKey}
                                    className={cn(
                                      'relative rounded-2xl border transition',
                                      !available
                                        ? 'border-border-subtle bg-bg-tertiary/20 opacity-75'
                                        : selected
                                          ? 'border-primary/50 bg-primary/10'
                                          : 'border-border-subtle bg-bg-tertiary/40 hover:bg-bg-tertiary/70',
                                    )}
                                  >
                                    <button
                                      type="button"
                                      disabled={!available}
                                      onClick={() => {
                                        if (!available) return
                                        setSelectedConnectorComputerId(computer.id)
                                        setSelectedConnectorRuntimeId(runtime.id)
                                        setConnectorSelectionConfirmed(false)
                                      }}
                                      className="w-full px-4 py-3 text-left disabled:cursor-not-allowed"
                                    >
                                      <div className="flex items-center gap-3 pr-8">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-deep/50">
                                          <RuntimeIcon
                                            iconId={runtime.iconId}
                                            runtimeId={runtime.id}
                                            label={runtime.label}
                                            className="h-5 w-5"
                                          />
                                        </span>
                                        <span className="min-w-0">
                                          <span className="block truncate text-sm font-black text-text-primary">
                                            {runtime.label}
                                          </span>
                                          <span className="mt-0.5 block truncate text-xs text-text-muted">
                                            {available
                                              ? connectorRuntimeDisplayDetail(computer, runtime)
                                              : t('agentMgmt.runtimeMissing')}
                                          </span>
                                        </span>
                                      </div>
                                    </button>
                                    {!available ? (
                                      <span className="absolute right-3 top-3">
                                        <RuntimeInstallHelpButton runtimeId={runtime.id} t={t} />
                                      </span>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                    {t('agentMgmt.cloudRuntime')}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CLOUD_BUDDY_RUNTIME_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSelectedCloudRuntimeId(option.id)
                          setConnectorSelectionConfirmed(false)
                        }}
                        className={cn(
                          'rounded-2xl border px-4 py-3 text-left transition',
                          selectedCloudRuntime?.id === option.id
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-border-subtle bg-bg-tertiary/40 hover:bg-bg-tertiary/70',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-deep/50">
                            <RuntimeIcon
                              runtimeId={option.id}
                              label={option.label}
                              className="h-6 w-6"
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-text-primary">
                              {option.label}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                              {t(option.descriptionKey)}
                            </span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter className="justify-end">
              <ModalButtonGroup>
                <Button variant="ghost" size="sm" onClick={close}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setConnectorSelectionConfirmed(true)}
                  disabled={!canContinueCreateBuddy}
                >
                  {t('agentMgmt.connectorContinue')}
                </Button>
              </ModalButtonGroup>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
