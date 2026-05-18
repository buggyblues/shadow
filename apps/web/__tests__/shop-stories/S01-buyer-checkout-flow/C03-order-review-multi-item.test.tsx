/** @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShopOrders } from '../../../src/components/shop/shop-orders'
import { fetchApiMock, renderWithQuery, resetMocks, serverId } from '../_shared/test-helpers'

describe('S01/C03 order review multi item', () => {
  beforeEach(() => resetMocks())

  it('应提交被选中的商品 productId', async () => {
    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).includes('/shop/orders/o1/review') && options?.method === 'POST') {
        return Promise.resolve({ ok: true })
      }
      if (String(path).includes('/shop/orders/o1/reviews')) return Promise.resolve([])
      if (String(path).includes('/shop/orders') && (!options?.method || options.method === 'GET')) {
        return Promise.resolve([
          {
            id: 'o1',
            orderNo: 'NO0001',
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
                price: 10,
                quantity: 1,
              },
              {
                id: 'i2',
                productId: 'p2',
                productName: '商品B',
                specValues: [],
                price: 20,
                quantity: 1,
              },
            ],
          },
        ])
      }
      return Promise.resolve({})
    })

    renderWithQuery(<ShopOrders serverId={serverId} />)

    await screen.findAllByText('商品A')
    await userEvent.click(screen.getByText('#NO0001'))
    await userEvent.click(screen.getByRole('button', { name: '我要评价' }))
    await userEvent.click(screen.getByRole('button', { name: '商品B' }))
    await userEvent.click(screen.getByRole('button', { name: '提交评价' }))

    await waitFor(() => {
      const call = fetchApiMock.mock.calls.find(
        (c) => String(c[0]).includes('/shop/orders/o1/review') && c[1]?.method === 'POST',
      )
      expect(call).toBeTruthy()
      const body = JSON.parse(String(call?.[1]?.body)) as { productId: string }
      expect(body.productId).toBe('p2')
    })
  })
})
