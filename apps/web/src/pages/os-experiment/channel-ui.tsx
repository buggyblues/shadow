import { cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Hash, Inbox, Megaphone, Volume2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '../../components/chat/message-bubble/types'
import { UserAvatar } from '../../components/common/avatar'
import { PresenceAvatar } from '../../components/common/presence-avatar'
import type { MemberListInitialMember } from '../../components/member/member-list'
import { fetchApi } from '../../lib/api'
import type { BuddyInboxEntry, ChannelMeta } from './types'

export type ChannelCreateType = 'text' | 'voice' | 'announcement'

export const CHANNEL_CREATE_TYPES: ChannelCreateType[] = ['text', 'voice', 'announcement']

type ChannelBootstrapPreview = {
  members?: MemberListInitialMember[]
  messages?: {
    messages?: Message[]
  }
}

function normalizeChannelType(type?: string | null): ChannelCreateType {
  if (type === 'voice' || type === 'announcement') return type
  return 'text'
}

export function ChannelTypeIcon({
  type,
  size = 15,
  className,
}: {
  type?: string | null
  size?: number
  className?: string
}) {
  const kind = normalizeChannelType(type)
  const Icon = kind === 'voice' ? Volume2 : kind === 'announcement' ? Megaphone : Hash
  return <Icon size={size} className={className} />
}

function channelTypeLabelKey(type?: string | null) {
  const kind = normalizeChannelType(type)
  return kind === 'voice'
    ? 'channel.typeVoice'
    : kind === 'announcement'
      ? 'channel.typeAnnouncement'
      : 'channel.typeText'
}

function userName(user: { username?: string | null; displayName?: string | null } | undefined) {
  return user?.displayName?.trim() || user?.username?.trim() || ''
}

function messageText(message: Message, attachmentFallback: string) {
  const content = message.content?.trim()
  if (content) return content
  if ((message.attachments?.length ?? 0) > 0) return attachmentFallback
  return ''
}

function inboxDisplayName(entry: BuddyInboxEntry) {
  return entry.agent.user.displayName?.trim() || entry.agent.user.username || entry.agent.id
}

export function OsChannelTabHoverCard({ channel }: { channel: ChannelMeta }) {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useQuery<ChannelBootstrapPreview>({
    queryKey: ['os-channel-tab-preview', channel.id],
    queryFn: () =>
      fetchApi<ChannelBootstrapPreview>(`/api/channels/${channel.id}/bootstrap?messagesLimit=5`),
    enabled: Boolean(channel.id),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  })

  const messages = useMemo(
    () =>
      [...(data?.messages?.messages ?? [])]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, 2),
    [data?.messages?.messages],
  )
  const activeUsers = useMemo(() => {
    const users = new Map<
      string,
      { id: string; avatarUrl: string | null; displayName: string; username?: string | null }
    >()
    for (const message of messages) {
      if (!message.author?.id || users.has(message.author.id)) continue
      users.set(message.author.id, {
        id: message.author.id,
        avatarUrl: message.author.avatarUrl,
        displayName: userName(message.author) || t('common.unknownUser'),
        username: message.author.username,
      })
    }
    for (const member of data?.members ?? []) {
      if (!member.user?.id || users.has(member.user.id)) continue
      users.set(member.user.id, {
        id: member.user.id,
        avatarUrl: member.user.avatarUrl,
        displayName: userName(member.user) || t('common.unknownUser'),
        username: member.user.username,
      })
      if (users.size >= 3) break
    }
    return [...users.values()].slice(0, 3)
  }, [data?.members, messages, t])

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language],
  )

  return (
    <div className="w-72 rounded-2xl border border-white/14 bg-bg-primary/96 p-3 text-left shadow-[0_22px_64px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-xl border',
            normalizeChannelType(channel.type) === 'voice'
              ? 'border-emerald-300/25 bg-emerald-300/12 text-emerald-200'
              : normalizeChannelType(channel.type) === 'announcement'
                ? 'border-amber-300/25 bg-amber-300/12 text-amber-200'
                : 'border-primary/25 bg-primary/12 text-primary',
          )}
        >
          <ChannelTypeIcon type={channel.type} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-text-primary">{channel.name}</p>
          <p className="truncate text-[11px] font-bold text-text-muted">
            {t(channelTypeLabelKey(channel.type))}
          </p>
        </div>
        {activeUsers.length > 0 ? (
          <div className="flex shrink-0 -space-x-2">
            {activeUsers.map((user) => (
              <UserAvatar
                key={user.id}
                userId={user.id}
                avatarUrl={user.avatarUrl}
                displayName={user.displayName}
                size="xs"
                className="border-2 border-bg-primary"
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-text-muted">
          {t('channel.recentMessages')}
        </p>
        {isLoading ? (
          <div className="space-y-2">
            <span className="block h-3 w-44 rounded-full bg-white/10" />
            <span className="block h-3 w-32 rounded-full bg-white/8" />
          </div>
        ) : messages.length > 0 ? (
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message.id} className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-[11px] font-bold text-text-muted">
                  <span className="truncate">
                    {userName(message.author) || t('common.unknownUser')}
                  </span>
                  <span className="shrink-0 text-text-muted/70">
                    {formatter.format(new Date(message.createdAt))}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-5 text-text-secondary">
                  {messageText(message, t('channel.attachmentMessage')) ||
                    t('channel.emptyMessage')}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs font-semibold text-text-muted">{t('channel.noRecentMessages')}</p>
        )}
      </div>
    </div>
  )
}

export function OsInboxHoverCard({
  entry,
  unread = 0,
}: {
  entry: BuddyInboxEntry
  unread?: number
}) {
  const { t, i18n } = useTranslation()
  const channelId = entry.channel?.id
  const displayName = inboxDisplayName(entry)
  const { data, isLoading } = useQuery<ChannelBootstrapPreview>({
    queryKey: ['os-inbox-hover-preview', entry.agent.id, channelId],
    queryFn: () => {
      if (!channelId) return Promise.resolve({})
      return fetchApi<ChannelBootstrapPreview>(
        `/api/channels/${channelId}/bootstrap?messagesLimit=5`,
      )
    },
    enabled: Boolean(channelId),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  })

  const messages = useMemo(
    () =>
      [...(data?.messages?.messages ?? [])]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, 2),
    [data?.messages?.messages],
  )

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language],
  )

  return (
    <div className="w-72 rounded-2xl border border-white/14 bg-bg-primary/96 p-3 text-left shadow-[0_22px_64px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
      <div className="flex min-w-0 items-center gap-2.5">
        <PresenceAvatar
          userId={entry.agent.user.id}
          avatarUrl={entry.agent.user.avatarUrl}
          displayName={displayName}
          status={entry.agent.user.status}
          agentStatus={entry.agent.status}
          lastHeartbeat={entry.agent.lastHeartbeat}
          isBot
          size="sm"
          className="shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-text-primary">{displayName}</p>
          <p className="truncate text-[11px] font-bold text-text-muted">
            {t(channelId ? 'inbox.queueOpen' : 'inbox.queueNotReady')}
          </p>
        </div>
        {unread > 0 ? (
          <span className="shrink-0 rounded-full border border-danger/30 bg-danger/15 px-2 py-0.5 text-[11px] font-black text-danger">
            {t('inbox.queueUnread', { count: unread })}
          </span>
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/12 text-primary">
            <Inbox size={16} />
          </span>
        )}
      </div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-text-muted">
          {t('channel.recentMessages')}
        </p>
        {!channelId ? (
          <p className="text-xs font-semibold text-text-muted">{t('inbox.queueNotReady')}</p>
        ) : isLoading ? (
          <div className="space-y-2">
            <span className="block h-3 w-44 rounded-full bg-white/10" />
            <span className="block h-3 w-32 rounded-full bg-white/8" />
          </div>
        ) : messages.length > 0 ? (
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message.id} className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-[11px] font-bold text-text-muted">
                  <span className="truncate">
                    {userName(message.author) || t('common.unknownUser')}
                  </span>
                  <span className="shrink-0 text-text-muted/70">
                    {formatter.format(new Date(message.createdAt))}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-5 text-text-secondary">
                  {messageText(message, t('channel.attachmentMessage')) ||
                    t('channel.emptyMessage')}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs font-semibold text-text-muted">{t('channel.noRecentMessages')}</p>
        )}
      </div>
    </div>
  )
}
