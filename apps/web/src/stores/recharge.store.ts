import { create } from 'zustand'

export type RechargeStep = 'select' | 'pay' | 'success'
export type RechargeTier = string
export type RechargeContext = {
  source: 'wallet' | 'cloud-computer' | 'chat' | 'shop'
  cloudComputerId?: string
  cloudComputerName?: string
  hourlyCost?: number
  resumeAfterPayment?: boolean
}
export type RechargeFollowUpStatus = 'idle' | 'running' | 'succeeded' | 'failed'

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
  context: RechargeContext | null
  followUpStatus: RechargeFollowUpStatus
  followUpError: string | null

  openModal: () => void
  openModalWithContext: (context: RechargeContext) => void
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
  setFollowUp: (status: RechargeFollowUpStatus, error?: string | null) => void
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
  context: null as RechargeContext | null,
  followUpStatus: 'idle' as RechargeFollowUpStatus,
  followUpError: null as string | null,
}

export const useRechargeStore = create<RechargeState>((set) => ({
  ...initialState,

  openModal: () =>
    set({
      isOpen: true,
      step: 'select',
      selectedTier: '3000',
      context: { source: 'wallet' },
      followUpStatus: 'idle',
      followUpError: null,
    }),
  openModalWithContext: (context) =>
    set({
      isOpen: true,
      step: 'select',
      selectedTier: '3000',
      context,
      followUpStatus: 'idle',
      followUpError: null,
    }),
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
  setFollowUp: (followUpStatus, followUpError = null) => set({ followUpStatus, followUpError }),
  reset: () => set(initialState),
}))
