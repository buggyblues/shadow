import { beforeEach, describe, expect, it } from 'vitest'
import { useRechargeStore } from './recharge.store'

describe('recharge store context', () => {
  beforeEach(() => useRechargeStore.getState().reset())

  it('opens a general wallet recharge without a follow-up action', () => {
    useRechargeStore.getState().openModal()

    expect(useRechargeStore.getState()).toMatchObject({
      isOpen: true,
      step: 'select',
      context: { source: 'wallet' },
      followUpStatus: 'idle',
    })
  })

  it('keeps the cloud computer follow-up through payment steps', () => {
    useRechargeStore.getState().openModalWithContext({
      source: 'cloud-computer',
      cloudComputerId: 'computer-1',
      cloudComputerName: 'Studio Computer',
      hourlyCost: 1,
      resumeAfterPayment: true,
    })
    useRechargeStore.getState().setStep('success')
    useRechargeStore.getState().setFollowUp('running')

    expect(useRechargeStore.getState()).toMatchObject({
      step: 'success',
      context: {
        source: 'cloud-computer',
        cloudComputerId: 'computer-1',
        resumeAfterPayment: true,
      },
      followUpStatus: 'running',
    })
  })

  it('clears the previous target when the modal closes', () => {
    useRechargeStore.getState().openModalWithContext({
      source: 'cloud-computer',
      cloudComputerId: 'computer-1',
      resumeAfterPayment: true,
    })

    useRechargeStore.getState().closeModal()

    expect(useRechargeStore.getState()).toMatchObject({
      isOpen: false,
      context: null,
      followUpStatus: 'idle',
    })
  })
})
