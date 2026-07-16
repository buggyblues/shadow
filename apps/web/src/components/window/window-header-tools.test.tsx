import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  OsWindowHeaderSearch,
  OsWindowHeaderToolsContext,
  useOsWindowHeaderSearch,
} from './window-header-tools'

describe('OsWindowHeaderSearch', () => {
  it('starts as an icon and expands a small text search in the shared window header', () => {
    const onChange = vi.fn()
    render(<OsWindowHeaderSearch value="" onChange={onChange} placeholder="Search workspace" />)

    expect(screen.queryByRole('textbox', { name: 'Search workspace' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Search workspace' }))

    const input = screen.getByRole('textbox', { name: 'Search workspace' })
    expect(input.getAttribute('type')).toBe('text')
    expect(input.className).toContain('h-8')

    fireEvent.change(input, {
      target: { value: 'regression' },
    })

    expect(onChange).toHaveBeenCalledWith('regression')
  })

  it('collapses on blur and preserves an active query when collapsed', () => {
    const { rerender } = render(
      <OsWindowHeaderSearch value="" onChange={vi.fn()} placeholder="Search workspace" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Search workspace' }))

    fireEvent.blur(screen.getByRole('textbox', { name: 'Search workspace' }), {
      relatedTarget: document.body,
    })
    expect(screen.queryByRole('textbox', { name: 'Search workspace' })).toBeNull()

    rerender(
      <OsWindowHeaderSearch value="regression" onChange={vi.fn()} placeholder="Search workspace" />,
    )
    expect(screen.getByRole('textbox', { name: 'Search workspace' })).toBeTruthy()
    fireEvent.blur(screen.getByRole('textbox', { name: 'Search workspace' }), {
      relatedTarget: document.body,
    })
    expect(screen.queryByRole('textbox', { name: 'Search workspace' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Search workspace' }))
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Search workspace' }).value).toBe(
      'regression',
    )
  })

  it('waits for IME composition to finish before applying a search', () => {
    const onChange = vi.fn()
    render(<OsWindowHeaderSearch value="" onChange={onChange} placeholder="Search workspace" />)
    fireEvent.click(screen.getByRole('button', { name: 'Search workspace' }))
    const input = screen.getByRole('textbox', { name: 'Search workspace' })

    fireEvent.compositionStart(input)
    fireEvent.change(input, {
      target: { value: '中文' },
    })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.compositionEnd(input)
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('中文')
  })
})

describe('useOsWindowHeaderSearch', () => {
  it('registers embedded App search with the window and removes it when disabled', () => {
    const cleanup = vi.fn()
    const setHeaderSearch = vi.fn(() => cleanup)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <OsWindowHeaderToolsContext.Provider
        value={{ setHeaderTools: vi.fn(() => vi.fn()), setHeaderSearch }}
      >
        {children}
      </OsWindowHeaderToolsContext.Provider>
    )
    const { rerender } = renderHook(
      ({ enabled }) =>
        useOsWindowHeaderSearch(
          'workspace-search',
          enabled
            ? {
                value: '',
                onChange: vi.fn(),
                placeholder: 'Search workspace',
              }
            : null,
        ),
      { initialProps: { enabled: true }, wrapper },
    )

    expect(setHeaderSearch).toHaveBeenCalledWith('workspace-search', expect.anything())

    rerender({ enabled: false })

    expect(cleanup).toHaveBeenCalled()
    expect(setHeaderSearch).toHaveBeenLastCalledWith('workspace-search', null)
  })
})
