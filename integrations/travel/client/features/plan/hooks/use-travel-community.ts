import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { travelShadowSpaceApp } from '../../../services/shadow-host.js'
import {
  bindTripBuddy,
  type CommunityBuddyInbox,
  dispatchBuddyPlan,
  listBuddyPlanDrafts,
  listCommunityBuddyInboxes,
  listCommunityChannels,
  listCommunityShares,
  listTravelAutomationTasks,
  listTripBuddyBindings,
  reviewBuddyPlan,
  revokeTripBuddy,
  shareTripToCommunity,
} from '../api/community.js'

export function useTravelCommunity(tripId: string) {
  const queryClient = useQueryClient()
  const communityEnabled = Boolean(tripId && travelShadowSpaceApp.bridgeAvailable())
  const queryKey = ['travel', 'community', tripId]
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const inboxes = useQuery({
    queryKey: [...queryKey, 'inboxes'],
    queryFn: listCommunityBuddyInboxes,
    enabled: communityEnabled,
    retry: false,
  })
  const bindings = useQuery({
    queryKey: [...queryKey, 'bindings'],
    queryFn: () => listTripBuddyBindings(tripId),
    enabled: communityEnabled,
  })
  const channels = useQuery({
    queryKey: [...queryKey, 'channels'],
    queryFn: listCommunityChannels,
    enabled: communityEnabled,
    retry: false,
  })
  const drafts = useQuery({
    queryKey: [...queryKey, 'drafts'],
    queryFn: () => listBuddyPlanDrafts(tripId),
    enabled: communityEnabled,
  })
  const shares = useQuery({
    queryKey: [...queryKey, 'shares'],
    queryFn: () => listCommunityShares(tripId),
    enabled: communityEnabled,
  })
  const tasks = useQuery({
    queryKey: [...queryKey, 'tasks'],
    queryFn: () => listTravelAutomationTasks(tripId),
    enabled: communityEnabled,
    refetchInterval: (query) =>
      query.state.data?.some((task) => task.status === 'queued' || task.status === 'running')
        ? 3000
        : false,
  })
  const bind = useMutation({
    mutationFn: (buddy: CommunityBuddyInbox) =>
      bindTripBuddy(tripId, {
        agentId: buddy.agentId,
        agentUserId: buddy.agentUserId ?? buddy.userId,
        displayName: buddy.displayName ?? buddy.username,
        capabilities: ['itinerary', 'bookings', 'budget', 'packing'],
      }),
    onSuccess: refresh,
  })
  const revoke = useMutation({
    mutationFn: (bindingId: string) => revokeTripBuddy(tripId, bindingId),
    onSuccess: refresh,
  })
  const dispatch = useMutation({
    mutationFn: (input: { agentId: string; title: string; prompt: string }) =>
      dispatchBuddyPlan(tripId, { ...input, priority: 'normal' }),
    onSuccess: refresh,
  })
  const review = useMutation({
    mutationFn: (input: { draftId: string; status: 'accepted' | 'rejected' }) =>
      reviewBuddyPlan(tripId, input.draftId, input.status),
    onSuccess: async () => {
      await refresh()
      await queryClient.invalidateQueries({ queryKey: ['travel', 'trip-domain', tripId] })
    },
  })
  const share = useMutation({
    mutationFn: (channelId: string) => shareTripToCommunity(tripId, channelId),
    onSuccess: refresh,
  })

  return {
    available: communityEnabled,
    bind,
    bindings: bindings.data ?? [],
    channels: channels.data?.channels ?? [],
    dispatch,
    drafts: drafts.data ?? [],
    error:
      inboxes.error ??
      channels.error ??
      bindings.error ??
      drafts.error ??
      shares.error ??
      tasks.error,
    inboxes: inboxes.data?.inboxes ?? [],
    isLoading:
      inboxes.isLoading ||
      channels.isLoading ||
      bindings.isLoading ||
      drafts.isLoading ||
      shares.isLoading ||
      tasks.isLoading,
    refresh,
    review,
    revoke,
    share,
    shares: shares.data ?? [],
    tasks: tasks.data ?? [],
  }
}
