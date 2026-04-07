import { Button, cn, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Link2, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../../components/common/avatar'
import { PriceDisplay } from '../../components/shop/ui/currency'
import { fetchApi } from '../../lib/api'
import { copyToClipboardSilent } from '../../lib/clipboard'

interface InviteCode {
  id: string
  code: string
  createdBy: string
  usedBy: string | null
  note: string | null
  isActive: boolean
  usedAt: string | null
  createdAt: string
  usedByUser: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

export function InviteSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: referralSummary } = useQuery({
    queryKey: ['task-referral-summary'],
    queryFn: () =>
      fetchApi<{
        rewardPerUser: number
        rewardForInviter: number
        rewardForInvitee: number
        successfulInvites: number
        totalInviteRewards: number
        campaignText: string
      }>('/api/tasks/referral-summary'),
  })

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ['invite-codes'],
    queryFn: () => fetchApi<InviteCode[]>('/api/invite-codes'),
  })

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [note, setNote] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [friendRequestSent, setFriendRequestSent] = useState<Set<string>>(new Set())

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/invite-codes', {
        method: 'POST',
        body: JSON.stringify({ count: 1, note: note || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-codes'] })
      setNote('')
      setShowCreateForm(false)
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/invite-codes/${id}/deactivate`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-codes'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/invite-codes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-codes'] })
    },
  })

  const copyCode = async (code: string, id: string) => {
    const registerUrl = `${window.location.origin}/app/register?code=${code}`
    const success = await copyToClipboardSilent(registerUrl)
    if (success) {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const handleAddFriend = async (username: string, userId: string) => {
    try {
      await fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      })
      setFriendRequestSent((prev) => new Set(prev).add(userId))
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div className="bg-gradient-to-r from-primary/15 to-emerald-500/15 border border-primary/20 rounded-[24px] p-4 mb-6">
        <p className="text-sm font-black text-text-primary">
          {referralSummary?.campaignText ?? '邀请好友完成注册登录，你和好友均可获得 500 虾币'}
        </p>
        <p className="text-xs text-text-muted mt-1">
          已成功邀请 {referralSummary?.successfulInvites ?? 0} 人，累计获得{' '}
          {referralSummary?.totalInviteRewards ?? 0} 虾币
        </p>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-text-primary">{t('settings.inviteTitle')}</h2>
          <p className="text-sm text-text-muted mt-1">{t('settings.inviteDesc')}</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className=""
        >
          {showCreateForm ? (
            <>
              <X size={16} className="mr-1" />
              {t('common.cancel')}
            </>
          ) : (
            <>
              <Plus size={16} className="mr-1" />
              {t('settings.inviteCreate')}
            </>
          )}
        </Button>
      </div>

      {showCreateForm && (
        <div className="bg-bg-tertiary/30 backdrop-blur-xl rounded-[24px] p-4 mb-6 border border-border-subtle">
          <div className="flex gap-3">
            <Input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  createMutation.mutate()
                }
              }}
              placeholder={t('settings.inviteNotePlaceholder')}
              className="flex-1 rounded-[14px] px-4 py-2.5 text-sm h-10"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className=""
            >
              {createMutation.isPending ? t('common.loading') : t('settings.inviteGenerate')}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-text-muted py-12">{t('common.loading')}</div>
      ) : codes.length === 0 ? (
        <div className="text-center text-text-muted py-12 bg-bg-tertiary/30 backdrop-blur-xl rounded-[24px] border border-border-subtle">
          <Link2 size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t('settings.inviteEmpty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {codes.map((code) => {
            const isUsed = !!code.usedBy
            const isActive = code.isActive && !isUsed

            return (
              <div
                key={code.id}
                className={cn(
                  'bg-bg-tertiary/30 backdrop-blur-xl rounded-[24px] p-4 border transition-all',
                  isActive ? 'border-border-subtle' : 'border-border-subtle opacity-60',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-black text-text-primary tracking-widest">
                        {code.code}
                      </span>
                      {isUsed && (
                        <span className="text-[11px] px-1.5 py-0.5 bg-success/10 text-success rounded font-medium">
                          {t('settings.inviteUsed')}
                        </span>
                      )}
                      {!isActive && !isUsed && (
                        <span className="text-[11px] px-1.5 py-0.5 bg-accent/10 text-accent rounded font-medium">
                          {t('settings.inviteInactive')}
                        </span>
                      )}
                      {isActive && (
                        <span className="text-[11px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium">
                          {t('settings.inviteActive')}
                        </span>
                      )}
                    </div>
                    {code.note && <p className="text-xs text-text-muted truncate">{code.note}</p>}
                    {isUsed && code.usedByUser && (
                      <div className="flex items-center gap-2 mt-1">
                        <UserAvatar
                          userId={code.usedByUser.id}
                          avatarUrl={code.usedByUser.avatarUrl}
                          size="xs"
                        />
                        <p className="text-xs text-text-muted">
                          {t('settings.inviteUsedBy')}:{' '}
                          {code.usedByUser.displayName || code.usedByUser.username}
                          {code.usedAt && (
                            <span className="ml-2 text-text-muted/60">
                              {new Date(code.usedAt).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    <p className="text-[11px] text-text-muted/50 mt-0.5">
                      {new Date(code.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isUsed && code.usedByUser && !friendRequestSent.has(code.usedByUser.id) && (
                      <button
                        onClick={() =>
                          handleAddFriend(code.usedByUser!.username, code.usedByUser!.id)
                        }
                        className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition"
                        title={t('friends.addFriend', '添加好友')}
                      >
                        <UserPlus size={15} />
                      </button>
                    )}
                    {isUsed && code.usedByUser && friendRequestSent.has(code.usedByUser.id) && (
                      <span className="p-2 text-success">
                        <Check size={15} />
                      </span>
                    )}
                    {isActive && (
                      <button
                        onClick={() => copyCode(code.code, code.id)}
                        className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-active rounded-lg transition"
                        title={t('settings.inviteCopyLink')}
                      >
                        {copiedId === code.id ? (
                          <Check size={15} className="text-success" />
                        ) : (
                          <Copy size={15} />
                        )}
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => deactivateMutation.mutate(code.id)}
                        disabled={deactivateMutation.isPending}
                        className="p-2 text-text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition"
                        title={t('settings.inviteDeactivate')}
                      >
                        <X size={15} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteMutation.mutate(code.id)}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition"
                      title={t('common.delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
