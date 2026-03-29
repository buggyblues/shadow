import type { ChannelPostingRuleType } from '@shadowob/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Bot, Check, ChevronRight, Eye, Lock, User, Users } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  getRuleTypeDescription,
  getRuleTypeLabel,
  useChannelPostingRule,
} from '../../hooks/use-channel-posting-rule'
import { useSocketEvent } from '../../hooks/use-socket'
import { showToast } from '../../lib/toast'
import { fontSize, radius, spacing, useColors } from '../../theme'

interface ChannelPostingRuleSettingsProps {
  channelId: string
  serverId: string
  isAdmin: boolean
}

const RULE_TYPES: { type: ChannelPostingRuleType; icon: typeof Users }[] = [
  { type: 'everyone', icon: Users },
  { type: 'humans_only', icon: User },
  { type: 'buddies_only', icon: Bot },
  { type: 'specific_users', icon: Users },
  { type: 'read_only', icon: Lock },
]

export function ChannelPostingRuleSettings({
  channelId,
  serverId,
  isAdmin,
}: ChannelPostingRuleSettingsProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const queryClient = useQueryClient()
  const { rule, isLoading, setRule, removeRule, isSettingRule } = useChannelPostingRule(channelId)
  const [selectedRuleType, setSelectedRuleType] = useState<ChannelPostingRuleType>(
    rule?.ruleType ?? 'everyone',
  )

  // Listen for posting rule changes from other clients
  useSocketEvent(
    'channel:posting-rule-changed',
    (data: { channelId: string; ruleType: ChannelPostingRuleType }) => {
      if (data.channelId === channelId) {
        // Refresh the rule data
        queryClient.invalidateQueries({ queryKey: ['channel-posting-rule', channelId] })
        // Also refresh channels list
        queryClient.invalidateQueries({ queryKey: ['channels'] })
        // Show toast notification
        showToast(t('channel.ruleChanged'))
      }
    },
  )

  // Update local state when rule changes
  if (rule && rule.ruleType !== selectedRuleType && !isSettingRule) {
    setSelectedRuleType(rule.ruleType)
  }

  const handleSave = async (ruleType: ChannelPostingRuleType) => {
    if (!isAdmin) {
      showToast(t('errors.permissionDenied'))
      return
    }

    try {
      await setRule({ ruleType })
      setSelectedRuleType(ruleType)
      showToast(t('settings.saved'))
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('errors.saveFailed'))
    }
  }

  const handleRemove = async () => {
    if (!isAdmin) return

    try {
      await removeRule()
      setSelectedRuleType('everyone')
      showToast(t('settings.saved'))
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('errors.saveFailed'))
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    )
  }

  const currentRuleType = rule?.ruleType ?? 'everyone'

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('channel.postingRules')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('channel.postingRulesDescription')}
        </Text>
      </View>

      <View style={styles.rulesList}>
        {RULE_TYPES.map(({ type, icon: Icon }) => {
          const isSelected = selectedRuleType === type
          const isCurrent = currentRuleType === type

          return (
            <Pressable
              key={type}
              onPress={() => handleSave(type)}
              disabled={!isAdmin || isSettingRule}
              style={[
                styles.ruleItem,
                {
                  backgroundColor: colors.background,
                  borderColor: isSelected ? colors.primary : colors.border,
                  opacity: isAdmin ? 1 : 0.6,
                },
              ]}
            >
              <View style={styles.ruleContent}>
                <View
                  style={[styles.iconContainer, { backgroundColor: colors.backgroundSecondary }]}
                >
                  <Icon size={20} color={colors.text} />
                </View>
                <View style={styles.ruleText}>
                  <Text style={[styles.ruleLabel, { color: colors.text }]}>
                    {getRuleTypeLabel(type)}
                  </Text>
                  <Text style={[styles.ruleDescription, { color: colors.textSecondary }]}>
                    {getRuleTypeDescription(type)}
                  </Text>
                </View>
              </View>
              <View style={styles.ruleActions}>
                {isCurrent && (
                  <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.badgeText, { color: colors.primary }]}>
                      {t('common.current')}
                    </Text>
                  </View>
                )}
                {isSelected && isCurrent && <Check size={20} color={colors.primary} />}
                {!isCurrent && <ChevronRight size={20} color={colors.textSecondary} />}
              </View>
            </Pressable>
          )
        })}
      </View>

      {currentRuleType !== 'everyone' && isAdmin && (
        <Pressable
          onPress={handleRemove}
          disabled={isSettingRule}
          style={[styles.resetButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.resetButtonText, { color: colors.danger }]}>
            {t('channel.resetToEveryone')}
          </Text>
        </Pressable>
      )}

      {!isAdmin && (
        <Text style={[styles.adminOnlyText, { color: colors.textSecondary }]}>
          {t('channel.adminOnly')}
        </Text>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  header: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  rulesList: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  ruleContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleText: {
    flex: 1,
    gap: spacing.xs,
  },
  ruleLabel: {
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  ruleDescription: {
    fontSize: fontSize.sm,
  },
  ruleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  resetButton: {
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  adminOnlyText: {
    textAlign: 'center',
    padding: spacing.lg,
    fontSize: fontSize.sm,
  },
})
