import { Badge, Button, cn } from '@shadowob/ui'
import type { UseMutationResult } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import {
  CircleDollarSign,
  ClipboardCopy,
  Edit2,
  Key,
  LockKeyhole,
  MessageCircle,
  Share2,
  Trash2,
  XCircle,
} from 'lucide-react'
import { UserAvatar } from '../common/avatar'
import { OpenClawSetupGuide } from './openclaw-setup-guide'
import { type Agent, type BuddyMode, getAgentBuddyMode, type TokenResponse } from './types'

function formatOnlineDuration(totalSeconds: number, t: TFunction): string {
  if (totalSeconds < 60) return `${totalSeconds}${t('time.seconds', '秒')}`
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours === 0) return `${minutes}${t('time.minutes', '分钟')}`
  if (hours < 24)
    return `${hours}${t('time.hours', '小时')}${minutes > 0 ? `${minutes}${t('time.minutes', '分钟')}` : ''}`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return `${days}${t('time.days', '天')}${remainHours > 0 ? `${remainHours}${t('time.hours', '小时')}` : ''}`
}

/* ── Agent Detail Panel ──────────────────────────────── */

export function AgentDetail({
  agent,
  generatedToken,
  tokenCopied,
  tokenMutation,
  onCopyToken,
  onDelete,
  onEdit,
  onToggle,
  onChangeBuddyMode,
  onCreateListing,
  togglePending,
  buddyModePending,
  onMessageOwner,
  isMessageOwnerPending,
  currentUserId,
  t,
}: {
  agent: Agent
  generatedToken: string | null
  tokenCopied: boolean
  tokenMutation: UseMutationResult<TokenResponse, Error, string>
  onCopyToken: (token: string) => void
  onDelete: () => void
  onEdit: () => void
  onCreateListing: () => void
  onToggle: (agent: Agent) => void
  onChangeBuddyMode?: (mode: BuddyMode) => void
  togglePending: boolean
  buddyModePending?: boolean
  onMessageOwner?: () => void
  isMessageOwnerPending?: boolean
  currentUserId?: string | null
  t: TFunction
}) {
  const name = agent.botUser?.displayName ?? agent.botUser?.username ?? 'Agent'
  const desc = (agent.config?.description as string) ?? ''
  const buddyMode = getAgentBuddyMode(agent)
  const isPrivateBuddy = buddyMode === 'private'
  const isTenantAccess = agent.accessRole === 'tenant'
  const canManageAgent = !isTenantAccess
  const ownerUserId = agent.botUser?.id ?? agent.userId
  const canMessageOwner =
    Boolean(onMessageOwner) &&
    Boolean(currentUserId) &&
    Boolean(ownerUserId) &&
    currentUserId !== ownerUserId

  return (
    <div className="space-y-6">
      {/* Agent header */}
      <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm">
        <div className="flex items-center gap-4">
          <UserAvatar
            userId={agent.botUser?.id ?? agent.userId}
            avatarUrl={agent.botUser?.avatarUrl}
            displayName={name}
            size="xl"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-text-primary">{name}</h3>
              {isPrivateBuddy && (
                <LockKeyhole
                  size={15}
                  className="text-warning"
                  aria-label={t('agentMgmt.modePrivate')}
                />
              )}
              <Badge variant="primary" size="xs">
                {t('common.bot')}
              </Badge>
              {isTenantAccess && (
                <Badge variant="warning" size="xs">
                  {t('agentMgmt.rentingAccessBadge')}
                </Badge>
              )}
            </div>
            {agent.botUser?.username && (
              <p className="text-sm text-text-muted font-bold italic">@{agent.botUser.username}</p>
            )}
            {desc && <p className="text-sm text-text-secondary mt-1">{desc}</p>}
          </div>
          <div className="flex gap-2">
            {canMessageOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={onMessageOwner}
                loading={isMessageOwnerPending}
                className="rounded-[12px]"
              >
                <MessageCircle size={14} />
                {t('marketplace.messageOwner', '私信')}
              </Button>
            )}
            {canManageAgent && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onCreateListing}
                  disabled={agent.isRented || isPrivateBuddy}
                  className="rounded-[12px]"
                  title={isPrivateBuddy ? t('agentMgmt.privateListingDisabled') : undefined}
                >
                  <CircleDollarSign size={14} />
                  {agent.listingInfo
                    ? t('marketplace.updateListing', '更新挂单')
                    : t('marketplace.createListing', '出租')}
                </Button>
                <Button variant="ghost" size="icon" onClick={onEdit} title={t('common.edit')}>
                  <Edit2 size={18} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  className="hover:text-danger hover:bg-danger/10"
                  title={t('common.delete')}
                >
                  <Trash2 size={18} />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-primary">
            {isPrivateBuddy ? <LockKeyhole size={18} /> : <Share2 size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
                {t('agentMgmt.accessSection')}
              </h3>
              <Badge variant={isPrivateBuddy ? 'neutral' : 'success'} size="xs">
                {isPrivateBuddy ? t('agentMgmt.modePrivate') : t('agentMgmt.modeShareable')}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-muted">
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
              <div className="mt-4 inline-flex rounded-[14px] border border-border-subtle bg-bg-tertiary/50 p-1">
                <button
                  type="button"
                  onClick={() => onChangeBuddyMode('private')}
                  disabled={buddyModePending || isPrivateBuddy}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-black transition',
                    isPrivateBuddy
                      ? 'bg-primary/15 text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover',
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
                    'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-black transition',
                    !isPrivateBuddy
                      ? 'bg-primary/15 text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover',
                    buddyModePending && 'opacity-60',
                  )}
                >
                  <Share2 size={13} />
                  {t('agentMgmt.modeShareable')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status & info */}
      <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1.5">
            {t('agentMgmt.status')}
          </label>
          <div className="flex items-center gap-2">
            {(() => {
              if (agent.status === 'error') {
                return (
                  <Badge variant="danger" size="sm">
                    <XCircle size={12} className="mr-1" />
                    {t('agentMgmt.statusError')}
                  </Badge>
                )
              }
              if (agent.status === 'stopped') {
                return (
                  <Badge variant="neutral" size="sm">
                    <span className="w-2 h-2 rounded-full bg-text-muted mr-1" />
                    {t('agentMgmt.statusStopped')}
                  </Badge>
                )
              }
              const isOnline =
                agent.lastHeartbeat && Date.now() - new Date(agent.lastHeartbeat).getTime() < 90000
              return (
                <Badge variant={isOnline ? 'success' : 'neutral'} size="sm">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full mr-1',
                      isOnline ? 'bg-success' : 'bg-text-muted',
                    )}
                  />
                  {isOnline ? t('member.online') : t('member.offline')}
                </Badge>
              )
            })()}
          </div>
        </div>
        {canManageAgent && (
          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1.5">
              {t('agentMgmt.enableDisable')}
            </label>
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
          </div>
        )}
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1.5">
            {t('agentMgmt.owner')}
          </label>
          <div className="flex items-center gap-2">
            {agent.owner && (
              <UserAvatar
                userId={agent.owner.id}
                avatarUrl={agent.owner.avatarUrl}
                displayName={agent.owner.displayName ?? agent.owner.username}
                size="xs"
              />
            )}
            <p className="text-sm text-text-primary font-bold">
              {agent.owner?.displayName ?? agent.owner?.username ?? '—'}
            </p>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1.5">
            {t('agentMgmt.createdAt')}
          </label>
          <p className="text-sm text-text-primary font-bold">
            {new Date(agent.createdAt).toLocaleString()}
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
            {t('agentMgmt.totalOnlineTime')}
          </label>
          <p className="text-sm text-text-primary font-bold">
            {formatOnlineDuration(agent.totalOnlineSeconds ?? 0, t)}
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
            {t('agentMgmt.connection')}
          </label>
          {(() => {
            if (!agent.lastHeartbeat) {
              return (
                <Badge variant="neutral" size="sm">
                  {t('agentMgmt.neverConnected')}
                </Badge>
              )
            }
            const lastBeat = new Date(agent.lastHeartbeat).getTime()
            const now = Date.now()
            const diffSec = Math.floor((now - lastBeat) / 1000)
            const isOnline = diffSec < 90
            const isWarning = diffSec >= 90 && diffSec < 300
            return (
              <Badge variant={isOnline ? 'success' : isWarning ? 'warning' : 'danger'} size="sm">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full mr-1',
                    isOnline ? 'bg-success' : isWarning ? 'bg-warning' : 'bg-danger',
                  )}
                />
                {isOnline
                  ? t('agentMgmt.connected')
                  : `${t('agentMgmt.lastSeen')} ${new Date(agent.lastHeartbeat).toLocaleString()}`}
              </Badge>
            )
          })()}
        </div>
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
            {t('agentMgmt.rentalStatus')}
          </label>
          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </div>

      {canManageAgent && (
        <>
          {/* Token section */}
          <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Key size={16} className="text-primary" />
              <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
                {t('agentMgmt.tokenTitle')}
              </h3>
            </div>
            <p className="text-sm text-text-muted font-bold italic mb-5">
              {t('agentMgmt.tokenDesc')}
            </p>

            {(() => {
              const displayToken =
                generatedToken ?? (agent.config?.lastToken as string | undefined) ?? null
              if (displayToken) {
                return (
                  <div className="space-y-4">
                    <div className="bg-bg-deep/50 backdrop-blur-sm rounded-[16px] p-4 break-all font-mono text-[13px] text-text-secondary border border-border-subtle shadow-inner">
                      {displayToken}
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant={tokenCopied ? 'outline' : 'primary'}
                        size="sm"
                        onClick={() => onCopyToken(displayToken)}
                        className="rounded-[12px]"
                      >
                        <ClipboardCopy size={14} />
                        {tokenCopied ? t('common.copied') : t('common.copy')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => tokenMutation.mutate(agent.id)}
                        disabled={tokenMutation.isPending}
                        className="rounded-[12px]"
                      >
                        <Key size={14} />
                        {tokenMutation.isPending
                          ? t('agentMgmt.generating')
                          : t('agentMgmt.regenerateToken')}
                      </Button>
                    </div>

                    {/* JSON config example */}
                    <div className="mt-5">
                      <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-2">
                        {t('agentMgmt.configExample')}
                      </label>
                      <pre className="bg-bg-deep/50 backdrop-blur-sm rounded-[16px] p-4 text-[13px] text-text-secondary border border-border-subtle overflow-x-auto shadow-inner">
                        {`{
  "channels": {
    "shadowob": {
      "token": "${displayToken}...",
      "serverUrl": "${window.location.origin}"
    }
  }
}`}
                      </pre>
                    </div>
                  </div>
                )
              }
              return (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => tokenMutation.mutate(agent.id)}
                  disabled={tokenMutation.isPending}
                  className="rounded-[12px]"
                >
                  <Key size={14} />
                  {tokenMutation.isPending
                    ? t('agentMgmt.generating')
                    : t('agentMgmt.generateToken')}
                </Button>
              )
            })()}
          </div>

          {/* OpenClaw Setup Guide */}
          <OpenClawSetupGuide
            agent={agent}
            generatedToken={generatedToken}
            onGenerateToken={() => tokenMutation.mutate(agent.id)}
            generatingToken={tokenMutation.isPending}
            t={t}
          />
        </>
      )}
    </div>
  )
}
