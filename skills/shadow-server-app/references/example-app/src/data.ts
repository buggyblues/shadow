import { randomUUID } from 'node:crypto'
import type { Ticket, TicketPriority, TicketStatus } from './types.js'

const tickets: Ticket[] = [
  {
    id: 'TCK-1001',
    title: 'Connect Demo Desk to Shadow',
    body: 'Install the server App and grant a Buddy access.',
    status: 'open',
    priority: 'high',
    createdBy: 'system',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: 'TCK-1002',
    title: 'Verify iframe launch context',
    body: 'Open the App from the server Apps page.',
    status: 'in_progress',
    priority: 'normal',
    createdBy: 'system',
    createdAt: new Date(Date.now() - 1_800_000).toISOString(),
    updatedAt: new Date(Date.now() - 1_200_000).toISOString(),
  },
]

function ticketId() {
  return `TCK-${randomUUID().slice(0, 8).toUpperCase()}`
}

export function listTickets() {
  return [...tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function createTicket(input: {
  title: string
  body?: string
  priority?: TicketPriority
  createdBy: string
}) {
  const now = new Date().toISOString()
  const ticket: Ticket = {
    id: ticketId(),
    title: input.title,
    body: input.body ?? '',
    status: 'open',
    priority: input.priority ?? 'normal',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  tickets.unshift(ticket)
  return ticket
}

export function updateTicketStatus(id: string, status: TicketStatus) {
  const ticket = tickets.find((item) => item.id === id)
  if (!ticket) return null
  ticket.status = status
  ticket.updatedAt = new Date().toISOString()
  return ticket
}
