/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessageFloatingActions } from './use-message-floating-actions'

function FloatingActionsHarness() {
  const actions = useMessageFloatingActions('message-1', true)

  return (
    <div>
      <div ref={actions.messageRef}>message</div>
      <button type="button" onClick={actions.activateHover}>
        activate
      </button>
      <button type="button" onClick={actions.deactivateHover}>
        deactivate
      </button>
      <button type="button" onClick={() => actions.setShowMoreMenu(true)}>
        open more
      </button>
      <div data-message-actions-floating="true">
        <svg data-testid="floating-svg-icon" />
      </div>
      <button type="button">outside</button>
      <div data-testid="show-actions">{String(actions.showActions)}</div>
      <div data-testid="show-more-menu">{String(actions.showMoreMenu)}</div>
    </div>
  )
}

describe('useMessageFloatingActions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('closes actions after hover ends when no floating surface is pinned', () => {
    render(<FloatingActionsHarness />)

    fireEvent.click(screen.getByText('activate'))
    expect(screen.getByTestId('show-actions').textContent).toBe('true')

    fireEvent.click(screen.getByText('deactivate'))
    act(() => vi.advanceTimersByTime(151))

    expect(screen.getByTestId('show-actions').textContent).toBe('false')
  })

  it('keeps actions mounted after hover ends while the more menu is open', () => {
    render(<FloatingActionsHarness />)

    fireEvent.click(screen.getByText('activate'))
    fireEvent.click(screen.getByText('open more'))
    fireEvent.click(screen.getByText('deactivate'))
    act(() => vi.advanceTimersByTime(151))

    expect(screen.getByTestId('show-actions').textContent).toBe('true')
    expect(screen.getByTestId('show-more-menu').textContent).toBe('true')
  })

  it('keeps actions open when pointer down starts on an svg inside the floating surface', () => {
    render(<FloatingActionsHarness />)

    fireEvent.click(screen.getByText('activate'))
    fireEvent.click(screen.getByText('open more'))

    fireEvent.pointerDown(screen.getByTestId('floating-svg-icon'))

    expect(screen.getByTestId('show-actions').textContent).toBe('true')
    expect(screen.getByTestId('show-more-menu').textContent).toBe('true')
  })

  it('closes actions when pointer down starts outside the message and floating surface', () => {
    render(<FloatingActionsHarness />)

    fireEvent.click(screen.getByText('activate'))
    fireEvent.click(screen.getByText('open more'))

    fireEvent.pointerDown(screen.getByText('outside'))

    expect(screen.getByTestId('show-actions').textContent).toBe('false')
    expect(screen.getByTestId('show-more-menu').textContent).toBe('false')
  })
})
