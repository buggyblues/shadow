import { describe, expect, it } from 'vitest'
import { CLIENT_EVENTS, channelRoom, SERVER_EVENTS, threadRoom, userRoom } from '../src/constants'

describe('room helpers', () => {
  describe('channelRoom', () => {
    it('should build channel room name', () => {
      expect(channelRoom('abc123')).toBe('channel:abc123')
    })

    it('should handle empty string', () => {
      expect(channelRoom('')).toBe('channel:')
    })
  })

  describe('threadRoom', () => {
    it('should build thread room name', () => {
      expect(threadRoom('t456')).toBe('thread:t456')
    })
  })

  describe('userRoom', () => {
    it('should build user room name', () => {
      expect(userRoom('u789')).toBe('user:u789')
    })
  })
})

describe('re-exported constants', () => {
  it('should re-export CLIENT_EVENTS from shared', () => {
    expect(CLIENT_EVENTS).toBeDefined()
    expect(CLIENT_EVENTS.CHANNEL_JOIN).toBe('channel:join')
  })

  it('should re-export SERVER_EVENTS from shared', () => {
    expect(SERVER_EVENTS).toBeDefined()
    expect(SERVER_EVENTS.MESSAGE_NEW).toBe('message:new')
  })
})
