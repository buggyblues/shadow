export type TicketStatus = 'open' | 'in_progress' | 'done'
export type TicketPriority = 'low' | 'normal' | 'high'

export interface Ticket {
  id: string
  title: string
  body: string
  status: TicketStatus
  priority: TicketPriority
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ShadowCommandContext {
  protocol: 'shadow.app/1'
  serverId: string
  serverAppId: string
  appKey: string
  command: string
  actor: {
    kind: string
    userId: string | null
    buddyAgentId: string | null
    ownerId?: string | null
  }
  channelId: string | null
  permission: string
  action: string
  dataClass: string
}

export interface ShadowCommandEnvelope<TInput = unknown> {
  input: TInput
  context: ShadowCommandContext
}

export interface ShadowServerAppTokenIntrospection {
  active: boolean
  token_type?: 'Bearer'
  sub?: string
  scope?: string
  exp?: number
  iat?: number
  shadow?: ShadowCommandContext
}
