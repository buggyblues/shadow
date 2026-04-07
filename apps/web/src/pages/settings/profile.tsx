import { Avatar, Badge, Button, Card, FormField, Input, SectionHeader } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Save, User as UserIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AvatarEditor } from '../../components/common/avatar-editor'
import { LanguageSwitcher } from '../../components/common/language-switcher'
import { PriceDisplay } from '../../components/shop/ui/currency'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'

export function ProfileSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user, setUser } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)

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
      showToast(t('common.saveSuccess'), 'success')
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : t('common.saveFailed'), 'error')
    },
  })

  if (!user) return null

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <SectionHeader
        title={t('settings.tabProfile')}
        description={t('settings.profileTitle')}
        icon={UserIcon}
      />

      {/* Preview card */}
      <Card className="p-8 relative overflow-hidden group border-none bg-gradient-to-br from-bg-secondary to-bg-tertiary shadow-xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors duration-500" />

        <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10">
          <div className="relative shrink-0">
            <Avatar
              userId={user.id}
              avatarUrl={selectedAvatar ?? user.avatarUrl}
              displayName={displayName || user.username}
              size="xl"
              className="rounded-[40px] shadow-2xl ring-4 ring-white/5 transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary rounded-2xl flex items-center justify-center text-bg-deep shadow-lg border-4 border-bg-secondary">
              <UserIcon size={20} strokeWidth={3} />
            </div>
          </div>

          <div className="flex-1 text-center md:text-left pt-2 min-w-0">
            <h3 className="text-3xl font-black text-text-primary tracking-tight mb-1 truncate uppercase">
              {displayName || user.username}
            </h3>
            <p className="text-lg font-bold text-text-muted mb-4 opacity-60">@{user.username}</p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-bg-tertiary/50 border border-border-subtle hover:bg-bg-modifier-hover transition-colors shadow-inner">
                <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">
                  Balance
                </span>
                <PriceDisplay
                  amount={wallet?.balance ?? 0}
                  size={14}
                  className="font-black text-primary"
                />
              </div>
              <Badge variant="success" className="px-4 py-2 rounded-2xl">
                Active
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Edit Form */}
      <div className="space-y-8">
        <FormField label={t('settings.displayNameLabel')}>
          <Input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user.username}
          />
        </FormField>

        <FormField label={t('settings.avatarLabel')}>
          <Card className="p-6 bg-bg-tertiary/50 border-dashed border-2 border-border-subtle shadow-none">
            <AvatarEditor
              value={selectedAvatar ?? user.avatarUrl ?? undefined}
              onChange={setSelectedAvatar}
            />
          </Card>
        </FormField>

        <FormField label={t('settings.languageLabel')}>
          <Card className="p-4 flex items-center gap-4 hover:bg-bg-tertiary/50 transition-all shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 shadow-inner">
              <Globe size={20} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <LanguageSwitcher />
            </div>
          </Card>
        </FormField>
      </div>

      {/* Save Button */}
      <div className="pt-8 border-t border-border-subtle flex justify-end">
        <Button
          size="xl"
          onClick={() => updateProfileMutation.mutate()}
          loading={updateProfileMutation.isPending}
          icon={Save}
          className="w-full md:w-auto px-12"
        >
          {t('common.saveChanges')}
        </Button>
      </div>
    </div>
  )
}
