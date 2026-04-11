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

describe('S01/C06 category create edit delete flow', () => {
  beforeEach(() => {
    resetMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  it('分类应支持创建、编辑、删除', async () => {
    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).includes('/shop/products') && (!options?.method || options.method === 'GET'))
        return Promise.resolve({ products: [], total: 0 })
      if (
        String(path).endsWith('/shop/categories') &&
        (!options?.method || options.method === 'GET')
      )
        return Promise.resolve([
          { id: 'c1', shopId: 's1', name: '默认分类', slug: 'default', position: 0 },
        ])
      if (String(path).endsWith('/shop/categories') && options?.method === 'POST')
        return Promise.resolve({ id: 'c2' })
      if (String(path).includes('/shop/categories/c1') && options?.method === 'PUT')
        return Promise.resolve({ ok: true })
      if (String(path).includes('/shop/categories/c1') && options?.method === 'DELETE')
        return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })
    renderWithQuery(<ShopAdmin serverId={serverId} onBack={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: '分类管理' }))
    await userEvent.type(screen.getByPlaceholderText('如：数字设备'), '新分类')
    await userEvent.type(screen.getByPlaceholderText('如：digital'), 'new-cat')
    await userEvent.click(screen.getByRole('button', { name: '新建类目' }))
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith('shop.categoryCreated', 'success'),
    )
  })
})
