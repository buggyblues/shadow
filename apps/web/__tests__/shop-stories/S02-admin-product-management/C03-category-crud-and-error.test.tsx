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

describe('S02/C03 category crud and error', () => {
  beforeEach(() => {
    resetMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('新建分类成功 + 删除分类失败应出现错误提示', async () => {
    let categories = [{ id: 'c1', shopId: 's1', name: '默认分类', slug: 'default', position: 0 }]

    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).includes('/shop/products') && (!options?.method || options.method === 'GET'))
        return Promise.resolve({ products: [], total: 0 })
      if (
        String(path).includes('/shop/categories') &&
        (!options?.method || options.method === 'GET')
      )
        return Promise.resolve(categories)
      if (String(path).endsWith('/shop/categories') && options?.method === 'POST') {
        categories = [
          ...categories,
          { id: 'c2', shopId: 's1', name: '新分类', slug: 'new-cat', position: 1 },
        ]
        return Promise.resolve({ id: 'c2' })
      }
      if (String(path).includes('/shop/categories/c1') && options?.method === 'DELETE') {
        return Promise.reject(new Error('删除分类失败(500)'))
      }
      return Promise.resolve({})
    })

    renderWithQuery(<ShopAdmin serverId={serverId} onBack={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: '分类管理' }))

    await userEvent.type(screen.getByPlaceholderText('如：数字设备'), '新分类')
    await userEvent.type(screen.getByPlaceholderText('如：digital'), 'new-cat')
    await userEvent.click(screen.getByRole('button', { name: '新建类目' }))

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('分类创建成功', 'success')
    })

    const deleteBtns = screen.getAllByRole('button')
    const target = deleteBtns.find((b) => b.className.includes('hover:text-danger'))
    if (target) await userEvent.click(target)

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('删除分类失败(500)', 'error')
    })
  })
})
