import { Button, Card, Dialog, DialogContent, DialogHeader, DialogTitle } from '@shadowob/ui'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
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
    <Dialog isOpen={isOpen} onClose={closeModal}>
      <DialogContent className="!rounded-[40px] !max-w-md">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between">
          {step === 'pay' && (
            <Button
              variant="ghost"
              size="icon"
              icon={ArrowLeft}
              onClick={() => setStep('select')}
              className="!h-8 !w-8"
            />
          )}
          <DialogTitle className="flex-1 text-center">{t('recharge.title')}</DialogTitle>
          {step === 'success' && <div className="w-8" />}
        </DialogHeader>

        {/* Content */}
        <div className="space-y-4">
          {/* Balance display */}
          {step === 'select' && wallet && (
            <Card variant="glass" className="!rounded-[24px]">
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-text-muted font-bold">{t('recharge.balance')}</span>
                <span className="text-lg font-black text-text-primary">
                  {wallet.balance.toLocaleString()} 🦐
                </span>
              </div>
            </Card>
          )}

          {/* Step: Tier Selection */}
          {step === 'select' && (
            <>
              <TierSelector />
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!isCustomValid || loading}
                loading={loading}
                onClick={handleContinueToPayment}
              >
                {loading ? t('recharge.processing') : t('recharge.payNow')}
              </Button>
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
          <div className="text-xs text-text-muted text-center font-bold italic opacity-60">
            <p>
              {t('recharge.contact')}{' '}
              <a href="mailto:yeejonexyq@gmail.com" className="text-primary hover:underline">
                yeejonexyq@gmail.com
              </a>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
