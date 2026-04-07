import { Badge } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  LayoutDashboard,
  QrCode,
  Shield,
  User as UserIcon,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../components/common/avatar'
import { formatDuration, OnlineRank } from '../components/common/online-rank'
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
  online: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-danger',
  offline: 'bg-text-muted',
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
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-[24px] bg-primary/10 flex items-center justify-center animate-bounce">
            <div className="w-8 h-8 rounded-full bg-primary" />
          </div>
          <div className="text-primary font-black tracking-widest text-xs uppercase animate-pulse">
            {t('common.loading')}...
          </div>
        </div>
      </div>
    )
  }

  const status = profile.status ?? 'offline'

  return (
    <div className="flex-1 overflow-y-auto bg-bg-primary relative scrollbar-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10">
        {/* Banner Section */}
        <div className="h-48 md:h-64 bg-gradient-to-br from-primary/30 via-bg-secondary to-bg-deep relative overflow-hidden">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="absolute top-6 left-6 w-10 h-10 rounded-xl bg-bg-deep/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-bg-deep/40 transition-all active:scale-95 group z-20"
          >
            <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
        </div>

        <div className="max-w-4xl mx-auto px-6">
          {/* Profile Header Area */}
          <div className="relative -mt-24 md:-mt-32 mb-8">
            <div className="flex flex-col md:flex-row items-end gap-6">
              <div className="relative shrink-0">
                <UserAvatar
                  userId={profile.id}
                  avatarUrl={profile.avatarUrl}
                  displayName={profile.displayName}
                  size="xl"
                  className="w-40 h-40 md:w-48 md:h-48 rounded-[48px] border-[8px] border-bg-primary shadow-2xl ring-1 ring-white/5"
                />
                <div
                  className={`absolute bottom-4 right-4 w-8 h-8 rounded-2xl border-[4px] border-bg-primary shadow-lg ${statusColors[status]}`}
                  title={t(`member.${status}`, status)}
                />
              </div>

              <div className="flex-1 pb-4 text-center md:text-left">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
                  <h1 className="text-4xl font-black text-text-primary tracking-tight">
                    {profile.displayName}
                  </h1>
                  {profile.isBot && (
                    <span className="px-3 py-1 rounded-xl bg-primary text-bg-deep text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                      Buddy
                    </span>
                  )}
                </div>
                <p className="text-xl font-bold text-text-muted opacity-60">@{profile.username}</p>
              </div>

              <div className="pb-4 flex gap-3">
                {currentUser?.id === profile.id ? (
                  <button
                    type="button"
                    onClick={() => setShowQrCard(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-bg-tertiary/50 hover:bg-bg-modifier-hover text-text-primary rounded-2xl border border-border-subtle font-black text-sm transition-all active:scale-95 shadow-xl"
                  >
                    <QrCode size={18} strokeWidth={2.5} />
                    {t('profile.myQrCard', '我的名片')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flex items-center gap-2 px-8 py-3 bg-primary text-bg-deep rounded-2xl font-black text-sm transition-all hover:scale-105 active:scale-95 shadow-xl shadow-primary/20"
                  >
                    {t('member.addFriend', 'Add Friend')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
            {/* Left Column: Stats & Info */}
            <div className="lg:col-span-1 space-y-6">
              <section className="bg-bg-secondary/50 backdrop-blur-sm rounded-[40px] p-6 border border-border-subtle shadow-xl space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/50 ml-1">
                  About
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-text-secondary">
                    <div className="w-8 h-8 rounded-lg bg-bg-tertiary/50 flex items-center justify-center shrink-0">
                      <Calendar size={16} className="text-text-muted" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-widest text-text-muted/60 leading-none mb-1">
                        Joined
                      </p>
                      <p className="text-sm font-bold truncate">
                        {new Date(profile.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-text-secondary">
                    <div className="w-8 h-8 rounded-lg bg-bg-tertiary/50 flex items-center justify-center shrink-0">
                      <Shield size={16} className="text-text-muted" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-widest text-text-muted/60 leading-none mb-1">
                        Status
                      </p>
                      <p className="text-sm font-bold truncate capitalize">{status}</p>
                    </div>
                  </div>
                </div>

                {profile.isBot && profile.agent && (
                  <div className="pt-4 border-t border-border-subtle space-y-4">
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                      <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-2">
                        Online Time
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-black text-text-primary">
                          {formatDuration(profile.agent.totalOnlineSeconds)}
                        </span>
                        <OnlineRank totalSeconds={profile.agent.totalOnlineSeconds} />
                      </div>
                    </div>

                    <Link
                      to="/buddy/$agentId/dashboard"
                      params={{ agentId: profile.agent.id }}
                      className="flex items-center justify-center gap-2 w-full py-3 bg-bg-primary hover:bg-bg-deep text-primary border border-primary/20 rounded-2xl transition-all font-black text-xs uppercase tracking-widest active:scale-95"
                    >
                      <LayoutDashboard size={16} strokeWidth={2.5} />
                      {t('buddyDashboard.viewDashboard', 'View Dashboard')}
                    </Link>
                  </div>
                )}
              </section>

              {/* Owned Buddies Section */}
              {!profile.isBot && profile.ownedAgents.length > 0 && (
                <section className="bg-bg-secondary/50 backdrop-blur-sm rounded-[40px] p-6 border border-border-subtle shadow-xl space-y-4">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/50 ml-1">
                    Buddies ({profile.ownedAgents.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {profile.ownedAgents.map((agent) => (
                      <Link
                        key={agent.id}
                        to="/profile/$userId"
                        params={{ userId: agent.userId }}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-bg-tertiary/50 hover:bg-bg-modifier-hover transition-all group"
                      >
                        <div className="relative shrink-0">
                          <UserAvatar
                            userId={agent.userId}
                            avatarUrl={agent.botUser?.avatarUrl ?? null}
                            displayName={agent.botUser?.displayName ?? 'Buddy'}
                            size="sm"
                            className="rounded-xl group-hover:scale-105 transition-transform"
                          />
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary ${agent.status === 'running' ? 'bg-success' : 'bg-text-muted'}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-black text-text-primary truncate group-hover:text-primary transition-colors block">
                            {agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy'}
                          </span>
                          {agent.totalOnlineSeconds > 0 && (
                            <span className="text-[9px] font-black text-text-muted uppercase tracking-tighter">
                              {formatDuration(agent.totalOnlineSeconds)}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Right Column: Bio & Comments */}
            <div className="lg:col-span-2 space-y-8">
              {/* Bio/Description */}
              {profile.isBot && profile.agent?.config?.description ? (
                <section className="bg-bg-secondary/50 backdrop-blur-sm rounded-[40px] p-8 border border-border-subtle shadow-xl">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/50 mb-4 ml-1">
                    Biography
                  </h3>
                  <p className="text-lg font-bold text-text-primary leading-relaxed">
                    {profile.agent.config.description}
                  </p>
                </section>
              ) : (
                <section className="bg-bg-secondary/50 backdrop-blur-sm rounded-[40px] p-8 border border-border-subtle shadow-xl border-dashed">
                  <div className="flex flex-col items-center justify-center py-4 text-text-muted/30">
                    <UserIcon size={48} strokeWidth={1} className="mb-2" />
                    <p className="font-bold">This user is keeping a low profile.</p>
                  </div>
                </section>
              )}

              {/* Bot's Owner Info */}
              {profile.isBot && profile.agent && (
                <section className="bg-bg-secondary/50 backdrop-blur-sm rounded-[40px] p-8 border border-border-subtle shadow-xl">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/50 mb-4 ml-1">
                    Created By
                  </h3>
                  <Link
                    to="/profile/$userId"
                    params={{ userId: profile.agent.ownerId }}
                    className="flex items-center gap-4 p-4 rounded-3xl bg-bg-tertiary/50 hover:bg-bg-modifier-hover border border-transparent hover:border-primary/20 transition-all group"
                  >
                    <UserAvatar
                      userId={profile.agent.ownerId}
                      avatarUrl={profile.ownerProfile?.avatarUrl ?? null}
                      displayName={profile.ownerProfile?.displayName ?? 'Owner'}
                      size="lg"
                      className="rounded-2xl shadow-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xl font-black text-text-primary group-hover:text-primary transition-colors truncate block">
                        {profile.ownerProfile?.displayName ?? 'Owner'}
                      </span>
                      <span className="text-sm font-bold text-text-muted block">
                        @{profile.ownerProfile?.username ?? 'owner'}
                      </span>
                    </div>
                    <ArrowRight className="text-text-muted group-hover:text-primary transition-all group-hover:translate-x-1" />
                  </Link>
                </section>
              )}

              {/* Comment Section */}
              <div className="bg-bg-secondary/50 backdrop-blur-sm rounded-[40px] p-8 border border-border-subtle shadow-xl">
                <ProfileCommentSection profileUserId={profile.id} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Business Card Modal */}
      {showQrCard &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-bg-deep/80 backdrop-blur-md w-full h-full border-none p-0 m-0 cursor-default"
              onClick={() => setShowQrCard(false)}
              aria-label="Close QR card"
            />
            <div
              className="relative bg-bg-secondary rounded-[48px] p-10 w-full max-w-[400px] flex flex-col items-center shadow-[0_32px_120px_rgba(0,0,0,0.6)] border border-border-subtle z-10 animate-in zoom-in-95 duration-300"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
              }}
              role="presentation"
            >
              <button
                type="button"
                onClick={() => setShowQrCard(false)}
                className="absolute top-8 right-8 p-2 text-text-muted hover:text-text-primary transition-colors bg-bg-tertiary/50 rounded-xl"
              >
                <X size={20} strokeWidth={3} />
              </button>
              <UserAvatar
                userId={profile.id}
                avatarUrl={profile.avatarUrl}
                displayName={profile.displayName}
                size="xl"
                className="w-24 h-24 rounded-[40px] shadow-2xl mb-4"
              />
              <h2 className="text-2xl font-black text-text-primary tracking-tight">
                {profile.displayName}
              </h2>
              <p className="text-sm font-bold text-text-muted opacity-60 mb-8">
                @{profile.username}
              </p>
              <div className="bg-white p-6 rounded-[40px] shadow-inner mb-8 ring-8 ring-primary/10">
                <QRCodeSVG
                  value={`${window.location.origin}/app/profile/${profile.id}`}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#0f0f1a"
                  level="H"
                />
              </div>
              <p className="text-xs font-black text-primary uppercase tracking-[0.2em]">
                {t('profile.scanToAdd', 'Scan to follow me on Shadow')}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
