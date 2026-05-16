/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletSettings } from '../src/pages/settings/wallet'

const fetchApiMock = vi.fn()

vi.mock('../src/lib/api', () => ({
  fetchApi: (path: string, options?: RequestInit) => fetchApiMock(path, options),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../src/stores/recharge.store', () => ({
  useRechargeStore: () => ({ openModal: vi.fn() }),
}))

vi.mock('../src/pages/commerce', () => ({
  EntitlementsPage: () => <div>commerce.entitlements</div>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> | string) => {
      if (key === 'communityEconomy.assetCount' && typeof options === 'object') {
        return `${options.count} communityEconomy.assetCount`
      }
      return key
    },
  }),
}))

function renderWithQuery(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function mockCommunityEconomyApi() {
  fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
    if (path === '/api/wallet') {
      return Promise.resolve({ id: 'wallet-1', balance: 500, frozenAmount: 0 })
    }
    if (path.startsWith('/api/wallet/transactions/count')) {
      return Promise.resolve({ count: 0 })
    }
    if (path.startsWith('/api/wallet/transactions')) {
      return Promise.resolve([])
    }
    if (path === '/api/friends') {
      return Promise.resolve([
        {
          friendshipId: 'friendship-1',
          source: 'friend',
          createdAt: '2026-05-01T00:00:00.000Z',
          user: {
            id: 'recipient-1',
            username: 'recipient_one',
            displayName: 'Recipient One',
            avatarUrl: null,
            status: 'online',
            isBot: false,
          },
        },
        {
          friendshipId: 'friendship-2',
          source: 'friend',
          createdAt: '2026-05-01T00:00:00.000Z',
          user: {
            id: 'recipient-2',
            username: 'recipient_two',
            displayName: 'Recipient Two',
            avatarUrl: null,
            status: 'online',
            isBot: false,
          },
        },
      ])
    }
    if (path === '/api/channels/dm') {
      return Promise.resolve([])
    }
    if (path === '/api/economy/assets') {
      return Promise.resolve({
        assets: [
          {
            grant: {
              id: 'grant-1',
              definitionId: 'asset-1',
              ownerUserId: 'user-1',
              quantity: 2,
              remainingQuantity: 2,
              status: 'active',
              expiresAt: null,
            },
            definition: {
              id: 'asset-1',
              assetType: 'badge',
              name: 'Founding Badge',
              description: 'Early supporter badge',
              imageUrl: null,
              giftable: true,
              consumable: true,
              status: 'published',
            },
          },
        ],
      })
    }
    if (path.startsWith('/api/economy/assets/grant-1/')) {
      return Promise.resolve({ grant: { id: 'grant-1', status: 'active' } })
    }
    if (path.startsWith('/api/economy/settlements')) {
      if (path === '/api/economy/settlements/settle') {
        return Promise.resolve({ settlements: [] })
      }
      return Promise.resolve({
        settlements: [
          {
            id: 'settlement-1',
            sellerUserId: 'seller-1',
            sourceType: 'gift',
            sourceId: 'gift-1',
            grossAmount: 100,
            platformFee: 10,
            netAmount: 90,
            status: 'available',
            availableAt: '2026-05-01T00:00:00.000Z',
            settledAt: null,
          },
        ],
      })
    }
    if (path === '/api/economy/tips' || path === '/api/economy/gifts') {
      return Promise.resolve({ ok: true, body: options?.body })
    }
    return Promise.resolve({})
  })
}

beforeEach(() => {
  fetchApiMock.mockReset()
  mockCommunityEconomyApi()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('Community economy wallet UI', () => {
  it('renders assets and sends lifecycle actions through the economy API', async () => {
    renderWithQuery(<WalletSettings initialSection="assets" />)

    expect(await screen.findByText('Founding Badge')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'communityEconomy.consume' }))

    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledWith(
        '/api/economy/assets/grant-1/consume',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('renders settlement lines and settles available balance', async () => {
    renderWithQuery(<WalletSettings initialSection="settlements" />)

    expect(await screen.findByText('communityEconomy.source.gift')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'communityEconomy.settleAvailable' }))

    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledWith(
        '/api/economy/settlements/settle',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('submits tips through the recipient picker with idempotency keys', async () => {
    renderWithQuery(<WalletSettings initialSection="actions" />)

    await userEvent.click(screen.getAllByRole('button', { name: 'communityEconomy.sendTip' })[0]!)
    await userEvent.click(await screen.findByText('Recipient One'))
    await userEvent.click(screen.getByRole('button', { name: '10' }))
    const tipButtons = screen.getAllByRole('button', { name: 'communityEconomy.sendTip' })
    await userEvent.click(tipButtons[tipButtons.length - 1]!)

    await waitFor(() => {
      const tipCall = fetchApiMock.mock.calls.find(([path]) => path === '/api/economy/tips')
      expect(tipCall).toBeTruthy()
      expect(JSON.parse(String(tipCall?.[1]?.body))).toEqual(
        expect.objectContaining({
          recipientUserId: 'recipient-1',
          amount: 10,
          idempotencyKey: expect.any(String),
        }),
      )
    })
  })

  it('submits gifts from the asset scene with selected assets', async () => {
    renderWithQuery(<WalletSettings initialSection="assets" />)

    expect(await screen.findByText('Founding Badge')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('button', { name: 'communityEconomy.sendGift' })[0]!)
    await userEvent.click(await screen.findByText('Recipient Two'))
    const giftButtons = screen.getAllByRole('button', { name: 'communityEconomy.sendGift' })
    await userEvent.click(giftButtons[giftButtons.length - 1]!)

    await waitFor(() => {
      const giftCall = fetchApiMock.mock.calls.find(([path]) => path === '/api/economy/gifts')
      expect(giftCall).toBeTruthy()
      expect(JSON.parse(String(giftCall?.[1]?.body))).toEqual(
        expect.objectContaining({
          recipientUserId: 'recipient-2',
          assets: [{ assetGrantId: 'grant-1', quantity: 1 }],
          idempotencyKey: expect.any(String),
        }),
      )
    })
  })
})
