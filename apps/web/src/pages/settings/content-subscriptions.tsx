import { cn, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  type LucideIcon,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Rss,
  Search,
  Settings2,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { SettingsCard, SettingsHeader, SettingsPanel } from './_shared'

type ContentKind = 'image' | 'html' | 'pdf' | 'file' | 'voice' | 'card'
type DigestMode = 'realtime' | 'daily' | 'none'
type SubscriptionStatus = 'active' | 'paused'

interface ContentSubscriptionPreferences {
  id: string
  userId: string
  includeKinds: ContentKind[]
  pushEnabled: boolean
  digestMode: DigestMode
  isDefault?: boolean
}

interface ContentSubscription {
  id: string
  channelId: string
  serverId: string
  status: SubscriptionStatus
  isDefault?: boolean
  isCustomRule?: boolean
  includeKinds: ContentKind[]
  pushEnabled: boolean
  digestMode: DigestMode
  channel?: {
    name: string
    type: string
  }
  server?: {
    name: string
  }
}

const CONTENT_KINDS: ContentKind[] = ['image', 'html', 'pdf', 'file', 'voice', 'card']
const DIGEST_MODES: DigestMode[] = ['realtime', 'daily', 'none']
const DEFAULT_PREFERENCES: ContentSubscriptionPreferences = {
  id: 'default',
  userId: '',
  includeKinds: CONTENT_KINDS,
  pushEnabled: true,
  digestMode: 'realtime',
  isDefault: true,
}

export function ContentSubscriptionsSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: defaultPreferences = DEFAULT_PREFERENCES, isLoading: isDefaultsLoading } = useQuery(
    {
      queryKey: ['content-subscription-defaults'],
      queryFn: () =>
        fetchApi<ContentSubscriptionPreferences>('/api/content-subscriptions/defaults'),
      staleTime: 30_000,
    },
  )

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ['content-subscriptions'],
    queryFn: () => fetchApi<ContentSubscription[]>('/api/content-subscriptions'),
    staleTime: 30_000,
  })

  const updateDefaults = useMutation({
    mutationFn: (
      data: Partial<
        Pick<ContentSubscriptionPreferences, 'includeKinds' | 'pushEnabled' | 'digestMode'>
      >,
    ) =>
      fetchApi<ContentSubscriptionPreferences>('/api/content-subscriptions/defaults', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-subscription-defaults'] })
      queryClient.invalidateQueries({ queryKey: ['content-subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['content-feed'] })
      showToast(t('settings.contentSubscriptionUpdated'), 'success')
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : t('settings.contentSubscriptionUpdateFailed'),
        'error',
      )
    },
  })

  const updateSubscription = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Partial<
        Pick<ContentSubscription, 'status' | 'includeKinds' | 'pushEnabled' | 'digestMode'>
      > & { resetRules?: boolean }
    }) =>
      fetchApi(`/api/content-subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['content-feed'] })
      showToast(t('settings.contentSubscriptionUpdated'), 'success')
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : t('settings.contentSubscriptionUpdateFailed'),
        'error',
      )
    },
  })

  const markAllRead = useMutation({
    mutationFn: () =>
      fetchApi('/api/content-feed/read-scope', {
        method: 'POST',
        body: JSON.stringify({ all: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['content-feed'] })
      showToast(t('settings.contentSubscriptionMarkedRead'), 'success')
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : t('settings.contentSubscriptionUpdateFailed'),
        'error',
      )
    },
  })

  const pausedSubscriptions = useMemo(
    () => subscriptions.filter((subscription) => subscription.status === 'paused'),
    [subscriptions],
  )
  const customSubscriptions = useMemo(
    () =>
      subscriptions.filter(
        (subscription) => subscription.status === 'active' && subscription.isCustomRule,
      ),
    [subscriptions],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const visiblePaused = useMemo(
    () => filterSubscriptions(pausedSubscriptions, normalizedQuery),
    [normalizedQuery, pausedSubscriptions],
  )
  const visibleCustom = useMemo(
    () => filterSubscriptions(customSubscriptions, normalizedQuery),
    [customSubscriptions, normalizedQuery],
  )
  const hasSearchQuery = normalizedQuery.length > 0
  const visibleSearchResults = useMemo(
    () => (hasSearchQuery ? filterSubscriptions(subscriptions, normalizedQuery) : []),
    [hasSearchQuery, normalizedQuery, subscriptions],
  )
  const loading = isLoading || isDefaultsLoading

  const renderSearchResult = (subscription: ContentSubscription) => {
    const editing = editingId === subscription.id
    const paused = subscription.status === 'paused'
    const custom = subscription.isCustomRule === true

    if (paused) {
      return (
        <ExceptionRow
          key={subscription.id}
          subscription={subscription}
          badge={t('settings.contentSubscriptionStatusPaused')}
          badgeTone="warning"
          actionLabel={t('settings.contentSubscriptionResume')}
          actionIcon={PlayCircle}
          pending={updateSubscription.isPending}
          onAction={() =>
            updateSubscription.mutate({
              id: subscription.id,
              data: { status: 'active' },
            })
          }
        />
      )
    }

    return (
      <ExceptionRow
        key={subscription.id}
        subscription={subscription}
        badge={
          custom
            ? summarizeKinds(subscription.includeKinds, t)
            : t('settings.contentSubscriptionUsingDefault')
        }
        badgeTone={custom ? 'primary' : 'neutral'}
        actionLabel={
          editing
            ? t('settings.contentSubscriptionStopEditing')
            : t('settings.contentSubscriptionEditRules')
        }
        actionIcon={Settings2}
        pending={updateSubscription.isPending}
        onAction={() => setEditingId(editing ? null : subscription.id)}
        secondaryLabel={t('settings.contentSubscriptionPause')}
        secondaryIcon={PauseCircle}
        onSecondary={() =>
          updateSubscription.mutate({
            id: subscription.id,
            data: { status: 'paused' },
          })
        }
      >
        {editing ? (
          <RuleEditor
            includeKinds={subscription.includeKinds}
            pushEnabled={subscription.pushEnabled}
            digestMode={subscription.digestMode}
            pending={updateSubscription.isPending}
            onChange={(data) => updateSubscription.mutate({ id: subscription.id, data })}
          />
        ) : null}
      </ExceptionRow>
    )
  }

  return (
    <SettingsPanel>
      <SettingsHeader
        icon={Rss}
        titleKey="settings.contentSubscriptionsTitle"
        descKey="settings.contentSubscriptionsDesc"
      />

      <SettingsCard className="space-y-5">
        {loading ? (
          <SubscriptionSettingsSkeleton />
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-border-subtle pb-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold leading-6 text-text-secondary">
                  {t('settings.contentSubscriptionOverview', {
                    total: subscriptions.length,
                    paused: pausedSubscriptions.length,
                    custom: customSubscriptions.length,
                  })}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <MetricPill
                    label={t('settings.contentSubscriptionTotalChannels')}
                    value={subscriptions.length}
                  />
                  <MetricPill
                    label={t('settings.contentSubscriptionPausedChannels')}
                    value={pausedSubscriptions.length}
                  />
                  <MetricPill
                    label={t('settings.contentSubscriptionCustomRules')}
                    value={customSubscriptions.length}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate({ to: '/discover', search: { tab: 'feed' } })}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 text-xs font-black text-primary hover:bg-primary/15"
                >
                  <Rss size={14} />
                  {t('settings.contentSubscriptionOpenFeed')}
                </button>
                <button
                  type="button"
                  disabled={markAllRead.isPending}
                  onClick={() => markAllRead.mutate()}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle px-3 text-xs font-black text-text-secondary hover:bg-bg-tertiary disabled:opacity-60"
                >
                  <Check size={14} />
                  {t('settings.contentSubscriptionMarkAllRead')}
                </button>
              </div>
            </div>

            <section className="space-y-3">
              <div>
                <h3 className="text-base font-black text-text-primary">
                  {t('settings.contentSubscriptionDefaultRules')}
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-text-muted">
                  {t('settings.contentSubscriptionDefaultRulesDesc')}
                </p>
              </div>
              <RuleEditor
                includeKinds={defaultPreferences.includeKinds}
                pushEnabled={defaultPreferences.pushEnabled}
                digestMode={defaultPreferences.digestMode}
                pending={updateDefaults.isPending}
                onChange={(data) => updateDefaults.mutate(data)}
              />
            </section>

            <div className="border-t border-border-subtle pt-5">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-black text-text-primary">
                    {t('settings.contentSubscriptionExceptions')}
                  </h3>
                  <p className="mt-1 text-sm font-semibold leading-6 text-text-muted">
                    {t('settings.contentSubscriptionExceptionsDesc')}
                  </p>
                </div>
                <Input
                  icon={Search}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={t('settings.contentSubscriptionSearchPlaceholder')}
                  className="h-10 w-full md:w-72"
                />
              </div>

              {hasSearchQuery ? (
                <ExceptionSection
                  title={t('settings.contentSubscriptionSearchResults')}
                  emptyText={t('settings.contentSubscriptionNoSearchResults')}
                  hasItems={visibleSearchResults.length > 0}
                >
                  {visibleSearchResults.map(renderSearchResult)}
                </ExceptionSection>
              ) : (
                <>
                  <ExceptionSection
                    title={t('settings.contentSubscriptionPausedChannels')}
                    emptyText={t('settings.contentSubscriptionNoPaused')}
                    hasItems={visiblePaused.length > 0}
                  >
                    {visiblePaused.map((subscription) => (
                      <ExceptionRow
                        key={subscription.id}
                        subscription={subscription}
                        badge={t('settings.contentSubscriptionStatusPaused')}
                        badgeTone="warning"
                        actionLabel={t('settings.contentSubscriptionResume')}
                        actionIcon={PlayCircle}
                        pending={updateSubscription.isPending}
                        onAction={() =>
                          updateSubscription.mutate({
                            id: subscription.id,
                            data: { status: 'active' },
                          })
                        }
                      />
                    ))}
                  </ExceptionSection>

                  <ExceptionSection
                    title={t('settings.contentSubscriptionCustomRules')}
                    emptyText={t('settings.contentSubscriptionNoCustomRules')}
                    hasItems={visibleCustom.length > 0}
                  >
                    {visibleCustom.map((subscription) => {
                      const editing = editingId === subscription.id
                      return (
                        <ExceptionRow
                          key={subscription.id}
                          subscription={subscription}
                          badge={summarizeKinds(subscription.includeKinds, t)}
                          badgeTone="primary"
                          actionLabel={
                            editing
                              ? t('settings.contentSubscriptionStopEditing')
                              : t('settings.contentSubscriptionEditRules')
                          }
                          actionIcon={Settings2}
                          pending={updateSubscription.isPending}
                          onAction={() => setEditingId(editing ? null : subscription.id)}
                          secondaryLabel={t('settings.contentSubscriptionRestoreDefault')}
                          secondaryIcon={RotateCcw}
                          onSecondary={() =>
                            updateSubscription.mutate({
                              id: subscription.id,
                              data: { resetRules: true },
                            })
                          }
                        >
                          {editing ? (
                            <RuleEditor
                              includeKinds={subscription.includeKinds}
                              pushEnabled={subscription.pushEnabled}
                              digestMode={subscription.digestMode}
                              pending={updateSubscription.isPending}
                              onChange={(data) =>
                                updateSubscription.mutate({ id: subscription.id, data })
                              }
                            />
                          ) : null}
                        </ExceptionRow>
                      )
                    })}
                  </ExceptionSection>
                </>
              )}
            </div>
          </>
        )}
      </SettingsCard>
    </SettingsPanel>
  )
}

function filterSubscriptions(subscriptions: ContentSubscription[], query: string) {
  if (!query) return subscriptions
  return subscriptions.filter((subscription) =>
    [
      subscription.server?.name,
      subscription.channel?.name,
      subscription.serverId,
      subscription.channelId,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(query)),
  )
}

function summarizeKinds(kinds: ContentKind[], t: (key: string) => string) {
  if (kinds.length === CONTENT_KINDS.length) return t('settings.contentSubscriptionAllKinds')
  return kinds
    .map((kind) => t(`settings.contentSubscriptionKind${kind[0]!.toUpperCase()}${kind.slice(1)}`))
    .join(' / ')
}

function SubscriptionSettingsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-2xl bg-bg-tertiary/50" />
      <div className="h-40 animate-pulse rounded-2xl bg-bg-tertiary/50" />
      <div className="h-24 animate-pulse rounded-2xl bg-bg-tertiary/50" />
    </div>
  )
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-secondary/60 px-3 py-2">
      <div className="text-lg font-black text-text-primary">{value}</div>
      <div className="text-xs font-bold text-text-muted">{label}</div>
    </div>
  )
}

function RuleEditor({
  includeKinds,
  pushEnabled,
  digestMode,
  pending,
  onChange,
}: {
  includeKinds: ContentKind[]
  pushEnabled: boolean
  digestMode: DigestMode
  pending: boolean
  onChange: (
    data: Partial<
      Pick<ContentSubscriptionPreferences, 'includeKinds' | 'pushEnabled' | 'digestMode'>
    >,
  ) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 rounded-2xl border border-border-subtle bg-bg-secondary/45 p-4 lg:grid-cols-[1fr_260px]">
      <div>
        <p className="mb-2 text-xs font-black text-text-muted">
          {t('settings.contentSubscriptionKinds')}
        </p>
        <div className="flex flex-wrap gap-2">
          {CONTENT_KINDS.map((kind) => {
            const checked = includeKinds.includes(kind)
            return (
              <button
                key={kind}
                type="button"
                disabled={pending}
                onClick={() => {
                  const next = checked
                    ? includeKinds.filter((item) => item !== kind)
                    : [...includeKinds, kind]
                  if (next.length === 0) return
                  onChange({ includeKinds: next })
                }}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-black transition-colors disabled:opacity-60',
                  checked
                    ? 'border-primary/25 bg-primary/10 text-primary'
                    : 'border-border-subtle text-text-muted hover:bg-bg-tertiary',
                )}
              >
                {checked ? <Check size={13} /> : null}
                {t(`settings.contentSubscriptionKind${kind[0]!.toUpperCase()}${kind.slice(1)}`)}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-black text-text-muted">
          {t('settings.contentSubscriptionDelivery')}
        </p>
        <label className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-primary/50 px-3 py-2 text-xs font-bold text-text-secondary">
          <span>{t('settings.contentSubscriptionPush')}</span>
          <input
            type="checkbox"
            checked={pushEnabled}
            disabled={pending}
            onChange={(event) => onChange({ pushEnabled: event.currentTarget.checked })}
          />
        </label>
        <select
          value={digestMode}
          disabled={pending}
          onChange={(event) => onChange({ digestMode: event.currentTarget.value as DigestMode })}
          className="h-9 w-full rounded-xl border border-border-subtle bg-bg-primary px-3 text-xs font-bold text-text-primary disabled:opacity-60"
        >
          {DIGEST_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`settings.contentSubscriptionDigest${mode[0]!.toUpperCase()}${mode.slice(1)}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ExceptionSection({
  title,
  emptyText,
  hasItems,
  children,
}: {
  title: string
  emptyText: string
  hasItems: boolean
  children: ReactNode
}) {
  return (
    <section className="mb-5 last:mb-0">
      <h4 className="mb-2 text-sm font-black text-text-primary">{title}</h4>
      <div className="space-y-2">
        {hasItems ? (
          children
        ) : (
          <div className="rounded-xl border border-dashed border-border-subtle bg-bg-secondary/30 px-3 py-4 text-sm font-semibold text-text-muted">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  )
}

function ExceptionRow({
  subscription,
  badge,
  badgeTone,
  actionLabel,
  actionIcon: ActionIcon,
  pending,
  onAction,
  secondaryLabel,
  secondaryIcon: SecondaryIcon,
  onSecondary,
  children,
}: {
  subscription: ContentSubscription
  badge: string
  badgeTone: 'neutral' | 'primary' | 'warning'
  actionLabel: string
  actionIcon: LucideIcon
  pending: boolean
  onAction: () => void
  secondaryLabel?: string
  secondaryIcon?: LucideIcon
  onSecondary?: () => void
  children?: ReactNode
}) {
  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-secondary/45 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="truncate text-sm font-black text-text-primary">
              {subscription.server?.name ?? subscription.serverId} /{' '}
              {subscription.channel?.name ?? subscription.channelId}
            </h5>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black',
                badgeTone === 'warning'
                  ? 'bg-warning/15 text-warning'
                  : badgeTone === 'neutral'
                    ? 'bg-bg-tertiary text-text-muted'
                    : 'bg-primary/10 text-primary',
              )}
            >
              {badge}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondaryLabel && SecondaryIcon && onSecondary ? (
            <button
              type="button"
              disabled={pending}
              onClick={onSecondary}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle px-3 text-xs font-black text-text-secondary hover:bg-bg-tertiary disabled:opacity-60"
            >
              <SecondaryIcon size={14} />
              {secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={onAction}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 text-xs font-black text-primary hover:bg-primary/15 disabled:opacity-60"
          >
            <ActionIcon size={14} />
            {actionLabel}
          </button>
        </div>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </article>
  )
}
