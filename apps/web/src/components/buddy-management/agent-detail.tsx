import { Badge, Button, cn } from '@shadowob/ui'
import type { UseMutationResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  BookOpen,
  ChevronRight,
  CircleDollarSign,
  Edit2,
  Key,
  LockKeyhole,
  MessageCircle,
  PlugZap,
  Share2,
  Trash2,
} from 'lucide-react'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { UserAvatar } from '../common/avatar'
import { ConfigCodeBlock } from './config-code-block'
import { DaemonConnectionGuide } from './daemon-connection-guide'
import {
  type Agent,
  type BuddyMode,
  getAgentAllowedServerIds,
  getAgentBuddyMode,
  type TokenResponse,
} from './types'

type ServerEntry = {
  server: {
    id: string
    name: string
    slug?: string | null
  }
}

type CollapsiblePanelProps = {
  title: string
  icon: ReactNode
  rightContent?: ReactNode
  className?: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

function CollapsiblePanel({
  title,
  icon,
  rightContent,
  className,
  expanded,
  onToggle,
  children,
}: CollapsiblePanelProps) {
  const panelContentId = useId()

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[18px] border border-border-subtle/75 bg-bg-primary/45 shadow-sm',
        className,
      )}
    >
      <div
        role="button"
        tabIndex={0}
        id={`${panelContentId}-header`}
        aria-expanded={expanded}
        aria-controls={panelContentId}
        className="group w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left cursor-pointer select-none transition-colors hover:bg-bg-tertiary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 touch-manipulation"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-7 w-7 place-items-center rounded-full border border-border-subtle/90 bg-bg-primary/80 text-text-primary">
            {icon}
          </span>
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        </div>
        <div
          className="flex items-center gap-2"
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          {rightContent}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
            className="shrink-0 rounded-full border border-border-subtle/80 p-1.5 transition-colors hover:bg-bg-secondary hover:text-text-primary"
          >
            <ChevronRight
              size={15}
              className={cn(
                'text-text-muted transition-transform duration-200',
                expanded && 'rotate-90',
              )}
            />
          </button>
        </div>
      </div>
      <div
        id={panelContentId}
        className={cn(
          'grid transition-all duration-220 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
          expanded
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0 pointer-events-none',
        )}
        aria-hidden={!expanded}
      >
        <div className="min-h-0 border-t border-border-subtle/70">
          <div className="px-3.5 py-3.5 text-sm text-text-secondary">{children}</div>
        </div>
      </div>
    </div>
  )
}

type DetailFieldProps = {
  label: string
  right?: ReactNode
  mutedValue?: boolean
  children: ReactNode
}

function DetailField({ label, right, mutedValue, children }: DetailFieldProps) {
  return (
    <div className="px-3.5 py-3 sm:px-3.5">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-[11px] leading-5 tracking-[0.02em] text-text-muted">{label}</p>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className={cn('text-[14px] leading-5', mutedValue && 'text-text-muted')}>{children}</div>
    </div>
  )
}

const detailCardClass =
  'overflow-hidden rounded-[18px] border border-border-subtle/75 bg-bg-primary/45 shadow-sm'

/* ── Agent Detail Panel ──────────────────────────────── */

