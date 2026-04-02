import { create } from 'zustand'

export type RechargeStep = 'select' | 'pay' | 'success'
export type RechargeTier = '1000' | '3000' | '5000' | 'custom'

interface RechargeState {
  isOpen: boolean
  step: RechargeStep
  selectedTier: RechargeTier
  customAmount: number
  clientSecret: string | null
  paymentIntentId: string | null
  orderNo: string | null
  shrimpCoins: number
  usdCents: number
  loading: boolean

  openModal: () => void
  closeModal: () => void
  setStep: (step: RechargeStep) => void
  setTier: (tier: RechargeTier) => void
  setCustomAmount: (amount: number) => void
  setPaymentInfo: (info: {
    clientSecret: string
    paymentIntentId: string
    orderNo: string
    shrimpCoins: number
    usdCents: number
  }) => void
  setLoading: (v: boolean) => void
  reset: () => void
}

const initialState = {
  isOpen: false,
  step: 'select' as RechargeStep,
  selectedTier: '3000' as RechargeTier,
  customAmount: 0,
  clientSecret: null,
  paymentIntentId: null,
  orderNo: null,
  shrimpCoins: 0,
  usdCents: 0,
  loading: false,
}

export const useRechargeStore = create<RechargeState>((set) => ({
  ...initialState,

  openModal: () => set({ isOpen: true, step: 'select', selectedTier: '3000' }),
  closeModal: () => set(initialState),
  setStep: (step) => set({ step }),
  setTier: (tier) => set({ selectedTier: tier }),
  setCustomAmount: (amount) => set({ customAmount: amount }),
  setPaymentInfo: (info) =>
    set({
      clientSecret: info.clientSecret,
      paymentIntentId: info.paymentIntentId,
      orderNo: info.orderNo,
      shrimpCoins: info.shrimpCoins,
      usdCents: info.usdCents,
    }),
  setLoading: (loading) => set({ loading }),
  reset: () => set(initialState),
}))
