import {
  Button,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePresenceCacheSync } from '../../hooks/use-presence-cache-sync'
import { fetchApi } from '../../lib/api'
import {
  AUTH_ME_QUERY_KEY,
  type AuthenticatedUser,
  clearAuthenticatedSession,
  ensureAuthenticatedSession,
} from '../../lib/auth-session'
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  SOCKET_AUTH_FAILED_EVENT,
} from '../../lib/socket'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'

interface SpaceAppApprovalRequest {
  serverId: string
  appKey: string
  appName: string
  commandName: string
  commandTitle: string
  commandDescription?: string | null
  permission: string
  action: string
  dataClass: string
  subjectKind: 'user' | 'buddy'
  buddyAgentId?: string | null
  approvalMode: string
  reason: string
  channelId?: string | null
  requestedAt?: string
}

export interface AuthenticatedRuntimeState {
  me: AuthenticatedUser | undefined
  user: AuthenticatedUser | null | undefined
  isLoadingMe: boolean
  pendingSpaceAppApproval: SpaceAppApprovalRequest | null
  spaceAppApprovalSubmitting: boolean
  closeSpaceAppApproval: () => void
  approveSpaceAppCommand: () => Promise<void>
}

function isSpaceAppApprovalRequest(value: unknown): value is SpaceAppApprovalRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.serverId === 'string' &&
    typeof item.appKey === 'string' &&
    typeof item.appName === 'string' &&
    typeof item.commandName === 'string' &&
    typeof item.commandTitle === 'string' &&
    typeof item.permission === 'string' &&
    typeof item.action === 'string' &&
    typeof item.dataClass === 'string' &&
    (item.subjectKind === 'user' || item.subjectKind === 'buddy') &&
    typeof item.approvalMode === 'string' &&
    typeof item.reason === 'string'
  )
}

export function useAuthenticatedRuntime(): AuthenticatedRuntimeState {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user, setUser } = useAuthStore()
  const [pendingSpaceAppApproval, setPendingSpaceAppApproval] =
    useState<SpaceAppApprovalRequest | null>(null)
  const [spaceAppApprovalSubmitting, setSpaceAppApprovalSubmitting] = useState(false)

  usePresenceCacheSync()

  const {
    data: me,
    error: meError,
    isLoading: isLoadingMe,
  } = useQuery<AuthenticatedUser>({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: async () => {
      const authenticatedUser = await ensureAuthenticatedSession()
      if (authenticatedUser) return authenticatedUser
      const error = new Error('Unauthenticated') as Error & { status?: number }
      error.status = 401
      throw error
    },
    enabled: !user,
    initialData: () =>
      user ?? queryClient.getQueryData<AuthenticatedUser>(AUTH_ME_QUERY_KEY) ?? undefined,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (me) setUser(me)
  }, [me, setUser])

  useEffect(() => {
    if (meError && (meError as Error & { status?: number }).status === 401) {
      clearAuthenticatedSession({
        redirectToLogin: true,
        syncDesktop: true,
        desktopReason: 'revoked',
      })
    }
  }, [meError])

  useEffect(() => {
    connectSocket()
    const socket = getSocket()
    const handleSessionRevoked = () => {
      showToast(t('settings.sessionRevokedNotice'), 'error')
      clearAuthenticatedSession({
        redirectToLogin: true,
        syncDesktop: true,
        desktopReason: 'revoked',
      })
    }
    const handleSpaceAppApprovalRequired = (payload: unknown) => {
      if (!isSpaceAppApprovalRequest(payload)) return
      setPendingSpaceAppApproval(payload)
    }
    const handleSpaceAppListChanged = (payload: unknown) => {
      const item =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as { serverId?: unknown; serverSlug?: unknown })
          : null
      const keys = [item?.serverSlug, item?.serverId].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
      queryClient.invalidateQueries({ queryKey: ['space-apps'] })
      queryClient.invalidateQueries({ queryKey: ['os-space-apps'] })
      queryClient.invalidateQueries({ queryKey: ['space-app-summaries'] })
      queryClient.invalidateQueries({ queryKey: ['space-app-catalog'] })
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: ['space-apps', key] })
        queryClient.invalidateQueries({ queryKey: ['os-space-apps', key] })
        queryClient.invalidateQueries({ queryKey: ['space-app-summaries', key] })
        queryClient.invalidateQueries({ queryKey: ['space-app-catalog', key] })
      }
    }
    socket.on('auth:session-revoked', handleSessionRevoked)
    socket.on('space-app:approval-required', handleSpaceAppApprovalRequired)
    socket.on('space-app:list-changed', handleSpaceAppListChanged)
    window.addEventListener(SOCKET_AUTH_FAILED_EVENT, handleSessionRevoked)
    return () => {
      socket.off('auth:session-revoked', handleSessionRevoked)
      socket.off('space-app:approval-required', handleSpaceAppApprovalRequired)
      socket.off('space-app:list-changed', handleSpaceAppListChanged)
      window.removeEventListener(SOCKET_AUTH_FAILED_EVENT, handleSessionRevoked)
      disconnectSocket()
    }
  }, [queryClient, t])

  const closeSpaceAppApproval = () => {
    setPendingSpaceAppApproval(null)
  }

  const approveSpaceAppCommand = async () => {
    if (!pendingSpaceAppApproval) return
    setSpaceAppApprovalSubmitting(true)
    try {
      await fetchApi(
        `/api/servers/${pendingSpaceAppApproval.serverId}/space-apps/${pendingSpaceAppApproval.appKey}/approvals`,
        {
          method: 'POST',
          body: JSON.stringify({
            commandName: pendingSpaceAppApproval.commandName,
            buddyAgentId: pendingSpaceAppApproval.buddyAgentId ?? undefined,
            remember: pendingSpaceAppApproval.approvalMode !== 'every_time',
          }),
        },
      )
      showToast(t('spaceApps.commandApprovalSuccess'), 'success')
      setPendingSpaceAppApproval(null)
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t('spaceApps.commandApprovalFailed'),
        'error',
      )
    } finally {
      setSpaceAppApprovalSubmitting(false)
    }
  }

  return {
    me,
    user,
    isLoadingMe,
    pendingSpaceAppApproval,
    spaceAppApprovalSubmitting,
    closeSpaceAppApproval,
    approveSpaceAppCommand,
  }
}

