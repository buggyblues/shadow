import { describe, expect, it } from 'vitest'
import {
  codexPetActivePlaybackDuration,
  codexPetBackgroundPosition,
  codexPetLookFrame,
  codexPetPlayback,
} from '../src/renderer/lib/codex-pet-renderer'

describe('Codex pet renderer contract', () => {
  it('uses the standard per-frame idle timing and slow idle loop', () => {
    const playback = codexPetPlayback('idle')

    expect(playback.loopStartIndex).toBe(0)
    expect(playback.frames.map((frame) => frame.frameDurationMs)).toEqual([
      1680, 660, 660, 840, 840, 1920,
    ])
  })

  it('plays active states three times before entering slow idle', () => {
    const playback = codexPetPlayback('running-right')

    expect(playback.loopStartIndex).toBe(24)
    expect(playback.frames).toHaveLength(30)
    expect(playback.frames.slice(0, 8).map((frame) => frame.frameDurationMs)).toEqual([
      120, 120, 120, 120, 120, 120, 120, 220,
    ])
    expect(playback.frames.slice(24).every((frame) => frame.rowIndex === 0)).toBe(true)
    expect(codexPetActivePlaybackDuration('running-right')).toBe(3180)
  })

  it('renders only the first state frame when reduced motion is preferred', () => {
    expect(codexPetPlayback('waving', true)).toEqual({
      frames: [{ rowIndex: 3, columnIndex: 0, frameDurationMs: 140 }],
      loopStartIndex: null,
    })
  })

  it('maps the 16 clockwise look directions to v2 rows 9 and 10', () => {
    const look = (x: number, y: number) =>
      codexPetLookFrame({
        spriteVersionNumber: 2,
        petCenter: { x: 0, y: 0 },
        pointer: { x, y },
        deadzoneRadius: 0,
      })

    expect(look(0, -100)).toMatchObject({ rowIndex: 9, columnIndex: 0 })
    expect(look(100, 0)).toMatchObject({ rowIndex: 9, columnIndex: 4 })
    expect(look(0, 100)).toMatchObject({ rowIndex: 10, columnIndex: 0 })
    expect(look(-100, 0)).toMatchObject({ rowIndex: 10, columnIndex: 4 })
    expect(look(-100, -100)).toMatchObject({ rowIndex: 10, columnIndex: 6 })
  })

  it('disables look frames for v1 atlases and inside the pointer deadzone', () => {
    expect(
      codexPetLookFrame({
        spriteVersionNumber: 1,
        petCenter: { x: 0, y: 0 },
        pointer: { x: 100, y: 0 },
      }),
    ).toBeNull()
    expect(
      codexPetLookFrame({
        spriteVersionNumber: 2,
        petCenter: { x: 0, y: 0 },
        pointer: { x: 4, y: 3 },
        deadzoneRadius: 5,
      }),
    ).toBeNull()
  })

  it('uses percentage positioning compatible with scaled Codex atlases', () => {
    expect(codexPetBackgroundPosition({ rowIndex: 10, columnIndex: 7 }, 8, 11)).toBe('100% 100%')
    expect(codexPetBackgroundPosition({ rowIndex: 9, columnIndex: 0 }, 8, 11)).toBe('0% 90%')
  })
})
