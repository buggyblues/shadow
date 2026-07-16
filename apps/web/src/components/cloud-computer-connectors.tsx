import type {
  ShadowCloudComputerConnector,
  ShadowCloudComputerConnectorOAuthFlowResponse,
  ShadowCloudComputerConnectorOAuthStartResponse,
  ShadowCloudComputerConnectorsResponse,
} from '@shadowob/sdk'
import { cloudConnectorAccessKind } from '@shadowob/shared'
import {
  Button,
  cn,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Check,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { useConfirmStore } from './common/confirm-dialog'

type CloudComputerConnector = ShadowCloudComputerConnector
type ConnectorsResponse = ShadowCloudComputerConnectorsResponse
type OAuthStartResponse = ShadowCloudComputerConnectorOAuthStartResponse
type OAuthFlowResponse = ShadowCloudComputerConnectorOAuthFlowResponse

function connectorStatusClass(status: CloudComputerConnector['status']) {
  if (status === 'ready') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  if (status === 'error') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
  if (status === 'applying') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return 'bg-bg-tertiary text-text-muted'
}

function ConnectorGlyph({ connector }: { connector: CloudComputerConnector }) {
  const letters = connector.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border-subtle bg-white p-1 text-sm font-bold text-primary shadow-sm dark:bg-white/95">
      {connector.iconDataUrl ? (
        <img
          src={connector.iconDataUrl}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        letters || <PlugZap size={19} />
      )}
    </div>
  )
}

function ConnectorStatus({ connector }: { connector: CloudComputerConnector }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
        connectorStatusClass(connector.status),
      )}
    >
      {connector.status === 'applying' ? <Loader2 size={11} className="animate-spin" /> : null}
      {connector.status === 'ready' ? <Check size={11} /> : null}
      {connector.status === 'error' ? <AlertCircle size={11} /> : null}
      {t(`cloudComputers.connectors.status.${connector.status}`)}
    </span>
  )
}

function ConnectorAccess({ connector }: { connector: CloudComputerConnector }) {
  const { t } = useTranslation()
  const kind = cloudConnectorAccessKind(connector)
  const label =
    kind === 'direct'
      ? t('cloudComputers.connectors.access.direct')
      : connector.account
        ? connector.account.authType === 'oauth2'
          ? t('cloudComputers.connectors.access.oauthConnected')
          : t('cloudComputers.connectors.access.credentialsConnected')
        : t(`cloudComputers.connectors.access.${kind}`)

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold',
        kind === 'oauth'
          ? 'bg-primary/10 text-primary'
          : kind === 'direct'
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'bg-bg-tertiary text-text-muted',
      )}
    >
      {kind === 'unavailable' ? (
        <AlertCircle size={11} />
      ) : kind === 'oauth' ? (
        <Link2 size={11} />
      ) : kind === 'manual' ? (
        <KeyRound size={11} />
      ) : (
        <Check size={11} />
      )}
      {label}
    </span>
  )
}

function connectorInitialOptions(connector: CloudComputerConnector) {
  return Object.fromEntries(
    connector.optionFields.map((field) => [
      field.key,
      connector.options[field.key] ?? field.defaultValue ?? (field.type === 'boolean' ? false : ''),
    ]),
  )
}

function normalizedConnectorOptions(
  connector: CloudComputerConnector,
  options: Record<string, unknown>,
) {
  return Object.fromEntries(
    connector.optionFields.map((field) => {
      const value = options[field.key]
      if (field.type === 'string-array' && typeof value === 'string') {
        return [
          field.key,
          value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        ]
      }
      if (field.type === 'number' && typeof value === 'string') {
        return [field.key, Number(value)]
      }
      return [field.key, value]
    }),
  )
}

