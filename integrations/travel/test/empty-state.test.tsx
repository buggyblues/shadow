import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EmptyState } from '../client/components/empty-state.js'

describe('EmptyState layout contract', () => {
  it('owns its card surface in standalone contexts', () => {
    const markup = renderToStaticMarkup(
      <EmptyState description="Start here" size="section" title="Nothing yet" />,
    )

    expect(markup).toContain('rounded-[var(--radius-panel)]')
    expect(markup).toContain('border-sage/75')
    expect(markup).toContain('min-h-44')
  })

  it('does not create a second card when embedded in an existing surface', () => {
    const markup = renderToStaticMarkup(
      <EmptyState description="Start here" size="page" title="Nothing yet" variant="embedded" />,
    )

    expect(markup).not.toContain('border-sage/75')
    expect(markup).not.toContain('rounded-[var(--radius-panel)]')
    expect(markup).toContain('min-h-56')
  })
})
