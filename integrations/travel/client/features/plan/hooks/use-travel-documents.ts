import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TravelSyncStatus } from '../../../hooks/use-persistent-trip-state.js'
import { apiDelete, apiGet, apiPost } from '../../../services/api-client.js'
import { getClientState } from '../../../services/client-state-api.js'

export type TravelDocumentKind = 'booking' | 'ticket' | 'receipt' | 'invoice' | 'other'
export type TravelDocumentSubject = 'journey' | 'expense'

export interface TravelDocument {
  id: string
  tripId: string
  subjectType: TravelDocumentSubject
  subjectId: string
  kind: TravelDocumentKind
  name: string
  mimeType: string
  size: number
  createdAt: string
  contentUrl?: string
}

interface ServerAttachment {
  id: string
  tripId: string
  subjectType: string
  subjectId?: string
  fileName: string
  mimeType?: string
  sizeBytes?: number
  label?: string
  createdAt: string
}

function readFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(file)
  })
}

function mapAttachment(attachment: ServerAttachment): TravelDocument {
  const kind = attachment.label?.startsWith('kind:')
    ? (attachment.label.slice(5) as TravelDocumentKind)
    : 'other'
  return {
    id: attachment.id,
    tripId: attachment.tripId,
    subjectType: attachment.subjectType === 'expense' ? 'expense' : 'journey',
    subjectId: attachment.subjectId ?? '',
    kind,
    name: attachment.fileName,
    mimeType: attachment.mimeType ?? 'application/octet-stream',
    size: attachment.sizeBytes ?? 0,
    createdAt: attachment.createdAt,
    contentUrl: `/api/trips/${encodeURIComponent(attachment.tripId)}/attachments/${encodeURIComponent(attachment.id)}/content`,
  }
}

export function useTravelDocuments(tripId?: string) {
  const queryClient = useQueryClient()
  const queryKey = ['travel', 'attachments', tripId]
  const query = useQuery({
    enabled: Boolean(tripId),
    queryFn: async () => {
      let items = await apiGet<ServerAttachment[]>(
        `/api/trips/${encodeURIComponent(tripId!)}/attachments`,
      )
      if (!items.length) {
        const legacy = await getClientState<TravelDocument[]>('documents', {
          scope: 'trip',
          tripId,
        }).catch(() => null)
        for (const document of legacy?.value ?? []) {
          await apiPost(`/api/trips/${encodeURIComponent(tripId!)}/attachments`, {
            fileName: document.name,
            label: `kind:${document.kind}`,
            mimeType: document.mimeType,
            sizeBytes: document.size,
            subjectId: document.subjectId,
            subjectType: document.subjectType === 'expense' ? 'expense' : 'reservation',
          })
        }
        if (legacy?.value?.length)
          items = await apiGet<ServerAttachment[]>(
            `/api/trips/${encodeURIComponent(tripId!)}/attachments`,
          )
      }
      return items.map(mapAttachment)
    },
    queryKey,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const addMutation = useMutation({
    mutationFn: async (input: {
      file: File
      kind: TravelDocumentKind
      subjectId: string
      subjectType: TravelDocumentSubject
    }) =>
      apiPost(`/api/trips/${encodeURIComponent(tripId!)}/attachments`, {
        fileBase64: await readFileBase64(input.file),
        fileName: input.file.name,
        label: `kind:${input.kind}`,
        mimeType: input.file.type || 'application/octet-stream',
        sizeBytes: input.file.size,
        subjectId: input.subjectId,
        subjectType: input.subjectType === 'expense' ? 'expense' : 'reservation',
      }),
    onSuccess: refresh,
  })
  const removeMutation = useMutation({
    mutationFn: (documentId: string) =>
      apiDelete(
        `/api/trips/${encodeURIComponent(tripId!)}/attachments/${encodeURIComponent(documentId)}`,
      ),
    onSuccess: refresh,
  })
  const syncStatus: TravelSyncStatus =
    addMutation.isPending || removeMutation.isPending || query.isFetching
      ? 'saving'
      : addMutation.isError || removeMutation.isError || query.isError
        ? 'error'
        : query.data
          ? 'saved'
          : 'idle'
  return {
    documents: query.data ?? [],
    addDocument: (
      subjectType: TravelDocumentSubject,
      subjectId: string,
      kind: TravelDocumentKind,
      file: File,
    ) => {
      if (tripId) void addMutation.mutateAsync({ file, kind, subjectId, subjectType })
    },
    removeDocument: (documentId: string) => {
      if (tripId) void removeMutation.mutateAsync(documentId)
    },
    syncStatus,
  }
}