function ConnectorSetupModal({
  connector,
  saving,
  oauthStarting,
  error,
  onClose,
  onSubmit,
  onOAuth,
}: {
  connector: CloudComputerConnector | null
  saving: boolean
  oauthStarting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: {
    credentials?: Record<string, string>
    options: Record<string, unknown>
  }) => void
  onOAuth: (options: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const [showManualCredentials, setShowManualCredentials] = useState(false)

  useEffect(() => {
    if (!connector) return
    setCredentials(Object.fromEntries(connector.authFields.map((field) => [field.key, ''])))
    setOptions(connectorInitialOptions(connector))
    setShowManualCredentials(
      Boolean(connector.account && connector.account.authType !== 'oauth2') ||
        Boolean(
          connector.oauth?.available && !connector.oauth.configured && connector.authFields.length,
        ),
    )
  }, [connector])

  if (!connector) return null
  const accessKind = cloudConnectorAccessKind(connector)
  const manualCredentialsVisible =
    accessKind === 'manual' ||
    showManualCredentials ||
    Boolean(connector.account && connector.account.authType !== 'oauth2')
  const needsCredentials = !connector.account
  const hasEnteredCredential = Object.values(credentials).some((value) => value.trim())
  const missingRequired =
    needsCredentials &&
    manualCredentialsVisible &&
    connector.authFields.some((field) => field.required && !credentials[field.key]?.trim())

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving || missingRequired) return
    onSubmit({
      ...(hasEnteredCredential ? { credentials } : {}),
      options: normalizedConnectorOptions(connector, options),
    })
  }

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      closeOnEscape={!saving}
      closeOnOverlayClick={!saving}
    >
      <ModalContent maxWidth="max-w-xl">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <ModalHeader
            overline={t('cloudComputers.connectors.title')}
            icon={
              connector.iconDataUrl ? (
                <img
                  src={connector.iconDataUrl}
                  alt=""
                  className="h-8 w-8 object-contain"
                  draggable={false}
                />
              ) : (
                <Link2 size={18} strokeWidth={2.4} />
              )
            }
            title={connector.name}
            subtitle={connector.description}
            closeLabel={t('common.close')}
            hideCloseButton={saving}
          />
          <ModalBody className="space-y-5">
            {connector.account && accessKind !== 'direct' ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <ShieldCheck size={18} className="shrink-0 text-emerald-500" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {connector.account.accountName || t('cloudComputers.connectors.savedAccount')}
                  </p>
                  <p className="text-xs text-text-muted">
                    {t('cloudComputers.connectors.savedCredentialHint')}
                  </p>
                  <div className="mt-2">
                    <ConnectorAccess connector={connector} />
                  </div>
                </div>
              </div>
            ) : null}

            {!connector.account || accessKind === 'direct' ? (
              <div
                className={cn(
                  'rounded-xl border p-3',
                  accessKind === 'oauth' && connector.oauth?.configured
                    ? 'border-primary/20 bg-primary/5'
                    : accessKind === 'direct'
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : 'border-border-subtle bg-bg-tertiary/50',
                )}
              >
                <ConnectorAccess connector={connector} />
                <p className="mt-2 text-xs leading-5 text-text-muted">
                  {accessKind === 'oauth' && !connector.oauth?.configured
                    ? t('cloudComputers.connectors.oauthUnavailableHint')
                    : t(`cloudComputers.connectors.accessHint.${accessKind}`)}
                </p>
              </div>
            ) : null}

            {connector.oauth?.available &&
            connector.authFields.length > 0 &&
            !manualCredentialsVisible ? (
              <button
                type="button"
                className="text-left text-xs font-semibold text-text-muted underline-offset-4 hover:text-text-primary hover:underline"
                onClick={() => setShowManualCredentials(true)}
              >
                {t('cloudComputers.connectors.useTokenInstead')}
              </button>
            ) : null}

            {connector.authFields.length > 0 && manualCredentialsVisible ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {connector.oauth?.available
                      ? t('cloudComputers.connectors.manualCredentials')
                      : t('cloudComputers.connectors.credentials')}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    {connector.account
                      ? t('cloudComputers.connectors.replaceCredentialHint')
                      : t('cloudComputers.connectors.credentialSecurityHint')}
                  </p>
                </div>
                {connector.authFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Input
                      label={`${field.label}${field.required ? ' *' : ''}`}
                      type={field.sensitive ? 'password' : 'text'}
                      autoComplete="off"
                      placeholder={
                        connector.account
                          ? t('cloudComputers.connectors.keepSavedCredential')
                          : field.placeholder
                      }
                      value={credentials[field.key] ?? ''}
                      disabled={saving}
                      onChange={(event) =>
                        setCredentials((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                    {field.description ? (
                      <p className="text-xs leading-5 text-text-muted">{field.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {connector.optionFields.length > 0 ? (
              <div className="space-y-3 border-t border-border-subtle pt-4">
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('cloudComputers.connectors.preferences')}
                </h3>
                {connector.optionFields.map((field) =>
                  field.type === 'boolean' ? (
                    <label
                      key={field.key}
                      className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border-subtle p-3"
                    >
                      <span>
                        <span className="block text-sm font-medium text-text-primary">
                          {field.label}
                        </span>
                        {field.description ? (
                          <span className="mt-1 block text-xs leading-5 text-text-muted">
                            {field.description}
                          </span>
                        ) : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(options[field.key])}
                        disabled={saving}
                        className="mt-1 h-4 w-4 accent-primary"
                        onChange={(event) =>
                          setOptions((current) => ({
                            ...current,
                            [field.key]: event.target.checked,
                          }))
                        }
                      />
                    </label>
                  ) : (
                    <div key={field.key} className="space-y-1.5">
                      <Input
                        label={field.label}
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={
                          Array.isArray(options[field.key])
                            ? (options[field.key] as unknown[]).join(', ')
                            : String(options[field.key] ?? '')
                        }
                        disabled={saving}
                        onChange={(event) =>
                          setOptions((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                      {field.description ? (
                        <p className="text-xs leading-5 text-text-muted">{field.description}</p>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            ) : null}

            <div className="rounded-lg bg-bg-tertiary p-3 text-xs leading-5 text-text-muted">
              {t('cloudComputers.connectors.applyHint')}
            </div>
            {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onClose}>
                {t('common.cancel')}
              </Button>
              {connector.oauth?.available && connector.oauth.configured ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || oauthStarting}
                  onClick={() => onOAuth(normalizedConnectorOptions(connector, options))}
                >
                  {oauthStarting ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <ExternalLink size={15} />
                  )}
                  {t('cloudComputers.connectors.connectWithOAuth')}
                </Button>
              ) : null}
              {connector.connected || accessKind === 'direct' || accessKind === 'manual' ? (
                <Button
                  type="submit"
                  variant={connector.oauth?.configured ? 'secondary' : 'primary'}
                  size="sm"
                  disabled={saving || missingRequired}
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />}
                  {connector.connected
                    ? t('cloudComputers.connectors.update')
                    : accessKind === 'direct'
                      ? t('cloudComputers.connectors.enable')
                      : connector.oauth?.available
                        ? t('cloudComputers.connectors.connectManually')
                        : t('cloudComputers.connectors.connect')}
                </Button>
              ) : null}
            </ModalButtonGroup>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  )
}

export function CloudComputerConnectorsApp({ computerId }: { computerId: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [oauthFlow, setOauthFlow] = useState<{
    id: string
    pluginId: string
    options: Record<string, unknown>
  } | null>(null)
  const oauthPopupRef = useRef<Window | null>(null)

  const connectorsQuery = useQuery({
    queryKey: ['cloud-computer-connectors', computerId, i18n.resolvedLanguage],
    queryFn: () =>
      fetchApi<ConnectorsResponse>(
        `/api/cloud-computers/${encodeURIComponent(computerId)}/connectors?locale=${encodeURIComponent(i18n.resolvedLanguage ?? i18n.language)}`,
      ),
    refetchInterval: (result) =>
      result.state.data?.connectors.some((connector) => connector.status === 'applying')
        ? 3000
        : false,
  })

  const connectors = connectorsQuery.data?.connectors ?? []
  const selected = connectors.find((connector) => connector.id === selectedId) ?? null
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return connectors
      .filter((connector) => {
        if (!normalized) return true
        return [connector.name, connector.description, connector.id, ...connector.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalized)
      })
      .sort((a, b) => Number(b.connected) - Number(a.connected) || b.popularity - a.popularity)
  }, [connectors, query])

  const connectMutation = useMutation({
    mutationFn: (input: {
      connector: CloudComputerConnector
      credentials?: Record<string, string>
      options: Record<string, unknown>
    }) =>
      fetchApi(
        `/api/cloud-computers/${encodeURIComponent(computerId)}/connectors/${encodeURIComponent(
          input.connector.id,
        )}`,
        {
          method: 'PUT',
          body: JSON.stringify({ credentials: input.credentials, options: input.options }),
        },
      ),
    onSuccess: () => {
      setSelectedId(null)
      setMutationError(null)
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-connectors', computerId] })
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
    onError: (error: Error) => setMutationError(error.message),
  })

  const oauthStartMutation = useMutation({
    mutationFn: (input: { connector: CloudComputerConnector; options: Record<string, unknown> }) =>
      fetchApi<OAuthStartResponse>(
        `/api/cloud-computers/${encodeURIComponent(computerId)}/connectors/${encodeURIComponent(
          input.connector.id,
        )}/oauth/start`,
        { method: 'POST' },
      ).then((result) => ({ ...result, input })),
    onSuccess: (result) => {
      if (oauthPopupRef.current) oauthPopupRef.current.location.href = result.authorizationUrl
      setOauthFlow({
        id: result.flowId,
        pluginId: result.input.connector.id,
        options: result.input.options,
      })
      setMutationError(null)
    },
    onError: (error: Error) => {
      oauthPopupRef.current?.close()
      oauthPopupRef.current = null
      setMutationError(error.message)
    },
  })

  const oauthFlowQuery = useQuery({
    queryKey: ['cloud-computer-connector-oauth-flow', oauthFlow?.id],
    enabled: Boolean(oauthFlow?.id),
    queryFn: () =>
      fetchApi<OAuthFlowResponse>(
        `/api/cloud-computers/oauth/flows/${encodeURIComponent(oauthFlow?.id ?? '')}`,
      ),
    refetchInterval: (result) =>
      result.state.data?.flow.status === 'completed' ||
      result.state.data?.flow.status === 'error' ||
      result.state.data?.flow.status === 'expired'
        ? false
        : 1200,
  })

  useEffect(() => {
    const flow = oauthFlowQuery.data?.flow
    if (!flow || !oauthFlow) return
    if (flow.status === 'error' || flow.status === 'expired') {
      setMutationError(flow.error || t('cloudComputers.connectors.oauthFailed'))
      setOauthFlow(null)
      return
    }
    if (flow.status !== 'completed') return
    const connector = connectors.find((item) => item.id === oauthFlow.pluginId)
    if (!connector) return
    const options = oauthFlow.options
    setOauthFlow(null)
    oauthPopupRef.current?.close()
    oauthPopupRef.current = null
    connectMutation.mutate({ connector, options })
  }, [connectMutation, connectors, oauthFlow, oauthFlowQuery.data?.flow, t])

  const verifyMutation = useMutation({
    mutationFn: (connector: CloudComputerConnector) =>
      fetchApi(
        `/api/cloud-computers/${encodeURIComponent(computerId)}/connectors/${encodeURIComponent(
          connector.id,
        )}/verify`,
        { method: 'POST' },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-connectors', computerId] }),
  })

  const removeMutation = useMutation({
    mutationFn: (connector: CloudComputerConnector) =>
      fetchApi(
        `/api/cloud-computers/${encodeURIComponent(computerId)}/connectors/${encodeURIComponent(
          connector.id,
        )}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-connectors', computerId] })
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
  })

  const removeConnector = async (connector: CloudComputerConnector) => {
    const confirmed = await useConfirmStore.getState().confirm({
      title: t('cloudComputers.connectors.removeTitle', { name: connector.name }),
      message: t('cloudComputers.connectors.removeMessage'),
      confirmLabel: t('cloudComputers.connectors.remove'),
      danger: true,
    })
    if (confirmed) removeMutation.mutate(connector)
  }

  return (
    <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto bg-bg-primary p-4 sm:p-5">
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <PlugZap size={20} className="text-primary" />
              <h2 className="text-lg font-bold text-text-primary">
                {t('cloudComputers.connectors.title')}
              </h2>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
              {t('cloudComputers.connectors.description')}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={connectorsQuery.isFetching}
            onClick={() => connectorsQuery.refetch()}
          >
            <RefreshCw size={14} className={connectorsQuery.isFetching ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </Button>
        </div>

        <div className="rounded-2xl border border-border-subtle bg-bg-secondary/60 p-3">
          <div className="relative min-w-0">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('cloudComputers.connectors.searchPlaceholder')}
              className="h-9 w-full rounded-lg border border-border-subtle bg-bg-base pl-9 pr-3 text-sm text-text-primary outline-none focus:border-primary"
            />
          </div>
        </div>

        {connectorsQuery.isLoading ? (
          <div className="grid min-h-56 place-items-center">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : connectorsQuery.error ? (
          <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
            {(connectorsQuery.error as Error).message}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-subtle p-10 text-center text-sm text-text-muted">
            {t('cloudComputers.connectors.empty')}
          </div>
        ) : (
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {visible.map((connector) => (
              <article
                key={connector.id}
                className="flex min-w-0 flex-col rounded-2xl border border-border-subtle bg-bg-secondary/75 p-4 transition-colors hover:border-primary/30 hover:bg-bg-secondary"
              >
                <div className="flex items-start gap-3">
                  <ConnectorGlyph connector={connector} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-text-primary">
                          {connector.name}
                        </h3>
                        <p className="mt-0.5 text-xs capitalize text-text-muted">
                          {connector.category.replaceAll('-', ' ')}
                        </p>
                      </div>
                      <ConnectorStatus connector={connector} />
                    </div>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 break-words text-xs leading-5 text-text-muted">
                  {connector.description}
                </p>
                <div className="mt-3">
                  <ConnectorAccess connector={connector} />
                </div>
                {connector.account?.accountName ? (
                  <div className="mt-3 flex items-center gap-2 text-xs font-medium text-text-secondary">
                    <ShieldCheck size={13} className="text-emerald-500" />
                    <span className="truncate">{connector.account.accountName}</span>
                  </div>
                ) : null}
                {connector.lastError ? (
                  <p className="mt-2 line-clamp-2 text-xs text-danger">{connector.lastError}</p>
                ) : null}
                <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-4">
                  <Button
                    size="sm"
                    variant={connector.connected ? 'secondary' : 'primary'}
                    disabled={
                      connector.status === 'applying' ||
                      (!connector.connected &&
                        cloudConnectorAccessKind(connector) === 'unavailable')
                    }
                    onClick={() => {
                      setMutationError(null)
                      setSelectedId(connector.id)
                    }}
                  >
                    <PlugZap size={14} />
                    {connector.connected
                      ? t('cloudComputers.connectors.manage')
                      : cloudConnectorAccessKind(connector) === 'direct'
                        ? t('cloudComputers.connectors.enable')
                        : connector.account
                          ? t('cloudComputers.connectors.reconnect')
                          : cloudConnectorAccessKind(connector) === 'unavailable'
                            ? t('cloudComputers.connectors.unavailable')
                            : t('cloudComputers.connectors.connect')}
                  </Button>
                  {connector.connected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removeMutation.isPending || connector.status === 'applying'}
                      onClick={() => removeConnector(connector)}
                    >
                      <Unplug size={14} />
                    </Button>
                  ) : null}
                  {connector.connected &&
                  connector.account &&
                  cloudConnectorAccessKind(connector) !== 'direct' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={verifyMutation.isPending}
                      onClick={() => verifyMutation.mutate(connector)}
                    >
                      <ShieldCheck size={14} />
                    </Button>
                  ) : null}
                  {connector.docs ? (
                    <a
                      href={connector.docs}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
                      aria-label={t('cloudComputers.connectors.openDocs', {
                        name: connector.name,
                      })}
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ConnectorSetupModal
        connector={selected}
        saving={connectMutation.isPending}
        oauthStarting={oauthStartMutation.isPending || Boolean(oauthFlow)}
        error={mutationError}
        onClose={() => {
          setSelectedId(null)
          setMutationError(null)
        }}
        onSubmit={(input) => {
          if (!selected) return
          connectMutation.mutate({ connector: selected, ...input })
        }}
        onOAuth={(options) => {
          if (!selected) return
          oauthPopupRef.current = window.open(
            'about:blank',
            'shadow-connector-oauth',
            'popup,width=560,height=720',
          )
          if (!oauthPopupRef.current) {
            setMutationError(t('cloudComputers.connectors.oauthPopupBlocked'))
            return
          }
          oauthStartMutation.mutate({ connector: selected, options })
        }}
      />
    </div>
  )
}
