import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NativeSelect,
  SecretInput,
  Switch,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  TestTube2,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import type { ProviderCatalogEntry, ProviderProfile, ProviderTestResult } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

interface ProviderProfileFormState {
  id?: string
  providerId: string
  name: string
  apiKey: string
  baseUrl: string
  models: ProviderProfileModelFormState[]
  enabled: boolean
}

interface ProviderProfileModelFormState {
  clientId: string
  id: string
  name: string
  tags: string[]
  contextWindow: string
  maxTokens: string
}

const MODEL_TAGS = ['default', 'fast', 'reasoning', 'vision'] as const

const EMPTY_FORM: ProviderProfileFormState = {
  providerId: '',
  name: '',
  apiKey: '',
  baseUrl: '',
  models: [],
  enabled: true,
}

function defaultProfileName(providerId: string): string {
  return providerId ? `${providerId}-default` : ''
}

function profileBaseUrl(profile: ProviderProfile): string {
  const value = profile.config.baseUrl
  return typeof value === 'string' ? value : ''
}

function primarySecretKey(catalog: ProviderCatalogEntry | undefined): string {
  return catalog?.provider.envKey ?? ''
}

function statusText(result: ProviderTestResult | undefined): string | null {
  return result?.message ?? result?.error ?? null
}

function makeClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `model-${Date.now()}-${Math.random()}`
}

function emptyModel(): ProviderProfileModelFormState {
  return {
    clientId: makeClientId(),
    id: '',
    name: '',
    tags: ['default'],
    contextWindow: '',
    maxTokens: '',
  }
}

function numericField(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function profileModels(profile: ProviderProfile): ProviderProfileModelFormState[] {
  const rawModels = Array.isArray(profile.config.models) ? profile.config.models : []
  const models = rawModels
    .map((raw): ProviderProfileModelFormState | null => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
      const record = raw as Record<string, unknown>
      const id = typeof record.id === 'string' ? record.id.trim() : ''
      if (!id) return null
      return {
        clientId: makeClientId(),
        id,
        name: typeof record.name === 'string' ? record.name : '',
        tags: Array.isArray(record.tags)
          ? record.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
        contextWindow:
          typeof record.contextWindow === 'number' && Number.isFinite(record.contextWindow)
            ? String(record.contextWindow)
            : '',
        maxTokens:
          typeof record.maxTokens === 'number' && Number.isFinite(record.maxTokens)
            ? String(record.maxTokens)
            : '',
      }
    })
    .filter((model): model is ProviderProfileModelFormState => Boolean(model))

  const legacyModel = profile.config.modelId ?? profile.config.defaultModel ?? profile.config.model
  if (typeof legacyModel === 'string' && legacyModel.trim()) {
    models.push({
      ...emptyModel(),
      id: legacyModel.trim(),
      tags: ['default'],
    })
  }

  return models
}

function serializeModels(models: ProviderProfileModelFormState[]): Array<Record<string, unknown>> {
  const serialized: Array<Record<string, unknown>> = []

  for (const model of models) {
    const id = model.id.trim()
    if (!id) continue

    const contextWindow = numericField(model.contextWindow)
    const maxTokens = numericField(model.maxTokens)

    serialized.push({
      id,
      ...(model.name.trim() ? { name: model.name.trim() } : {}),
      ...(model.tags.length > 0 ? { tags: model.tags } : {}),
      ...(contextWindow ? { contextWindow } : {}),
      ...(maxTokens ? { maxTokens } : {}),
    })
  }

  return serialized
}

