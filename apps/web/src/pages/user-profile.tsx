import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft, Image, LayoutDashboard, QrCode, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../components/common/avatar'
import { formatDuration, OnlineRank } from '../components/common/online-rank'
import { PortfolioGrid } from '../components/portfolio'
import { ProfileCommentSection } from '../components/profile/ProfileCommentSection'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'

interface UserProfile {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
  status: string
  createdAt: string
  agent?: {
    id: string
    ownerId: string
    status: string
    totalOnlineSeconds: number
    config: { description?: string }
  }
  ownerProfile?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
  } | null
  ownedAgents: Array<{
    id: string
    userId: string
    status: string
    totalOnlineSeconds: number
    botUser?: { id: string; username: string; displayName: string; avatarUrl: string | null }
  }>
}

const statusColors: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
}

export function UserProfilePage() {
  const { t } = useTranslation()
  const { userId } = useParams({ strict: false }) as { userId: string }
  const currentUser = useAuthStore((s) => s.user)
  const [showQrCard, setShowQrCard] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => fetchApi<UserProfile>(`/api/auth/users/${userId}`),
    enabled: !!userId,
  })

  if (isLoading || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-text-muted text-lg font-bold">
          {t('common.loading', '加载中...')}
        </div>
      </div>
    )
  }

  const status = profile.status ?? 'offline'

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-bg-primary">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Back */}
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition font-bold mb-6"
          >
            <ChevronLeft className="w-5 h-5" />
            {t('common.back', '返回')}
          </button>

          {/* Profile Card */}
          <div className="bg-bg-secondary rounded-2xl border border-border-subtle overflow-hidden">
            {/* Banner */}
            <div className="h-32 bg-gradient-to-r from-primary/40 to-primary/20" />

            {/* Avatar */}
            <div className="px-8 -mt-12">
              <div className="relative inline-block">
                <UserAvatar
                  userId={profile.id}
                  avatarUrl={profile.avatarUrl}
                  displayName={profile.displayName}
                  size="xl"
                  className="border-4 border-bg-secondary w-24 h-24"
                />
                <div
                  className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-[3px] border-bg-secondary ${statusColors[status]}`}
                />
              </div>
            </div>

            {/* Info */}
            <div className="px-8 pt-4 pb-8">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-text-primary">{profile.displayName}</h1>
                {profile.isBot && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-medium">
                    Buddy
                  </span>
                )}
              </div>
              <p className="text-text-muted">@{profile.username}</p>

              {currentUser?.id === profile.id && (
                <button
                  type="button"
                  onClick={() => setShowQrCard(true)}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm font-medium"
                >
                  <QrCode className="w-4 h-4" />
                  {t('profile.myQrCard', '我的名片')}
                </button>
              )}

              {/* Status */}
              <div className="flex items-center gap-2 mt-4">
                <div className={`w-3 h-3 rounded-full ${statusColors[status]}`} />
                <span className="text-sm text-text-secondary">{t(`member.${status}`, status)}</span>
              </div>

              {/* Bot-specific info */}
              {profile.isBot && profile.agent && (
                <>
                  {/* Online duration + rank */}
                  {profile.agent.totalOnlineSeconds > 0 && (
                    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border-subtle">
                      <span className="text-sm text-text-muted">
                        累计在线 {formatDuration(profile.agent.totalOnlineSeconds)}
                      </span>
                      <OnlineRank totalSeconds={profile.agent.totalOnlineSeconds} />
                    </div>
                  )}

                  {/* Description */}
                  {profile.agent.config?.description && (
                    <div className="mt-4 pt-4 border-t border-border-subtle">
                      <p className="text-xs uppercase tracking-wide text-text-muted mb-2">描述</p>
                      <p className="text-sm text-text-secondary whitespace-pre-wrap">
                        {profile.agent.config.description}
                      </p>
                    </div>
                  )}

                  {/* Dashboard Link */}
                  <div className="mt-4 pt-4 border-t border-border-subtle">
                    <Link
                      to="/buddy/$agentId/dashboard"
                      params={{ agentId: profile.agent.id }}
                      className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition font-medium text-sm"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      {t('buddyDashboard.viewDashboard', 'View Dashboard')}
                    </Link>
                  </div>

                  {/* Owner link */}
                  <div className="mt-4 pt-4 border-t border-border-subtle">
                    <p className="text-xs uppercase tracking-wide text-text-muted mb-2">主人</p>
                    <Link
                      to="/profile/$userId"
                      params={{ userId: profile.agent.ownerId }}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-bg-modifier-hover transition group"
                    >
                      <UserAvatar
                        userId={profile.agent.ownerId}
                        avatarUrl={profile.ownerProfile?.avatarUrl ?? null}
                        displayName={profile.ownerProfile?.displayName ?? '主人'}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-primary group-hover:underline truncate block">
                          {profile.ownerProfile?.displayName ??
                            t('member.viewOwnerProfile', '查看主人主页')}
                        </span>
                        {profile.ownerProfile?.username && (
                          <span className="text-xs text-text-muted">
                            @{profile.ownerProfile.username}
                          </span>
                        )}
                      </div>
                    </Link>
                  </div>
                </>
              )}

              {/* Regular user: owned agents */}
              {!profile.isBot && profile.ownedAgents.length > 0 && (
                <div className="mt-6 pt-6 border-t border-border-subtle">
                  <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide mb-3">
                    拥有的 Buddy ({profile.ownedAgents.length})
                  </h2>
                  <div className="space-y-3">
                    {profile.ownedAgents.map((agent) => (
                      <Link
                        key={agent.id}
                        to="/profile/$userId"
                        params={{ userId: agent.userId }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-bg-tertiary hover:bg-bg-modifier-hover transition group"
                      >
                        <div className="relative shrink-0">
                          <UserAvatar
                            userId={agent.userId}
                            avatarUrl={agent.botUser?.avatarUrl ?? null}
                            displayName={agent.botUser?.displayName ?? 'Buddy'}
                            size="sm"
                          />
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-tertiary ${agent.status === 'running' ? 'bg-green-500' : 'bg-gray-500'}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition">
                              {agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy'}
                            </span>
                            <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded-[3px] font-semibold shrink-0">
                              Buddy
                            </span>
                          </div>
                          {agent.totalOnlineSeconds > 0 && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-text-muted">
                                在线 {formatDuration(agent.totalOnlineSeconds)}
                              </span>
                              <OnlineRank totalSeconds={agent.totalOnlineSeconds} />
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Portfolio Section */}
              <div className="mt-6 pt-6 border-t border-border-subtle">
                <div className="flex items-center gap-2 mb-4">
                  <Image className="w-4 h-4 text-text-muted" />
                  <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">
                    作品集
                  </h2>
                </div>
                <PortfolioGrid userId={profile.id} isOwner={currentUser?.id === profile.id} />
              </div>

              {/* Join date */}
              <div className="mt-6 pt-4 border-t border-border-subtle">
                <p className="text-xs text-text-muted">
                  {t('member.joinedAt', '加入时间')}：
                  {new Date(profile.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Comment Section */}
              <ProfileCommentSection profileUserId={profile.id} />
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Business Card Modal */}
      {showQrCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowQrCard(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowQrCard(false)}
        >
          <div
            className="bg-bg-secondary rounded-2xl p-8 w-[320px] flex flex-col items-center relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={() => {}}
          >
            <button
              type="button"
              onClick={() => setShowQrCard(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition"
            >
              <X className="w-5 h-5" />
            </button>

            <UserAvatar
              userId={profile.id}
              avatarUrl={profile.avatarUrl}
              displayName={profile.displayName}
              size="lg"
              className="w-16 h-16"
            />
            <h2 className="text-lg font-bold text-text-primary mt-3">{profile.displayName}</h2>
            <p className="text-sm text-text-muted">@{profile.username}</p>

            <div className="bg-white p-4 rounded-xl mt-5">
              <QRCodeSVG
                value={`shadow://user/${profile.username}`}
                size={180}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>

            <p className="text-xs text-text-muted mt-4">
              {t('profile.scanToAdd', '扫一扫，加好友')}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
