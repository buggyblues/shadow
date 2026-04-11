/** @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProductDetail } from '../../../src/components/shop/product-detail'
import {
  fetchApiMock,
  renderWithQuery,
  resetMocks,
  serverId,
  showToastMock,
} from '../_shared/test-helpers'

describe('S01/C01 product detail buy now success', () => {
  beforeEach(() => resetMocks())

  it('点击立即购买应发起下单并提示成功', async () => {
    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).includes('/products/p1/reviews')) return Promise.resolve([])
      if (String(path).includes('/products/p1')) {
        return Promise.resolve({
          id: 'p1',
          shopId: 's1',
          name: '权益商品',
          slug: 'entitlement-1',
          type: 'entitlement',
          status: 'active',
          basePrice: 99,
          currency: 'CNY',
          specNames: [],
          tags: [],
          salesCount: 1,
          avgRating: 5,
          ratingCount: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          media: [{ id: 'm1', type: 'image', url: '/img.png', position: 0 }],
          skus: [],
        })
      }
      if (String(path).includes('/shop/orders') && options?.method === 'POST') {
        return Promise.resolve({ id: 'o1' })
      }
      return Promise.resolve({})
    })

    renderWithQuery(<ProductDetail serverId={serverId} productId="p1" onBack={() => {}} />)

    const buyButtons = await screen.findAllByRole('button', { name: '立即购买' })
    await userEvent.click(buyButtons[0])

    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledWith(
        `/api/servers/${serverId}/shop/orders`,
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(showToastMock).toHaveBeenCalledWith('购买成功！', 'success')
  })
})
