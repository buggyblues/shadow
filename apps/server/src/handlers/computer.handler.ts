import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

const listQuerySchema = z.object({
  kind: z.enum(['local', 'cloud']).optional(),
})

const renameSchema = z.object({
  name: z.string().trim().min(1).max(128),
})

export function createComputerHandler(container: AppContainer) {
  const handler = new Hono()
  handler.use('*', authMiddleware)

  handler.get('/', zValidator('query', listQuerySchema), async (c) => {
    const user = c.get('user')
    const computerService = container.resolve('computerService')
    const computers = await computerService.listComputers(user.userId, c.req.valid('query').kind)
    return c.json({ computers })
  })

  handler.get('/:id', async (c) => {
    const user = c.get('user')
    const computerService = container.resolve('computerService')
    const computer = await computerService.getComputer(user.userId, c.req.param('id'))
    if (!computer) return c.json({ ok: false, error: 'Computer not found' }, 404)
    return c.json({ computer })
  })

  handler.patch('/:id', zValidator('json', renameSchema), async (c) => {
    const user = c.get('user')
    try {
      const computerService = container.resolve('computerService')
      const computer = await computerService.renameComputer(
        user.userId,
        c.req.param('id'),
        c.req.valid('json').name,
      )
      return c.json({ computer })
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : 'Failed to rename computer' },
        status as 400,
      )
    }
  })

  handler.delete('/:id', async (c) => {
    const user = c.get('user')
    try {
      const computerService = container.resolve('computerService')
      return c.json(await computerService.removeLocalComputer(user.userId, c.req.param('id')))
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : 'Failed to remove computer' },
        status as 400,
      )
    }
  })

  return handler
}
