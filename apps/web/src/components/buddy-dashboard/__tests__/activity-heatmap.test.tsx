import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivityHeatmap } from '../activity-heatmap'

// @vitest-environment jsdom

// Mock i18next
vi.mock('react-i18next', () => {
  const translations: Record<string, string> = {
    'buddyDashboard.activityHeatmap': 'Activity Heatmap',
    'buddyDashboard.less': 'Less',
    'buddyDashboard.more': 'More',
    'buddyDashboard.messages': 'messages',
    'buddyDashboard.noData': 'No data',
    'buddyDashboard.activityLevel0': 'No activity',
    'buddyDashboard.activityLevel1': 'Low activity',
    'buddyDashboard.activityLevel2': 'Moderate activity',
    'buddyDashboard.activityLevel3': 'High activity',
    'buddyDashboard.activityLevel4': 'Very high activity',
  }

  return {
    useTranslation: () => ({
      t: (key: string) => translations[key] ?? key,
      i18n: { language: 'en', resolvedLanguage: 'en' },
    }),
  }
})

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
    expect(screen.getByText('Activity Heatmap')).toBeTruthy()
  })

  it('renders legend with all levels', () => {
    render(<ActivityHeatmap data={mockData} />)
    expect(screen.getByText('Less')).toBeTruthy()
    expect(screen.getByText('More')).toBeTruthy()
  })

  it('renders heatmap cells', () => {
    const { container } = render(<ActivityHeatmap data={mockData} />)
    const cells = container.querySelectorAll('[title]')
    expect(cells.length).toBeGreaterThan(0)
  })
})
