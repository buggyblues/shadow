import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../../components/common/avatar'
import { AvatarEditor } from '../../components/common/avatar-editor'
import { LanguageSwitcher } from '../../components/common/language-switcher'
import { PriceDisplay } from '../../components/shop/ui/currency'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { useRechargeStore } from '../../stores/recharge.store'

export function ProfileSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user, setUser } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const openRecharge = useRechargeStore((s) => s.openModal)

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ balance: number }>('/api/wallet'),
  })

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const result = await fetchApi<{
        id: string
        email: string
        username: string
        displayName: string | null
        avatarUrl: string | null
      }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName || undefined,
          avatarUrl: selectedAvatar,
        }),
      })
      return result
    },
    onSuccess: (result) => {
      setUser({ ...user!, ...result })
      setMessage(t('common.saveSuccess'))
      setSaveSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : t('common.saveFailed'))
      setSaveSuccess(false)
    },
  })

  if (!user) return null

  return (
    <>
      <h2 className="text-2xl font-bold text-text-primary mb-6">{t('settings.profileTitle')}</h2>

      {/* Preview card */}
      <div className="bg-bg-secondary rounded-xl p-6 mb-8 border border-border-subtle">
        <div className="flex items-center gap-4">
          <UserAvatar
            userId={user.id}
            avatarUrl={selectedAvatar ?? user.avatarUrl}
            displayName={displayName || user.username}
            size="xl"
          />
          <div>
            <h3 className="text-lg font-bold text-text-primary">{displayName || user.username}</h3>
            <p className="text-sm text-text-muted">@{user.username}</p>
            <p className="text-xs text-text-muted mt-1">{user.email}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-tertiary border border-border-subtle">
              <span className="text-xs text-text-muted">虾币</span>
              <PriceDisplay amount={wallet?.balance ?? 0} size={13} className="ml-0.5" />
            </div>
            <button
              type="button"
              onClick={openRecharge}
              className="mt-2 ml-2 inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary-hover transition"
            >
              {t('recharge.rechargeNow')}
            </button>
          </div>
        </div>
      </div>

      {/* Display name */}
      <div className="mb-6">
        <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
          {t('settings.displayNameLabel')}
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary transition"
          placeholder={user.username}
        />
      </div>

      {/* Avatar picker */}
      <div className="mb-8">
        <label className="block text-[12px] font-bold uppercase text-text-secondary mb-3 tracking-wide">
          {t('settings.avatarLabel')}
        </label>
        <AvatarEditor
          value={selectedAvatar ?? user.avatarUrl ?? undefined}
          onChange={setSelectedAvatar}
        />
      </div>

      {/* Language */}
      <div className="mb-8">
        <label className="block text-xs font-bold uppercase text-text-secondary mb-3">
          {t('settings.languageLabel')}
        </label>
        <LanguageSwitcher />
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => updateProfileMutation.mutate()}
          disabled={updateProfileMutation.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg transition disabled:opacity-50"
        >
          <Save size={16} />
          {updateProfileMutation.isPending ? t('common.saving') : t('common.saveChanges')}
        </button>
        {message && (
          <span className={`text-sm ${saveSuccess ? 'text-green-400' : 'text-red-400'}`}>
            {message}
          </span>
        )}
      </div>
    </>
  )
}
