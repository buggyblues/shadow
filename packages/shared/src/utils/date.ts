/**
 * Date utility functions for shared usage across packages
 */

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Get date string for a specific date
 */
export function getDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Get date N days ago as ISO string
 */
export function getDaysAgoDateString(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return getDateString(date)
}

/**
 * Format duration in seconds to human readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours === 0 && minutes === 0) {
    return `${remainingSeconds}s`
  }
  if (hours === 0) {
    return `${minutes}m ${remainingSeconds}s`
  }
  if (hours < 24) {
    return `${hours}h ${minutes}m`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days}d ${remainingHours}h`
}

/**
 * Format duration in seconds to short string (for compact display)
 */
export function formatDurationShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours === 0) {
    return `${minutes}m`
  }
  if (hours < 24) {
    return `${hours}h ${minutes}m`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days}d ${remainingHours}h`
}

/**
 * Dashboard constants
 */
export const DASHBOARD_CONSTANTS = {
  /** Number of days to show in activity heatmap */
  HEATMAP_DAYS: 365,
  /** Number of days for weekly activity chart */
  WEEKLY_DAYS: 7,
  /** Number of months for monthly trend */
  MONTHLY_MONTHS: 12,
  /** Number of days for active days calculation */
  ACTIVE_DAYS_WINDOW: 30,
  /** Number of days to keep activity events */
  EVENT_RETENTION_DAYS: 90,
  /** Cache TTL in seconds */
  CACHE_TTL_SECONDS: 300,
} as const

/**
 * Activity level thresholds and colors
 */
export const ACTIVITY_LEVELS = {
  0: { min: 0, max: 0, color: 'bg-transparent', label: 'No activity' },
  1: { min: 1, max: 10, color: 'bg-green-900/30', label: '1-10 messages' },
  2: { min: 11, max: 50, color: 'bg-green-700/50', label: '11-50 messages' },
  3: { min: 51, max: 100, color: 'bg-green-500/70', label: '51-100 messages' },
  4: { min: 101, max: Infinity, color: 'bg-green-400', label: '100+ messages' },
} as const

export type ActivityLevel = 0 | 1 | 2 | 3 | 4

/**
 * Calculate activity level based on message count
 */
export function calculateActivityLevel(count: number): ActivityLevel {
  if (count >= 100) return 4
  if (count >= 51) return 3
  if (count >= 11) return 2
  if (count >= 1) return 1
  return 0
}
