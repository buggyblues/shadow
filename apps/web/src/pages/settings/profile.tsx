import { Button, FormField, Input } from '@shadowob/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ExternalLink, Globe, Save, User as UserIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AvatarEditor } from '../../components/common/avatar-editor'
import { LanguageSwitcher } from '../../components/common/language-switcher'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
import { SettingsCard, SettingsHeader, SettingsPanel } from './_shared'

export function ProfileSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)

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
    <SettingsPanel>
      <div className="flex items-center justify-between">
        <SettingsHeader
          titleKey="settings.tabProfile"
          titleFallback="修改资料"
          descKey="settings.profileDesc"
          descFallback="修改你的头像、昵称和语言偏好"
          icon={UserIcon}
        />
        <Button
          variant="ghost"
          size="sm"
          icon={ExternalLink}
          onClick={() => navigate({ to: '/profile/$userId', params: { userId: user.id } })}
        >
          {t('settings.viewProfile', '查看主页')}
        </Button>
      </div>

      {/* Edit Form */}
      <SettingsCard>
        <div className="space-y-6">
          <FormField label={t('settings.displayNameLabel')}>
            <Input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={user.username}
            />
          </FormField>

          <FormField label={t('settings.avatarLabel')}>
            <div className="p-4 rounded-2xl bg-bg-tertiary/30 border-2 border-dashed border-border-subtle">
              <AvatarEditor
                value={selectedAvatar ?? user.avatarUrl ?? undefined}
                onChange={setSelectedAvatar}
              />
            </div>
          </FormField>

          <FormField label={t('settings.languageLabel')}>
            <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-bg-modifier-hover transition-all">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 shadow-inner">
                <Globe size={20} strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <LanguageSwitcher />
              </div>
            </div>
          </FormField>
        </div>
      </SettingsCard>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() => updateProfileMutation.mutate()}
          loading={updateProfileMutation.isPending}
          icon={Save}
          className="px-10"
        >
          {t('common.saveChanges')}
        </Button>
      </div>
    </SettingsPanel>
  )
}
