import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { useChatStore } from '../../stores/chat.store'
import { UserAvatar } from '../common/avatar'

interface MemberUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline'
  isBot: boolean
}

interface Member {
  id: string
  userId: string
  serverId: string
  role: 'owner' | 'admin' | 'member'
  nickname: string | null
  joinedAt: string
  user?: MemberUser
}

const statusColors: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
}

export function MemberList() {
  const { t } = useTranslation()
  const { activeServerId } = useChatStore()
  const queryClient = useQueryClient()

  const { data: members = [] } = useQuery({
    queryKey: ['members', activeServerId],
    queryFn: () => fetchApi<Member[]>(`/api/servers/${activeServerId}/members`),
    enabled: !!activeServerId,
  })

  // Listen for real-time presence changes
  useSocketEvent(
    'presence:change',
    (data: { userId: string; status: 'online' | 'idle' | 'dnd' | 'offline' }) => {
      queryClient.setQueryData<Member[]>(['members', activeServerId], (old = []) =>
        old.map((m) =>
          m.userId === data.userId && m.user
            ? { ...m, user: { ...m.user, status: data.status } }
            : m,
        ),
      )
    },
  )

  const onlineMembers = members.filter((m) => m.user?.status !== 'offline')
  const offlineMembers = members.filter((m) => m.user?.status === 'offline')

  const renderMemberGroup = (label: string, items: Member[]) => {
    if (items.length === 0) return null
    return (
      <div className="mb-4">
        <h4 className="text-xs font-semibold uppercase text-text-muted px-2 mb-1">
          {label} — {items.length}
        </h4>
        {items.map((member) => {
          const user = member.user
          if (!user) return null
          const badge =
            member.role === 'owner'
              ? { label: t('member.owner'), color: 'text-yellow-400' }
              : member.role === 'admin'
                ? { label: t('member.admin'), color: 'text-blue-400' }
                : null
          return (
            <button
              type="button"
              key={member.id}
              className="flex items-center gap-3 px-2 py-1.5 w-full rounded-md hover:bg-white/[0.04] transition group"
            >
              {/* Avatar with status dot */}
              <div className="relative shrink-0">
                <UserAvatar
                  userId={user.id}
                  avatarUrl={user.avatarUrl}
                  displayName={user.displayName || user.username}
                  size="sm"
                />
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary ${statusColors[user.status]}`}
                  title={t(`member.${user.status}`)}
                />
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1">
                  <span
                    className={`text-sm truncate ${user.status === 'offline' ? 'text-text-muted' : 'text-text-secondary group-hover:text-text-primary'} transition`}
                  >
                    {member.nickname ?? user.displayName}
                  </span>
                  {user.isBot && (
                    <span className="text-[9px] bg-primary/20 text-primary px-1 py-0.5 rounded font-medium shrink-0">
                      BOT
                    </span>
                  )}
                </div>
                {badge && <span className={`text-[10px] ${badge.color}`}>{badge.label}</span>}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="w-60 bg-bg-secondary overflow-y-auto shrink-0 pt-4 hidden lg:block">
      {renderMemberGroup(t('member.groupOnline'), onlineMembers)}
      {renderMemberGroup(t('member.groupOffline'), offlineMembers)}
      {members.length === 0 && (
        <p className="text-text-muted text-sm px-4 py-2">{t('member.noMembers')}</p>
      )}
    </div>
  )
}
