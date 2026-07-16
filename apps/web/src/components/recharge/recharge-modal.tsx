import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@shadowob/ui'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js/pure'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { type RechargeContext, useRechargeStore } from '../../stores/recharge.store'
import { PaymentForm } from './payment-form'
import { SuccessAnimation } from './success-animation'
import { TierSelector } from './tier-selector'

/** Global recharge modal — mount once in app layout. */
export function RechargeModal() {
  const { t } = useTranslation()
  const {
    isOpen,
    step,
    selectedTier,
    customAmount,
    clientSecret,
    loading,
    context,
    setStep,
    setTier,
    setPaymentInfo,
    setLoading,
    closeModal,
  } = useRechargeStore()

  // Cross-bundle entry point: cloud-ui (mounted under /cloud) and any other
  // sub-app can dispatch `shadow:open-recharge` to surface the global Stripe
  // recharge modal. Reply with `shadow:open-recharge:ack` so callers can
  // detect the host listener and skip a fallback redirect.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ context?: RechargeContext }>).detail
      if (detail?.context) useRechargeStore.getState().openModalWithContext(detail.context)
      else useRechargeStore.getState().openModal()
      window.dispatchEvent(new CustomEvent('shadow:open-recharge:ack'))
    }
    window.addEventListener('shadow:open-recharge', handler)
    return () => window.removeEventListener('shadow:open-recharge', handler)
  }, [])

  // Fetch recharge config (tiers, Stripe publishable key)
  const configQuery = useQuery({
    queryKey: ['recharge-config'],
    queryFn: () =>
      fetchApi<{
        tiers: { key: string; shrimpCoins: number; usdCents: number; label: string }[]
        customAmountMin: number
        customAmountMax: number
        exchangeRate: number
        stripePublishableKey: string
      }>('/api/v1/recharge/config'),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000, // 5 min
  })
  const config = configQuery.data

  useEffect(() => {
    const defaultTier = config?.tiers[0]
    if (!defaultTier || selectedTier === 'custom') return
    if (!config.tiers.some((tier) => tier.key === selectedTier)) {
      setTier(defaultTier.key)
    }
  }, [config, selectedTier, setTier])

  // Fetch wallet balance
  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ balance: number }>('/api/wallet'),
    enabled: isOpen,
  })

  const stripePromise = useMemo(() => {
    if (!config?.stripePublishableKey) return null
    return loadStripe(config.stripePublishableKey)
  }, [config?.stripePublishableKey])

  // Create PaymentIntent and move to payment step
  const handleContinueToPayment = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const idempotencyKey =
        globalThis.crypto?.randomUUID?.() ??
        `recharge-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const params: { tier: string; customAmount?: number; idempotencyKey: string } = {
        tier: selectedTier,
        idempotencyKey,
      }
      if (selectedTier === 'custom') {
        params.customAmount = customAmount
      }
      const result = await fetchApi<{
        clientSecret: string
        paymentIntentId: string
        orderNo: string
        amount: { shrimpCoins: number; usdCents: number }
      }>('/api/v1/recharge/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      setPaymentInfo({
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        orderNo: result.orderNo,
        shrimpCoins: result.amount.shrimpCoins,
        usdCents: result.amount.usdCents,
      })
      setStep('pay')
    } catch (err) {
      console.error('Failed to create payment intent:', err)
      const msg = err instanceof Error ? err.message : String(err)
      showToast(msg || t('recharge.failed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [loading, selectedTier, customAmount, setLoading, setPaymentInfo, setStep, t])

  const isCustomValid =
    selectedTier !== 'custom' ||
    (Boolean(config) &&
      customAmount >= (config?.customAmountMin ?? 0) &&
      customAmount <= (config?.customAmountMax ?? Number.POSITIVE_INFINITY))

  if (!isOpen) return null

  const title =
    context?.source === 'cloud-computer' && context.cloudComputerName
      ? t('recharge.restoreCloudComputerTitle', { name: context.cloudComputerName })
      : t('recharge.title')
  const subtitle =
    step === 'pay'
      ? t('recharge.paymentStepDesc')
      : step === 'success'
        ? t('recharge.successStepDesc')
        : context?.source === 'cloud-computer'
          ? t('recharge.restoreCloudComputerDesc')
          : t('recharge.selectAmountDesc')

  return (
    <Modal open={isOpen} onClose={closeModal}>
      <ModalContent maxWidth="max-w-lg">
        <ModalHeader
          overline={t('recharge.walletLabel')}
          title={title}
          subtitle={subtitle}
          action={
            step === 'pay' ? (
              <Button
                variant="ghost"
                size="icon"
                icon={ArrowLeft}
                onClick={() => setStep('select')}
                className="!h-10 !w-10"
              />
            ) : null
          }
          closeLabel={t('common.close')}
        />

        <ModalBody className="space-y-4 py-5">
          {step === 'select' ? (
            <>
              <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-bg-secondary px-4 py-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Wallet size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-text-muted">{t('recharge.balance')}</p>
                  <p className="mt-0.5 text-lg font-black text-text-primary">
                    {(wallet?.balance ?? 0).toLocaleString()} {t('recharge.coins')}
                  </p>
                </div>
                {context?.source === 'cloud-computer' && context.hourlyCost ? (
                  <p className="max-w-40 text-right text-xs leading-5 text-text-muted">
                    {t('recharge.cloudComputerRate', { count: context.hourlyCost })}
                  </p>
                ) : null}
              </div>

              {configQuery.isError ? (
                <div className="rounded-2xl border border-danger/20 bg-danger/7 p-4">
                  <p className="text-sm font-bold text-danger">{t('recharge.configUnavailable')}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {(configQuery.error as Error).message}
                  </p>
                  <Button
                    className="mt-3"
                    variant="secondary"
                    size="sm"
                    onClick={() => configQuery.refetch()}
                  >
                    <RefreshCw size={14} />
                    {t('common.retry')}
                  </Button>
                </div>
              ) : config ? (
                <TierSelector
                  tiers={config.tiers}
                  customAmountMin={config.customAmountMin}
                  customAmountMax={config.customAmountMax}
                  exchangeRate={config.exchangeRate}
                  hourlyCost={context?.hourlyCost}
                />
              ) : (
                <div className="h-48 animate-pulse rounded-2xl bg-bg-secondary" />
              )}
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!config || !isCustomValid || loading}
                loading={loading}
                onClick={handleContinueToPayment}
              >
                {loading ? t('recharge.processing') : t('recharge.continueToPayment')}
              </Button>
            </>
          ) : null}

          {step === 'pay' && clientSecret && stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#7c3aed',
                    borderRadius: '12px',
                  },
                },
              }}
            >
              <PaymentForm />
            </Elements>
          )}

          {step === 'success' && <SuccessAnimation />}
        </ModalBody>

        {/* Footer: legal + contact */}
        {step !== 'success' && (
          <ModalFooter className="justify-center text-center">
            <p>
              {t('recharge.contact')}{' '}
              <a href="mailto:yeejonexyq@gmail.com" className="text-primary hover:underline">
                yeejonexyq@gmail.com
              </a>
            </p>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  )
}
