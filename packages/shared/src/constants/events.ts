// ─── Client → Server ───

export const CLIENT_EVENTS = {
  CHANNEL_JOIN: 'channel:join',
  CHANNEL_LEAVE: 'channel:leave',
  MESSAGE_SEND: 'message:send',
  MESSAGE_TYPING: 'message:typing',
  PRESENCE_UPDATE: 'presence:update',
  VOICE_JOIN: 'voice:join',
  VOICE_LEAVE: 'voice:leave',
  VOICE_STATE_UPDATE: 'voice:state:update',
  VOICE_TOKEN_RENEW: 'voice:token:renew',
  VOICE_HEARTBEAT: 'voice:heartbeat',
} as const

// ─── Server → Client ───

export const SERVER_EVENTS = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_DELETE: 'message:delete',
  MEMBER_TYPING: 'member:typing',
  MEMBER_JOIN: 'member:join',
  MEMBER_LEAVE: 'member:leave',
  PRESENCE_CHANGE: 'presence:change',
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',
  NOTIFICATION_NEW: 'notification:new',
  SERVER_APP_LIST_CHANGED: 'server-app:list-changed',
  VOICE_STATE: 'voice:state',
  VOICE_PARTICIPANT_JOINED: 'voice:participant-joined',
  VOICE_PARTICIPANT_LEFT: 'voice:participant-left',
  VOICE_PARTICIPANT_UPDATED: 'voice:participant-updated',
  VOICE_POLICY_UPDATED: 'voice:policy-updated',
} as const

export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS]
export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS]
