export function formatTravelAddress(value?: string | null) {
  if (!value) return ''
  const segments = value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  return segments
    .filter((segment) => {
      const key = segment.normalize('NFKC').toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 5)
    .join(', ')
}

export function formatTravelOpeningHours(value?: string | string[] | null) {
  if (!value) return ''
  const text = Array.isArray(value) ? value.join(' · ') : value
  const clauses = text
    .split(';')
    .map((clause) => clause.trim())
    .filter(Boolean)
  if (clauses.length <= 3 && text.length <= 96) return text
  return `${clauses.slice(0, 3).join(' · ')}…`
}
