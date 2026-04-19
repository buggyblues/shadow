// ══════════════════════════════════════════════════════════════
// PhysicsDesk — WebGL infinite-canvas card desk component
//
// Renders all cards on a WebGL canvas with Matter.js physics.
// Provides: hover overlay, rubber-band multi-select, batch actions.
// ══════════════════════════════════════════════════════════════

import type { CommandResult } from '@shadowob/flash-cards'
import { drawArenas } from '@shadowob/flash-cards'
import {
  ArrowRight,
  Bot,
  Edit3,
  Layers,
  Link2,
  Loader2,
  Sparkles,
  Split,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import type Matter from 'matter-js'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { CARD_H, CARD_W, drawConstraints, drawHighlight, getHighlight } from '../ecs'
import { DeskLoop } from '../ecs/DeskLoop'
import { animationManager } from '../ecs/resources/animationManager'
import type { Card } from '../types'

// ─────────────────────────────────────
// Props
// ─────────────────────────────────────

export interface PhysicsDeskHandle {
  executeCommand: (text: string) => CommandResult | null
}

interface PhysicsDeskProps {
  cards: Card[]
  hiddenCardIds?: Set<string>
  linkingCardId: string | null
  linkingMode?: { outlineId: string; deckId: string } | null
  onLinkCard: (id: string) => void
  onLinkToOutline?: (deckId: string, outlineId: string, cardId: string) => void
  onDetail: (card: Card) => void
  onDelete: (id: string) => void
  onLink: (id: string) => void
  onConvert: (card: Card, strategy: 'auto' | 'expand' | 'refine' | 'decompose') => void
  onDirectMove: (id: string) => void
  convertingCardId: string | null
  strategyMenuCardId: string | null
  setStrategyMenuCardId: (id: string | null) => void
  onCardAdded?: (card: Card) => void
  onScanResult?: (cardId: string, nearby: Array<{ id: string; distance: number }>) => void
}

// ─────────────────────────────────────
// Component
// ─────────────────────────────────────

export const PhysicsDesk = forwardRef<PhysicsDeskHandle, PhysicsDeskProps>(function PhysicsDesk(
  {
    cards,
    hiddenCardIds,
    linkingCardId,
    linkingMode,
    onLinkCard,
    onLinkToOutline,
    onDetail,
    onDelete,
    onLink,
    onConvert,
    onDirectMove,
    convertingCardId,
    strategyMenuCardId,
    setStrategyMenuCardId,
    onCardAdded,
    onScanResult,
  }: PhysicsDeskProps,
  ref,
) {
  const deskRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const deskLoopRef = useRef<DeskLoop | null>(null)
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  // Stable callback refs — updated every render so DeskLoop always sees latest
  const onCardTapRef = useRef<(id: string) => void>()
  const onHoverRef = useRef<(id: string | null) => void>()
  const onDragRef = useRef<(id: string | null) => void>()

  // Convenience accessors
  const r = () => deskLoopRef.current?.getRenderer() ?? null
  const bm = () => deskLoopRef.current?.getBodiesMap() ?? new Map()

  // ── Hover overlay ──
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null)
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number; angle: number } | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOverOverlayRef = useRef(false)

  // ── Marquee multi-select ──
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set())
  const [selectBox, setSelectBox] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const isSelectingRef = useRef(false)
  const selectStartRef = useRef({ x: 0, y: 0 })

  // ── Tap handler ──
  const handleCardTap = useCallback(
    (cardId: string) => {
      if (linkingCardId) {
        onLinkCard(cardId)
      } else if (linkingMode && onLinkToOutline) {
        const card = cardsRef.current.find((c) => c.id === cardId)
        if (card) onLinkToOutline(linkingMode.deckId, linkingMode.outlineId, cardId)
      } else {
        const card = cardsRef.current.find((c) => c.id === cardId)
        if (card) onDetail(card)
      }
    },
    [linkingCardId, linkingMode, onLinkCard, onLinkToOutline, onDetail],
  )

  // Update stable refs every render
  onCardTapRef.current = handleCardTap
  onHoverRef.current = (cardId) => {
    animationManager.setHoveredCard(cardId)
    if (cardId) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
      setHoveredCardId(cardId)
      const body = bm().get(cardId)
      const renderer = r()
      if (body && renderer) {
        const offset = renderer.getViewOffset()
        const zoom = renderer.getViewZoom()
        setHoveredPos({
          x: (body.position.x - offset.x) * zoom,
          y: (body.position.y - offset.y) * zoom,
          angle: body.angle,
        })
      }
    } else {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = setTimeout(() => {
        if (!isOverOverlayRef.current) {
          setHoveredCardId(null)
          setHoveredPos(null)
        }
      }, 200)
    }
  }
  onDragRef.current = (cardId) => {
    if (cardId) setHoveredCardId(null)
  }

  // ── DeskLoop init ──
  useEffect(() => {
    const canvas = canvasRef.current
    const container = deskRef.current
    if (!canvas || !container) return

    const loop = new DeskLoop()
    deskLoopRef.current = loop
    loop.mount(canvas, container, cardsRef.current, {
      onCardTap: (id) => onCardTapRef.current?.(id),
      onHoverChange: (id) => onHoverRef.current?.(id),
      onDragChange: (id) => onDragRef.current?.(id),
    })

    // Set up command callbacks
    loop.setCommandCallbacks({
      onCardRemoved: (cardId) => onDelete(cardId),
      onCardAdded: (card) => onCardAdded?.(card as Card),
      onScanResult: (cardId, nearby) => onScanResult?.(cardId, nearby),
    })

    return () => {
      loop.destroy()
      deskLoopRef.current = null
    }
  }, [])

  // ── Expose imperative handle for command dispatch ──
  useImperativeHandle(
    ref,
    () => ({
      executeCommand(text: string) {
        return deskLoopRef.current?.executeTextCommand(text) ?? null
      },
    }),
    [],
  )

  // ── 2D Overlay rendering for constraints + highlights ──
  useEffect(() => {
    const overlay = overlayRef.current
    const container = deskRef.current
    if (!overlay || !container) return

    let running = true
    const renderOverlay = () => {
      if (!running) return
      const loop = deskLoopRef.current
      const renderer = loop?.getRenderer()
      if (!loop || !renderer) {
        requestAnimationFrame(renderOverlay)
        return
      }

      const w = container.clientWidth
      const h = container.clientHeight
      const dpr = renderer.getDpr()

      if (overlay.width !== w * dpr || overlay.height !== h * dpr) {
        overlay.width = w * dpr
        overlay.height = h * dpr
        overlay.style.width = w + 'px'
        overlay.style.height = h + 'px'
      }

      const ctx = overlay.getContext('2d')
      if (!ctx) {
        requestAnimationFrame(renderOverlay)
        return
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const constraintsMap = loop.getConstraintsMap()
      const viewport = {
        offsetX: renderer.getViewOffset().x,
        offsetY: renderer.getViewOffset().y,
        zoom: renderer.getViewZoom(),
        dpr,
        screenW: w,
        screenH: h,
        zoomSettled: true,
      }

      // Draw elastic rope constraints
      if (constraintsMap.size > 0) {
        drawConstraints(ctx, constraintsMap, viewport)
      }

      // Draw arenas
      const arenas = loop.arenaManager.getAll()
      if (arenas.length > 0) {
        drawArenas(ctx, arenas, viewport, w, h, performance.now())
      }

      // Draw card highlights
      const bodiesMap = loop.getBodiesMap()
      for (const [cardId, body] of bodiesMap) {
        const hl = getHighlight(cardId)
        if (hl) {
          const sx = (body.position.x - viewport.offsetX) * viewport.zoom
          const sy = (body.position.y - viewport.offsetY) * viewport.zoom
          drawHighlight(ctx, sx, sy, CARD_W, CARD_H, hl.color, hl.intensity, viewport.zoom)
        }
      }

      requestAnimationFrame(renderOverlay)
    }
    requestAnimationFrame(renderOverlay)

    return () => {
      running = false
    }
  }, [])

  // ── Sync cards to physics ──
  useLayoutEffect(() => {
    deskLoopRef.current?.syncCards(cards)
  }, [cards])

  // Track hovered card position each frame (physics moves it)
  useEffect(() => {
    if (!hoveredCardId) return
    let running = true
    const track = () => {
      if (!running || !hoveredCardId) return
      const body = bm().get(hoveredCardId)
      const renderer = r()
      if (body && renderer) {
        const offset = renderer.getViewOffset()
        const zoom = renderer.getViewZoom()
        setHoveredPos({
          x: (body.position.x - offset.x) * zoom,
          y: (body.position.y - offset.y) * zoom,
          angle: body.angle,
        })
      }
      requestAnimationFrame(track)
    }
    requestAnimationFrame(track)
    return () => {
      running = false
    }
  }, [hoveredCardId])

  // ── Marquee handlers ──
  const handleSelectMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const renderer = r()
      if (!renderer) return
      const rect = deskRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const hitId = renderer.hitTest(mx, my, cardsRef.current, bm())
      if (hitId) {
        if (e.shiftKey) {
          e.stopPropagation()
          setSelectedCardIds((prev) => {
            const next = new Set(prev)
            if (next.has(hitId)) next.delete(hitId)
            else next.add(hitId)
            renderer.setSelectedCards(next)
            return next
          })
          return
        }
        if (selectedCardIds.size > 0) {
          setSelectedCardIds(new Set())
          renderer.setSelectedCards(new Set())
        }
        return
      }

      isSelectingRef.current = true
      selectStartRef.current = { x: mx, y: my }
      setSelectBox({ x1: mx, y1: my, x2: mx, y2: my })

      const mc = deskLoopRef.current?.getMouseConstraint()
      if (mc) mc.constraint.stiffness = 0

      if (!e.shiftKey) {
        setSelectedCardIds(new Set())
        renderer.setSelectedCards(new Set())
      }
    },
    [selectedCardIds],
  )

  const handleSelectMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelectingRef.current) return
    const rect = deskRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setSelectBox({ x1: selectStartRef.current.x, y1: selectStartRef.current.y, x2: mx, y2: my })

    const renderer = r()
    if (renderer) {
      const ids = renderer.hitTestRect(
        selectStartRef.current.x,
        selectStartRef.current.y,
        mx,
        my,
        cardsRef.current,
        bm(),
      )
      renderer.setSelectedCards(ids)
      setSelectedCardIds(ids)
    }
  }, [])

  const handleSelectMouseUp = useCallback(() => {
    if (!isSelectingRef.current) return
    isSelectingRef.current = false
    setSelectBox(null)
    const mc = deskLoopRef.current?.getMouseConstraint()
    if (mc) mc.constraint.stiffness = 0.6
  }, [])

  // Sync selection + hidden state to renderer
  useEffect(() => {
    r()?.setSelectedCards(selectedCardIds)
  }, [selectedCardIds])
  useEffect(() => {
    r()?.setHiddenCards(hiddenCardIds ?? new Set())
  }, [hiddenCardIds])

  // Auto-center when card set changes and none are visible
  const prevCardsKeyRef = useRef('')
  useEffect(() => {
    const key = cards
      .map((c) => c.id)
      .sort()
      .join(',')
    if (key === prevCardsKeyRef.current) return
    prevCardsKeyRef.current = key

    const timer = setTimeout(() => {
      const renderer = r()
      const bodyMap = bm()
      if (!renderer || bodyMap.size === 0) return

      const container = deskRef.current
      const w = container?.clientWidth ?? 800
      const h = container?.clientHeight ?? 600

      const offsetX = renderer.getViewOffset().x
      const offsetY = renderer.getViewOffset().y
      const zoom = renderer.getViewZoom()

      const visibleBodyMap = new Map<string, Matter.Body>()
      for (const card of cards) {
        const body = bodyMap.get(card.id)
        if (body) visibleBodyMap.set(card.id, body)
      }

      let anyVisible = false
      for (const [, body] of visibleBodyMap) {
        const sx = (body.position.x - offsetX) * zoom
        const sy = (body.position.y - offsetY) * zoom
        if (sx > -CARD_W && sx < w + CARD_W && sy > -CARD_H && sy < h + CARD_H) {
          anyVisible = true
          break
        }
      }
      if (!anyVisible && visibleBodyMap.size > 0) renderer.centerOnCards(visibleBodyMap, w, h)
    }, 80)

    return () => clearTimeout(timer)
  }, [cards])

  // Keyboard: Escape clears selection, Ctrl/Cmd+A selects all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedCardIds.size > 0) {
        setSelectedCardIds(new Set())
        r()?.setSelectedCards(new Set())
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        const allIds = new Set(cardsRef.current.map((c) => c.id))
        setSelectedCardIds(allIds)
        r()?.setSelectedCards(allIds)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedCardIds])

  const hoveredCard = hoveredCardId ? cards.find((c) => c.id === hoveredCardId) : null
  const zoom = r()?.getViewZoom() ?? 1

  return (
    <div
      ref={deskRef}
      className="physics-desk"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        touchAction: 'none',
        cursor: hoveredCardId ? 'grab' : 'default',
      }}
      tabIndex={0}
      onMouseDown={handleSelectMouseDown}
      onMouseMove={handleSelectMouseMove}
      onMouseUp={handleSelectMouseUp}
    >
      {/* WebGL canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
        }}
      />

      {/* 2D overlay for constraints + highlights */}
      <canvas
        ref={overlayRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Rubber-band selection box */}
      {selectBox && (
        <div
          className="absolute pointer-events-none z-20"
          style={{
            left: Math.min(selectBox.x1, selectBox.x2),
            top: Math.min(selectBox.y1, selectBox.y2),
            width: Math.abs(selectBox.x2 - selectBox.x1),
            height: Math.abs(selectBox.y2 - selectBox.y1),
            border: '1.5px dashed rgba(99, 149, 255, 0.6)',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderRadius: 4,
          }}
        />
      )}

      {/* Batch action toolbar */}
      {selectedCardIds.size > 0 && !selectBox && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl bg-[#0e0508]/95 border border-amber-900/20 px-4 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.6),0_0_8px_rgba(99,149,255,0.15)] backdrop-blur-xl animate-fade-in"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="text-[11px] text-zinc-400 mr-1">
            <span className="text-blue-400 font-semibold">{selectedCardIds.size}</span> selected
          </span>
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={() => {
              selectedCardIds.forEach((id) => onDelete(id))
              setSelectedCardIds(new Set())
              r()?.setSelectedCards(new Set())
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-zinc-400 transition hover:text-red-400 hover:bg-red-500/10"
            title="Batch Delete"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
          <button
            onClick={() => {
              setSelectedCardIds(new Set())
              r()?.setSelectedCards(new Set())
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-zinc-400 transition hover:text-zinc-200 hover:bg-white/[0.06]"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      )}

      {/* Hover overlay */}
      {hoveredCard && hoveredPos && (
        <div
          className="absolute pointer-events-auto z-10"
          style={{
            left: hoveredPos.x + (CARD_W / 2) * zoom - 4,
            top: hoveredPos.y - (CARD_H / 2) * zoom,
            transform: `rotate(${hoveredPos.angle}rad) scale(${Math.min(zoom, 1)})`,
            transformOrigin: 'top left',
            paddingLeft: 8,
          }}
          onMouseEnter={() => {
            isOverOverlayRef.current = true
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current)
              hoverTimeoutRef.current = null
            }
          }}
          onMouseLeave={() => {
            isOverOverlayRef.current = false
            setHoveredCardId(null)
            setHoveredPos(null)
          }}
        >
          <div
            className="flex flex-col items-center gap-0.5 rounded-lg bg-[#0e0508]/95 border border-amber-900/20 p-0.5 shadow-[0_4px_24px_rgba(0,0,0,0.6),0_0_8px_rgba(196,160,53,0.1)] backdrop-blur-xl animate-fade-in"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Convert to requirement */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (convertingCardId === hoveredCard.id) return
                  setStrategyMenuCardId(
                    strategyMenuCardId === hoveredCard.id ? null : hoveredCard.id,
                  )
                }}
                className={`rounded p-1 transition ${
                  convertingCardId === hoveredCard.id
                    ? 'text-brand-400 animate-pulse'
                    : 'text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10'
                }`}
                title="Convert to Task"
              >
                {convertingCardId === hoveredCard.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
              </button>

              {strategyMenuCardId === hoveredCard.id && (
                <div
                  className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-amber-900/20 bg-[#0e0508]/95 shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_12px_rgba(196,160,53,0.08)] py-1 animate-fade-in backdrop-blur-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
                    <Bot className="inline h-2.5 w-2.5 mr-1" />
                    SubAgent to Task
                  </div>
                  {[
                    {
                      strategy: 'auto' as const,
                      label: 'Auto Convert',
                      desc: 'AI auto selects strategy',
                      icon: <Sparkles className="h-3 w-3 text-brand-400" />,
                    },
                    {
                      strategy: 'expand' as const,
                      label: 'Expand',
                      desc: 'Expand into detailed tasks',
                      icon: <Layers className="h-3 w-3 text-purple-400" />,
                    },
                    {
                      strategy: 'refine' as const,
                      label: 'Refine',
                      desc: 'Extract core points',
                      icon: <Wand2 className="h-3 w-3 text-cyan-400" />,
                    },
                    {
                      strategy: 'decompose' as const,
                      label: 'Decompose',
                      desc: 'Split into multiple sub-tasks',
                      icon: <Split className="h-3 w-3 text-amber-400" />,
                    },
                  ].map((opt) => (
                    <button
                      key={opt.strategy}
                      onClick={() => onConvert(hoveredCard, opt.strategy)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-white/[0.04] transition"
                    >
                      {opt.icon}
                      <div>
                        <p className="text-[10px] font-medium text-zinc-200">{opt.label}</p>
                        <p className="text-[9px] text-zinc-500">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                  <div className="border-t border-white/[0.04] mt-1 pt-1 px-2">
                    <button
                      onClick={() => onDirectMove(hoveredCard.id)}
                      className="flex items-center gap-2 w-full py-1.5 text-left hover:bg-white/[0.04] rounded transition"
                    >
                      <ArrowRight className="h-3 w-3 text-zinc-500" />
                      <p className="text-[10px] text-zinc-400">Move to tasks directly</p>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                onLink(hoveredCard.id)
              }}
              className="rounded p-1 text-zinc-600 hover:text-purple-400 hover:bg-purple-500/10"
              title="Link Card"
            >
              <Link2 className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDetail(hoveredCard)
              }}
              className="rounded p-1 text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10"
              title="Details"
            >
              <Edit3 className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(hoveredCard.id)
              }}
              className="rounded p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
