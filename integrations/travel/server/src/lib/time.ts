export function nowIso() {
  return new Date().toISOString()
}

export function dateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return []
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []

  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end && dates.length < 370) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function compareOptionalIso(a?: string, b?: string) {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b)
}
