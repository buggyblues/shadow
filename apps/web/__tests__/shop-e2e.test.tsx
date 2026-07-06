/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShopCart } from '../src/components/shop/shop-cart'
import { ShopOrders } from '../src/components/shop/shop-orders'
import { ShopPage } from '../src/components/shop/shop-page'
import i18n from '../src/lib/i18n'

const fetchApiMock = vi.fn()
const showToastMock = vi.fn()

vi.mock('../src/lib/api', () => ({
  fetchApi: (path: string, options?: RequestInit) => fetchApiMock(path, options),
}))

vi.mock('../src/lib/toast', () => ({
  showToast: (message: string, type?: 'error' | 'success' | 'info') => showToastMock(message, type),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to: _to,
    params: _params,
    search: _search,
    ...props
  }: {
    children?: React.ReactNode
    to?: unknown
    params?: unknown
    search?: unknown
    [key: string]: unknown
  }) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
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

const serverId = '550e8400-e29b-41d4-a716-446655440000'

beforeEach(async () => {
  fetchApiMock.mockReset()
  showToastMock.mockReset()
  localStorage.clear()
  await i18n.changeLanguage('zh-CN')
})

describe('Shop UI E2E (real interaction)', () => {
  it('购物车为空时应显示空态', async () => {
    fetchApiMock.mockResolvedValueOnce([])

    renderWithQuery(<ShopCart serverId={serverId} />)

    expect(await screen.findByText('购物车空空如也')).toBeTruthy()
  })

  it('购物车应支持选择商品并触发下单请求', async () => {
    const cart = [
      {
        id: 'c1',
        userId: 'u1',
        shopId: 's1',
        productId: 'p1',
        quantity: 2,
        product: { id: 'p1', name: '商品A', status: 'active', basePrice: 100 },
        sku: null,
        imageUrl: null,
        unitPrice: 100,
      },
      {
        id: 'c2',
        userId: 'u1',
        shopId: 's1',
        productId: 'p2',
        quantity: 1,
        product: { id: 'p2', name: '商品B', status: 'active', basePrice: 250 },
        sku: null,
        imageUrl: null,
        unitPrice: 250,
      },
    ]

    fetchApiMock.mockImplementation((path: string) => {
      if (path.includes('/shop/cart')) return Promise.resolve(cart)
      if (path.includes('/shop/orders')) return Promise.resolve({ id: 'o1' })
      return Promise.resolve({})
    })

    renderWithQuery(<ShopCart serverId={serverId} />)

    expect(await screen.findByText('商品A')).toBeTruthy()

    const allCheckboxes = screen.getAllByRole('checkbox')
    expect(allCheckboxes.length).toBeGreaterThan(1)
    fireEvent.click(allCheckboxes[1] as HTMLInputElement)

    const checkoutBtn = screen.getByRole('button', { name: /去结算/ })
    await userEvent.click(checkoutBtn)

    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledWith(
        `/api/servers/${serverId}/shop/orders`,
        expect.objectContaining({ method: 'POST' }),
      )
    })

    const orderCall = fetchApiMock.mock.calls.find((c) =>
      String(c[0]).includes(`/api/servers/${serverId}/shop/orders`),
    )
    expect(orderCall).toBeTruthy()
    const payload = JSON.parse(String(orderCall?.[1]?.body)) as {
      items: Array<{ productId: string; quantity: number }>
    }
    expect(payload.items).toEqual([{ productId: 'p1', quantity: 2 }])
  })

  it('下单失败时应提示错误（500/400）', async () => {
    const cart = [
      {
        id: 'c1',
        userId: 'u1',
        shopId: 's1',
        productId: 'p1',
        quantity: 1,
        product: { id: 'p1', name: '商品A', status: 'active', basePrice: 100 },
        sku: null,
        imageUrl: null,
        unitPrice: 100,
      },
    ]

    fetchApiMock.mockImplementation((path: string) => {
      if (path.includes('/shop/cart')) return Promise.resolve(cart)
      if (path.includes('/shop/orders')) return Promise.reject(new Error('库存不足(400)'))
      return Promise.resolve({})
    })

    renderWithQuery(<ShopCart serverId={serverId} />)
    expect(await screen.findByText('商品A')).toBeTruthy()

    const allCheckboxes = screen.getAllByRole('checkbox')
    fireEvent.click(allCheckboxes[1] as HTMLInputElement)

    await userEvent.click(screen.getByRole('button', { name: /去结算/ }))

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('库存不足(400)', 'error')
    })
  })

  it('订单页应支持状态筛选并按状态请求', async () => {
    fetchApiMock.mockImplementation((path: string) => {
      if (String(path).endsWith('/shop/orders')) {
        return Promise.resolve([
          {
            id: 'o-init',
            orderNo: 'NOINIT01',
            shopId: 's1',
            buyerId: 'u1',
            status: 'pending',
            totalAmount: 10,
            currency: 'CNY',
            createdAt: '2026-01-01T00:00:00.000Z',
            items: [
              {
                id: 'oi-init',
                productId: 'p-init',
                productName: '初始订单',
                specValues: [],
                price: 10,
                quantity: 1,
              },
            ],
          },
        ])
      }
      if (String(path).includes('/shop/orders?status=paid')) {
        return Promise.resolve([
          {
            id: 'o-paid',
            orderNo: 'NO0002',
            shopId: 's1',
            buyerId: 'u1',
            status: 'paid',
            totalAmount: 200,
            currency: 'CNY',
            createdAt: '2026-01-01T00:00:00.000Z',
            items: [
              {
                id: 'oi1',
                productId: 'p1',
                productName: '已支付商品',
                specValues: [],
                price: 200,
                quantity: 1,
              },
            ],
          },
        ])
      }
      return Promise.resolve({})
    })

    renderWithQuery(<ShopOrders serverId={serverId} />)

    const paidTab = await screen.findByRole('button', { name: '已支付' })
    await userEvent.click(paidTab)

    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledWith(
        `/api/servers/${serverId}/shop/orders?status=paid`,
        undefined,
      )
    })
    expect((await screen.findAllByText('已支付商品')).length).toBeGreaterThan(0)
  })

  it('空间店铺应展示买家路径和可视化权益商品', async () => {
    fetchApiMock.mockImplementation((path: string) => {
      if (path === `/api/servers/${serverId}/shop`) {
        return Promise.resolve({
          id: 'shop-1',
          serverId,
          name: '星港服务站',
          description: '把服务器里的服务、徽章和文件整理成清晰货架',
          status: 'active',
          settings: {},
        })
      }
      if (path === `/api/servers/${serverId}/shop/cart`) return Promise.resolve([])
      if (path === '/api/wallet') return Promise.resolve({ balance: 1200 })
      if (path === `/api/servers/${serverId}/shop/categories`) {
        return Promise.resolve([
          {
            id: 'cat-1',
            shopId: 'shop-1',
            name: '会员服务',
            slug: 'member-service',
            position: 1,
          },
        ])
      }
      if (String(path).startsWith(`/api/servers/${serverId}/shop/products`)) {
        return Promise.resolve({
          total: 1,
          products: [
            {
              id: 'product-1',
              shopId: 'shop-1',
              categoryId: 'cat-1',
              name: '创作者会员徽章',
              slug: 'creator-badge',
              type: 'entitlement',
              billingMode: 'fixed_duration',
              status: 'active',
              description: '购买后获得可展示的身份徽章',
              summary: '购买后进钱包资产库',
              basePrice: 100,
              currency: 'CNY',
              specNames: [],
              tags: ['badge'],
              salesCount: 8,
              avgRating: 0,
              ratingCount: 0,
              entitlementConfig: {
                resourceType: 'community_asset',
                resourceId: 'asset-1',
                capability: 'redeem',
                durationSeconds: 2592000,
              },
              media: [],
              skus: [],
              createdAt: '2026-05-01T00:00:00.000Z',
            },
          ],
        })
      }
      return Promise.resolve({})
    })

    renderWithQuery(<ShopPage serverId={serverId} />)

    expect((await screen.findAllByText('星港服务站')).length).toBeGreaterThan(0)
    expect(await screen.findByText('空间店铺')).toBeTruthy()
    expect((await screen.findAllByText('创作者会员徽章')).length).toBeGreaterThan(0)
    expect(await screen.findByText('徽章')).toBeTruthy()
  })

  it('多商品订单评价应提交当前选中的商品ID', async () => {
    const orders = [
      {
        id: 'o1',
        orderNo: 'NO0001',
        shopId: 's1',
        buyerId: 'u1',
        status: 'delivered',
        totalAmount: 300,
        currency: 'CNY',
        createdAt: '2026-01-01T00:00:00.000Z',
        items: [
          {
            id: 'oi1',
            productId: 'p1',
            productName: '商品A',
            specValues: [],
            price: 100,
            quantity: 1,
          },
          {
            id: 'oi2',
            productId: 'p2',
            productName: '商品B',
            specValues: [],
            price: 200,
            quantity: 1,
          },
        ],
      },
    ]

    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).includes('/shop/orders/o1/review') && options?.method === 'POST') {
        return Promise.resolve({ success: true })
      }
      if (String(path).includes('/shop/orders/o1/reviews')) return Promise.resolve([])
      if (String(path).includes('/shop/orders')) return Promise.resolve(orders)
      return Promise.resolve({})
    })

    renderWithQuery(<ShopOrders serverId={serverId} />)

    expect((await screen.findAllByText('商品A')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByText('#NO0001'))
    await userEvent.click(screen.getByRole('button', { name: '我要评价' }))

    await userEvent.click(screen.getByRole('button', { name: '商品B' }))
    await userEvent.click(screen.getByRole('button', { name: '提交评价' }))

    await waitFor(() => {
      const reviewCall = fetchApiMock.mock.calls.find(
        (c) =>
          String(c[0]).includes(`/api/servers/${serverId}/shop/orders/o1/review`) &&
          c[1]?.method === 'POST',
      )
      expect(reviewCall).toBeTruthy()
      const body = JSON.parse(String(reviewCall?.[1]?.body)) as {
        productId: string
        rating: number
      }
      expect(body.productId).toBe('p2')
      expect(body.rating).toBe(5)
    })
  })

  it('订单取消失败时应展示错误提示（400/500）', async () => {
    const orders = [
      {
        id: 'o2',
        orderNo: 'NO0002',
        shopId: 's1',
        buyerId: 'u1',
        status: 'pending',
        totalAmount: 120,
        currency: 'CNY',
        createdAt: '2026-01-01T00:00:00.000Z',
        items: [
          {
            id: 'oi3',
            productId: 'p3',
            productName: '商品C',
            specValues: [],
            price: 120,
            quantity: 1,
          },
        ],
      },
    ]

    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).includes('/shop/orders/o2/cancel') && options?.method === 'POST') {
        return Promise.reject(new Error('shop.cancelNotAllowed(400)'))
      }
      if (String(path).includes('/shop/orders/o2/reviews')) return Promise.resolve([])
      if (String(path).includes('/shop/orders')) return Promise.resolve(orders)
      return Promise.resolve({})
    })

    renderWithQuery(<ShopOrders serverId={serverId} />)

    expect((await screen.findAllByText('商品C')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByText('#NO0002'))
    await userEvent.click(screen.getByRole('button', { name: '取消订单' }))

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('shop.cancelNotAllowed(400)', 'error')
    })
  })
})