export function AgentDetail({
  agent,
  generatedToken,
  tokenMutation,
  onCopyToken,
  onDelete,
  onEdit,
  onToggle,
  onChangeBuddyMode,
  onChangeAllowedServerIds,
  onCreateListing,
  togglePending,
  buddyModePending,
  allowedServersPending,
  servers = [],
  onMessageOwner,
  isMessageOwnerPending,
  currentUserId,
  t,
}: {
  agent: Agent
  generatedToken: string | null
  tokenMutation: UseMutationResult<TokenResponse, Error, string>
  onCopyToken: (token: string) => void
  onDelete: () => void
  onEdit: () => void
  onCreateListing: () => void
  onToggle: (agent: Agent) => void
  onChangeBuddyMode?: (mode: BuddyMode) => void
  onChangeAllowedServerIds?: (ids: string[]) => void
  togglePending: boolean
  buddyModePending?: boolean
  allowedServersPending?: boolean
  servers?: ServerEntry[]
  onMessageOwner?: () => void
  isMessageOwnerPending?: boolean
  currentUserId?: string | null
  t: TFunction
}) {
  const name = agent.botUser?.displayName ?? agent.botUser?.username ?? t('common.unknownUser')
  const desc = (agent.config?.description as string) ?? ''
  const buddyMode = getAgentBuddyMode(agent)
  const allowedServerIds = getAgentAllowedServerIds(agent)
  const isPrivateBuddy = buddyMode === 'private'
  const isTenantAccess = agent.accessRole === 'tenant'
  const canManageAgent = !isTenantAccess
  const ownerUserId = agent.botUser?.id ?? agent.userId
  const canMessageOwner =
    Boolean(onMessageOwner) &&
    Boolean(currentUserId) &&
    Boolean(ownerUserId) &&
    currentUserId !== ownerUserId
  const [isAccessSectionExpanded, setIsAccessSectionExpanded] = useState(false)
  const [isTokenSectionExpanded, setIsTokenSectionExpanded] = useState(false)
  const [isGuideSectionExpanded, setIsGuideSectionExpanded] = useState(false)
  const hasHeartbeat = Boolean(agent.lastHeartbeat)
  const lastHeartbeatAt = agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null
  const isHeartbeatAlive =
    Boolean(lastHeartbeatAt) && Date.now() - (lastHeartbeatAt?.getTime() ?? 0) < 90000
  const isBuddyOnline = agent.status === 'running' && isHeartbeatAlive
  const showOfflineGuide = !isBuddyOnline
  const buddyProfileUserId = agent.botUser?.id ?? agent.userId
  const toggleAllowedServer = (serverId: string) => {
    if (!onChangeAllowedServerIds) return
    onChangeAllowedServerIds(
      allowedServerIds.includes(serverId)
        ? allowedServerIds.filter((id) => id !== serverId)
        : [...allowedServerIds, serverId],
    )
  }
  useEffect(() => {
    setIsAccessSectionExpanded(false)
    setIsTokenSectionExpanded(false)
    setIsGuideSectionExpanded(!isBuddyOnline)
  }, [agent.id, isBuddyOnline])
  const displayToken = generatedToken ?? (agent.config?.lastToken as string | undefined) ?? null

  const accessPolicySection = (
    <CollapsiblePanel
      title={t('agentMgmt.accessSection')}
      icon={isPrivateBuddy ? <LockKeyhole size={18} /> : <Share2 size={18} />}
      rightContent={
        <Badge variant={isPrivateBuddy ? 'neutral' : 'success'} size="xs">
          {isPrivateBuddy ? t('agentMgmt.modePrivate') : t('agentMgmt.modeShareable')}
        </Badge>
      }
      expanded={isAccessSectionExpanded}
      onToggle={() => setIsAccessSectionExpanded((expanded) => !expanded)}
    >
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {isPrivateBuddy ? t('agentMgmt.modePrivateDesc') : t('agentMgmt.modeShareableDesc')}
      </p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {t('agentMgmt.defaultReplyPolicyDesc')}
      </p>
      {isPrivateBuddy && (
        <p className="mt-2 text-xs leading-5 text-warning">
          {t('agentMgmt.privateListingDisabledDesc')}
        </p>
      )}
      {canManageAgent && onChangeBuddyMode && (
        <div className="mt-4 inline-flex rounded-full border border-border-subtle bg-bg-primary/70 p-1">
          <button
            type="button"
            onClick={() => onChangeBuddyMode('private')}
            disabled={buddyModePending || isPrivateBuddy}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
              isPrivateBuddy ? 'bg-primary text-primary-foreground' : 'text-text-muted',
              isPrivateBuddy ? '' : 'hover:bg-bg-secondary hover:text-text-primary',
              buddyModePending && 'opacity-60',
            )}
          >
            <LockKeyhole size={13} />
            {t('agentMgmt.modePrivate')}
          </button>
          <button
            type="button"
            onClick={() => onChangeBuddyMode('shareable')}
            disabled={buddyModePending || !isPrivateBuddy}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
              !isPrivateBuddy ? 'bg-primary text-primary-foreground' : 'text-text-muted',
              !isPrivateBuddy ? '' : 'hover:bg-bg-secondary hover:text-text-primary',
              buddyModePending && 'opacity-60',
            )}
          >
            <Share2 size={13} />
            {t('agentMgmt.modeShareable')}
          </button>
        </div>
      )}
      {isPrivateBuddy && canManageAgent && onChangeAllowedServerIds && (
        <div className="mt-4 rounded-[14px] border border-border-subtle bg-bg-tertiary/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-text-primary">{t('agentMgmt.allowedServersLabel')}</div>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {t('agentMgmt.allowedServersDesc')}
              </p>
            </div>
            <Badge variant="neutral" size="xs">
              {allowedServerIds.length}
            </Badge>
          </div>
          {servers.length === 0 ? (
            <div className="mt-3 text-xs text-text-muted">{t('agentMgmt.allowedServersEmpty')}</div>
          ) : (
            <div className="mt-3 max-h-36 overflow-y-auto space-y-1 pr-1">
              {servers.map((entry) => (
                <label
                  key={entry.server.id}
                  className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-sm text-text-primary hover:bg-bg-modifier-hover"
                >
                  <input
                    type="checkbox"
                    checked={allowedServerIds.includes(entry.server.id)}
                    disabled={allowedServersPending}
                    onChange={() => toggleAllowedServer(entry.server.id)}
                    className="h-4 w-4 rounded border-border-subtle text-primary"
                  />
                  <span className="truncate">{entry.server.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </CollapsiblePanel>
  )

  const tokenSection = (
    <CollapsiblePanel
      title={t('agentMgmt.tokenTitle')}
      icon={<Key size={16} />}
      expanded={isTokenSectionExpanded}
      onToggle={() => setIsTokenSectionExpanded((expanded) => !expanded)}
    >
      <p className="text-sm text-text-secondary leading-6 mb-5">{t('agentMgmt.tokenDesc')}</p>
      {displayToken ? (
        <div className="space-y-4">
          <ConfigCodeBlock
            content={displayToken}
            mode="single"
            onCopy={(value) => onCopyToken(value)}
            t={t}
          />
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => tokenMutation.mutate(agent.id)}
              disabled={tokenMutation.isPending}
              className="rounded-full h-8"
            >
              <Key size={14} />
              {tokenMutation.isPending ? t('agentMgmt.generating') : t('agentMgmt.regenerateToken')}
            </Button>
          </div>
          <ConfigCodeBlock
            label={t('agentMgmt.configExample')}
            content={`{"channels":{"shadowob":{"token":"${displayToken}...","serverUrl":"${window.location.origin}"}}}`}
            mode="single"
            t={t}
          />
        </div>
      ) : (
        <Button
          variant="primary"
          size="sm"
          onClick={() => tokenMutation.mutate(agent.id)}
          disabled={tokenMutation.isPending}
          className="rounded-full h-8"
        >
          <PlugZap size={14} />
          {tokenMutation.isPending ? t('agentMgmt.generating') : t('agentMgmt.connectButton')}
        </Button>
      )}
    </CollapsiblePanel>
  )

  const connectorSection = (
    <CollapsiblePanel
      title={t('agentMgmt.connectorGuideTitle')}
      icon={<BookOpen size={16} />}
      expanded={isGuideSectionExpanded}
      onToggle={() => setIsGuideSectionExpanded((expanded) => !expanded)}
    >
      <DaemonConnectionGuide agent={agent} t={t} />
    </CollapsiblePanel>
  )

  return (
    <div className="space-y-3">
      {/* Agent header */}
      <div className={detailCardClass}>
        <div className="px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-2.5">
              <div className="relative inline-flex">
                <UserAvatar
                  userId={agent.botUser?.id ?? agent.userId}
                  avatarUrl={agent.botUser?.avatarUrl}
                  displayName={name}
                  size="sm"
                />
                <span
                  className={cn(
                    'absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg-primary',
                    isHeartbeatAlive ? 'bg-success' : 'bg-text-muted',
                  )}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/profile/$userId"
                    params={{ userId: buddyProfileUserId }}
                    className="text-base font-semibold text-text-primary hover:text-primary hover:underline transition"
                  >
                    {name}
                  </Link>
                  {isTenantAccess ? (
                    <Badge variant="warning" size="xs">
                      {t('agentMgmt.rentingAccessBadge')}
                    </Badge>
                  ) : null}
                </div>
                {agent.botUser?.username ? (
                  <Link
                    to="/profile/$userId"
                    params={{ userId: buddyProfileUserId }}
                    className="mt-1 inline-block text-xs text-text-muted hover:text-text-primary hover:underline transition"
                  >
                    @{agent.botUser.username}
                  </Link>
                ) : null}
                {desc ? (
                  <p className="mt-1.5 text-sm text-text-secondary leading-6 line-clamp-2">
                    {desc}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="inline-flex shrink-0 items-center gap-1 pt-0.5">
              {canMessageOwner && isBuddyOnline ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onMessageOwner}
                  loading={isMessageOwnerPending}
                  className="rounded-full text-text-muted hover:text-text-primary"
                  title={t('marketplace.messageOwner')}
                  aria-label={t('marketplace.messageOwner')}
                >
                  <MessageCircle size={14} />
                </Button>
              ) : null}
              {canManageAgent ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onEdit}
                    title={t('common.edit')}
                    className="rounded-full text-text-muted hover:text-text-primary"
                    aria-label={t('common.edit')}
                  >
                    <Edit2 size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onDelete}
                    className="rounded-full text-text-muted hover:text-danger hover:bg-danger/10"
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              ) : null}
              {canManageAgent &&
              isBuddyOnline &&
              !agent.isRented &&
              !agent.isListed &&
              !agent.listingInfo &&
              !isPrivateBuddy ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onCreateListing}
                  disabled={agent.isRented || isPrivateBuddy}
                  className="h-8 rounded-full px-3"
                  title={
                    isPrivateBuddy
                      ? t('agentMgmt.privateListingDisabled')
                      : t('marketplace.listingLeaseAction')
                  }
                >
                  <CircleDollarSign size={13} />
                  <span className="ml-1.5">{t('marketplace.listingLeaseAction')}</span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="border-t border-border-subtle/70">
          <div className="divide-y divide-border-subtle/70">
            {canManageAgent && isBuddyOnline ? (
              <DetailField label={t('agentMgmt.enableDisable')}>
                <button
                  type="button"
                  onClick={() => onToggle(agent)}
                  disabled={togglePending}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors',
                    agent.status === 'running' ? 'bg-success' : 'bg-text-muted/30',
                    togglePending && 'opacity-50',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm',
                      agent.status === 'running' && 'translate-x-5',
                    )}
                  />
                </button>
              </DetailField>
            ) : null}
            {isBuddyOnline ? (
              <DetailField label={t('agentMgmt.rentalStatus')}>
                {isTenantAccess ? (
                  <Badge variant="warning" size="sm">
                    {t('agentMgmt.rentingAccessBadge')}
                  </Badge>
                ) : agent.isRented ? (
                  <Badge variant="warning" size="sm">
                    {t('agentMgmt.rented')}
                  </Badge>
                ) : agent.isListed ? (
                  <Badge variant="success" size="sm">
                    {t('agentMgmt.listed')}
                  </Badge>
                ) : agent.listingInfo ? (
                  <Badge variant="warning" size="sm">
                    {agent.listingInfo.listingStatus === 'draft'
                      ? t('agentMgmt.listingDraft')
                      : agent.listingInfo.listingStatus === 'paused'
                        ? t('agentMgmt.listingPaused')
                        : agent.listingInfo.listingStatus === 'expired'
                          ? t('agentMgmt.listingExpired')
                          : t('agentMgmt.listingClosed')}
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="sm">
                    {t('agentMgmt.notListed')}
                  </Badge>
                )}
              </DetailField>
            ) : null}
          </div>
        </div>
      </div>

      {showOfflineGuide && canManageAgent ? (
        connectorSection
      ) : (
        <>
          {accessPolicySection}
          {canManageAgent && tokenSection}
          {canManageAgent && connectorSection}
        </>
      )}
    </div>
  )
}
