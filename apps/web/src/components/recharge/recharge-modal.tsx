import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useRechargeStore } from '../../stores/recharge.store'
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
    setStep,
    setPaymentInfo,
    setLoading,
    closeModal,
  } = useRechargeStore()

  // Fetch recharge config (tiers, Stripe publishable key)
  const { data: config } = useQuery({
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
      const params: { tier: string; customAmount?: number } = { tier: selectedTier }
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

  const isCustomValid = selectedTier !== 'custom' || customAmount >= 100

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]"
      role="dialog"
      aria-modal="true"
      onClick={closeModal}
      onKeyDown={(e) => e.key === 'Escape' && closeModal()}
    >
      <div
        className="bg-bg-secondary rounded-2xl w-full max-w-md mx-4 border border-border-subtle animate-scale-in shadow-2xl overflow-hidden"
        role="document"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          {step === 'pay' && (
            <button
              type="button"
              onClick={() => setStep('select')}
              className="text-text-muted hover:text-text-primary transition"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 className="text-lg font-bold text-text-primary flex-1 text-center">
            {t('recharge.title')}
          </h2>
          {step !== 'success' && (
            <button
              type="button"
              onClick={closeModal}
              className="text-text-muted hover:text-text-primary transition"
            >
              <X size={20} />
            </button>
          )}
          {step === 'success' && <div className="w-5" />}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Balance display */}
          {step === 'select' && wallet && (
            <div className="flex items-center justify-between mb-4 p-3 bg-bg-tertiary rounded-xl">
              <span className="text-sm text-text-muted">{t('recharge.balance')}</span>
              <span className="text-lg font-bold text-text-primary">
                {wallet.balance.toLocaleString()} 🦐
              </span>
            </div>
          )}

          {/* Step: Tier Selection */}
          {step === 'select' && (
            <>
              <TierSelector />
              <button
                type="button"
                disabled={!isCustomValid || loading}
                onClick={handleContinueToPayment}
                className="w-full mt-6 py-3 rounded-xl font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? t('recharge.processing') : t('recharge.payNow')}
              </button>
            </>
          )}

          {/* Step: Payment */}
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

          {/* Step: Success */}
          {step === 'success' && <SuccessAnimation />}
        </div>

        {/* Footer: legal + contact */}
        {step !== 'success' && (
          <div className="px-6 pb-4 text-xs text-text-muted text-center">
            <p>
              {t('recharge.contact')}{' '}
              <a href="mailto:yeejonexyq@gmail.com" className="text-primary hover:underline">
                yeejonexyq@gmail.com
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
