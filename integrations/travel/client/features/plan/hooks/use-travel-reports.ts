import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { TravelSyncStatus } from '../../../hooks/use-persistent-trip-state.js'
import { apiGet, apiPost } from '../../../services/api-client.js'
import { getClientState } from '../../../services/client-state-api.js'
import type { EventCategory, EventSeverity } from '../types/travel-events.js'

export type TravelReportStatus = 'active' | 'ended' | 'removed'

export interface UserTravelReport {
  id: string
  title: string
  category: EventCategory
  severity: EventSeverity
  latitude: number
  longitude: number
  affectedTripIds: string[]
  journeyItemIds: string[]
  participantIds: string[]
  reporterId: string
  createdAt: string
  expiresAt: string
  status: TravelReportStatus
  removalVotes: string[]
}

interface ServerEmergencyReport {
  id: string
  title: string
  category: EventCategory
  severity: EventSeverity
  latitude: number
  longitude: number
  affectedTripIds: string[]
  journeyItemIds: string[]
  participantMemberIds: string[]
  reporterUserId: string
  createdAt: string
  expiresAt: string
  status: TravelReportStatus
  removalVoteUserIds: string[]
}

export const removalVoteThreshold = 3
const reportsQueryKey = ['travel', 'emergency-reports']

function mapReport(report: ServerEmergencyReport): UserTravelReport {
  return {
    ...report,
    participantIds: report.participantMemberIds,
    removalVotes: report.removalVoteUserIds,
    reporterId: report.reporterUserId,
  }
}

export function effectiveTravelReportStatus(report: UserTravelReport): TravelReportStatus {
  if (report.status !== 'active') return report.status
  return new Date(report.expiresAt).getTime() <= Date.now() ? 'ended' : 'active'
}

export function useTravelReports(tripId?: string, scope: 'all' | 'affected' = 'all') {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryFn: async () => {
      let reports = await apiGet<ServerEmergencyReport[]>('/api/emergency-reports', {
        includeEnded: true,
      })
      if (!reports.length) {
        const legacy = await getClientState<UserTravelReport[]>('shared-reports', {
          scope: 'global',
        }).catch(() => null)
        for (const report of legacy?.value ?? []) {
          await apiPost('/api/emergency-reports', {
            category: report.category,
            expiresAt: report.expiresAt,
            latitude: report.latitude,
            longitude: report.longitude,
            severity: report.severity,
            title: report.title,
          })
        }
        if (legacy?.value?.length)
          reports = await apiGet<ServerEmergencyReport[]>('/api/emergency-reports', {
            includeEnded: true,
          })
      }
      return reports.map(mapReport)
    },
    queryKey: reportsQueryKey,
    refetchInterval: 15_000,
    staleTime: 5_000,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: reportsQueryKey })
  const createMutation = useMutation({
    mutationFn: (
      input: Omit<UserTravelReport, 'createdAt' | 'id' | 'removalVotes' | 'reporterId' | 'status'>,
    ) =>
      apiPost<ServerEmergencyReport>('/api/emergency-reports', {
        category: input.category,
        expiresAt: input.expiresAt,
        latitude: input.latitude,
        longitude: input.longitude,
        severity: input.severity,
        title: input.title,
      }),
    onSuccess: refresh,
  })
  const endMutation = useMutation({
    mutationFn: (id: string) =>
      apiPost<ServerEmergencyReport>(`/api/emergency-reports/${encodeURIComponent(id)}/end`),
    onSuccess: refresh,
  })
  const voteMutation = useMutation({
    mutationFn: (id: string) =>
      apiPost<ServerEmergencyReport>(
        `/api/emergency-reports/${encodeURIComponent(id)}/vote-remove`,
      ),
    onSuccess: refresh,
  })
  const reports = query.data ?? []
  const visibleReports = useMemo(
    () =>
      reports.filter(
        (report) => scope === 'all' || !tripId || report.affectedTripIds.includes(tripId),
      ),
    [reports, scope, tripId],
  )
  const syncStatus: TravelSyncStatus =
    createMutation.isPending || endMutation.isPending || voteMutation.isPending
      ? 'saving'
      : createMutation.isError || endMutation.isError || voteMutation.isError || query.isError
        ? 'error'
        : query.data
          ? 'saved'
          : 'idle'

  return {
    reports: visibleReports,
    addReport: createMutation.mutateAsync,
    endReport: endMutation.mutateAsync,
    voteToRemove: (id: string) => voteMutation.mutateAsync(id),
    syncStatus,
  }
}
