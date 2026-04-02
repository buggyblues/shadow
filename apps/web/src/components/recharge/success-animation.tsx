import { useQueryClient } from '@tanstack/react-query'
import { animate, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { useRechargeStore } from '../../stores/recharge.store'

export function SuccessAnimation() {
  const { t } = useTranslation()
  const { shrimpCoins, closeModal } = useRechargeStore()
  const counterRef = useRef<HTMLSpanElement>(null)
  const queryClient = useQueryClient()

  // Listen for webhook-confirmed recharge notification to refresh wallet data
  useSocketEvent('notification:new', (data: { type?: string }) => {
    if (data?.type === 'recharge_success') {
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] })
    }
  })

  // Animate the coin counter rolling up
  useEffect(() => {
    const node = counterRef.current
    if (!node) return

    const controls = animate(0, shrimpCoins, {
      duration: 1.5,
      ease: 'easeOut',
      onUpdate: (value) => {
        node.textContent = `+${Math.round(value).toLocaleString()}`
      },
    })

    return () => controls.stop()
  }, [shrimpCoins])

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Confetti / coin burst animation */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg"
      >
        <span className="text-4xl">🦐</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <h3 className="text-2xl font-bold text-text-primary">{t('recharge.success')}</h3>
        <p className="text-text-muted mt-1">
          {t('recharge.successDesc', { amount: shrimpCoins.toLocaleString() })}
        </p>
      </motion.div>

      {/* Rolling counter */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring' }}
        className="bg-primary/10 rounded-2xl px-8 py-4"
      >
        <span ref={counterRef} className="text-4xl font-bold text-primary tabular-nums">
          +0
        </span>
        <span className="text-lg text-primary ml-2">🦐</span>
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        type="button"
        onClick={closeModal}
        className="mt-4 px-8 py-3 rounded-xl font-bold text-white bg-primary hover:bg-primary-hover transition-all"
      >
        {t('recharge.done')}
      </motion.button>
    </div>
  )
}
