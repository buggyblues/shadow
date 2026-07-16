import type { Expense, ItineraryAssignment, Reservation, Trip, TripDay } from '../types.js'

function escapeIcsText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n')
}

function formatIcsDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.replaceAll('-', '')
  }
  return date
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'Z')
}

function eventDate(input: { value?: string; day?: TripDay }) {
  if (input.value) return formatIcsDate(input.value)
  if (input.day?.date) return input.day.date.replaceAll('-', '')
  return null
}

function eventBlock(input: {
  uid: string
  title: string
  start: string
  end?: string | null
  description?: string
  timestamp: string
}) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${input.timestamp}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `DTSTART:${input.start}`,
  ]
  if (input.end) lines.push(`DTEND:${input.end}`)
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`)
  lines.push('END:VEVENT')
  return lines
}

export function buildTripIcs(input: {
  trip: Trip
  days: TripDay[]
  assignments: ItineraryAssignment[]
  reservations: Reservation[]
}) {
  const timestamp = formatIcsDate(new Date().toISOString())
  const daysById = new Map(input.days.map((day) => [day.id, day]))
  const events: string[] = []

  for (const assignment of input.assignments) {
    const day = assignment.dayId ? daysById.get(assignment.dayId) : undefined
    const start = eventDate({ value: assignment.startAt, day })
    if (!start) continue
    events.push(
      ...eventBlock({
        uid: `${assignment.id}@travel.shadow`,
        title: assignment.title,
        start,
        end: assignment.endAt ? formatIcsDate(assignment.endAt) : null,
        description: assignment.notes,
        timestamp,
      }),
    )
  }

  for (const reservation of input.reservations) {
    const start = eventDate({ value: reservation.startAt })
    if (!start) continue
    events.push(
      ...eventBlock({
        uid: `${reservation.id}@travel.shadow`,
        title: reservation.title,
        start,
        end: reservation.endAt ? formatIcsDate(reservation.endAt) : null,
        description: reservation.confirmationCode
          ? `Confirmation: ${reservation.confirmationCode}`
          : reservation.provider,
        timestamp,
      }),
    )
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shadow Travel//Travel Space App//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(input.trip.title)}`,
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

function csvCell(value: unknown) {
  if (value === undefined || value === null) return ''
  const text = String(value)
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

export function buildExpensesCsv(expenses: Expense[]) {
  const rows = [
    [
      'id',
      'title',
      'category',
      'amount',
      'currency',
      'status',
      'date',
      'paidByMemberId',
      'participantMemberIds',
      'paidMemberIds',
    ],
    ...expenses.map((expense) => [
      expense.id,
      expense.title,
      expense.category,
      expense.amount,
      expense.currency,
      expense.status,
      expense.date ?? '',
      expense.paidByMemberId ?? '',
      expense.participantMemberIds.join('|'),
      expense.paidMemberIds.join('|'),
    ]),
  ]
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`
}
