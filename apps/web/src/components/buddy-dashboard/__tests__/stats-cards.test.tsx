import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatsCards } from '../stats-cards'

// @vitest-environment jsdom
import '@testing-library/jest-dom'

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) {
        return `${key} ${JSON.stringify(params)}`
      }
      return key
    },
  }),
}))

describe('StatsCards', () => {
  const mockStats = {
    totalMessages: 1234,
    totalOnlineSeconds: 3665, // 1h 1m 5s
    activeDays30d: 15,
    currentStreak: 5,
    longestStreak: 10,
  }

  it('renders all stat cards', () => {
    render(<StatsCards stats={mockStats} />)

    expect(screen.getByText('buddyDashboard.totalMessages')).toBeInTheDocument()
    expect(screen.getByText('buddyDashboard.onlineTime')).toBeInTheDocument()
    expect(screen.getByText('buddyDashboard.activeDays')).toBeInTheDocument()
    expect(screen.getByText('buddyDashboard.currentStreak')).toBeInTheDocument()
  })

  it('displays correct values', () => {
    render(<StatsCards stats={mockStats} />)

    expect(screen.getByText('1,234')).toBeInTheDocument() // totalMessages
    expect(screen.getByText('1h 1m')).toBeInTheDocument() // online time
    expect(screen.getByText('15')).toBeInTheDocument() // active days
    expect(screen.getByText('buddyDashboard.days {"count":5}')).toBeInTheDocument() // streak
  })

  it('shows best streak when available', () => {
    render(<StatsCards stats={mockStats} />)
    expect(screen.getByText(/buddyDashboard.best/)).toBeInTheDocument()
  })
})
