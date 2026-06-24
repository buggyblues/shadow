import {
  type Arena,
  animationManager,
  bootstrapCards,
  type CardCommand,
  DeskLoop,
  drawArenas,
  drawConstraints,
  parseCommand,
} from '@shadowob/flash-cards'
import type { Card } from '@shadowob/flash-types'
import {
  cardMetaWithLayout,
  type FlashArena,
  type FlashBoardSnapshot,
  type FlashCard,
  type FlashCommandEvent,
  type FlashSelection,
  type FlashViewport,
} from '@shadowob/flash-types/server-app'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  authorizeShadowOAuth,
  executeCardCommand,
  flashAccessMode,
  getBoard,
  getBoardEvents,
  getOAuthSession,
  subscribeAppEvents,
  updateBoardViewport,
  updateCard,
  updateSelection,
} from './api.js'

bootstrapCards()

function isOAuthAccessDenied(error: unknown) {
  return error instanceof Error && error.message === 'access_denied'
}

function toEngineCard(card: FlashCard): Card {
  const { layout: _layout, createdBy: _createdBy, ...base } = card
  return {
    ...base,
    meta: cardMetaWithLayout(card),
  }
}

function toEngineArena(arena: FlashArena): Omit<Arena, 'activated' | 'activationCount'> {
  return {
    id: arena.id,
    kind: arena.kind,
    shape: arena.kind === 'grid' ? 'rect' : 'circle',
    label: arena.label,
    x: arena.x,
    y: arena.y,
    radius: arena.radius,
    halfHeight: arena.radius * 0.7,
    color: arena.color,
    cardIds: arena.cardIds,
    script: arena.script ?? undefined,
  } as Omit<Arena, 'activated' | 'activationCount'>
}

function syncArenas(loop: DeskLoop, arenas: FlashArena[]) {
  const nextIds = new Set(arenas.map((arena) => arena.id))
  for (const existing of loop.arenaManager.getAll()) {
    if (!nextIds.has(existing.id)) {
      loop.arenaManager.remove(existing.id)
    }
  }

  for (const arena of arenas) {
    const current = loop.arenaManager.get(arena.id)
    const next = toEngineArena(arena)
    if (current) {
      Object.assign(current, next)
      continue
    }
    Object.assign(loop.arenaManager.create(next), next)
  }
}

function drawArenaLayer(canvas: HTMLCanvasElement, loop: DeskLoop) {
  const ctx = canvas.getContext('2d')
  const renderer = loop.getRenderer()
  if (!ctx || !renderer) return

  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const dpr = renderer.getDpr()
  const pixelWidth = Math.round(width * dpr)
  const pixelHeight = Math.round(height * dpr)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const viewport = {
    offsetX: renderer.getViewOffset().x,
    offsetY: renderer.getViewOffset().y,
    zoom: renderer.getViewZoom(),
    dpr,
    screenW: width,
    screenH: height,
    zoomSettled: true,
  }
  drawArenas(ctx, loop.arenaManager.getAll(), viewport, width, height, performance.now(), null)
  drawConstraints(ctx, loop.getConstraintsMap(), viewport)
}

function replaceById<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((existing) => existing.id === item.id)
  if (index === -1) return [...items, item]
  return items.map((existing, current) => (current === index ? item : existing))
}

function replaceSelection(items: FlashSelection[], item: FlashSelection) {
  const index = items.findIndex((existing) => existing.actorId === item.actorId)
  if (index === -1) return [...items, item]
  return items.map((existing, current) => (current === index ? item : existing))
}

const LAYOUT_SYNC_DEBOUNCE_MS = 220
const LAYOUT_SYNC_RETRY_MS = 80
const LAYOUT_SETTLE_RETRY_MS = 120
const LAYOUT_SETTLE_MAX_MS = 900
const LAYOUT_SETTLE_SPEED = 0.05
const LAYOUT_SETTLE_ANGULAR_SPEED = 0.003

