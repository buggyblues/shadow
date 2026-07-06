import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Pause, Play } from 'lucide-react'
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useI18n } from 'rspress/runtime'
import { ORCHESTRA_PLAYERS, type OrchestraNote } from '../../data/orchestra'
import { useOrchestraAudio } from '../../hooks/useOrchestraAudio'
import { TypingSlogan } from './primitives/TypingSlogan'

const DOCS_BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ||
  '/'
).replace(/\/$/, '')
const orchestraAsset = (name: string) => `${DOCS_BASE}/orchestra/${name}`
const THEME_AUDIO_SRC = orchestraAsset('a_morning_waltz_in_green.mp3')

const CURTAIN_IMAGE_ASPECT = 1672 / 941
const CURTAIN_CLOTH_EDGE = 0.431
const CURTAIN_PEEK_RATIO = 0.1
const CURTAIN_MIN_PEEK = 34
const CURTAIN_MAX_PEEK = 132

const STAR_POINTS = [
  ['7%', '18%', 2],
  ['10%', '48%', 1],
  ['14%', '35%', 3],
  ['22%', '14%', 2],
  ['25%', '58%', 1],
  ['30%', '44%', 2],
  ['37%', '22%', 3],
  ['41%', '36%', 1],
  ['46%', '11%', 2],
  ['54%', '31%', 2],
  ['57%', '8%', 1],
  ['63%', '17%', 3],
  ['68%', '49%', 1],
  ['72%', '39%', 2],
  ['81%', '13%', 2],
  ['78%', '25%', 1],
  ['90%', '29%', 3],
  ['18%', '55%', 2],
  ['34%', '7%', 1],
  ['58%', '52%', 2],
  ['84%', '56%', 2],
  ['93%', '48%', 1],
] as const

type HomeOrchestraPlayer = (typeof ORCHESTRA_PLAYERS)[number]

const ORCHESTRA_SHORTCUTS = ['1', '2', '3', '4', '5'] as const

const NOTE_GLYPHS = ['♪', '♫', '♩', '♬'] as const
const NOTE_COLORS: Record<string, string> = {
  A: '#ffce6a',
  B: '#c4b5fd',
  C: '#8df7ff',
  D: '#93c5fd',
  E: '#f8e71c',
  F: '#86efac',
  G: '#f9a8d4',
}
const NOTE_ORIGINS: Record<string, { x: number; y: number }> = {
  bear: { x: 0.52, y: 0.08 },
  cat: { x: 0.5, y: 0.12 },
  duck: { x: 0.5, y: 0.1 },
  fox: { x: 0.48, y: 0.08 },
  rabbit: { x: 0.52, y: 0.1 },
}

const THEME_AUDIO_VOLUME = 0.82
const THEME_AUDIO_FADE_START = 0.42
const THEME_AUDIO_STOP_PROGRESS = 0.985
const PERFORMANCE_NOTE_INTERVAL_MS = 260
const THEME_POEM_LINE_INTERVAL_MS = 4000
const THEME_POEM_LINE_KEYS = [
  'home.hero.poem.line1',
  'home.hero.poem.line2',
  'home.hero.poem.line3',
  'home.hero.poem.line4',
  'home.hero.poem.line5',
  'home.hero.poem.line6',
  'home.hero.poem.line7',
  'home.hero.poem.line8',
  'home.hero.poem.line9',
  'home.hero.poem.line10',
  'home.hero.poem.line11',
  'home.hero.poem.line12',
  'home.hero.poem.line13',
  'home.hero.poem.line14',
] as const

const POEM_BREAK_PUNCTUATION = new Set([
  ',',
  '.',
  ';',
  ':',
  '!',
  '?',
  '，',
  '。',
  '；',
  '：',
  '！',
  '？',
  '、',
  '…',
])

function getShortcutPlayer(key: string) {
  const shortcutIndex = ORCHESTRA_SHORTCUTS.indexOf(key as (typeof ORCHESTRA_SHORTCUTS)[number])

  if (shortcutIndex === -1) return null

  return ORCHESTRA_PLAYERS[shortcutIndex] || null
}

