import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY not set — Stripe payments will be unavailable')
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
  : (null as unknown as Stripe)

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

/**
 * Recharge tier definitions.
 * Exchange rate: 1 USD = 100 shrimp coins.
 */
export const RECHARGE_TIERS = {
  '1000': { shrimpCoins: 1000, usdCents: 1000, label: 'Starter' },
  '3000': { shrimpCoins: 3000, usdCents: 2999, label: 'Best Value' },
  '5000': { shrimpCoins: 5000, usdCents: 4999, label: 'Premium' },
} as const

export type RechargeTierKey = keyof typeof RECHARGE_TIERS

/** Min/max for custom amount (in shrimp coins) */
export const CUSTOM_AMOUNT_MIN = 100 // $1.00
export const CUSTOM_AMOUNT_MAX = 10_000_000 // effectively no upper limit, but sane cap

/**
 * Convert shrimp coins to USD cents for custom amounts.
 * Rate: 100 shrimp coins = $1.00 = 100 cents
 */
export function shrimpCoinsToUsdCents(coins: number): number {
  return coins // 1:1 mapping: 100 coins = 100 cents = $1
}

/**
 * Generate a unique order number.
 * Format: RC-YYYYMMDD-RANDOMHEX
 */
export function generateOrderNo(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `RC-${date}-${rand}`
}
