import { describe, expect, it } from 'vitest'
import { userFacingChannelTopic } from './channel-topic'

describe('userFacingChannelTopic', () => {
  it('hides internal Space App dedupe markers', () => {
    expect(userFacingChannelTopic('space-app:travel:travel-trip:trip_123 · 巴黎秋日三天')).toBe(
      '巴黎秋日三天',
    )
    expect(userFacingChannelTopic('space-app:travel:travel-trip:trip_123')).toBeNull()
  })

  it('keeps regular channel topics unchanged', () => {
    expect(userFacingChannelTopic('一起规划巴黎周末')).toBe('一起规划巴黎周末')
    expect(userFacingChannelTopic(null)).toBeNull()
  })
})
