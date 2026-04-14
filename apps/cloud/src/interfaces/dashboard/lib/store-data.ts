/**
 * Store presentation helpers.
 *
 * Template copy and metadata are resolved on the backend via TemplateI18nService.
 * This module only contains client-side visual mappings.
 */

import type { TemplateCategoryId, TemplateDifficulty } from './api'

export function getCategoryColor(category: TemplateCategoryId): string {
  const colors: Record<TemplateCategoryId, string> = {
    devops: 'bg-blue-900/50 text-blue-300 border-blue-800/60',
    security: 'bg-red-900/50 text-red-300 border-red-800/60',
    support: 'bg-green-900/50 text-green-300 border-green-800/60',
    research: 'bg-purple-900/50 text-purple-300 border-purple-800/60',
    monitoring: 'bg-yellow-900/50 text-yellow-300 border-yellow-800/60',
    business: 'bg-orange-900/50 text-orange-300 border-orange-800/60',
    demo: 'bg-cyan-900/50 text-cyan-300 border-cyan-800/60',
  }

  return colors[category]
}

export function getDifficultyColor(difficulty: TemplateDifficulty): string {
  const colors: Record<TemplateDifficulty, string> = {
    beginner: 'bg-green-900/50 text-green-300 border border-green-800/50',
    intermediate: 'bg-yellow-900/50 text-yellow-300 border border-yellow-800/50',
    advanced: 'bg-red-900/50 text-red-300 border border-red-800/50',
  }

  return colors[difficulty]
}

export function formatUsdCost(value: number | null, locale?: string): string {
  if (value === null) return '—'
  return new Intl.NumberFormat(locale ?? 'en', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}
