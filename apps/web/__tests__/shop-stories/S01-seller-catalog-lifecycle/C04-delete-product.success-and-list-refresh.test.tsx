/** @vitest-environment jsdom */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShopAdmin } from '../../../src/components/shop/shop-admin'
import {
  fetchApiMock,
  renderWithQuery,
  resetMocks,
  serverId,
  showToastMock,
} from '../_shared/test-helpers'

describe('S01/C04 delete product success and list refresh', () => {
  beforeEach(() => {
    resetMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('删除商品成功后提示成功', async () => {
    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).includes('/shop/categories')) return Promise.resolve([])
      if (
        String(path).includes('/shop/products') &&
        (!options?.method || options.method === 'GET')
      ) {
        return Promise.resolve({
          products: [
            {
              id: 'p1',
              shopId: 's1',
              name: '商品X',
              slug: 'x',
              type: 'physical',
              status: 'active',
              basePrice: 9,
              currency: 'CNY',
              specNames: [],
              tags: [],
              salesCount: 0,
              avgRating: 0,
              ratingCount: 0,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          total: 1,
        })
      }
      if (String(path).includes('/shop/products/p1') && options?.method === 'DELETE')
        return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })
    renderWithQuery(<ShopAdmin serverId={serverId} onBack={() => {}} />)
    await screen.findByText('商品X')
    await userEvent.click(screen.getByTitle('删除此商品'))
    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('shop.productDeleted', 'success')
    })
  })
})
