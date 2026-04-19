import {
  Activity,
  Brain,
  Zap as FlashIcon,
  Layers,
  Loader2,
  Microscope,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  Wand2,
  Workflow,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  abortTask,
  analyzeAndOutline,
  curateMaterials,
  genId,
  requestInspiration,
  startResearch,
} from '../api'
import { getActiveDeck, useApp } from '../store'
import type {
  Card,
  OutlineItem,
  Pipeline,
  ResearchAngle,
  ResearchSession,
  TaskRecord,
} from '../types'

interface ToolbarProps {
  onToggleTheme: () => void
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
  onToggleTaskCenter: () => void
  taskCenterOpen: boolean
  onToggleResearch: () => void
  onToggleSkills: () => void
  onToggleSettings: () => void
  onTogglePipeline: () => void
}

export default function Toolbar({
  onToggleTheme,
  onToggleSidebar,
  sidebarCollapsed,
  onToggleTaskCenter,
  taskCenterOpen,
  onToggleResearch,
  onToggleSkills,
  onToggleSettings,
  onTogglePipeline,
}: ToolbarProps) {
  const { state, dispatch } = useApp()
  const { project } = state
  const deck = getActiveDeck(project)
  // Concurrent execution: use Set to track multiple simultaneously running operations
  const [runningOps, setRunningOps] = useState<Set<string>>(new Set())
  const [lastError, setLastError] = useState(false)
  const cancelRefs = useRef<Map<string, () => void>>(new Map())
  // taskId → server-side requestId mapping for precise abort
  const requestIdMap = useRef<Map<string, string>>(new Map())

  const hasMaterials = project.materials.length > 0
  const hasCards = project.cards.length > 0
  const hasOutline = (deck?.outline.length || 0) > 0
  const isWorking = runningOps.size > 0
  const runningTasks = project.tasks.filter((t) => t.status === 'running')

  const addOp = (op: string) => setRunningOps((prev) => new Set(prev).add(op))
  const removeOp = (op: string) =>
    setRunningOps((prev) => {
      const s = new Set(prev)
      s.delete(op)
      return s
    })
  const isOpRunning = (op: string) => runningOps.has(op)

  // ── Create Task record (with dependency support) ──
  function createTask(
    name: string,
    deckId?: string,
    opts?: { dependsOn?: string[]; taskType?: string; pipelineId?: string },
  ): string {
    const taskId = genId()
    const task: TaskRecord = {
      id: taskId,
      name,
      status: opts?.dependsOn?.length ? 'pending' : 'running',
      dependsOn: opts?.dependsOn || [],
      taskType: opts?.taskType || name,
      startedAt: Date.now(),
      artifacts: [],
      logs: [],
      deckId,
      pipelineId: opts?.pipelineId,
    }
    dispatch({ type: 'ADD_TASK', task })
    return taskId
  }

  // ── Grinder Pipeline: auto curate → analyze → generate ──
  const startPipeline = (materialIds?: string[]) => {
    if (!deck) return
    const pipelineId = genId()
    const pipeline: Pipeline = {
      id: pipelineId,
      name: `Grinder — ${deck.title}`,
      status: 'running',
      taskIds: [],
      currentStep: 0,
      deckId: deck.id,
      createdAt: Date.now(),
    }
    dispatch({ type: 'ADD_PIPELINE', pipeline })

    // Step 1: Curate
    dispatch({ type: 'ADD_LOG', message: '🔄 Grinder started: Step 1/2 — Curate Cards' })
    handleCurateWithCallback(materialIds, () => {
      // Step 2: Analyze → Outline
      dispatch({ type: 'ADD_LOG', message: '🔄 Grinder: Step 2/2 — Generate Outline' })
      dispatch({ type: 'ADVANCE_PIPELINE', pipelineId })
      handleAnalyzeWithCallback(() => {
        dispatch({ type: 'COMPLETE_PIPELINE', pipelineId })
      })
    })
  }

  // ── Curate with callback (for Pipeline chaining) ──
  const handleCurateWithCallback = (materialIds?: string[], onComplete?: () => void) => {
    const mats = materialIds
      ? project.materials.filter((m) => materialIds.includes(m.id))
      : project.materials
    if (mats.length === 0) {
      onComplete?.()
      return
    }
    if (isOpRunning('curating')) return

    const taskId = createTask('Curate Cards', undefined, { taskType: 'curate' })
    addOp('curating')
    dispatch({ type: 'SET_STATUS', status: 'curating' })

    for (const mat of mats) {
      dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, updates: { status: 'curating' } })
    }

    const { cancel } = curateMaterials(project.id, mats, project.cards, project.decks, (evt) => {
      switch (evt.type) {
        case 'request_id':
          requestIdMap.current.set(taskId, evt.data)
          dispatch({ type: 'UPDATE_TASK', id: taskId, updates: { requestId: evt.data } })
          break
        case 'thinking':
        case 'text':
          dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
          break
        case 'card': {
          try {
            const card = JSON.parse(evt.data) as Card
            dispatch({
              type: 'STREAM_CARD',
              card: {
                ...card,
                isStreaming: true,
                deckIds: card.deckIds || [],
                rating: card.rating || 0,
              },
            })
            if (card.sourceId) {
              dispatch({
                type: 'BIND_CARD_TO_MATERIAL',
                cardId: card.id,
                materialId: card.sourceId,
              })
            }
            if (card.deckIds && card.deckIds.length > 0) {
              for (const did of card.deckIds) {
                dispatch({ type: 'ASSIGN_CARD_TO_DECK', cardId: card.id, deckId: did })
              }
            }
            dispatch({
              type: 'ADD_TASK_LOG',
              taskId,
              message: `Card: ${card.title} ★${card.rating || 0}`,
            })
          } catch {
            /* ignore */
          }
          break
        }
        case 'cards': {
          try {
            const cards = JSON.parse(evt.data) as Card[]
            dispatch({
              type: 'ADD_CARDS',
              cards: cards.map((c) => ({ ...c, deckIds: c.deckIds || [], rating: c.rating || 0 })),
            })
            for (const card of cards) {
              if (card.sourceId) {
                dispatch({
                  type: 'BIND_CARD_TO_MATERIAL',
                  cardId: card.id,
                  materialId: card.sourceId,
                })
              }
            }
            dispatch({
              type: 'ADD_TASK_ARTIFACT',
              taskId,
              artifact: { type: 'cards', label: 'Cards', count: cards.length },
            })
          } catch {
            /* ignore */
          }
          break
        }
        case 'link_cards': {
          try {
            const { cardId, targetId } = JSON.parse(evt.data)
            dispatch({ type: 'LINK_CARDS', cardId, targetId })
          } catch {
            /* ignore */
          }
          break
        }
        case 'assign_card': {
          try {
            const { cardId, deckId: dId } = JSON.parse(evt.data)
            dispatch({ type: 'ASSIGN_CARD_TO_DECK', cardId, deckId: dId })
          } catch {
            /* ignore */
          }
          break
        }
        case 'new_deck': {
          try {
            const newDeck = JSON.parse(evt.data)
            dispatch({
              type: 'ADD_DECK',
              deck: { ...newDeck, outline: [], createdAt: Date.now(), updatedAt: Date.now() },
            })
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: `New Deck: ${newDeck.title}` })
          } catch {
            /* ignore */
          }
          break
        }
        case 'material_curated': {
          try {
            const { materialId } = JSON.parse(evt.data)
            dispatch({ type: 'UPDATE_MATERIAL', id: materialId, updates: { status: 'curated' } })
          } catch {
            /* ignore */
          }
          break
        }
        case 'progress':
          dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
          break
        case 'done':
          removeOp('curating')
          dispatch({ type: 'SET_STATUS', status: 'idle' })
          for (const mat of mats) {
            dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, updates: { status: 'curated' } })
          }
          // Clear isStreaming flag for all cards
          for (const card of project.cards) {
            if (card.isStreaming) {
              dispatch({ type: 'UPDATE_CARD', id: card.id, updates: { isStreaming: false } })
            }
          }
          dispatch({ type: 'COMPLETE_TASK', taskId })
          requestIdMap.current.delete(taskId)
          onComplete?.()
          break
        case 'aborted':
          removeOp('curating')
          dispatch({ type: 'SET_STATUS', status: 'idle' })
          dispatch({
            type: 'UPDATE_TASK',
            id: taskId,
            updates: { status: 'cancelled', completedAt: Date.now() },
          })
          dispatch({ type: 'ADD_TASK_LOG', taskId, message: '⛔ Task aborted by user' })
          requestIdMap.current.delete(taskId)
          break
        case 'error':
          removeOp('curating')
          setLastError(true)
          dispatch({ type: 'SET_STATUS', status: 'error' })
          dispatch({ type: 'FAIL_TASK', taskId, error: evt.data })
          requestIdMap.current.delete(taskId)
          break
      }
    })
    cancelRefs.current.set('curating', cancel)
  }

  // ── Analyze with callback (for Pipeline chaining) ──
  const handleAnalyzeWithCallback = (onComplete?: () => void) => {
    if (!deck || (!hasCards && !hasMaterials)) {
      onComplete?.()
      return
    }
    if (isOpRunning('analyzing')) return
    const taskId = createTask('Generate Outline', deck.id, { taskType: 'analyze' })
    addOp('analyzing')
    dispatch({ type: 'SET_STATUS', status: 'analyzing' })

    const deckCards = project.cards.filter((c) => c.deckIds.includes(deck.id))
    const cardsForDeck = deckCards.length > 0 ? deckCards : project.cards

    const { cancel } = analyzeAndOutline(
      project.id,
      deck.id,
      project.materials,
      cardsForDeck,
      deck.outline.length > 0 ? deck.outline : undefined,
      deck.theme,
      project.todos.length > 0 ? project.todos : undefined,
      (evt) => {
        switch (evt.type) {
          case 'request_id':
            requestIdMap.current.set(taskId, evt.data)
            dispatch({ type: 'UPDATE_TASK', id: taskId, updates: { requestId: evt.data } })
            break
          case 'thinking':
          case 'text':
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
            break
          case 'outline_item': {
            try {
              const item = JSON.parse(evt.data) as OutlineItem
              dispatch({
                type: 'STREAM_OUTLINE_ITEM',
                deckId: deck.id,
                item: { ...item, isStreaming: true, cardRefs: item.cardRefs || [] },
              })
            } catch {
              /* ignore */
            }
            break
          }
          case 'outline': {
            try {
              const outline = JSON.parse(evt.data) as OutlineItem[]
              dispatch({
                type: 'SET_OUTLINE',
                deckId: deck.id,
                outline: outline.map((o) => ({ ...o, cardRefs: o.cardRefs || [] })),
              })
              dispatch({
                type: 'ADD_TASK_ARTIFACT',
                taskId,
                artifact: { type: 'outline', label: 'Outline', count: outline.length },
              })
            } catch {
              /* ignore */
            }
            break
          }
          case 'card': {
            try {
              const card = JSON.parse(evt.data) as Card
              dispatch({
                type: 'STREAM_CARD',
                card: { ...card, deckIds: card.deckIds || [deck.id], rating: card.rating || 0 },
              })
              if (card.sourceId) {
                dispatch({
                  type: 'BIND_CARD_TO_MATERIAL',
                  cardId: card.id,
                  materialId: card.sourceId,
                })
              }
            } catch {
              /* ignore */
            }
            break
          }
          case 'progress':
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
            break
          case 'done':
            removeOp('analyzing')
            dispatch({ type: 'SET_STATUS', status: 'idle' })
            dispatch({ type: 'COMPLETE_TASK', taskId })
            requestIdMap.current.delete(taskId)
            onComplete?.()
            break
          case 'aborted':
            removeOp('analyzing')
            dispatch({ type: 'SET_STATUS', status: 'idle' })
            dispatch({
              type: 'UPDATE_TASK',
              id: taskId,
              updates: { status: 'cancelled', completedAt: Date.now() },
            })
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: '⛔ Task aborted by user' })
            requestIdMap.current.delete(taskId)
            break
          case 'error':
            removeOp('analyzing')
            setLastError(true)
            dispatch({ type: 'SET_STATUS', status: 'error' })
            dispatch({ type: 'FAIL_TASK', taskId, error: evt.data })
            requestIdMap.current.delete(taskId)
            break
        }
      },
    )
    cancelRefs.current.set('analyzing', cancel)
  }

  // ── Curate Materials → Cards (simple wrapper) ──
  const handleCurate = (materialIds?: string[]) => {
    // If Grinder mode is enabled, use Pipeline
    if (state.userSettings.autoPipeline && deck) {
      startPipeline(materialIds)
      return
    }
    handleCurateWithCallback(materialIds)
  }

  // ── Analyze Cards → Outline (for current Deck) ──
  const handleAnalyze = () => {
    handleAnalyzeWithCallback()
  }

  // ── Deep Research ──
  const handleResearch = () => {
    if (isOpRunning('researching')) return
    const topic = project.title || 'Presentation Topic'
    const sessionId = genId()
    const angles: ResearchAngle[] = [
      {
        id: genId(),
        name: 'Deep Analysis',
        description: 'In-depth analysis of core viewpoints from existing materials',
        status: 'idle',
        cardIds: [],
        logs: [],
      },
      {
        id: genId(),
        name: 'Data Evidence',
        description: 'Find data and statistics that support the argument',
        status: 'idle',
        cardIds: [],
        logs: [],
      },
      {
        id: genId(),
        name: 'Case Study',
        description: 'Find relevant concrete case studies',
        status: 'idle',
        cardIds: [],
        logs: [],
      },
      {
        id: genId(),
        name: 'Counter Argument',
        description: 'Explore opposing arguments and rebuttals',
        status: 'idle',
        cardIds: [],
        logs: [],
      },
    ]
    const session: ResearchSession = {
      id: sessionId,
      topic,
      angles,
      status: 'running',
      totalCards: 0,
      createdAt: Date.now(),
    }
    dispatch({ type: 'ADD_RESEARCH_SESSION', session })

    const taskId = createTask('Deep Research')
    addOp('researching')
    dispatch({ type: 'SET_STATUS', status: 'researching' })

    // Read research goals set in ResearchPanel
    const goals = ((window as unknown as Record<string, unknown>).__researchGoals as string[]) || []

    const { cancel } = startResearch(
      project.id,
      topic,
      project.materials,
      project.cards,
      angles.map((a) => ({ name: a.name, description: a.description })),
      goals.length > 0 ? goals : undefined,
      (evt) => {
        switch (evt.type) {
          case 'request_id':
            requestIdMap.current.set(taskId, evt.data)
            dispatch({ type: 'UPDATE_TASK', id: taskId, updates: { requestId: evt.data } })
            break
          case 'thinking':
          case 'text':
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
            break
          case 'angle_started': {
            try {
              const { angleId } = JSON.parse(evt.data)
              dispatch({
                type: 'UPDATE_RESEARCH_ANGLE',
                sessionId,
                angleId,
                updates: { status: 'running', startedAt: Date.now() },
              })
            } catch {
              /* ignore */
            }
            break
          }
          case 'angle_log': {
            try {
              const { angleId, message } = JSON.parse(evt.data)
              dispatch({ type: 'ADD_RESEARCH_ANGLE_LOG', sessionId, angleId, message })
            } catch {
              /* ignore */
            }
            break
          }
          case 'card': {
            try {
              const card = JSON.parse(evt.data) as Card
              dispatch({
                type: 'STREAM_CARD',
                card: { ...card, deckIds: card.deckIds || [], rating: card.rating || 0 },
              })
              // Update outline (if there is a corresponding association)
              dispatch({
                type: 'ADD_TASK_LOG',
                taskId,
                message: `Research card: ${card.title} ★${card.rating || 0}`,
              })
            } catch {
              /* ignore */
            }
            break
          }
          case 'angle_completed': {
            try {
              const { angleId, cardIds } = JSON.parse(evt.data)
              dispatch({
                type: 'UPDATE_RESEARCH_ANGLE',
                sessionId,
                angleId,
                updates: { status: 'completed', completedAt: Date.now(), cardIds: cardIds || [] },
              })
            } catch {
              /* ignore */
            }
            break
          }
          case 'outline_updated': {
            // Valuable new cards automatically update the outline
            try {
              if (deck) {
                const { outline } = JSON.parse(evt.data)
                dispatch({ type: 'SET_OUTLINE', deckId: deck.id, outline })
                dispatch({ type: 'ADD_TASK_LOG', taskId, message: 'Outline auto-updated' })
              }
            } catch {
              /* ignore */
            }
            break
          }
          case 'research_summary': {
            try {
              const summary = JSON.parse(evt.data)
              dispatch({
                type: 'ADD_TASK_LOG',
                taskId,
                message: `Deep research summary: ${summary.totalCards} new cards total`,
              })
              if (summary.byAngle) {
                for (const a of summary.byAngle) {
                  dispatch({
                    type: 'ADD_TASK_LOG',
                    taskId,
                    message: `  📌 ${a.name}: ${a.cardCount} cards`,
                  })
                }
              }
              dispatch({
                type: 'ADD_TASK_ARTIFACT',
                taskId,
                artifact: { type: 'research', label: 'Deep Research', count: summary.totalCards },
              })
            } catch {
              /* ignore */
            }
            break
          }
          case 'progress':
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
            break
          case 'done':
            removeOp('researching')
            dispatch({ type: 'SET_STATUS', status: 'idle' })
            dispatch({ type: 'COMPLETE_RESEARCH', sessionId })
            dispatch({ type: 'COMPLETE_TASK', taskId })
            requestIdMap.current.delete(taskId)
            break
          case 'aborted':
            removeOp('researching')
            dispatch({ type: 'SET_STATUS', status: 'idle' })
            dispatch({
              type: 'UPDATE_TASK',
              id: taskId,
              updates: { status: 'cancelled', completedAt: Date.now() },
            })
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: '⛔ Task aborted by user' })
            requestIdMap.current.delete(taskId)
            break
          case 'error':
            removeOp('researching')
            setLastError(true)
            dispatch({ type: 'SET_STATUS', status: 'error' })
            dispatch({ type: 'FAIL_RESEARCH', sessionId, error: evt.data })
            dispatch({ type: 'FAIL_TASK', taskId, error: evt.data })
            requestIdMap.current.delete(taskId)
            break
        }
      },
    )
    cancelRefs.current.set('researching', cancel)
  }

  // ── Inspiration Generation ──
  const handleInspire = () => {
    if (isOpRunning('inspiring')) return
    const taskId = createTask('Get Inspiration')
    addOp('inspiring')
    dispatch({ type: 'SET_STATUS', status: 'curating' })

    const { cancel } = requestInspiration(
      project.id,
      project.materials,
      project.cards,
      deck?.outline || [],
      project.todos,
      (evt) => {
        switch (evt.type) {
          case 'request_id':
            requestIdMap.current.set(taskId, evt.data)
            dispatch({ type: 'UPDATE_TASK', id: taskId, updates: { requestId: evt.data } })
            break
          case 'thinking':
          case 'text':
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
            break
          case 'card': {
            try {
              const card = JSON.parse(evt.data) as Card
              dispatch({
                type: 'STREAM_CARD',
                card: {
                  ...card,
                  kind: 'inspiration',
                  isStreaming: true,
                  deckIds: card.deckIds || [],
                  rating: card.rating || 0,
                  autoGenerated: true,
                },
              })
              dispatch({ type: 'ADD_TASK_LOG', taskId, message: `💡 Inspiration: ${card.title}` })
            } catch {
              /* ignore */
            }
            break
          }
          case 'cards': {
            try {
              const cards = JSON.parse(evt.data) as Card[]
              const inspirationCards = cards.map((c) => ({
                ...c,
                kind: 'inspiration' as const,
                autoGenerated: true,
                deckIds: c.deckIds || [],
                rating: c.rating || 0,
              }))
              dispatch({ type: 'ADD_CARDS', cards: inspirationCards })
              dispatch({
                type: 'ADD_TASK_ARTIFACT',
                taskId,
                artifact: { type: 'cards', label: 'Inspiration Cards', count: cards.length },
              })
            } catch {
              /* ignore */
            }
            break
          }
          case 'progress':
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
            break
          case 'done':
            removeOp('inspiring')
            dispatch({ type: 'SET_STATUS', status: 'idle' })
            for (const card of project.cards) {
              if (card.isStreaming) {
                dispatch({ type: 'UPDATE_CARD', id: card.id, updates: { isStreaming: false } })
              }
            }
            dispatch({ type: 'COMPLETE_TASK', taskId })
            requestIdMap.current.delete(taskId)
            break
          case 'aborted':
            removeOp('inspiring')
            dispatch({ type: 'SET_STATUS', status: 'idle' })
            dispatch({
              type: 'UPDATE_TASK',
              id: taskId,
              updates: { status: 'cancelled', completedAt: Date.now() },
            })
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: '⛔ Task aborted by user' })
            requestIdMap.current.delete(taskId)
            break
          case 'error':
            removeOp('inspiring')
            setLastError(true)
            dispatch({ type: 'SET_STATUS', status: 'error' })
            dispatch({ type: 'FAIL_TASK', taskId, error: evt.data })
            requestIdMap.current.delete(taskId)
            break
        }
      },
    )
    cancelRefs.current.set('inspiring', cancel)
  }

  const handleCancel = () => {
    // 1. Send abort request to server (precise cancellation by requestId)
    for (const [, reqId] of requestIdMap.current) {
      abortTask(reqId).catch(() => {})
    }
    requestIdMap.current.clear()
    // 2. Cancel client-side SSE connections
    for (const [, cancelFn] of cancelRefs.current) {
      cancelFn()
    }
    cancelRefs.current.clear()
    setRunningOps(new Set())
    dispatch({ type: 'SET_STATUS', status: 'idle' })
    for (const t of project.tasks) {
      if (t.status === 'running') {
        dispatch({
          type: 'UPDATE_TASK',
          id: t.id,
          updates: { status: 'cancelled', completedAt: Date.now() },
        })
      }
    }
  }

  // ── Single task abort — called via TaskCenter ──
  const handleAbortTask = (taskId: string) => {
    const reqId = requestIdMap.current.get(taskId)
    if (reqId) {
      abortTask(reqId).catch(() => {})
      requestIdMap.current.delete(taskId)
    }
    // Find the corresponding cancel function — by task type
    const task = project.tasks.find((t) => t.id === taskId)
    if (task) {
      const opKey =
        task.taskType === 'curate'
          ? 'curating'
          : task.taskType === 'analyze'
            ? 'analyzing'
            : task.taskType === 'Generate PPT'
              ? 'generating'
              : task.taskType === 'Update PPT'
                ? 'updating'
                : task.taskType === 'research'
                  ? 'researching'
                  : task.taskType === 'inspire'
                    ? 'inspiring'
                    : task.name === 'Curate Cards'
                      ? 'curating'
                      : task.name === 'Generate Outline'
                        ? 'analyzing'
                        : task.name === 'Generate PPT'
                          ? 'generating'
                          : task.name === 'Update PPT'
                            ? 'updating'
                            : task.name === 'Deep Research'
                              ? 'researching'
                              : task.name === 'Get Inspiration'
                                ? 'inspiring'
                                : ''
      if (opKey && cancelRefs.current.has(opKey)) {
        cancelRefs.current.get(opKey)!()
        cancelRefs.current.delete(opKey)
        removeOp(opKey)
      }
      dispatch({
        type: 'UPDATE_TASK',
        id: taskId,
        updates: { status: 'cancelled', completedAt: Date.now() },
      })
      dispatch({ type: 'ADD_TASK_LOG', taskId, message: '⛔ Task aborted by user' })
    }
    // If no more running tasks, reset status
    const stillRunning = project.tasks.filter((t) => t.status === 'running' && t.id !== taskId)
    if (stillRunning.length === 0) {
      dispatch({ type: 'SET_STATUS', status: 'idle' })
    }
  }

  // Expose curate for external calls
  ;(window as unknown as Record<string, unknown>).__handleCurate = handleCurate
  // Expose inspire / research / analyze for heartbeat mechanism
  ;(window as unknown as Record<string, unknown>).__handleInspire = handleInspire
  ;(window as unknown as Record<string, unknown>).__handleResearch = handleResearch
  ;(window as unknown as Record<string, unknown>).__handleAnalyze = handleAnalyze
  ;(window as unknown as Record<string, unknown>).__handleGenerate = handleGenerate
  ;(window as unknown as Record<string, unknown>).__isOpRunning = isOpRunning
  ;(window as unknown as Record<string, unknown>).__handleAbortTask = handleAbortTask

  return (
    <header className="flex h-11 shrink-0 items-center border-b border-border bg-toolbar">
      {/* ── Left: Logo + Sidebar toggle ── */}
      <div className="flex items-center gap-1.5 pl-3 pr-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600">
          <FlashIcon className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-[13px] font-semibold text-white hidden sm:block">Flash</span>

        <button
          onClick={onToggleSidebar}
          className="ml-1 rounded p-1 text-zinc-500 transition hover:bg-surface-3 hover:text-zinc-300"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <div className="h-5 w-px bg-border shrink-0" />

      {/* ── Middle: Status + Running info ── */}
      <div className="flex flex-1 items-center gap-2 px-3 min-w-0">
        {runningTasks.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-brand-500/8 px-2 py-0.5">
            <Loader2 className="h-3 w-3 animate-spin text-brand-400" />
            <span className="truncate text-[11px] text-zinc-400 max-w-[180px]">
              {runningTasks[0].name}
              {runningTasks.length > 1 && ` +${runningTasks.length - 1}`}
            </span>
          </div>
        )}
        {!isWorking && runningTasks.length === 0 && project.status === 'done' && (
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/8 px-2 py-0.5">
            <Sparkles className="h-3 w-3 text-emerald-400" />
            <span className="text-[11px] text-zinc-500">Ready</span>
          </div>
        )}
        {/* ❤️ Heartbeat status indicator */}
        {(state.userSettings.autoInspire ||
          state.userSettings.autoResearch ||
          state.userSettings.autoConsumeTodos) &&
          !isWorking && (
            <div
              className="flex items-center gap-1 rounded-full bg-pink-500/8 px-2 py-0.5"
              title="Heartbeat auto mode active: inspiration, deep research, demand consumption"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-pulse" />
              <span className="text-[10px] text-pink-400/80">Heartbeat</span>
            </div>
          )}
      </div>

      {/* ── Right: All actions ── */}
      <div className="flex items-center gap-0.5 pr-3">
        {/* ─ Group 1: Utility tools (icon only) ─ */}
        <div className="flex items-center gap-0.5 rounded-md bg-surface-2/50 p-0.5">
          <button
            onClick={onToggleTaskCenter}
            className={`relative flex items-center justify-center rounded p-1.5 text-xs transition ${
              taskCenterOpen
                ? 'bg-surface-3 text-zinc-200'
                : 'text-zinc-500 hover:bg-surface-3 hover:text-zinc-300'
            }`}
            title="Task Center"
          >
            <Activity className="h-3.5 w-3.5" />
            {runningTasks.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-500 text-[8px] font-bold text-white">
                {runningTasks.length}
              </span>
            )}
          </button>

          <button
            onClick={onToggleResearch}
            className="flex items-center justify-center rounded p-1.5 text-zinc-500 transition hover:bg-surface-3 hover:text-zinc-300"
            title="Deep Research Panel"
          >
            <Microscope className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={onToggleSkills}
            className="relative flex items-center justify-center rounded p-1.5 text-zinc-500 transition hover:bg-surface-3 hover:text-zinc-300"
            title="Skills Center"
          >
            <Puzzle className="h-3.5 w-3.5" />
            {project.skills.filter((s) => s.status === 'installed').length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">
                {project.skills.filter((s) => s.status === 'installed').length}
              </span>
            )}
          </button>

          <button
            onClick={onToggleTheme}
            className="flex items-center justify-center rounded p-1.5 text-zinc-500 transition hover:bg-surface-3 hover:text-zinc-300"
            title="Theme Style"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={onTogglePipeline}
            className="flex items-center justify-center rounded p-1.5 text-zinc-500 transition hover:bg-surface-3 hover:text-zinc-300"
            title="Pipeline"
          >
            <Workflow className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={onToggleSettings}
            className="flex items-center justify-center rounded p-1.5 text-zinc-500 transition hover:bg-surface-3 hover:text-zinc-300"
            title="Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mx-1.5 h-5 w-px bg-border shrink-0" />

        {/* ─ Group 2: Workflow actions (labeled buttons) ─ */}
        <div className="flex items-center gap-1">
          {/* Curate — Organize Cards */}
          {hasMaterials && (
            <button
              onClick={() => handleCurate()}
              disabled={isOpRunning('curating')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                isOpRunning('curating')
                  ? 'bg-amber-600/5 text-amber-500/50 cursor-not-allowed'
                  : 'text-amber-300 hover:bg-amber-600/15'
              }`}
            >
              {isOpRunning('curating') ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Layers className="h-3 w-3" />
              )}
              {hasCards ? 'Re-curate' : 'Curate'}
            </button>
          )}

          {/* Inspire — Get Inspiration */}
          {(hasCards || hasMaterials) && (
            <button
              onClick={handleInspire}
              disabled={isOpRunning('inspiring')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                isOpRunning('inspiring')
                  ? 'bg-fuchsia-600/5 text-fuchsia-500/50 cursor-not-allowed'
                  : 'text-fuchsia-300 hover:bg-fuchsia-600/15'
              }`}
              title="AI Inspiration Suggestions"
            >
              {isOpRunning('inspiring') ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Inspire
            </button>
          )}

          {/* Research — Deep Research */}
          {(hasCards || hasMaterials) && (
            <button
              onClick={handleResearch}
              disabled={isOpRunning('researching')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                isOpRunning('researching')
                  ? 'bg-purple-600/5 text-purple-500/50 cursor-not-allowed'
                  : 'text-purple-300 hover:bg-purple-600/15'
              }`}
              title="Multi-angle Deep Research"
            >
              {isOpRunning('researching') ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Microscope className="h-3 w-3" />
              )}
              Research
            </button>
          )}

          {/* Analyze → Outline */}
          {(hasCards || hasMaterials) && deck && (
            <button
              onClick={handleAnalyze}
              disabled={isOpRunning('analyzing')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                isOpRunning('analyzing')
                  ? 'bg-brand-600/5 text-brand-300/50 cursor-not-allowed'
                  : 'text-brand-300 hover:bg-brand-600/15'
              }`}
            >
              {isOpRunning('analyzing') ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Brain className="h-3 w-3" />
              )}
              {hasOutline ? 'Re-analyze' : 'Outline'}
            </button>
          )}
        </div>

        {/* Cancel / Reset */}
        {isWorking && (
          <button
            onClick={handleCancel}
            className="ml-1 flex items-center gap-1 rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300 transition hover:bg-red-500/20"
          >
            <Square className="h-3 w-3" />
            Cancel
          </button>
        )}
        {lastError && !isWorking && (
          <button
            onClick={() => {
              setLastError(false)
              dispatch({ type: 'SET_STATUS', status: 'idle' })
            }}
            className="ml-1 flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] text-zinc-400 transition hover:bg-surface-3 hover:text-zinc-200"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>
    </header>
  )
}
