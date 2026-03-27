import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivityHeatmap } from '../activity-heatmap'

// @vitest-environment jsdom
import '@testing-library/jest-dom'

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('ActivityHeatmap', () => {
  const mockData = [
    { date: '2025-03-20', messageCount: 0, level: 0 as const },
    { date: '2025-03-21', messageCount: 5, level: 1 as const },
    { date: '2025-03-22', messageCount: 25, level: 2 as const },
    { date: '2025-03-23', messageCount: 75, level: 3 as const },
    { date: '2025-03-24', messageCount: 150, level: 4 as const },
  ]

  it('renders without crashing', () => {
    render(<ActivityHeatmap data={mockData} />)
    expect(screen.getByText('buddyDashboard.activityHeatmap')).toBeInTheDocument()
  })

  it('renders legend with all levels', () => {
    render(<ActivityHeatmap data={mockData} />)
    expect(screen.getByText('buddyDashboard.less')).toBeInTheDocument()
    expect(screen.getByText('buddyDashboard.more')).toBeInTheDocument()
  })

  it('renders heatmap cells', () => {
    const { container } = render(<ActivityHeatmap data={mockData} />)
    const cells = container.querySelectorAll('[title]')
    expect(cells.length).toBeGreaterThan(0)
  })
})
