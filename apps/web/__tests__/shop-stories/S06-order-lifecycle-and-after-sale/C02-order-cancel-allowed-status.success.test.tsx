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

describe('S06/C02 order cancel allowed status success', () => {
  beforeEach(() => resetMocks())

  it('pending 订单可取消并提示成功', async () => {
    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).includes('/shop/orders/o1/cancel') && options?.method === 'POST') {
        return Promise.resolve({ ok: true })
      }
      if (String(path).includes('/shop/orders/o1/reviews')) return Promise.resolve([])
      if (String(path).includes('/shop/orders')) {
        return Promise.resolve([
          {
            id: 'o1',
            orderNo: 'NO2001',
            shopId: 's1',
            buyerId: 'u1',
            status: 'pending',
            totalAmount: 10,
            currency: 'CNY',
            createdAt: '2026-01-01T00:00:00.000Z',
            items: [
              {
                id: 'i1',
                productId: 'p1',
                productName: '商品A',
                specValues: [],
                price: 10,
                quantity: 1,
              },
            ],
          },
        ])
      }
      return Promise.resolve({})
    })

    renderWithQuery(<ShopOrders serverId={serverId} />)

    await userEvent.click(await screen.findByText('#NO2001'))
    await userEvent.click(screen.getByRole('button', { name: '取消订单' }))

    await waitFor(() => {
      const hasCancelCall = fetchApiMock.mock.calls.some(
        (c) => String(c[0]).includes('/shop/orders/o1/cancel') && c[1]?.method === 'POST',
      )
      expect(hasCancelCall).toBe(true)
    })

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('订单已取消', 'success')
    })
  })
})
