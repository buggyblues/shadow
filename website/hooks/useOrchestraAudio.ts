import { useCallback, useEffect, useRef } from 'react'
import type { OrchestraNote } from '../data/orchestra'

type BrowserAudioContext = AudioContext & {
  createStereoPanner?: () => StereoPannerNode
}

type PlayNoteOptions = {
  delay?: number
  force?: boolean
  onNoteStart?: (note: OrchestraNote) => void
  pan?: number
}

type ActiveArpeggio = {
  notes: OrchestraNote[]
  options: PlayNoteOptions
}

const NOTE_COOLDOWN_MS = 90
const ARPEGGIO_STEP_SECONDS = 0.14

export function useOrchestraAudio() {
  const audioContextRef = useRef<BrowserAudioContext | null>(null)
  const activeArpeggioRef = useRef<ActiveArpeggio | null>(null)
  const arpeggioIntervalRef = useRef<number | null>(null)
  const lastPlayedAtRef = useRef<Record<string, number>>({})
  const noteStartTimeoutsRef = useRef<number[]>([])

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null

    if (!audioContextRef.current) {
      const AudioContextConstructor =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext
          }
        ).webkitAudioContext

      if (!AudioContextConstructor) return null

      audioContextRef.current = new AudioContextConstructor() as BrowserAudioContext
    }

    return audioContextRef.current
  }, [])

  const unlockAudio = useCallback(() => {
    const audioContext = getAudioContext()

    if (!audioContext || audioContext.state !== 'suspended') return

    void audioContext.resume()
  }, [getAudioContext])

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio)
    window.addEventListener('touchstart', unlockAudio, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }
  }, [unlockAudio])

  const notifyNoteStart = useCallback((note: OrchestraNote, options: PlayNoteOptions) => {
    if (!options.onNoteStart) return

    const delayMs = Math.max(0, (options.delay || 0) * 1000)

    if (delayMs === 0) {
      options.onNoteStart(note)
      return
    }

    const timeoutId = window.setTimeout(() => {
      noteStartTimeoutsRef.current = noteStartTimeoutsRef.current.filter((id) => id !== timeoutId)
      options.onNoteStart?.(note)
    }, delayMs)

    noteStartTimeoutsRef.current.push(timeoutId)
  }, [])

  const playNote = useCallback(
    (note: OrchestraNote, options: PlayNoteOptions = {}) => {
      const audioContext = getAudioContext()
      if (!audioContext) return

      const currentTime = performance.now()
      const lastPlayedAt = lastPlayedAtRef.current[note.label] || 0

      if (!options.force && currentTime - lastPlayedAt < NOTE_COOLDOWN_MS) return

      lastPlayedAtRef.current[note.label] = currentTime

      if (audioContext.state === 'suspended') {
        void audioContext.resume()
      }

      notifyNoteStart(note, options)

      const startAt = audioContext.currentTime + (options.delay || 0)
      const releaseAt = startAt + 0.86
      const masterGain = audioContext.createGain()
      const bodyGain = audioContext.createGain()
      const shimmerGain = audioContext.createGain()
      const filter = audioContext.createBiquadFilter()
      const body = audioContext.createOscillator()
      const shimmer = audioContext.createOscillator()
      const panner = audioContext.createStereoPanner?.()

      body.type = 'triangle'
      body.frequency.setValueAtTime(note.frequency, startAt)

      shimmer.type = 'sine'
      shimmer.frequency.setValueAtTime(note.frequency * 2, startAt)
      shimmer.detune.setValueAtTime(4, startAt)

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(1800, startAt)
      filter.Q.setValueAtTime(0.7, startAt)

      masterGain.gain.setValueAtTime(0.0001, startAt)
      masterGain.gain.exponentialRampToValueAtTime(0.13, startAt + 0.018)
      masterGain.gain.exponentialRampToValueAtTime(0.035, startAt + 0.22)
      masterGain.gain.exponentialRampToValueAtTime(0.0001, releaseAt)

      bodyGain.gain.setValueAtTime(0.74, startAt)
      shimmerGain.gain.setValueAtTime(0.18, startAt)
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42)

      body.connect(bodyGain)
      shimmer.connect(shimmerGain)
      bodyGain.connect(filter)
      shimmerGain.connect(filter)
      filter.connect(masterGain)

      if (panner) {
        panner.pan.setValueAtTime(options.pan || 0, startAt)
        masterGain.connect(panner)
        panner.connect(audioContext.destination)
      } else {
        masterGain.connect(audioContext.destination)
      }

      body.start(startAt)
      shimmer.start(startAt)
      body.stop(releaseAt + 0.04)
      shimmer.stop(startAt + 0.48)
    },
    [getAudioContext, notifyNoteStart],
  )

  const playArpeggio = useCallback(
    (notes: OrchestraNote[], options: PlayNoteOptions = {}) => {
      notes.forEach((note, index) => {
        playNote(note, {
          ...options,
          delay: (options.delay || 0) + index * ARPEGGIO_STEP_SECONDS,
          force: true,
        })
      })
    },
    [playNote],
  )

  const stopArpeggioLoop = useCallback(() => {
    if (arpeggioIntervalRef.current === null) return

    window.clearInterval(arpeggioIntervalRef.current)
    arpeggioIntervalRef.current = null
  }, [])

  const stopArpeggio = useCallback(() => {
    stopArpeggioLoop()
    activeArpeggioRef.current = null
  }, [stopArpeggioLoop])

  const releaseArpeggio = useCallback(() => {
    const activeArpeggio = activeArpeggioRef.current

    stopArpeggio()

    if (!activeArpeggio) return

    playArpeggio([...activeArpeggio.notes].reverse(), activeArpeggio.options)
  }, [playArpeggio, stopArpeggio])

  const startArpeggio = useCallback(
    (notes: OrchestraNote[], options: PlayNoteOptions = {}) => {
      if (typeof window === 'undefined') return

      stopArpeggio()
      activeArpeggioRef.current = { notes, options }
      playArpeggio(notes, options)
      arpeggioIntervalRef.current = window.setInterval(
        () => {
          playArpeggio(notes, options)
        },
        notes.length * ARPEGGIO_STEP_SECONDS * 1000,
      )
    },
    [playArpeggio, stopArpeggio],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.addEventListener('blur', stopArpeggio)

    return () => window.removeEventListener('blur', stopArpeggio)
  }, [stopArpeggio])

  useEffect(() => stopArpeggio, [stopArpeggio])

  useEffect(() => {
    if (typeof window === 'undefined') return

    return () => {
      noteStartTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
      noteStartTimeoutsRef.current = []
    }
  }, [])

  return { playNote, releaseArpeggio, startArpeggio, stopArpeggio }
}