export function SpaceAppApprovalModal({ runtime }: { runtime: AuthenticatedRuntimeState }) {
  const { t } = useTranslation()
  const {
    approveSpaceAppCommand,
    closeSpaceAppApproval,
    pendingSpaceAppApproval,
    spaceAppApprovalSubmitting,
  } = runtime

  return (
    <Modal open={!!pendingSpaceAppApproval} onClose={closeSpaceAppApproval}>
      <ModalContent maxWidth="max-w-[460px]">
        <ModalHeader title={t('spaceApps.commandApprovalTitle')} closeLabel={t('common.close')} />
        <ModalBody className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-bg-tertiary/40 p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-text-primary">
                {pendingSpaceAppApproval?.appName}
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {pendingSpaceAppApproval?.commandTitle}
              </p>
              {pendingSpaceAppApproval?.commandDescription ? (
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {pendingSpaceAppApproval.commandDescription}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2 text-xs text-text-muted">
            <div className="rounded-lg bg-bg-tertiary/30 px-3 py-2">
              {t('spaceApps.commandApprovalSubject')}:{' '}
              <span className="text-text-primary">
                {pendingSpaceAppApproval?.subjectKind === 'buddy'
                  ? t('spaceApps.commandApprovalBuddy')
                  : t('spaceApps.commandApprovalPerson')}
              </span>
            </div>
            <div className="rounded-lg bg-bg-tertiary/30 px-3 py-2">
              {t('spaceApps.commandApprovalPermission')}:{' '}
              <span className="font-mono text-text-primary">
                {pendingSpaceAppApproval?.permission}
              </span>
            </div>
            <div className="rounded-lg bg-bg-tertiary/30 px-3 py-2">
              {t('spaceApps.commandApprovalScope')}:{' '}
              <span className="text-text-primary">
                {pendingSpaceAppApproval?.action} / {pendingSpaceAppApproval?.dataClass}
              </span>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button variant="ghost" size="sm" onClick={closeSpaceAppApproval}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={approveSpaceAppCommand}
              loading={spaceAppApprovalSubmitting}
              disabled={spaceAppApprovalSubmitting}
            >
              <ShieldCheck size={14} />
              {t('spaceApps.commandApprovalConfirm')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
