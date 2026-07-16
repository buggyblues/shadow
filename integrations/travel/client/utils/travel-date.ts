export function formatTripDate(date: string, language: string) {
  const value = new Date(`${date}T12:00:00`)
  return new Intl.DateTimeFormat(language.startsWith('zh') ? 'zh-CN' : 'en-US', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(value)
}

export function formatTripDayNumber(day: number, language: string) {
  return language.startsWith('zh') ? `第 ${day} 天` : `Day ${day}`
}
