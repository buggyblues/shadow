/** @vitest-environment jsdom */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShopOrders } from '../../../src/components/shop/shop-orders'
import {
  fetchApiMock,
  renderWithQuery,
  resetMocks,
  serverId,
  showToastMock,
} from '../_shared/test-helpers'

describe('S06/C06 review submit 500 error toast', () => {
  beforeEach(() => resetMocks())
  it('评价失败应提示错误', async () => {
    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).includes('/shop/orders/o1/review') && options?.method === 'POST')
        return Promise.reject(new Error('shop.reviewError(500)'))
      if (String(path).includes('/shop/orders/o1/reviews')) return Promise.resolve([])
      if (String(path).includes('/shop/orders'))
        return Promise.resolve([
          {
            id: 'o1',
            orderNo: 'NO6001',
            shopId: 's1',
            buyerId: 'u1',
            status: 'delivered',
            totalAmount: 30,
            currency: 'CNY',
            createdAt: '2026-01-01T00:00:00.000Z',
            items: [
              {
                id: 'i1',
                productId: 'p1',
                productName: '商品A',
                specValues: [],
                price: 30,
                quantity: 1,
              },
            ],
          },
        ])
      return Promise.resolve({})
    })
    renderWithQuery(<ShopOrders serverId={serverId} />)
    await userEvent.click(await screen.findByText('#NO6001'))
    await userEvent.click(screen.getByRole('button', { name: '我要评价' }))
    await userEvent.click(screen.getByRole('button', { name: '提交评价' }))
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith('shop.reviewError(500)', 'error'),
    )
  })
})
