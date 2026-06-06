import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InteractiveSelect } from './interactive-block'

const options = [
  { key: 'research', label: 'Research', value: 'research' },
  { key: 'script', label: 'Script', value: 'script' },
  { key: 'review', label: 'Review', value: 'review' },
]

describe('InteractiveSelect', () => {
  it('renders a React listbox select instead of a native select element', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <InteractiveSelect onSelect={onSelect} options={options} placeholder="Choose..." value="" />,
    )

    const trigger = screen.getByRole('combobox')
    expect(container.querySelector('select')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.textContent).toContain('Choose...')
  })

  it('selects an option with the pointer', async () => {
    const onSelect = vi.fn()
    render(
      <InteractiveSelect onSelect={onSelect} options={options} placeholder="Choose..." value="" />,
    )

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'Script' }))

    expect(onSelect).toHaveBeenCalledWith(options[1])
  })

  it('selects an option with keyboard navigation', async () => {
    const onSelect = vi.fn()
    render(
      <InteractiveSelect onSelect={onSelect} options={options} placeholder="Choose..." value="" />,
    )

    const trigger = screen.getByRole('combobox')
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledWith(options[1])
  })
})
