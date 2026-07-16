import { Button } from '@shadowob/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Loader2, MonitorUp } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useRechargeStore } from '../../stores/recharge.store'

export function SuccessAnimation() {
  const { t } = useTranslation()
  const { shrimpCoins, closeModal, context, followUpStatus, followUpError, setFollowUp } =
    useRechargeStore()
  const queryClient = useQueryClient()
  const started = useRef(false)

  const resumeCloudComputer = useMutation({
    mutationFn: async () => {
      if (!context?.cloudComputerId) return
      setFollowUp('running')
      await fetchApi(`/api/cloud-computers/${encodeURIComponent(context.cloudComputerId)}/resume`, {
        method: 'POST',
      })
    },
    onSuccess: () => {
      setFollowUp('succeeded')
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
    onError: (error: Error) => setFollowUp('failed', error.message),
  })

  useEffect(() => {
    if (
      started.current ||
      !context?.resumeAfterPayment ||
      !context.cloudComputerId ||
      followUpStatus !== 'idle'
    ) {
      return
    }
    started.current = true
    resumeCloudComputer.mutate()
  }, [context, followUpStatus, resumeCloudComputer.mutate])

  const isResuming = context?.resumeAfterPayment && followUpStatus === 'running'
  const resumeFailed = context?.resumeAfterPayment && followUpStatus === 'failed'
  const resumeSucceeded = context?.resumeAfterPayment && followUpStatus === 'succeeded'

  return (
    <div className="py-4">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-500">
          <Check size={24} />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-black text-text-primary">{t('recharge.success')}</h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {t('recharge.successDesc', { amount: shrimpCoins.toLocaleString() })}
          </p>
        </div>
      </div>

      {context?.resumeAfterPayment ? (
        <div className="mt-5 rounded-2xl border border-border-subtle bg-bg-secondary p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-primary">
              {isResuming ? (
                <Loader2 size={18} className="animate-spin" />
              ) : resumeFailed ? (
                <AlertCircle size={18} className="text-warning" />
              ) : (
                <MonitorUp size={18} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text-primary">
                {isResuming
                  ? t('recharge.resumingCloudComputer')
                  : resumeFailed
                    ? t('recharge.resumeNeedsAction')
                    : resumeSucceeded
                      ? t('recharge.cloudComputerReady')
                      : t('recharge.resumingCloudComputer')}
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {resumeFailed
                  ? followUpError || t('recharge.resumeNeedsActionDesc')
                  : isResuming
                    ? t('recharge.resumingCloudComputerDesc')
                    : t('recharge.cloudComputerReadyDesc')}
              </p>
            </div>
          </div>
          {resumeFailed ? (
            <Button
              className="mt-3"
              variant="secondary"
              size="sm"
              disabled={resumeCloudComputer.isPending}
              onClick={() => resumeCloudComputer.mutate()}
            >
              {t('common.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        className="mt-5 w-full"
        disabled={isResuming}
        onClick={closeModal}
      >
        {isResuming ? t('recharge.resuming') : t('recharge.done')}
      </Button>
    </div>
  )
}
