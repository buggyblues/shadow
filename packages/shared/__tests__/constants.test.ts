import { describe, expect, it } from 'vitest'
import { CLIENT_EVENTS, SERVER_EVENTS } from '../src/constants/events'
import { LIMITS } from '../src/constants/limits'

describe('CLIENT_EVENTS', () => {
  it('should have all expected client events', () => {
    expect(CLIENT_EVENTS.CHANNEL_JOIN).toBe('channel:join')
    expect(CLIENT_EVENTS.CHANNEL_LEAVE).toBe('channel:leave')
    expect(CLIENT_EVENTS.MESSAGE_SEND).toBe('message:send')
    expect(CLIENT_EVENTS.MESSAGE_TYPING).toBe('message:typing')
    expect(CLIENT_EVENTS.PRESENCE_UPDATE).toBe('presence:update')
    expect(CLIENT_EVENTS.VOICE_JOIN).toBe('voice:join')
    expect(CLIENT_EVENTS.VOICE_LEAVE).toBe('voice:leave')
    expect(CLIENT_EVENTS.VOICE_STATE_UPDATE).toBe('voice:state:update')
    expect(CLIENT_EVENTS.VOICE_TOKEN_RENEW).toBe('voice:token:renew')
    expect(CLIENT_EVENTS.VOICE_HEARTBEAT).toBe('voice:heartbeat')
  })

  it('should be readonly', () => {
    const events = CLIENT_EVENTS
    expect(Object.keys(events)).toHaveLength(10)
  })
})

describe('SERVER_EVENTS', () => {
  it('should have all expected server events', () => {
    expect(SERVER_EVENTS.MESSAGE_NEW).toBe('message:new')
    expect(SERVER_EVENTS.MESSAGE_UPDATE).toBe('message:update')
    expect(SERVER_EVENTS.MESSAGE_DELETE).toBe('message:delete')
    expect(SERVER_EVENTS.MEMBER_TYPING).toBe('member:typing')
    expect(SERVER_EVENTS.MEMBER_JOIN).toBe('member:join')
    expect(SERVER_EVENTS.MEMBER_LEAVE).toBe('member:leave')
    expect(SERVER_EVENTS.PRESENCE_CHANGE).toBe('presence:change')
    expect(SERVER_EVENTS.REACTION_ADD).toBe('reaction:add')
    expect(SERVER_EVENTS.REACTION_REMOVE).toBe('reaction:remove')
    expect(SERVER_EVENTS.NOTIFICATION_NEW).toBe('notification:new')
    expect(SERVER_EVENTS.SERVER_APP_LIST_CHANGED).toBe('server-app:list-changed')
    expect(SERVER_EVENTS.VOICE_STATE).toBe('voice:state')
    expect(SERVER_EVENTS.VOICE_PARTICIPANT_JOINED).toBe('voice:participant-joined')
    expect(SERVER_EVENTS.VOICE_PARTICIPANT_LEFT).toBe('voice:participant-left')
    expect(SERVER_EVENTS.VOICE_PARTICIPANT_UPDATED).toBe('voice:participant-updated')
    expect(SERVER_EVENTS.VOICE_POLICY_UPDATED).toBe('voice:policy-updated')
  })

  it('should have 16 server events', () => {
    expect(Object.keys(SERVER_EVENTS)).toHaveLength(16)
  })
})

describe('LIMITS', () => {
  it('should define message limits', () => {
    expect(LIMITS.MESSAGE_CONTENT_MAX).toBe(16000)
    expect(LIMITS.MESSAGES_PER_PAGE).toBe(50)
  })

  it('should define username limits', () => {
    expect(LIMITS.USERNAME_MIN).toBe(3)
    expect(LIMITS.USERNAME_MAX).toBe(32)
  })

  it('should define file upload limit', () => {
    expect(LIMITS.FILE_UPLOAD_MAX_SIZE).toBe(10 * 1024 * 1024)
  })

  it('should define server/channel limits', () => {
    expect(LIMITS.SERVER_NAME_MAX).toBe(100)
    expect(LIMITS.CHANNEL_NAME_MAX).toBe(100)
    expect(LIMITS.SERVERS_PER_USER_MAX).toBe(100)
    expect(LIMITS.CHANNELS_PER_SERVER_MAX).toBe(200)
  })

  it('should define invite code length', () => {
    expect(LIMITS.INVITE_CODE_LENGTH).toBe(8)
  })

  it('should define password min length', () => {
    expect(LIMITS.PASSWORD_MIN).toBe(8)
  })
})
