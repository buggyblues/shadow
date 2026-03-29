import type { ChannelPostingRule, ChannelPostingRuleType } from '@shadowob/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'

interface PostingRuleInput {
  ruleType: ChannelPostingRuleType
  config?: { allowedUserIds?: string[] }
}

/**
 * Hook to fetch and manage channel posting rules
 */
export function useChannelPostingRule(channelId: string | null) {
  const queryClient = useQueryClient()
  const queryKey = ['channel-posting-rule', channelId]

  const {
    data: rule,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<ChannelPostingRule> => {
      if (!channelId) throw new Error('Channel ID required')
      const response = await fetchApi<ChannelPostingRule>(`/api/channels/${channelId}/posting-rule`)
      return response
    },
    enabled: !!channelId,
  })

  const setRuleMutation = useMutation({
    mutationFn: async (input: PostingRuleInput): Promise<ChannelPostingRule> => {
      if (!channelId) throw new Error('Channel ID required')
      const response = await fetchApi<ChannelPostingRule>(
        `/api/channels/${channelId}/posting-rule`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      )
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const removeRuleMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!channelId) throw new Error('Channel ID required')
      await fetchApi(`/api/channels/${channelId}/posting-rule`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  return {
    rule,
    isLoading,
    error,
    setRule: setRuleMutation.mutateAsync,
    removeRule: removeRuleMutation.mutateAsync,
    isSettingRule: setRuleMutation.isPending,
    isRemovingRule: removeRuleMutation.isPending,
  }
}

/**
 * Get display label for rule type
 */
export function getRuleTypeLabel(ruleType: ChannelPostingRuleType): string {
  const labels: Record<ChannelPostingRuleType, string> = {
    everyone: 'Everyone',
    humans_only: 'Humans Only',
    buddies_only: 'Buddies Only',
    specific_users: 'Specific Users',
    read_only: 'Read Only',
  }
  return labels[ruleType] ?? ruleType
}

/**
 * Get description for rule type
 */
export function getRuleTypeDescription(ruleType: ChannelPostingRuleType): string {
  const descriptions: Record<ChannelPostingRuleType, string> = {
    everyone: 'All server members can post messages',
    humans_only: 'Only human users can post (bots excluded)',
    buddies_only: 'Only buddy agents can post',
    specific_users: 'Only designated users can post',
    read_only: 'No one can post (announcements only)',
  }
  return descriptions[ruleType] ?? ''
}
