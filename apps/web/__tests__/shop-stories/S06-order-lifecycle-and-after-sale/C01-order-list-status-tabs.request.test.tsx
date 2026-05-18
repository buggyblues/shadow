/** @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShopOrders } from '../../../src/components/shop/shop-orders'
import { fetchApiMock, renderWithQuery, resetMocks, serverId } from '../_shared/test-helpers'

describe('S06/C01 order list status tabs request', () => {
  beforeEach(() => resetMocks())

  it('切换状态标签应附带 status 查询参数', async () => {
    fetchApiMock.mockImplementation((path: string) => {
      if (String(path).includes('/shop/orders')) {
        return Promise.resolve([
          {
            id: 'o1',
            orderNo: 'NO1000',
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

    await userEvent.click(await screen.findByRole('button', { name: '待支付' }))

    await waitFor(() => {
      const hasStatusReq = fetchApiMock.mock.calls.some((c) =>
        String(c[0]).includes('/shop/orders?status=pending'),
      )
      expect(hasStatusReq).toBe(true)
    })
  })
})
