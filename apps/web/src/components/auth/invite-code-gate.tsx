import { InviteCodeDialog, type InviteCodeDialogText } from '@shadowob/views/invite-code'
import type { TFunction } from 'i18next'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api-errors'
import { type InviteCodeGateRequest, setInviteCodeGateHandler } from '../../lib/invite-code-gate'
import { queryClient } from '../../lib/query-client'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'

type MembershipSnapshot = NonNullable<
  NonNullable<ReturnType<typeof useAuthStore.getState>['user']>['membership']
>

type ActiveInviteRequest = InviteCodeGateRequest & {
  resolve: (membership: MembershipSnapshot) => void
  reject: (error: unknown) => void
}

function inviteDialogText(t: TFunction): InviteCodeDialogText {
  return {
    title: t('inviteCodeGate.title'),
    description: t('inviteCodeGate.description'),
    codeLabel: t('inviteCodeGate.codeLabel'),
    codePlaceholder: t('inviteCodeGate.codePlaceholder'),
    submit: t('inviteCodeGate.submit'),
    submitting: t('inviteCodeGate.submitting'),
    required: t('inviteCodeGate.required'),
    cancel: t('common.cancel'),
    close: t('common.close'),
    success: t('inviteCodeGate.success'),
    failed: t('inviteCodeGate.failed'),
    capability: (capability: string) =>
      t('inviteCodeGate.capability', {
        capability: t(`settings.membershipCapabilityLabels.${capability.replace(/[:.]/g, '_')}`, {
          defaultValue: capability,
        }),
      }),
  }
}

export function InviteCodeGateProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [activeRequest, setActiveRequest] = useState<ActiveInviteRequest | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const text = useMemo(() => inviteDialogText(t), [t])

  useEffect(() => {
    return setInviteCodeGateHandler(
      (request) =>
        new Promise<MembershipSnapshot>((resolve, reject) => {
          setError('')
          setActiveRequest({ ...request, resolve, reject })
        }),
    )
  }, [])

  const close = () => {
    if (!activeRequest) return
    activeRequest.reject(activeRequest.error)
    setActiveRequest(null)
    setError('')
  }

  const submitInviteCode = async (code: string) => {
    if (!activeRequest || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const membership = await fetchApi<MembershipSnapshot>('/api/membership/redeem-invite', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      const authState = useAuthStore.getState()
      if (authState.user) {
        const nextUser = { ...authState.user, membership }
        authState.setUser(nextUser)
        queryClient.setQueryData(['me'], nextUser)
      }
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      showToast(text.success, 'success')
      activeRequest.resolve(membership)
      setActiveRequest(null)
    } catch (err) {
      setError(getApiErrorMessage(err, t, 'inviteCodeGate.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {children}
      <InviteCodeDialog
        open={Boolean(activeRequest)}
        text={text}
        capability={activeRequest?.error.capability}
        error={error}
        submitting={submitting}
        onSubmit={submitInviteCode}
        onClose={close}
      />
    </>
  )
}