type LayoutDraft = Pick<FlashCard['layout'], 'x' | 'y' | 'angle'> & { revision: number }
type LayoutBody = {
  position: { x: number; y: number }
  angle: number
  velocity?: { x: number; y: number }
  speed?: number
  angularVelocity?: number
  angularSpeed?: number
}

interface ApplyFlashEventsOptions {
  localMovingIds?: Set<string>
  layoutGuards?: Map<string, LayoutDraft>
  onLayoutRevisionSettled?: (cardId: string, revision: number) => void
}

function cardWithLayout(card: FlashCard, layout: Pick<LayoutDraft, 'x' | 'y' | 'angle'>) {
  return {
    ...card,
    layout: {
      ...card.layout,
      x: layout.x,
      y: layout.y,
      angle: layout.angle,
    },
  }
}

function cardPatchClientRevision(event: FlashCommandEvent, cardId: string) {
  if (!event.command || typeof event.command !== 'object' || Array.isArray(event.command)) {
    return undefined
  }
  const command = event.command as Record<string, unknown>
  if (typeof command.cardId === 'string' && command.cardId !== cardId) return undefined
  const revision = command.clientRevision
  return typeof revision === 'number' && Number.isInteger(revision) && revision >= 0
    ? revision
    : undefined
}

function applyCardPatch(
  cards: FlashCard[],
  card: FlashCard,
  event: FlashCommandEvent,
  options: ApplyFlashEventsOptions,
) {
  const guard = options.layoutGuards?.get(card.id)
  const isMoving = options.localMovingIds?.has(card.id) === true
  if (guard) {
    const revision = cardPatchClientRevision(event, card.id)
    if (isMoving || revision === undefined || revision < guard.revision) {
      return replaceById(cards, cardWithLayout(card, guard))
    }
    options.onLayoutRevisionSettled?.(card.id, revision)
  } else if (isMoving) {
    return cards
  }
  return replaceById(cards, card)
}

function layoutFromBody(body: LayoutBody, revision: number): LayoutDraft {
  return {
    x: body.position.x,
    y: body.position.y,
    angle: body.angle,
    revision,
  }
}

function bodyIsSettling(body: LayoutBody) {
  const speed = body.speed ?? Math.hypot(body.velocity?.x ?? 0, body.velocity?.y ?? 0)
  const angularSpeed = body.angularSpeed ?? Math.abs(body.angularVelocity ?? 0)
  return speed > LAYOUT_SETTLE_SPEED || angularSpeed > LAYOUT_SETTLE_ANGULAR_SPEED
}

function applyFlashEvents(
  snapshot: FlashBoardSnapshot,
  events: FlashCommandEvent[],
  options: ApplyFlashEventsOptions = {},
) {
  let board = snapshot.board
  let cards = snapshot.cards
  let arenas = snapshot.arenas
  let selections = snapshot.selections
  let cursor = snapshot.cursor

  const orderedEvents = [...events].sort((a, b) => a.seq - b.seq)
  for (const event of orderedEvents) {
    if (event.seq <= cursor) continue
    cursor = Math.max(cursor, event.seq)
    for (const patch of event.patches) {
      if (patch.type === 'card.created' || patch.type === 'card.updated') {
        cards = applyCardPatch(cards, patch.card, event, options)
      } else if (patch.type === 'card.deleted') {
        cards = cards.filter((card) => card.id !== patch.cardId)
      } else if (patch.type === 'cards.updated') {
        for (const card of patch.cards) {
          cards = applyCardPatch(cards, card, event, options)
        }
      } else if (patch.type === 'arena.created' || patch.type === 'arena.updated') {
        arenas = replaceById(arenas, patch.arena)
      } else if (patch.type === 'arena.deleted') {
        arenas = arenas.filter((arena) => arena.id !== patch.arenaId)
      } else if (patch.type === 'board.viewport.updated') {
        board = { ...board, viewport: patch.viewport, updatedAt: event.createdAt }
      } else if (patch.type === 'selection.updated') {
        selections = replaceSelection(selections, patch.selection)
      }
    }
  }

  const eventLog = new Map<string, FlashCommandEvent>()
  for (const event of [...orderedEvents, ...snapshot.events]) eventLog.set(event.id, event)

  return {
    ...snapshot,
    board,
    cards,
    arenas,
    selections,
    cursor,
    events: Array.from(eventLog.values())
      .sort((a, b) => b.seq - a.seq)
      .slice(0, 40),
  }
}

