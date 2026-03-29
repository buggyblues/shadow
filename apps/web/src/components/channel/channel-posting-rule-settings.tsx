import type { ChannelPostingRuleType } from '@shadowob/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, Lock, User, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChannelPostingRule } from '../../hooks/use-channel-posting-rule'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { UserPicker } from '../common/user-picker'

const RULE_TYPE_ICONS: Record<ChannelPostingRuleType, React.ReactNode> = {
  everyone: <Users size={16} />,
  humans_only: <User size={16} />,
  buddies_only: <Bot size={16} />,
  specific_users: <Users size={16} />,
  read_only: <Lock size={16} />,
}

interface MemberUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
}

interface Member {
  userId: string
  user?: MemberUser
}

interface ChannelPostingRuleSettingsProps {
  channelId: string
  serverId: string
  isAdmin: boolean
}

const RULE_TYPES: ChannelPostingRuleType[] = [
  'everyone',
  'humans_only',
  'buddies_only',
  'specific_users',
  'read_only',
]

export function ChannelPostingRuleSettings({
  channelId,
  serverId,
  isAdmin,
}: ChannelPostingRuleSettingsProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { rule, isLoading, setRule, removeRule, isSettingRule } = useChannelPostingRule(channelId)

  const [selectedRuleType, setSelectedRuleType] = useState<ChannelPostingRuleType>(
    rule?.ruleType ?? 'everyone',
  )
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>(rule?.config?.allowedUserIds ?? [])
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Listen for posting rule changes from other clients
  useSocketEvent(
    'channel:posting-rule-changed',
    (data: {
      channelId: string
      ruleType: ChannelPostingRuleType
      config?: { allowedUserIds?: string[] }
    }) => {
      if (data.channelId === channelId) {
        // Refresh the rule data
        queryClient.invalidateQueries({ queryKey: ['channel-posting-rule', channelId] })
        // Also refresh channels list to update sidebar icons
        queryClient.invalidateQueries({ queryKey: ['channels'] })
      }
    },
  )

  // Fetch server members for user picker
  const { data: members = [] } = useQuery({
    queryKey: ['members', serverId],
    queryFn: () => fetchApi<Member[]>(`/api/servers/${serverId}/members`),
    enabled: !!serverId,
  })

  // Update form when rule changes
  useEffect(() => {
    if (rule) {
      setSelectedRuleType(rule.ruleType)
      setAllowedUserIds(rule.config?.allowedUserIds ?? [])
    }
  }, [rule])

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Get labels and descriptions
  const ruleTypeLabels: Record<ChannelPostingRuleType, string> = {
    everyone: t('channel.ruleTypeEveryone'),
    humans_only: t('channel.ruleTypeHumansOnly'),
    buddies_only: t('channel.ruleTypeBuddiesOnly'),
    specific_users: t('channel.ruleTypeSpecificUsers'),
    read_only: t('channel.ruleTypeReadOnly'),
  }

  const ruleTypeDescriptions: Record<ChannelPostingRuleType, string> = {
    everyone: t('channel.ruleTypeEveryoneDesc'),
    humans_only: t('channel.ruleTypeHumansOnlyDesc'),
    buddies_only: t('channel.ruleTypeBuddiesOnlyDesc'),
    specific_users: t('channel.ruleTypeSpecificUsersDesc'),
    read_only: t('channel.ruleTypeReadOnlyDesc'),
  }

  const currentRuleType = rule?.ruleType ?? 'everyone'
  const currentAllowedUserIds = rule?.config?.allowedUserIds ?? []

  const hasChanges = useMemo(() => {
    if (selectedRuleType !== currentRuleType) return true
    if (selectedRuleType === 'specific_users') {
      if (allowedUserIds.length !== currentAllowedUserIds.length) return true
      return allowedUserIds.some((id, i) => id !== currentAllowedUserIds[i])
    }
    return false
  }, [selectedRuleType, allowedUserIds, currentRuleType, currentAllowedUserIds])

  const handleRuleTypeChange = (newType: ChannelPostingRuleType) => {
    setSelectedRuleType(newType)
    setError(null)
    // Reset allowed users when switching away from specific_users
    if (newType !== 'specific_users') {
      setAllowedUserIds([])
    }
  }

  const handleSave = async () => {
    if (!isAdmin) return

    try {
      setError(null)
      setSuccessMessage(null)

      // Validate specific_users rule
      if (selectedRuleType === 'specific_users' && allowedUserIds.length === 0) {
        setError(t('channel.specificUsersRequired'))
        return
      }

      await setRule({
        ruleType: selectedRuleType,
        config: selectedRuleType === 'specific_users' ? { allowedUserIds } : undefined,
      })

      setSuccessMessage(t('channel.saveSuccess'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failedToSave'))
    }
  }

  const handleRemove = async () => {
    if (!isAdmin) return

    try {
      setError(null)
      setSuccessMessage(null)
      await removeRule()
      setSelectedRuleType('everyone')
      setAllowedUserIds([])
      setSuccessMessage(t('channel.resetSuccess'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failedToRemove'))
    }
  }

  // Map members to users for UserPicker
  const users = useMemo(() => {
    return members
      .filter((m) => m.user && !m.user.isBot)
      .map((m) => ({
        id: m.userId,
        username: m.user!.username,
        displayName: m.user!.displayName,
        avatarUrl: m.user!.avatarUrl,
      }))
  }, [members])

  if (isLoading) {
    return <div className="py-8 text-center text-text-secondary">{t('common.loading')}</div>
  }

  if (!isAdmin) {
    return <div className="py-8 text-center text-text-secondary">{t('channel.adminOnly')}</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium mb-1 text-text-primary">{t('channel.postingRules')}</h3>
        <p className="text-sm text-text-secondary">{t('channel.postingRulesDescription')}</p>
      </div>

      {/* Rule Type Select */}
      <div className="relative">
        <label
          htmlFor="rule-type-select"
          className="block text-xs font-bold uppercase text-text-secondary mb-2"
        >
          {t('channel.ruleType')}
        </label>
        <div className="relative">
          <select
            id="rule-type-select"
            value={selectedRuleType}
            onChange={(e) => handleRuleTypeChange(e.target.value as ChannelPostingRuleType)}
            className="w-full appearance-none bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 pr-10 border border-border focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer"
          >
            {RULE_TYPES.map((type) => (
              <option key={type} value={type}>
                {ruleTypeLabels[type]}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
          />
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm text-text-secondary">
          <span className="text-text-primary">{RULE_TYPE_ICONS[selectedRuleType]}</span>
          <span>{ruleTypeDescriptions[selectedRuleType]}</span>
        </div>
      </div>

      {/* Specific Users Picker */}
      {selectedRuleType === 'specific_users' && (
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase text-text-secondary">
            {t('channel.allowedUsers')}
          </label>
          <UserPicker users={users} selectedUserIds={allowedUserIds} onChange={setAllowedUserIds} />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="text-danger text-sm bg-danger/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="text-success text-sm bg-success/10 rounded-lg px-3 py-2">
          {successMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || isSettingRule}
          className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-hover transition"
        >
          {isSettingRule ? t('common.saving') : t('common.save')}
        </button>

        {currentRuleType !== 'everyone' && (
          <button
            type="button"
            onClick={handleRemove}
            className="px-4 py-2.5 text-danger border border-danger rounded-lg font-medium hover:bg-danger/10 transition"
          >
            {t('channel.reset')}
          </button>
        )}
      </div>

      {/* Current Rule Info */}
      {currentRuleType !== 'everyone' && (
        <div className="flex items-center gap-2 text-sm text-text-secondary pt-2 border-t border-border">
          <span className="font-medium text-text-primary">{t('channel.currentRule')}:</span>
          <span className="flex items-center gap-1.5">
            <span className="text-text-primary">{RULE_TYPE_ICONS[currentRuleType]}</span>
            {ruleTypeLabels[currentRuleType]}
            {currentRuleType === 'specific_users' && currentAllowedUserIds.length > 0 && (
              <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                {currentAllowedUserIds.length}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
