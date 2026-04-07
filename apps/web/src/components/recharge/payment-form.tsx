import { Button } from '@shadowob/ui'
import {
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useRechargeStore } from '../../stores/recharge.store'

export function PaymentForm() {
  const { t } = useTranslation()
  const stripe = useStripe()
  const elements = useElements()
  const queryClient = useQueryClient()
  const { setStep, setLoading, loading, shrimpCoins, paymentIntentId } = useRechargeStore()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  /** Invalidate wallet-related queries after successful payment */
  const refreshWalletData = () => {
    queryClient.invalidateQueries({ queryKey: ['wallet'] })
    queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] })
    queryClient.invalidateQueries({ queryKey: ['wallet-transactions-count'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  /**
   * After Stripe confirms payment client-side, call the server to verify
   * the PaymentIntent status and credit the wallet. This ensures the wallet
   * is updated even when Stripe webhooks can't reach the server (e.g. local dev).
   */
  const confirmPaymentOnServer = async () => {
    if (!paymentIntentId) return
    try {
      await fetchApi('/api/v1/recharge/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId }),
      })
    } catch (err) {
      // Non-fatal: webhook may still handle it; log for debugging
      console.warn('[Recharge] Server-side confirm failed, webhook will retry:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements || loading) return

    setLoading(true)
    setErrorMessage(null)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin,
      },
      redirect: 'if_required',
    })

    if (error) {
      setErrorMessage(error.message ?? t('recharge.failedDesc'))
      setLoading(false)
    } else {
      // Payment succeeded client-side — confirm on server to credit wallet
      await confirmPaymentOnServer()
      setLoading(false)
      setStep('success')
      refreshWalletData()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Express Checkout (Apple Pay / Google Pay) — pinned to top */}
      <div className="min-h-[44px]">
        <ExpressCheckoutElement
          onConfirm={async () => {
            if (!stripe || !elements) return
            const { error } = await stripe.confirmPayment({
              elements,
              confirmParams: { return_url: window.location.origin },
              redirect: 'if_required',
            })
            if (error) {
              setErrorMessage(error.message ?? t('recharge.failedDesc'))
            } else {
              await confirmPaymentOnServer()
              setStep('success')
              refreshWalletData()
            }
          }}
          onClick={({ resolve }) => resolve()}
        />
      </div>

      <div className="relative flex items-center gap-2 text-xs text-text-muted">
        <div className="flex-1 h-px bg-border-subtle" />
        <span>OR</span>
        <div className="flex-1 h-px bg-border-subtle" />
      </div>

      {/* Card / other payment methods */}
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />

      {errorMessage && (
        <div className="text-sm text-danger bg-danger/10 rounded-2xl p-3 font-bold backdrop-blur-sm border border-danger/20">
          {errorMessage}
        </div>
      )}

      {/* Legal disclaimer */}
      <div className="text-xs text-text-muted text-center space-y-1">
        <p>
          {t('recharge.legal')}{' '}
          <a
            href="https://shadowob.com/zh/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {t('recharge.tos')}
          </a>{' '}
          &amp;{' '}
          <a
            href="https://shadowob.com/zh/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {t('recharge.privacy')}
          </a>
        </p>
        <p>{t('recharge.noRefund')}</p>
      </div>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        type="submit"
        disabled={!stripe || !elements || loading}
        loading={loading}
      >
        {loading
          ? t('recharge.processing')
          : `${t('recharge.payNow')} — ${shrimpCoins.toLocaleString()} 🦐`}
      </Button>
    </form>
  )
}