function useBoardSnapshot(enabled: boolean) {
  const query = useQuery({
    queryKey: ['flash-board'],
    queryFn: () => getBoard(),
    enabled,
  })
  return {
    ...query,
    snapshot: query.data?.snapshot ?? null,
  }
}

export function FlashApp() {
  const queryClient = useQueryClient()
  const accessMode = flashAccessMode()
  const oauthGateEnabled = accessMode !== 'local-dev'
  const { data: oauthSession, isLoading: oauthLoading } = useQuery({
    queryKey: ['flash-oauth-session', accessMode],
    queryFn: getOAuthSession,
    enabled: oauthGateEnabled,
    retry: false,
  })
  const oauthRequired = oauthGateEnabled && oauthSession?.required !== false
  const oauthReady = !oauthGateEnabled || oauthSession?.authenticated === true
  const authorized = accessMode !== 'unauthorized' && oauthReady
  const { snapshot, isLoading, error, refetch } = useBoardSnapshot(authorized)
  const snapshotRef = useRef<FlashBoardSnapshot | null>(null)
  const cardsRef = useRef<Card[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const arenaCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const animMountRef = useRef<HTMLDivElement | null>(null)
  const loopRef = useRef<DeskLoop | null>(null)
  const selectedIdsRef = useRef<Set<string>>(new Set())
  const dragCardIdRef = useRef<string | null>(null)
  const layoutRevisionRef = useRef(0)
  const layoutGuardsRef = useRef<Map<string, LayoutDraft>>(new Map())
  const pendingLayoutCardIdsRef = useRef<Set<string>>(new Set())
  const layoutSettleStartedAtRef = useRef<number | null>(null)
  const layoutSaveTimerRef = useRef<number | null>(null)
  const layoutFlushInFlightRef = useRef(false)
  const flushLayoutsRef = useRef<() => Promise<void>>(async () => undefined)
  const persistLayoutsRef = useRef<(cardIds: string[]) => void>(() => undefined)
  const persistSelectionRef = useRef<(ids: Set<string>, anchorCardId?: string | null) => void>(
    () => undefined,
  )
  const persistViewportRef = useRef<(viewport: FlashViewport) => void>(() => undefined)
  const pendingViewportRef = useRef<{ boardId: string; viewport: FlashViewport } | null>(null)
  const viewportSaveTimerRef = useRef<number | null>(null)
  const selectionSaveTimerRef = useRef<number | null>(null)
  const selectionRevisionRef = useRef(0)
  const oauthPopupPollRef = useRef<number | null>(null)
  const runCardCommandRef = useRef<
    (command: CardCommand, options?: { optimistic?: boolean }) => void
  >(() => undefined)
  const hasFocusedInitialCardsRef = useRef(false)
  const restoredViewportBoardRef = useRef<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandText, setCommandText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [oauthPopupOpen, setOauthPopupOpen] = useState(false)

  snapshotRef.current = snapshot

  const cards = useMemo(() => snapshot?.cards.map(toEngineCard) ?? [], [snapshot?.cards])
  cardsRef.current = cards

  const setSnapshot = useCallback(
    (next: FlashBoardSnapshot) => {
      snapshotRef.current = next
      queryClient.setQueryData(['flash-board'], { snapshot: next })
    },
    [queryClient],
  )

  const scheduleLayoutFlush = useCallback((delay = LAYOUT_SYNC_DEBOUNCE_MS) => {
    if (layoutSaveTimerRef.current !== null) {
      window.clearTimeout(layoutSaveTimerRef.current)
    }
    layoutSaveTimerRef.current = window.setTimeout(() => {
      layoutSaveTimerRef.current = null
      void flushLayoutsRef.current()
    }, delay)
  }, [])

  const settleLayoutRevision = useCallback((cardId: string, revision: number) => {
    const guard = layoutGuardsRef.current.get(cardId)
    if (guard && revision >= guard.revision) {
      layoutGuardsRef.current.delete(cardId)
    }
  }, [])

  const applyEvents = useCallback(
    (events: FlashCommandEvent[]) => {
      const current = snapshotRef.current
      if (!current || events.length === 0) return
      const scopedEvents = events.filter((event) => event.boardId === current.board.id)
      if (scopedEvents.length === 0) return
      const moving = new Set<string>()
      if (dragCardIdRef.current) moving.add(dragCardIdRef.current)
      setSnapshot(
        applyFlashEvents(current, scopedEvents, {
          localMovingIds: moving,
          layoutGuards: layoutGuardsRef.current,
          onLayoutRevisionSettled: settleLayoutRevision,
        }),
      )
    },
    [setSnapshot, settleLayoutRevision],
  )

  const commandMutation = useMutation({
    mutationFn: (command: CardCommand) =>
      executeCardCommand({ boardId: snapshotRef.current?.board.id, command }),
    onSuccess: (data) => {
      applyEvents(data.events)
      const result = data.result as { success?: boolean; error?: string } | null
      setMessage(result?.success === false ? result.error || 'Command failed' : 'Synced')
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : 'Command failed'),
  })

  const refreshOAuthSession = useCallback(() => {
    setOauthPopupOpen(false)
    if (oauthPopupPollRef.current !== null) {
      window.clearInterval(oauthPopupPollRef.current)
      oauthPopupPollRef.current = null
    }
    void queryClient.invalidateQueries({ queryKey: ['flash-oauth-session', accessMode] })
  }, [accessMode, queryClient])

  const startOAuth = useCallback(() => {
    const authorizeUrl = oauthSession?.authorizeUrl
    if (!authorizeUrl) return

    setOauthPopupOpen(true)

    const openInCurrentFrame = () => {
      window.location.assign(authorizeUrl)
    }

    void authorizeShadowOAuth(authorizeUrl)
      .then((result) => {
        if (result.opened) return
        setOauthPopupOpen(false)
        openInCurrentFrame()
      })
      .catch((error: unknown) => {
        setOauthPopupOpen(false)
        if (isOAuthAccessDenied(error)) {
          setMessage('OAuth authorization was denied')
          return
        }
        openInCurrentFrame()
      })
  }, [oauthSession?.authorizeUrl, refreshOAuthSession])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (!data || typeof data !== 'object' || data.type !== 'flash.oauth.completed') return
      refreshOAuthSession()
    }
    window.addEventListener('message', handler)
    return () => {
      window.removeEventListener('message', handler)
      if (oauthPopupPollRef.current !== null) {
        window.clearInterval(oauthPopupPollRef.current)
        oauthPopupPollRef.current = null
      }
    }
  }, [refreshOAuthSession])

  const persistSelection = useCallback(
    (ids: Set<string>, anchorCardId?: string | null) => {
      const boardId = snapshotRef.current?.board.id
      if (!boardId) return
      if (selectionSaveTimerRef.current !== null) {
        window.clearTimeout(selectionSaveTimerRef.current)
      }
      const selectedCardIds = Array.from(ids)
      selectionRevisionRef.current += 1
      const revision = selectionRevisionRef.current
      selectionSaveTimerRef.current = window.setTimeout(async () => {
        selectionSaveTimerRef.current = null
        try {
          const data = await updateSelection({
            boardId,
            selectedCardIds,
            anchorCardId: anchorCardId ?? selectedCardIds[0] ?? null,
            revision,
          })
          applyEvents(data.events)
        } catch (err) {
          setMessage(err instanceof Error ? err.message : 'Selection sync failed')
        }
      }, 120)
    },
    [applyEvents],
  )

  const persistLayouts = useCallback(
    (cardIds: string[]) => {
      const bodies = loopRef.current?.getBodiesMap()
      if (!snapshotRef.current?.board.id || !bodies || cardIds.length === 0) return

      layoutRevisionRef.current += 1
      const revision = layoutRevisionRef.current
      for (const cardId of new Set(cardIds)) {
        const body = bodies.get(cardId)
        if (!body) continue
        const layout = layoutFromBody(body, revision)
        pendingLayoutCardIdsRef.current.add(cardId)
        layoutGuardsRef.current.set(cardId, layout)
      }
      if (pendingLayoutCardIdsRef.current.size === 0) return
      layoutSettleStartedAtRef.current ??= performance.now()
      scheduleLayoutFlush()
    },
    [scheduleLayoutFlush],
  )

  const flushPendingLayouts = useCallback(async () => {
    const boardId = snapshotRef.current?.board.id
    const bodies = loopRef.current?.getBodiesMap()
    if (!boardId || !bodies || pendingLayoutCardIdsRef.current.size === 0) return
    if (layoutFlushInFlightRef.current) {
      scheduleLayoutFlush(LAYOUT_SYNC_RETRY_MS)
      return
    }

    const now = performance.now()
    const settleStartedAt = layoutSettleStartedAtRef.current ?? now
    const layouts: Array<[string, LayoutDraft]> = []
    let stillSettling = false
    for (const cardId of pendingLayoutCardIdsRef.current) {
      const body = bodies.get(cardId)
      if (!body) continue
      const revision = layoutGuardsRef.current.get(cardId)?.revision ?? layoutRevisionRef.current
      const layout = layoutFromBody(body, revision)
      layouts.push([cardId, layout])
      layoutGuardsRef.current.set(cardId, layout)
      stillSettling ||= bodyIsSettling(body)
    }
    if (layouts.length === 0) {
      pendingLayoutCardIdsRef.current.clear()
      layoutSettleStartedAtRef.current = null
      return
    }
    if (stillSettling && now - settleStartedAt < LAYOUT_SETTLE_MAX_MS) {
      scheduleLayoutFlush(LAYOUT_SETTLE_RETRY_MS)
      return
    }

    pendingLayoutCardIdsRef.current.clear()
    layoutSettleStartedAtRef.current = null
    layoutFlushInFlightRef.current = true
    try {
      const results = await Promise.all(
        layouts.map(([cardId, layout]) =>
          updateCard({
            boardId,
            cardId,
            clientRevision: layout.revision,
            x: layout.x,
            y: layout.y,
            angle: layout.angle,
          }),
        ),
      )
      const events: FlashCommandEvent[] = []
      for (const result of results) events.push(...result.events)
      applyEvents(events)
    } catch (err) {
      for (const [cardId, layout] of layouts) {
        const guard = layoutGuardsRef.current.get(cardId)
        if (
          guard &&
          guard.revision <= layout.revision &&
          !pendingLayoutCardIdsRef.current.has(cardId)
        ) {
          layoutGuardsRef.current.delete(cardId)
        }
      }
      if (pendingLayoutCardIdsRef.current.size === 0) void refetch()
      setMessage(err instanceof Error ? err.message : 'Layout sync failed')
    } finally {
      layoutFlushInFlightRef.current = false
      if (pendingLayoutCardIdsRef.current.size > 0) {
        scheduleLayoutFlush(LAYOUT_SYNC_RETRY_MS)
      }
    }
  }, [applyEvents, refetch, scheduleLayoutFlush])

  const persistViewport = useCallback(
    (viewport: FlashViewport) => {
      const boardId = snapshotRef.current?.board.id
      if (!boardId) return
      pendingViewportRef.current = { boardId, viewport }
      if (viewportSaveTimerRef.current !== null) {
        window.clearTimeout(viewportSaveTimerRef.current)
      }
      viewportSaveTimerRef.current = window.setTimeout(async () => {
        viewportSaveTimerRef.current = null
        const pending = pendingViewportRef.current
        if (!pending) return
        try {
          const data = await updateBoardViewport({
            boardId: pending.boardId,
            viewport: pending.viewport,
          })
          applyEvents(data.events)
        } catch (err) {
          setMessage(err instanceof Error ? err.message : 'Viewport sync failed')
        }
      }, 600)
    },
    [applyEvents],
  )

  useEffect(
    () => () => {
      if (layoutSaveTimerRef.current !== null) {
        window.clearTimeout(layoutSaveTimerRef.current)
      }
      if (viewportSaveTimerRef.current !== null) {
        window.clearTimeout(viewportSaveTimerRef.current)
      }
      if (selectionSaveTimerRef.current !== null) {
        window.clearTimeout(selectionSaveTimerRef.current)
      }
    },
    [],
  )

  const runCardCommand = useCallback(
    (command: CardCommand, options: { optimistic?: boolean } = {}) => {
      if (options.optimistic !== false) {
        const result = loopRef.current?.dispatchCommand(command)
        if (result?.success === false) {
          setMessage(result.error || 'Command failed')
        }
      }
      commandMutation.mutate(command)
    },
    [commandMutation],
  )

  persistLayoutsRef.current = (ids) => {
    void persistLayouts(ids)
  }
  flushLayoutsRef.current = flushPendingLayouts
  persistSelectionRef.current = persistSelection
  persistViewportRef.current = persistViewport
  runCardCommandRef.current = runCardCommand

  const runTextCommand = useCallback(() => {
    const command = parseServerCommand(commandText, cardsRef.current)
    if (!command) {
      setMessage('Unknown command')
      return
    }
    setCommandText('')
    setCommandOpen(false)
    runCardCommand(command)
  }, [commandText, runCardCommand])

  useEffect(() => {
    if (animMountRef.current) {
      animationManager.setMountElement(animMountRef.current)
    }
    return () => animationManager.destroyAll()
  }, [])

  useEffect(() => {
    if (!snapshot?.board.id) return
    let closed = false
    const syncFromCursor = async () => {
      const current = snapshotRef.current
      if (!current) return
      try {
        const data = await getBoardEvents({
          boardId: current.board.id,
          after: current.cursor,
          limit: 200,
        })
        if (!closed) applyEvents(data.events)
      } catch (err) {
        if (!closed) setMessage(err instanceof Error ? err.message : 'Event sync failed')
      }
    }
    const unsubscribe = subscribeAppEvents(snapshot.board.id, (event) => {
      if (event.type === 'flash.events') {
        applyEvents(event.events)
        return
      }
      if (event.command === 'boards.get' || event.command === 'boards.events') return
      void syncFromCursor()
    })
    return () => {
      closed = true
      unsubscribe()
    }
  }, [applyEvents, snapshot?.board.id])

  useLayoutEffect(() => {
    if (!snapshot?.board.id) return
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas || loopRef.current) return

    const loop = new DeskLoop({ renderer: { backend: 'webgl' } })
    loopRef.current = loop
    loop.mount(canvas, container, cardsRef.current, {
      onCardTap: (cardId) => {
        const ids = new Set([cardId])
        selectedIdsRef.current = ids
        loop.updateSelectedCards(ids)
        persistSelectionRef.current(ids, cardId)
      },
      onSelectionChange: (ids) => {
        selectedIdsRef.current = ids
        persistSelectionRef.current(ids)
      },
      onDragChange: (cardId) => {
        if (cardId) {
          dragCardIdRef.current = cardId
          return
        }
        const dragged = dragCardIdRef.current
        dragCardIdRef.current = null
        if (!dragged) return
        const selected = selectedIdsRef.current
        const ids = selected.has(dragged) && selected.size > 1 ? Array.from(selected) : [dragged]
        persistLayoutsRef.current(ids)
      },
      onCardFlip: (cardId) =>
        runCardCommandRef.current(
          { name: 'flip', cardId, params: { face: 'toggle' }, timestamp: Date.now() },
          { optimistic: false },
        ),
      onLinkRequest: (fromId, toId) =>
        runCardCommandRef.current({
          name: 'link',
          cardId: fromId,
          params: { targetId: toId },
          timestamp: Date.now(),
        }),
      onArenaDelta: (arenaId, dwx, dwy) => {
        const arena = loop.arenaManager.get(arenaId)
        if (!arena) return
        arena.x += dwx
        arena.y += dwy
      },
      onArenaResize: (arenaId, radius, hasHalfHeight) => {
        const arena = loop.arenaManager.get(arenaId)
        if (!arena) return
        arena.radius = radius
        if (hasHalfHeight) arena.halfHeight = radius * 0.7
      },
      onViewportChange: (viewport) => persistViewportRef.current(viewport),
      getArenas: () => loop.arenaManager.getAll(),
    })
    if (arenaCanvasRef.current) {
      drawArenaLayer(arenaCanvasRef.current, loop)
    }
    return () => {
      loop.destroy()
      loopRef.current = null
    }
  }, [snapshot?.board.id])

  useEffect(() => {
    hasFocusedInitialCardsRef.current = false
    restoredViewportBoardRef.current = null
    pendingViewportRef.current = null
    pendingLayoutCardIdsRef.current.clear()
    layoutSettleStartedAtRef.current = null
    layoutGuardsRef.current.clear()
    layoutFlushInFlightRef.current = false
    if (layoutSaveTimerRef.current !== null) {
      window.clearTimeout(layoutSaveTimerRef.current)
      layoutSaveTimerRef.current = null
    }
  }, [snapshot?.board.id])

  useEffect(() => {
    const loop = loopRef.current
    if (!loop) return
    const preserveLayoutIds = new Set(layoutGuardsRef.current.keys())
    if (dragCardIdRef.current) preserveLayoutIds.add(dragCardIdRef.current)
    loop.syncCards(cards, { preserveLayoutIds })
    if (snapshot?.arenas) syncArenas(loop, snapshot.arenas)
    if (snapshot?.board.id && restoredViewportBoardRef.current !== snapshot.board.id) {
      restoredViewportBoardRef.current = snapshot.board.id
      if (snapshot.board.viewport) {
        hasFocusedInitialCardsRef.current = true
        loop.setViewport(snapshot.board.viewport)
      } else if (cards.length > 0) {
        hasFocusedInitialCardsRef.current = true
        loop.focusCards(cards)
      }
      return
    }
    if (cards.length > 0 && !hasFocusedInitialCardsRef.current) {
      hasFocusedInitialCardsRef.current = true
      loop.focusCards(cards)
    }
  }, [cards, snapshot?.arenas, snapshot?.board.id, snapshot?.board.viewport])

  useEffect(() => {
    const loop = loopRef.current
    if (!loop || !snapshot) return
    const ownSelection = snapshot.selections.find(
      (selection) => selection.actorId === snapshot.actor.id,
    )
    if (!ownSelection) return
    const ids = new Set(ownSelection.selectedCardIds)
    selectedIdsRef.current = ids
    loop.updateSelectedCards(ids)
  }, [snapshot?.actor.id, snapshot?.selections])

  useEffect(() => {
    const canvas = arenaCanvasRef.current
    if (!canvas) return
    let frame = 0
    const tick = () => {
      const loop = loopRef.current
      if (loop) drawArenaLayer(canvas, loop)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [snapshot?.board.id])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 2200)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement

      if (commandOpen) {
        if (event.key === 'Escape') {
          setCommandOpen(false)
          setCommandText('')
        }
        return
      }

      if (
        !isTyping &&
        (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key === 'k'))
      ) {
        event.preventDefault()
        setCommandOpen(true)
        return
      }

      if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace')) {
        const ids = Array.from(selectedIdsRef.current)
        if (ids.length === 0) return
        event.preventDefault()
        for (const cardId of ids) {
          runCardCommand({
            name: 'trash',
            cardId,
            params: { animation: 'shrink' },
            timestamp: Date.now(),
          })
        }
        selectedIdsRef.current = new Set()
        loopRef.current?.updateSelectedCards(new Set())
        persistSelectionRef.current(new Set())
        return
      }

      if (!isTyping && event.key === 'Escape') {
        selectedIdsRef.current = new Set()
        loopRef.current?.updateSelectedCards(new Set())
        persistSelectionRef.current(new Set())
        return
      }

      if (!isTyping && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        const ids = new Set(cardsRef.current.map((card) => card.id))
        selectedIdsRef.current = ids
        loopRef.current?.updateSelectedCards(ids)
        persistSelectionRef.current(ids)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandOpen, runCardCommand])

  if (oauthGateEnabled && oauthLoading) {
    return <main className="flash-canvas-shell flash-center">Checking authorization...</main>
  }

  if (!authorized) {
    const hasShadowLaunch = accessMode !== 'unauthorized'
    const alreadyAuthorized = oauthSession?.authenticated === true
    return (
      <main className="flash-canvas-shell flash-center">
        <section className="flash-auth-gate">
          <span>Flash App</span>
          <h1>{alreadyAuthorized ? 'Open Flash from Shadow.' : 'Authorize Flash with Shadow.'}</h1>
          <p>
            {hasShadowLaunch
              ? 'Flash needs your Shadow OAuth approval before it opens this server board.'
              : 'Flash stores cards per Shadow user and Buddy owner. Authorize first, then open it from the Shadow server App page.'}
          </p>
          {!alreadyAuthorized && oauthSession?.authorizeUrl ? (
            <button
              className="flash-auth-button"
              type="button"
              onClick={startOAuth}
              disabled={oauthPopupOpen}
            >
              {oauthPopupOpen ? 'Complete OAuth authorization' : 'Continue to Shadow OAuth'}
            </button>
          ) : null}
          {!alreadyAuthorized && oauthSession?.configured === false ? (
            <p className="flash-auth-note">
              OAuth is not configured for this Flash instance. Set the Flash OAuth client id and
              secret, then restart the integration.
            </p>
          ) : null}
        </section>
      </main>
    )
  }

  if (isLoading) {
    return <main className="flash-canvas-shell flash-center">Loading Flash...</main>
  }

  if (!snapshot || error) {
    return (
      <main className="flash-canvas-shell flash-center">
        <button className="flash-retry" type="button" onClick={() => refetch()}>
          Retry
        </button>
      </main>
    )
  }

  return (
    <main className="flash-canvas-shell">
      <div ref={animMountRef} className="flash-hidden-mount" aria-hidden="true" />
      <div ref={containerRef} className="physics-desk flash-server-desk">
        <canvas ref={arenaCanvasRef} className="flash-arena-canvas" />
        <canvas ref={canvasRef} className="flash-card-canvas" />
        {snapshot.cards.length === 0 && !commandOpen ? (
          <button className="flash-empty-hint" type="button" onClick={() => setCommandOpen(true)}>
            Press / to add cards or run board commands
          </button>
        ) : null}
      </div>

      {commandOpen ? (
        <form
          className="flash-command"
          onSubmit={(event) => {
            event.preventDefault()
            runTextCommand()
          }}
        >
          <span>/</span>
          <input
            autoFocus
            value={commandText}
            onChange={(event) => setCommandText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setCommandOpen(false)
                setCommandText('')
              }
            }}
            placeholder="add kind=inspiration title=Idea | arena magic-circle | scan 0"
          />
        </form>
      ) : null}

      {message ? <div className="flash-toast">{message}</div> : null}
    </main>
  )
}

function parseServerCommand(text: string, cards: Card[]) {
  const normalized = text.trim().startsWith('/') ? text.trim() : `/${text.trim()}`
  return parseCommand(normalized, cards)
}
