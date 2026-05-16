import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'

export interface CommunityAssetDefinition {
  id: string
  assetType: string
  name: string
  description?: string | null
  imageUrl?: string | null
  giftable: boolean
  consumable: boolean
  status: string
}

export interface CommunityAssetGrant {
  id: string
  definitionId: string
  ownerUserId: string
  quantity: number
  remainingQuantity: number
  status: string
  expiresAt?: string | null
}

export interface CommunityAsset {
  grant: CommunityAssetGrant
  definition: CommunityAssetDefinition
}

export interface SettlementLine {
  id: string
  sellerUserId: string
  sourceType: string
  sourceId: string
  grossAmount: number
  platformFee: number
  netAmount: number
  status: string
  availableAt?: string | null
  settledAt?: string | null
}

export function useCommunityAssets(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['community-assets'],
    queryFn: () => fetchApi<{ assets: CommunityAsset[] }>('/api/economy/assets'),
    enabled: options?.enabled ?? true,
  })
}

export function useConsumeCommunityAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { grantId: string; idempotencyKey: string }) =>
      fetchApi<{ grant: CommunityAssetGrant }>(`/api/economy/assets/${input.grantId}/consume`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: input.idempotencyKey }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-assets'] })
    },
  })
}

export function useLockCommunityAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { grantId: string; idempotencyKey: string }) =>
      fetchApi<{ grant: CommunityAssetGrant }>(`/api/economy/assets/${input.grantId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: input.idempotencyKey }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-assets'] })
    },
  })
}

export function useUnlockCommunityAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { grantId: string; idempotencyKey: string }) =>
      fetchApi<{ grant: CommunityAssetGrant }>(`/api/economy/assets/${input.grantId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: input.idempotencyKey }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-assets'] })
    },
  })
}

export function useRevokeCommunityAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { grantId: string; idempotencyKey: string; reason?: string }) =>
      fetchApi<{ grant: CommunityAssetGrant }>(`/api/economy/assets/${input.grantId}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: input.idempotencyKey, reason: input.reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-assets'] })
    },
  })
}

export function useSendTip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      recipientUserId: string
      amount: number
      message?: string
      context?: { kind: string; id: string }
      idempotencyKey: string
    }) =>
      fetchApi('/api/economy/tips', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] })
    },
  })
}

export function useSendGift() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      recipientUserId: string
      assets?: Array<{ assetGrantId: string; quantity?: number }>
      currencies?: Array<{ currencyCode: 'shrimp_coin'; amount: number }>
      message?: string
      idempotencyKey: string
    }) =>
      fetchApi('/api/economy/gifts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-assets'] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] })
    },
  })
}

export function useSettlementLines(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['community-settlements', params?.limit ?? 50, params?.offset ?? 0],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (params?.limit != null) qs.set('limit', String(params.limit))
      if (params?.offset != null) qs.set('offset', String(params.offset))
      const suffix = qs.toString() ? `?${qs}` : ''
      return fetchApi<{ settlements: SettlementLine[] }>(`/api/economy/settlements${suffix}`)
    },
  })
}

export function useSettleAvailableLines() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      fetchApi<{ settlements: SettlementLine[] }>('/api/economy/settlements/settle', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-settlements'] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] })
    },
  })
}