function isEditableTarget(target: EventTarget | null) {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'SELECT' ||
    target.tagName === 'TEXTAREA'
  )
}

function splitPoemLineAtPunctuation(text: string) {
  const characters = Array.from(text)
  const segments: string[] = []
  let currentSegment = ''

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]
    currentSegment += character

    if (!POEM_BREAK_PUNCTUATION.has(character)) continue

    while (characters[index + 1] === ' ') {
      index += 1
      currentSegment += characters[index]
    }

    segments.push(currentSegment)
    currentSegment = ''
  }

  if (currentSegment) segments.push(currentSegment)

  return segments.length > 0 ? segments : [text]
}

function PoemLineText({ text }: { text: string }) {
  return (
    <>
      {splitPoemLineAtPunctuation(text).map((segment, index, segments) => (
        <Fragment key={`${index}:${segment}`}>
          <span className="home-orchestra-poem-segment">{segment}</span>
          {index < segments.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  )
}

export function HomeHero({ isZh }: { isZh: boolean }) {
  const t = useI18n()
  const heroRef = useRef<HTMLElement>(null)
  const noteLayerRef = useRef<HTMLDivElement>(null)
  const themeAudioRef = useRef<HTMLAudioElement>(null)
  const [activePlayerName, setActivePlayerName] = useState<string | null>(null)
  const [hoveredPlayerName, setHoveredPlayerName] = useState<string | null>(null)
  const [isThemePlaying, setIsThemePlaying] = useState(false)
  const [activePoemLineIndex, setActivePoemLineIndex] = useState(0)
  const activeKeyboardShortcutRef = useRef<string | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const activePointerTargetRef = useRef<HTMLButtonElement | null>(null)
  const activePlayerNameRef = useRef<string | null>(null)
  const curtainProgressRef = useRef(0)
  const activeNoteTweensRef = useRef<Array<{ kill: () => void }>>([])
  const activeStarTweensRef = useRef<
    Array<{ kill: () => void; timeScale: (value: number) => unknown }>
  >([])
  const performanceMovementRef = useRef<Array<{ kill: () => void }>>([])
  const performanceNoteIntervalRef = useRef<number | null>(null)
  const performanceNoteIndexRef = useRef(0)
  const themePlayingRef = useRef(false)
  const noteSequenceRef = useRef(0)
  const pointerSessionControllerRef = useRef<AbortController | null>(null)
  const { playNote, releaseArpeggio, startArpeggio, stopArpeggio } = useOrchestraAudio()
  const discoverServersHref = `${DOCS_BASE}${isZh ? '/zh/servers.html' : '/servers.html'}`

  const emitMusicNote = useCallback((playerName: string, note: OrchestraNote) => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const hero = heroRef.current
    const layer = noteLayerRef.current
    const playerElement = hero?.querySelector<HTMLElement>(
      `[data-orchestra-player="${playerName}"]`,
    )

    if (!hero || !layer || !playerElement) return

    const layerRect = layer.getBoundingClientRect()
    const playerRect = playerElement.getBoundingClientRect()
    const scaleX = layer.offsetWidth > 0 ? layerRect.width / layer.offsetWidth : 1
    const scaleY = layer.offsetHeight > 0 ? layerRect.height / layer.offsetHeight : 1
    const origin = NOTE_ORIGINS[playerName] || { x: 0.5, y: 0.1 }
    const localX = (playerRect.left + playerRect.width * origin.x - layerRect.left) / scaleX
    const localY = (playerRect.top + playerRect.height * origin.y - layerRect.top) / scaleY
    const sequence = noteSequenceRef.current++
    const noteElement = document.createElement('span')

    noteElement.className = 'home-orchestra-music-note'
    noteElement.textContent = NOTE_GLYPHS[sequence % NOTE_GLYPHS.length]
    noteElement.setAttribute('aria-hidden', 'true')
    noteElement.dataset.note = note.label
    noteElement.style.left = `${localX}px`
    noteElement.style.top = `${localY}px`
    noteElement.style.setProperty('--note-color', NOTE_COLORS[note.label] || '#8df7ff')
    layer.appendChild(noteElement)

    const drift = gsap.utils.random(-28, 28)
    const lift = gsap.utils.random(-92, -66)
    const timeline = gsap.timeline({
      onComplete: () => {
        timeline.kill()
        noteElement.remove()
        activeNoteTweensRef.current = activeNoteTweensRef.current.filter(
          (tween) => tween !== timeline,
        )
      },
    })

    activeNoteTweensRef.current.push(timeline)

    timeline
      .fromTo(
        noteElement,
        {
          autoAlpha: 0,
          rotation: gsap.utils.random(-14, 14),
          scale: 0.44,
          x: gsap.utils.random(-8, 8),
          y: 0,
        },
        {
          autoAlpha: 1,
          duration: 0.16,
          ease: 'power2.out',
          scale: 1,
          x: 0,
        },
      )
      .to(
        noteElement,
        {
          autoAlpha: 0,
          duration: 1.15,
          ease: 'sine.out',
          rotation: `+=${gsap.utils.random(-26, 26)}`,
          scale: 0.72,
          x: drift,
          y: lift,
        },
        0.07,
      )
  }, [])

  const playPlayerNote = useCallback(
    (player: HomeOrchestraPlayer) => {
      if (themePlayingRef.current) return

      playNote(player.note, {
        onNoteStart: (note) => emitMusicNote(player.name, note),
        pan: player.pan,
      })
    },
    [emitMusicNote, playNote],
  )

  const findPlayerFromPoint = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY)
    const playerElement = element?.closest<HTMLElement>('.home-orchestra-player')
    const playerName = playerElement?.dataset.orchestraPlayer

    if (!playerName) return null

    return ORCHESTRA_PLAYERS.find((player) => player.name === playerName) || null
  }

  const switchActivePlayer = useCallback(
    (player: HomeOrchestraPlayer) => {
      if (themePlayingRef.current) return
      if (activePlayerNameRef.current === player.name) return

      activePlayerNameRef.current = player.name
      setActivePlayerName(player.name)
      startArpeggio(player.triad, {
        onNoteStart: (note) => emitMusicNote(player.name, note),
        pan: player.pan,
      })
    },
    [emitMusicNote, startArpeggio],
  )

  const stopPerformanceNotes = useCallback(() => {
    if (performanceNoteIntervalRef.current === null) return

    window.clearInterval(performanceNoteIntervalRef.current)
    performanceNoteIntervalRef.current = null
  }, [])

  const stopPerformanceMovement = useCallback((shouldSettle = true) => {
    performanceMovementRef.current.forEach((animation) => animation.kill())
    performanceMovementRef.current = []

    if (!shouldSettle) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const hero = heroRef.current
    if (!hero) return

    const playerArtElements = Array.from(
      hero.querySelectorAll<HTMLElement>('.home-orchestra-player-art'),
    )

    playerArtElements.forEach((element) => {
      const settleTween = gsap.to(element, {
        clearProps: 'transform',
        duration: 0.42,
        ease: 'sine.out',
        overwrite: true,
        rotation: 0,
        scale: 1,
        x: 0,
        y: 0,
      })
      performanceMovementRef.current.push(settleTween)
    })
  }, [])

  const startPerformanceMovement = useCallback(() => {
    stopPerformanceMovement(false)

    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const hero = heroRef.current
    if (!hero) return

    const configs = [
      {
        delay: 0,
        duration: 1.36,
        lift: -10,
        scalePeak: 1.11,
        scaleRest: 1.04,
        swayLeft: -8,
        swayRight: 6,
      },
      {
        delay: 0.14,
        duration: 1.58,
        lift: -14,
        scalePeak: 1.13,
        scaleRest: 1.05,
        swayLeft: -6,
        swayRight: 8,
      },
      {
        delay: 0.22,
        duration: 1.72,
        lift: -9,
        scalePeak: 1.095,
        scaleRest: 1.035,
        swayLeft: -5,
        swayRight: 5,
      },
      {
        delay: 0.08,
        duration: 1.44,
        lift: -13,
        scalePeak: 1.12,
        scaleRest: 1.05,
        swayLeft: -7,
        swayRight: 6,
      },
      {
        delay: 0.18,
        duration: 1.28,
        lift: -11,
        scalePeak: 1.115,
        scaleRest: 1.045,
        swayLeft: -9,
        swayRight: 7,
      },
    ]

    ORCHESTRA_PLAYERS.forEach((player, index) => {
      const element = hero.querySelector<HTMLElement>(
        `[data-orchestra-player="${player.name}"] .home-orchestra-player-art`,
      )
      const config = configs[index]

      if (!element || !config) return

      gsap.set(element, { transformOrigin: '50% 92%' })

      const intro = gsap.to(element, {
        delay: config.delay,
        duration: 0.34,
        ease: 'sine.inOut',
        overwrite: true,
        rotation: config.swayLeft,
        scale: config.scaleRest,
        y: 0,
        onComplete: () => {
          if (!themePlayingRef.current) return

          const loop = gsap
            .timeline({ repeat: -1 })
            .to(element, {
              duration: config.duration / 2,
              ease: 'sine.inOut',
              rotation: config.swayRight,
              scale: config.scalePeak,
              y: config.lift,
            })
            .to(element, {
              duration: config.duration / 2,
              ease: 'sine.inOut',
              rotation: config.swayLeft,
              scale: config.scaleRest,
              y: 0,
            })

          performanceMovementRef.current.push(loop)
        },
      })

      performanceMovementRef.current.push(intro)
    })
  }, [stopPerformanceMovement])

  const startPerformanceNotes = useCallback(() => {
    if (typeof window === 'undefined') return

    stopPerformanceNotes()

    const emitNextPerformanceNote = () => {
      const player = ORCHESTRA_PLAYERS[performanceNoteIndexRef.current % ORCHESTRA_PLAYERS.length]
      performanceNoteIndexRef.current += 1
      emitMusicNote(player.name, player.note)
    }

    emitNextPerformanceNote()
    performanceNoteIntervalRef.current = window.setInterval(
      emitNextPerformanceNote,
      PERFORMANCE_NOTE_INTERVAL_MS,
    )
  }, [emitMusicNote, stopPerformanceNotes])

  const syncThemeAudioToCurtain = useCallback((progress: number) => {
    curtainProgressRef.current = progress

    const audio = themeAudioRef.current
    if (!audio || !themePlayingRef.current) return

    const fadeProgress = Math.min(
      1,
      Math.max(0, (progress - THEME_AUDIO_FADE_START) / (1 - THEME_AUDIO_FADE_START)),
    )
    audio.volume = THEME_AUDIO_VOLUME * (1 - fadeProgress)
  }, [])

  const releaseActivePointerCapture = () => {
    const pointerId = activePointerIdRef.current
    const pointerTarget = activePointerTargetRef.current

    if (pointerId === null || !pointerTarget) return

    try {
      pointerTarget.releasePointerCapture?.(pointerId)
    } catch {
      // Pointer capture may already be released by the browser.
    }
  }

  const endPointerSession = (shouldRelease: boolean) => {
    pointerSessionControllerRef.current?.abort()
    pointerSessionControllerRef.current = null

    releaseActivePointerCapture()

    activePointerIdRef.current = null
    activePointerTargetRef.current = null
    activePlayerNameRef.current = null
    setActivePlayerName(null)
    setHoveredPlayerName(null)

    if (shouldRelease) {
      releaseArpeggio()
    } else {
      stopArpeggio()
    }
  }

  const stopThemePerformance = useCallback(
    (options: { resetVolume?: boolean } = {}) => {
      themePlayingRef.current = false
      setIsThemePlaying(false)
      stopPerformanceMovement()
      stopPerformanceNotes()
      stopArpeggio()

      activeKeyboardShortcutRef.current = null
      activePlayerNameRef.current = null
      activePointerIdRef.current = null
      activePointerTargetRef.current = null
      setActivePlayerName(null)
      setHoveredPlayerName(null)

      const audio = themeAudioRef.current
      if (!audio) return

      audio.pause()
      if (options.resetVolume !== false) {
        audio.volume = THEME_AUDIO_VOLUME
      }
    },
    [stopArpeggio, stopPerformanceMovement, stopPerformanceNotes],
  )

  const startThemePerformance = useCallback(() => {
    const audio = themeAudioRef.current
    if (!audio) return

    if (activePointerIdRef.current !== null) {
      endPointerSession(false)
    } else {
      stopArpeggio()
    }

    activeKeyboardShortcutRef.current = null
    activePlayerNameRef.current = null
    setActivePlayerName(null)
    setHoveredPlayerName(null)

    themePlayingRef.current = true
    setIsThemePlaying(true)
    startPerformanceMovement()
    syncThemeAudioToCurtain(curtainProgressRef.current)
    startPerformanceNotes()

    void audio.play().catch(() => {
      stopThemePerformance()
    })
  }, [
    startPerformanceMovement,
    startPerformanceNotes,
    stopArpeggio,
    stopThemePerformance,
    syncThemeAudioToCurtain,
  ])

  const toggleThemePerformance = () => {
    if (themePlayingRef.current) {
      stopThemePerformance()
      return
    }

    startThemePerformance()
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (event && activePointerIdRef.current !== event.pointerId) return

    event.preventDefault()

    const nextPlayer = findPlayerFromPoint(event.clientX, event.clientY)

    if (nextPlayer) {
      switchActivePlayer(nextPlayer)
    }
  }

  const releasePlayerArpeggio = (event: PointerEvent | ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return

    event.preventDefault()
    endPointerSession(true)
  }

  const cancelPlayerArpeggio = (event?: PointerEvent | ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current === null) return
    if (event && activePointerIdRef.current !== event.pointerId) return

    event?.preventDefault()
    endPointerSession(false)
  }

  const startPlayerArpeggio = (
    player: HomeOrchestraPlayer,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (themePlayingRef.current) return
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    if (activePointerIdRef.current !== null) return

    event.preventDefault()
    activePointerIdRef.current = event.pointerId
    activePointerTargetRef.current = event.currentTarget
    event.currentTarget.setPointerCapture?.(event.pointerId)
    switchActivePlayer(player)

    const pointerSessionController = new AbortController()
    pointerSessionControllerRef.current = pointerSessionController

    window.addEventListener('pointermove', handlePointerMove, {
      passive: false,
      signal: pointerSessionController.signal,
    })
    window.addEventListener('pointerup', releasePlayerArpeggio, {
      passive: false,
      signal: pointerSessionController.signal,
    })
    window.addEventListener('pointercancel', cancelPlayerArpeggio, {
      passive: false,
      signal: pointerSessionController.signal,
    })
  }

  const startKeyboardArpeggio = (
    player: HomeOrchestraPlayer,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (themePlayingRef.current) return
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return

    startArpeggio(player.triad, {
      onNoteStart: (note) => emitMusicNote(player.name, note),
      pan: player.pan,
    })
  }

  const releaseKeyboardArpeggio = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return

    releaseArpeggio()
  }

  useEffect(() => {
    return () => {
      activeNoteTweensRef.current.forEach((tween) => tween.kill())
      activeNoteTweensRef.current = []
      activeStarTweensRef.current.forEach((tween) => tween.kill())
      activeStarTweensRef.current = []
      stopPerformanceMovement(false)
      stopPerformanceNotes()
      themeAudioRef.current?.pause()
      noteLayerRef.current?.replaceChildren()
    }
  }, [stopPerformanceMovement, stopPerformanceNotes])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const startShortcutArpeggio = (event: globalThis.KeyboardEvent) => {
      if (themePlayingRef.current) return
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return

      const player = getShortcutPlayer(event.key)

      if (!player) return

      event.preventDefault()

      if (event.repeat && activeKeyboardShortcutRef.current === event.key) return
      if (activePointerIdRef.current !== null) return
      if (activeKeyboardShortcutRef.current === event.key) return

      activeKeyboardShortcutRef.current = event.key
      switchActivePlayer(player)
    }

    const releaseShortcutArpeggio = (event: globalThis.KeyboardEvent) => {
      if (activeKeyboardShortcutRef.current !== event.key) return

      event.preventDefault()
      activeKeyboardShortcutRef.current = null
      activePlayerNameRef.current = null
      setActivePlayerName(null)
      releaseArpeggio()
    }

    const cancelShortcutArpeggio = () => {
      if (activeKeyboardShortcutRef.current === null) return

      activeKeyboardShortcutRef.current = null
      activePlayerNameRef.current = null
      setActivePlayerName(null)
      stopArpeggio()
    }

    window.addEventListener('keydown', startShortcutArpeggio)
    window.addEventListener('keyup', releaseShortcutArpeggio)
    window.addEventListener('blur', cancelShortcutArpeggio)

    return () => {
      window.removeEventListener('keydown', startShortcutArpeggio)
      window.removeEventListener('keyup', releaseShortcutArpeggio)
      window.removeEventListener('blur', cancelShortcutArpeggio)
    }
  }, [releaseArpeggio, stopArpeggio, switchActivePlayer])

  useEffect(() => {
    const audio = themeAudioRef.current
    if (!audio) return

    audio.volume = THEME_AUDIO_VOLUME

    const handleEnded = () => {
      stopThemePerformance()
    }

    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [stopThemePerformance])

  useEffect(() => {
    if (typeof document === 'undefined') return

    document.documentElement.classList.toggle('is-home-theme-playing', isThemePlaying)

    return () => {
      document.documentElement.classList.remove('is-home-theme-playing')
    }
  }, [isThemePlaying])

  useEffect(() => {
    const starTimeScale = isThemePlaying ? 1.85 : 1

    activeStarTweensRef.current.forEach((tween) => {
      tween.timeScale(starTimeScale)
    })
  }, [isThemePlaying])

  useEffect(() => {
    if (!isThemePlaying) {
      setActivePoemLineIndex(0)
      return
    }

    if (typeof window === 'undefined') return

    setActivePoemLineIndex(0)
    const poemInterval = window.setInterval(() => {
      setActivePoemLineIndex((current) =>
        current >= THEME_POEM_LINE_KEYS.length - 1 ? 0 : current + 1,
      )
    }, THEME_POEM_LINE_INTERVAL_MS)

    return () => window.clearInterval(poemInterval)
  }, [isThemePlaying])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      const players = gsap.utils.toArray<HTMLImageElement>('.home-orchestra-player img')
      const sway = [1.8, 3.4, 1.2, 2.7, 2.1]
      const lift = [-3, -7, -2, -5, -4]
      const drift = [-2, 4, 1, -3, 2]
      const durations = [5.8, 4.7, 6.6, 5.2, 6.1]
      const delays = [0.7, 0.05, 1.15, 0.42, 1.65]

      players.forEach((player, index) => {
        gsap.fromTo(
          player,
          {
            rotation: -sway[index],
            x: -drift[index],
            y: 0,
            scale: 1,
          },
          {
            rotation: sway[index],
            x: drift[index],
            y: lift[index],
            scale: 1.018,
            transformOrigin: '50% 92%',
            duration: durations[index],
            delay: delays[index],
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          },
        )
      })

      gsap.to('.home-orchestra-mesh', {
        x: 36,
        y: -18,
        scale: 1.08,
        rotation: 2,
        duration: 12,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      })

      const stars = gsap.utils.toArray<HTMLElement>('.home-orchestra-star')

      activeStarTweensRef.current = []
      stars.forEach((star, index) => {
        gsap.set(star, {
          autoAlpha: gsap.utils.random(0.28, 0.54),
          scale: gsap.utils.random(0.8, 1.08),
        })

        const twinkle = gsap
          .timeline({
            delay: index * 0.09 + gsap.utils.random(0, 0.8),
            repeat: -1,
            repeatRefresh: true,
          })
          .to(star, {
            autoAlpha: () => gsap.utils.random(0.2, 0.42),
            duration: () => gsap.utils.random(1.4, 2.5),
            ease: 'sine.inOut',
            scale: () => gsap.utils.random(0.72, 0.95),
          })
          .to(star, {
            autoAlpha: () => gsap.utils.random(0.62, 0.9),
            duration: () => gsap.utils.random(0.48, 1.05),
            ease: 'sine.inOut',
            scale: () => gsap.utils.random(1.12, 1.5),
          })
          .to(star, {
            autoAlpha: () => gsap.utils.random(0.3, 0.54),
            duration: () => gsap.utils.random(1.2, 2.4),
            ease: 'sine.inOut',
            scale: () => gsap.utils.random(0.86, 1.08),
          })

        const drift = gsap.to(star, {
          delay: gsap.utils.random(0, 1.8),
          duration: () => gsap.utils.random(9, 16),
          ease: 'sine.inOut',
          repeat: -1,
          repeatRefresh: true,
          rotation: () => gsap.utils.random(-10, 10),
          x: () => gsap.utils.random(-44, 44),
          y: () => gsap.utils.random(-20, 26),
          yoyo: true,
        })

        activeStarTweensRef.current.push(twinkle, drift)
      })

      const getCurtainStartOffset = () => {
        const hero = heroRef.current
        if (!hero) return 0

        const { height, width } = hero.getBoundingClientRect()
        const curtainImageWidth = height * CURTAIN_IMAGE_ASPECT
        const curtainPeek = Math.min(
          CURTAIN_MAX_PEEK,
          Math.max(CURTAIN_MIN_PEEK, width * CURTAIN_PEEK_RATIO),
        )

        return Math.max(0, curtainImageWidth * CURTAIN_CLOTH_EDGE - curtainPeek)
      }

      gsap
        .timeline({
          scrollTrigger: {
            trigger: heroRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.9,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              syncThemeAudioToCurtain(self.progress)
              if (self.progress >= THEME_AUDIO_STOP_PROGRESS && themePlayingRef.current) {
                stopThemePerformance({ resetVolume: false })
              }
            },
          },
        })
        .to(
          '.home-orchestra-depth',
          {
            scale: 0.82,
            y: -30,
            filter: 'blur(0.8px)',
            transformOrigin: '50% 86%',
            ease: 'none',
          },
          0,
        )
        .fromTo(
          '.home-orchestra-curtain-cloth .home-orchestra-curtain-left',
          {
            x: () => -getCurtainStartOffset(),
            xPercent: 0,
          },
          {
            x: 0,
            xPercent: 0,
            ease: 'none',
          },
          0,
        )
        .fromTo(
          '.home-orchestra-curtain-cloth .home-orchestra-curtain-right',
          {
            x: () => getCurtainStartOffset(),
            xPercent: 0,
          },
          {
            x: 0,
            xPercent: 0,
            ease: 'none',
          },
          0,
        )
        .to(
          '.home-orchestra-copy',
          {
            y: -42,
            autoAlpha: 0.72,
            ease: 'none',
          },
          0,
        )
    }, heroRef)

    return () => ctx.revert()
  }, [stopThemePerformance, syncThemeAudioToCurtain])

  const heroClassName = ['home-orchestra-hero', isThemePlaying ? 'is-theme-playing' : '']
    .filter(Boolean)
    .join(' ')
  const activePoemLine = t(THEME_POEM_LINE_KEYS[activePoemLineIndex])

  return (
    <section className={heroClassName} ref={heroRef}>
      <audio ref={themeAudioRef} src={THEME_AUDIO_SRC} preload="auto" loop />
      <div className="home-orchestra-depth">
        <img
          src={orchestraAsset('hero_night_background.png')}
          className="home-orchestra-bg"
          alt=""
          draggable={false}
        />
        <div className="home-orchestra-scrim" />
        <div className="home-orchestra-mesh" />
        <div className="home-orchestra-stars">
          {STAR_POINTS.map(([left, top, size]) => (
            <span
              key={`${left}:${top}`}
              className="home-orchestra-star"
              style={{ left, top, width: size, height: size }}
            />
          ))}
        </div>

        <div className="home-orchestra-stage" role="group" aria-label={t('home.orchestra.notes')}>
          {ORCHESTRA_PLAYERS.map((player) => (
            <button
              key={player.name}
              type="button"
              className={`home-orchestra-player home-orchestra-${player.name}${
                activePlayerName === player.name ? ' is-playing' : ''
              }${hoveredPlayerName === player.name ? ' is-hovered' : ''}`}
              aria-label={t(player.ariaKey)}
              data-orchestra-player={player.name}
              disabled={isThemePlaying}
              onBlur={() => cancelPlayerArpeggio()}
              onContextMenu={(event) => event.preventDefault()}
              onDragStart={(event) => event.preventDefault()}
              onFocus={() => playPlayerNote(player)}
              onKeyDown={(event) => startKeyboardArpeggio(player, event)}
              onKeyUp={releaseKeyboardArpeggio}
              onPointerCancel={cancelPlayerArpeggio}
              onPointerDown={(event) => startPlayerArpeggio(player, event)}
              onPointerEnter={() => {
                if (themePlayingRef.current) return
                setHoveredPlayerName(player.name)
                if (activePointerIdRef.current === null) {
                  playPlayerNote(player)
                }
              }}
              onPointerLeave={() => {
                if (themePlayingRef.current) return
                if (activePointerIdRef.current === null) {
                  setHoveredPlayerName((current) => (current === player.name ? null : current))
                }
              }}
              onPointerUp={releasePlayerArpeggio}
            >
              <span className="home-orchestra-player-art">
                <img
                  src={orchestraAsset(player.image)}
                  alt=""
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                />
              </span>
            </button>
          ))}
          {isThemePlaying && (
            <button
              type="button"
              className="home-orchestra-theme-toggle home-orchestra-stage-pause is-playing"
              aria-label={t('home.hero.theme.pause')}
              aria-pressed="true"
              onClick={toggleThemePerformance}
              title={t('home.hero.theme.pause')}
            >
              <Pause aria-hidden="true" size={23} strokeWidth={3} />
            </button>
          )}
        </div>
        <div className="home-orchestra-notes" ref={noteLayerRef} aria-hidden="true" />
        <div className="home-orchestra-footlights" />
      </div>

      <div className="home-orchestra-poem" aria-hidden={!isThemePlaying} aria-live="polite">
        {isThemePlaying && (
          <p className="home-orchestra-poem-line" key={activePoemLineIndex}>
            <PoemLineText text={activePoemLine} />
          </p>
        )}
      </div>

      <div className="home-orchestra-curtain-cloth" aria-hidden="true">
        <div className="home-orchestra-curtain-panel home-orchestra-curtain-left">
          <img
            src={orchestraAsset('curtain_stage_half.png')}
            className="home-orchestra-curtain-image home-orchestra-curtain-image-cloth"
            alt=""
            draggable={false}
          />
        </div>
        <div className="home-orchestra-curtain-panel home-orchestra-curtain-right">
          <img
            src={orchestraAsset('curtain_stage_half.png')}
            className="home-orchestra-curtain-image home-orchestra-curtain-image-cloth"
            alt=""
            draggable={false}
          />
        </div>
      </div>

      <div className="home-orchestra-copy">
        <p className="home-orchestra-eyebrow">{t('home.hero.eyebrow')}</p>
        <TypingSlogan isZh={isZh} />
        <div className="home-orchestra-actions">
          <a
            href={discoverServersHref}
            className="btn-secondary home-orchestra-discover-link"
            style={{ textDecoration: 'none' }}
          >
            {t('home.hero.discoverServers')}
          </a>
          {!isThemePlaying && (
            <button
              type="button"
              className="home-orchestra-theme-toggle"
              aria-label={t('home.hero.theme.play')}
              aria-pressed="false"
              onClick={toggleThemePerformance}
              title={t('home.hero.theme.play')}
            >
              <Play aria-hidden="true" size={24} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
