/** @vitest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShopAdmin } from '../../../src/components/shop/shop-admin'
import { fetchApiMock, renderWithQuery, resetMocks, serverId } from '../_shared/test-helpers'

describe('S01/C08 create entitlement multi config success', () => {
  beforeEach(() => resetMocks())

  it('创建虚拟权益商品应支持提交多条 entitlementConfig', async () => {
    fetchApiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (
        String(path).includes('/shop/categories') &&
        (!options?.method || options.method === 'GET')
      )
        return Promise.resolve([])
      if (String(path).includes('/shop/products') && (!options?.method || options.method === 'GET'))
        return Promise.resolve({ products: [], total: 0 })
      if (String(path).includes('/shop/products') && options?.method === 'POST')
        return Promise.resolve({ id: 'p-ent' })
      return Promise.resolve({})
    })

    renderWithQuery(<ShopAdmin serverId={serverId} onBack={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: '添加商品' }))
    fireEvent.change(await screen.findByLabelText('商品名称 (必填)'), {
      target: { value: '权益商品A' },
    })
    await userEvent.click(screen.getByRole('button', { name: '虚拟权益' }))

    await userEvent.click(screen.getByRole('button', { name: '新增权益规则' }))

    const resourceInputs = screen.getAllByPlaceholderText('留空时默认绑定商品自身')
    fireEvent.change(resourceInputs[0], { target: { value: 'resource-a' } })
    fireEvent.change(resourceInputs[1], { target: { value: 'resource-b' } })

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() => {
      const call = fetchApiMock.mock.calls.find(
        (c) => String(c[0]).includes('/shop/products') && c[1]?.method === 'POST',
      )
      expect(call).toBeTruthy()
      const body = JSON.parse(String(call?.[1]?.body)) as { entitlementConfig?: unknown[] }
      expect(Array.isArray(body.entitlementConfig)).toBe(true)
      expect(body.entitlementConfig?.length).toBe(2)
      expect(body.entitlementConfig).toEqual([
        expect.objectContaining({
          resourceType: 'service',
          resourceId: 'resource-a',
          capability: 'use',
        }),
        expect.objectContaining({
          resourceType: 'service',
          resourceId: 'resource-b',
          capability: 'use',
        }),
      ])
    })
  }, 10_000)
})