export function ProviderProfilesPage() {
  const api = useApiClient()
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ProviderProfileFormState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProviderProfile | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({})

  const { data: catalogData, isLoading: isCatalogLoading } = useQuery({
    queryKey: ['provider-catalogs'],
    queryFn: api.providerCatalogs.list,
  })

  const { data: profileData, isLoading: isProfilesLoading } = useQuery({
    queryKey: ['provider-profiles'],
    queryFn: api.providerProfiles.list,
  })

  const catalogs = catalogData?.providers ?? []
  const profiles = profileData?.profiles ?? []
  const catalogById = useMemo(
    () => new Map(catalogs.map((catalog) => [catalog.provider.id, catalog])),
    [catalogs],
  )
  const defaultProfileNames = useMemo(
    () => new Set(catalogs.map((catalog) => defaultProfileName(catalog.provider.id))),
    [catalogs],
  )
  const selectedCatalog = form ? catalogById.get(form.providerId) : undefined

  const saveProfile = useMutation({
    mutationFn: (state: ProviderProfileFormState) => {
      const catalog = catalogById.get(state.providerId)
      const envVars: Record<string, string> = {}
      const secretKey = primarySecretKey(catalog)
      if (secretKey && state.apiKey.trim()) envVars[secretKey] = state.apiKey.trim()

      const config: Record<string, unknown> = {}
      if (state.baseUrl.trim()) config.baseUrl = state.baseUrl.trim()
      const models = serializeModels(state.models)
      if (models.length > 0) config.models = models

      return api.providerProfiles.upsert({
        id: state.id,
        providerId: state.providerId,
        name: state.name.trim(),
        enabled: state.enabled,
        config,
        envVars,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-profiles'] })
      setForm(null)
      toast.success(t('providers.profileSaved'))
    },
    onError: () => toast.error(t('providers.profileSaveFailed')),
  })

  const deleteProfile = useMutation({
    mutationFn: (profile: ProviderProfile) => api.providerProfiles.delete(profile.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-profiles'] })
      setDeleteTarget(null)
      toast.success(t('providers.profileDeleted'))
    },
    onError: () => toast.error(t('providers.profileDeleteFailed')),
  })

  const testProfile = useMutation({
    mutationFn: (profile: ProviderProfile) => api.providerProfiles.test(profile.id),
    onSuccess: (result, profile) => {
      setTestResults((current) => ({ ...current, [profile.id]: result }))
      if (result.ok) toast.success(t('providers.testPassed'))
      else toast.error(t('providers.testFailed'))
    },
    onError: (_error, profile) => {
      setTestResults((current) => ({
        ...current,
        [profile.id]: { ok: false, message: t('providers.testFailed') },
      }))
      toast.error(t('providers.testFailed'))
    },
  })

  const toggleProfile = (profile: ProviderProfile) => {
    saveProfile.mutate({
      id: profile.id,
      providerId: profile.providerId,
      name: profile.name,
      apiKey: '',
      baseUrl: profileBaseUrl(profile),
      models: profileModels(profile),
      enabled: !profile.enabled,
    })
  }

  const openCreate = (providerId?: string) => {
    const nextProviderId = providerId ?? catalogs[0]?.provider.id ?? ''
    setForm({
      ...EMPTY_FORM,
      providerId: nextProviderId,
      name: defaultProfileName(nextProviderId),
    })
  }

  const openEdit = (profile: ProviderProfile) => {
    setForm({
      id: profile.id,
      providerId: profile.providerId,
      name: profile.name,
      apiKey: '',
      baseUrl: profileBaseUrl(profile),
      models: profileModels(profile),
      enabled: profile.enabled,
    })
  }

  const submitDisabled =
    saveProfile.isPending || !form?.providerId || !form.name.trim() || !selectedCatalog

  return (
    <PageShell
      breadcrumb={[{ label: t('providers.title') }]}
      title={t('providers.title')}
      description={t('providers.description')}
      narrow
      actions={
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => openCreate()}
          disabled={catalogs.length === 0}
        >
          <Plus size={14} />
          {t('providers.addProvider')}
        </Button>
      }
      headerContent={
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/20 bg-success/5 px-4 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <ShieldCheck size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-success">
              {t('providers.encryptionActive')}
            </span>
            <span className="ml-2 text-xs text-text-muted">
              {t('providers.encryptionDescription')}
            </span>
          </div>
          <span className="shrink-0 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
            {profiles.filter((profile) => profile.enabled).length} {t('providers.enabledProfiles')}
          </span>
        </div>
      }
    >
      {isCatalogLoading || isProfilesLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-text-muted">
          <Loader2 size={18} className="mr-2 animate-spin" />
          {t('common.loading')}
        </div>
      ) : profiles.length === 0 ? (
        <Card variant="glass">
          <EmptyState
            icon={KeyRound}
            title={t('providers.noProfiles')}
            description={t('providers.noProfilesDescription')}
            action={
              <Button type="button" variant="primary" size="sm" onClick={() => openCreate()}>
                <Plus size={14} />
                {t('providers.addProvider')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {profiles.map((profile) => {
            const catalog = catalogById.get(profile.providerId)
            const models = profileModels(profile)
            const result = testResults[profile.id]
            const isTesting = testProfile.isPending && testProfile.variables?.id === profile.id
            return (
              <Card key={profile.id} variant="glass" className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-black text-text-primary">
                        {profile.name}
                      </h3>
                      <Badge variant={profile.enabled ? 'success' : 'neutral'} size="sm">
                        {profile.enabled ? t('providers.enabled') : t('providers.disabled')}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-muted">
                      {catalog?.pluginName ?? profile.providerId}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => testProfile.mutate(profile)}
                      disabled={isTesting || !profile.enabled}
                      title={t('providers.testConnection')}
                    >
                      {isTesting ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <TestTube2 size={13} />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => openEdit(profile)}
                      title={t('common.edit')}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-danger/70 hover:text-danger"
                      onClick={() => setDeleteTarget(profile)}
                      title={t('common.delete')}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border-subtle/45 bg-bg-secondary/35 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase text-text-muted">
                      {t('providers.secretFields')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.envVars.length > 0 ? (
                        profile.envVars.map((entry) => (
                          <code
                            key={entry.key}
                            className="rounded-md border border-border-subtle bg-bg-primary/50 px-1.5 py-1 text-[11px] text-text-secondary"
                          >
                            {entry.key}: {entry.maskedValue}
                          </code>
                        ))
                      ) : (
                        <span className="text-xs text-text-muted">
                          {t('providers.noSecretValue')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border-subtle/45 bg-bg-secondary/35 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase text-text-muted">
                      {t('providers.configuredModels')}
                    </p>
                    {models.length > 0 ? (
                      <div className="space-y-1">
                        {models.slice(0, 3).map((model) => (
                          <div key={model.clientId} className="min-w-0">
                            <p className="truncate font-mono text-xs text-text-secondary">
                              {model.id}
                            </p>
                            {model.tags.length > 0 && (
                              <p className="truncate text-[11px] text-text-muted">
                                {model.tags.join(', ')}
                              </p>
                            )}
                          </div>
                        ))}
                        {models.length > 3 && (
                          <p className="text-[11px] text-text-muted">
                            {t('providers.moreModels', { count: models.length - 3 })}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="truncate font-mono text-xs text-text-secondary">
                        {t('providers.modelsNotConfigured')}
                      </p>
                    )}
                    {profileBaseUrl(profile) && (
                      <p className="mt-1 truncate font-mono text-[11px] text-text-muted">
                        {profileBaseUrl(profile)}
                      </p>
                    )}
                  </div>
                </div>

                {result && (
                  <div
                    className={cn(
                      'mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs',
                      result.ok
                        ? 'border-success/25 bg-success/8 text-success'
                        : 'border-danger/25 bg-danger/8 text-danger',
                    )}
                  >
                    {result.ok ? (
                      <CheckCircle size={13} className="mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={13} className="mt-0.5 shrink-0" />
                    )}
                    <span className="min-w-0 break-words">{statusText(result)}</span>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-border-subtle/45 pt-4">
                  <span className="text-xs text-text-muted">{t('providers.enabled')}</span>
                  <Switch
                    checked={profile.enabled}
                    onCheckedChange={() => toggleProfile(profile)}
                    disabled={saveProfile.isPending}
                  />
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {form && (
        <Modal open onClose={() => setForm(null)}>
          <ModalContent maxWidth="max-w-2xl">
            <ModalHeader
              title={form.id ? t('providers.editProfile') : t('providers.createProfile')}
              subtitle={t('providers.profileDialogDescription')}
            />
            <ModalBody className="grid grid-cols-1 gap-4 py-5 sm:grid-cols-2">
              <div>
                <label htmlFor="provider-profile-provider" className="mb-1 block text-xs font-bold">
                  {t('providers.provider')}
                </label>
                <NativeSelect
                  id="provider-profile-provider"
                  value={form.providerId}
                  disabled={Boolean(form.id)}
                  onChange={(event) => {
                    const providerId = event.target.value
                    const shouldRefreshDefaultName =
                      !form.name || defaultProfileNames.has(form.name)
                    setForm({
                      ...form,
                      providerId,
                      name: shouldRefreshDefaultName ? defaultProfileName(providerId) : form.name,
                    })
                  }}
                >
                  <option value="">{t('providers.selectProvider')}</option>
                  {catalogs.map((catalog) => (
                    <option key={catalog.provider.id} value={catalog.provider.id}>
                      {catalog.provider.id}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div>
                <label htmlFor="provider-profile-name" className="mb-1 block text-xs font-bold">
                  {t('providers.profileName')}
                </label>
                <Input
                  id="provider-profile-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder={t('providers.profileNamePlaceholder')}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="provider-profile-api-key" className="mb-1 block text-xs font-bold">
                  {primarySecretKey(selectedCatalog) || t('providers.apiKey')}
                </label>
                <SecretInput
                  id="provider-profile-api-key"
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  placeholder={
                    form.id
                      ? t('providers.apiKeyEditPlaceholder')
                      : t('providers.apiKeyPlaceholder')
                  }
                  autoComplete="new-password"
                  data-bwignore="true"
                />
              </div>

              <div>
                <label htmlFor="provider-profile-base-url" className="mb-1 block text-xs font-bold">
                  {t('providers.baseUrl')}
                </label>
                <Input
                  id="provider-profile-base-url"
                  value={form.baseUrl}
                  onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                  placeholder={
                    selectedCatalog?.provider.baseUrl ?? t('providers.baseUrlPlaceholder')
                  }
                />
              </div>

              <section className="space-y-3" style={{ gridColumn: '1 / -1' }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-text-primary">
                      {t('providers.modelsTitle')}
                    </h3>
                    <p className="text-xs text-text-muted">{t('providers.modelsDescription')}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => setForm({ ...form, models: [...form.models, emptyModel()] })}
                  >
                    <Plus size={12} />
                    {t('providers.addModel')}
                  </Button>
                </div>
                {selectedCatalog?.provider.models.length ? (
                  <datalist id="provider-profile-model-options">
                    {selectedCatalog.provider.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name ?? model.id}
                      </option>
                    ))}
                  </datalist>
                ) : null}
                {form.models.length === 0 ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-center rounded-[16px] border border-dashed border-border-subtle px-4 py-3 text-sm font-bold text-text-muted transition-colors hover:border-primary/40 hover:text-primary"
                    onClick={() => setForm({ ...form, models: [emptyModel()] })}
                  >
                    <Plus size={14} />
                    {t('providers.addFirstModel')}
                  </button>
                ) : (
                  <div className="space-y-3">
                    {form.models.map((model, index) => (
                      <div
                        key={model.clientId}
                        className="rounded-[20px] border border-border-subtle/70 bg-bg-secondary/25 p-3"
                      >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                          <Input
                            value={model.id}
                            onChange={(event) => {
                              const models = [...form.models]
                              models[index] = { ...model, id: event.target.value }
                              setForm({ ...form, models })
                            }}
                            placeholder={t('providers.modelIdPlaceholder')}
                            list="provider-profile-model-options"
                          />
                          <Input
                            value={model.name}
                            onChange={(event) => {
                              const models = [...form.models]
                              models[index] = { ...model, name: event.target.value }
                              setForm({ ...form, models })
                            }}
                            placeholder={t('providers.modelNamePlaceholder')}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-[58px] w-[58px] self-end"
                            title={t('common.delete')}
                            onClick={() =>
                              setForm({
                                ...form,
                                models: form.models.filter(
                                  (item) => item.clientId !== model.clientId,
                                ),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {MODEL_TAGS.map((tag) => {
                            const active = model.tags.includes(tag)
                            return (
                              <button
                                key={tag}
                                type="button"
                                className={cn(
                                  'rounded-full border px-3 py-1 text-[11px] font-black uppercase transition-colors',
                                  active
                                    ? 'border-primary/50 bg-primary/15 text-primary'
                                    : 'border-border-subtle text-text-muted hover:border-primary/40 hover:text-primary',
                                )}
                                onClick={() => {
                                  const tags = active
                                    ? model.tags.filter((item) => item !== tag)
                                    : [...model.tags, tag]
                                  const models = [...form.models]
                                  models[index] = { ...model, tags }
                                  setForm({ ...form, models })
                                }}
                              >
                                {t(`providers.modelTags.${tag}`)}
                              </button>
                            )
                          })}
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Input
                            type="number"
                            min={1}
                            value={model.contextWindow}
                            onChange={(event) => {
                              const models = [...form.models]
                              models[index] = { ...model, contextWindow: event.target.value }
                              setForm({ ...form, models })
                            }}
                            placeholder={t('providers.contextWindowPlaceholder')}
                          />
                          <Input
                            type="number"
                            min={1}
                            value={model.maxTokens}
                            onChange={(event) => {
                              const models = [...form.models]
                              models[index] = { ...model, maxTokens: event.target.value }
                              setForm({ ...form, models })
                            }}
                            placeholder={t('providers.maxTokensPlaceholder')}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <label
                className="flex items-center justify-between self-start rounded-[20px] border-2 border-[#F1F5F9] bg-white/70 px-6 text-base font-bold shadow-[inset_2px_2px_6px_rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(0,0,0,0.3)] dark:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.25)]"
                style={{ gridColumn: '1 / -1', height: 58 }}
              >
                <span className="text-base font-bold text-text-primary">
                  {t('providers.enabled')}
                </span>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                />
              </label>
            </ModalBody>
            <ModalFooter>
              <ModalButtonGroup>
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={saveProfile.isPending}
                  disabled={submitDisabled}
                  onClick={() => form && saveProfile.mutate(form)}
                >
                  {t('common.save')}
                </Button>
              </ModalButtonGroup>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('providers.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('providers.deleteDescription', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                loading={deleteProfile.isPending}
                onClick={() => deleteTarget && deleteProfile.mutate(deleteTarget)}
              >
                {t('common.delete')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
