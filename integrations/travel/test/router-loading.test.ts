import { describe, expect, it } from 'vitest'
import { router } from '../client/routes/router.js'

describe('travel route loading feedback', () => {
  it('shows the pending UI immediately instead of delaying the route transition', () => {
    expect(router.options.defaultPendingMs).toBe(0)
    expect(router.options.defaultPendingMinMs).toBe(180)
    expect(router.options.defaultPendingComponent).toBeTypeOf('function')
  })

  it('uses TanStack Router intent preloading instead of page-owned navigation loading', () => {
    expect(router.options.defaultPreload).toBe('intent')
    expect(router.options.defaultPreloadDelay).toBe(40)
  })
})
