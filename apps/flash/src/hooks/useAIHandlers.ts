import { useCallback, useRef, useState } from 'react'
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

export function useAIHandlers() {
  const { state, dispatch } = useApp()
  const { project } = state
  const deck = getActiveDeck(project)

  // Use ref to always have the latest project/deck reference, avoid stale useCallback closures
  const projectRef = useRef(project)
  projectRef.current = project
  const deckRef = useRef(deck)
  deckRef.current = deck

  const [runningOps, setRunningOps] = useState<Set<string>>(new Set())
  const [lastError, setLastError] = useState(false)
  const cancelRefs = useRef<Map<string, () => void>>(new Map())
  const requestIdMap = useRef<Map<string, string>>(new Map())

  const hasMaterials = project.materials.length > 0
  const hasCards = project.cards.length > 0
  const hasOutline = (deck?.outline.length || 0) > 0
  const isWorking = runningOps.size > 0

  const addOp = (op: string) => setRunningOps((prev) => new Set(prev).add(op))
  const removeOp = (op: string) =>
    setRunningOps((prev) => {
      const s = new Set(prev)
      s.delete(op)
      return s
    })
  const isOpRunning = useCallback((op: string) => runningOps.has(op), [runningOps])

  // ── Create Task record ──
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

  // ── Pipeline Item status sync helper ──
  function updatePipelineItemForTask(
    payload: Record<string, unknown>,
    taskId: string,
    status: string,
    progress: string,
    result?: Record<string, unknown>,
  ) {
    const pipelineItemId = payload?.pipelineItemId as string | undefined
    if (pipelineItemId) {
      const updates: Record<string, unknown> = { status, progress, taskId }
      if (result) updates.result = result
      dispatch({ type: 'UPDATE_PIPELINE_ITEM', id: pipelineItemId, updates })
    }
  }

  // ── Grinder Pipeline ──
  const startPipeline = useCallback(
    (materialIds?: string[]) => {
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

      dispatch({ type: 'ADD_LOG', message: '🔄 Grinder started: Step 1/2 — Curate cards' })
      handleCurateWithCallback(materialIds, {}, () => {
        dispatch({ type: 'ADD_LOG', message: '🔄 Grinder: Step 2/2 — Generate outline' })
        dispatch({ type: 'ADVANCE_PIPELINE', pipelineId })
        handleAnalyzeWithCallback({}, () => {
          dispatch({ type: 'COMPLETE_PIPELINE', pipelineId })
        })
      })
    },
    [deck, project],
  )

  // ── Curate (with callback) ──
  const handleCurateWithCallback = useCallback(
    (materialIds?: string[], payload: Record<string, unknown> = {}, onComplete?: () => void) => {
      // Use ref to get the latest project data (avoid stale closures)
      const latestProject = projectRef.current
      const mats = materialIds
        ? latestProject.materials.filter((m) => materialIds.includes(m.id))
        : latestProject.materials
      if (mats.length === 0) {
        console.warn(
          '[Curate] mats is empty, materialIds:',
          materialIds,
          'total materials:',
          latestProject.materials.length,
        )
        onComplete?.()
        return
      }
      if (runningOps.has('curating')) return

      const taskId = createTask('Curate cards', undefined, { taskType: 'curate' })
      addOp('curating')
      dispatch({ type: 'SET_STATUS', status: 'curating' })
      updatePipelineItemForTask(
        payload,
        taskId,
        'executing',
        `Extracting cards from ${mats.length} materials...`,
      )

      for (const mat of mats) {
        dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, updates: { status: 'curating' } })
      }

      const { cancel } = curateMaterials(
        latestProject.id,
        mats,
        latestProject.cards,
        latestProject.decks,
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
                    isStreaming: true,
                    deckIds: card.deckIds || [],
                    rating: card.rating || 0,
                  },
                })
                if (card.sourceId)
                  dispatch({
                    type: 'BIND_CARD_TO_MATERIAL',
                    cardId: card.id,
                    materialId: card.sourceId,
                  })
                if (card.deckIds?.length) {
                  for (const did of card.deckIds)
                    dispatch({ type: 'ASSIGN_CARD_TO_DECK', cardId: card.id, deckId: did })
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
                  cards: cards.map((c) => ({
                    ...c,
                    deckIds: c.deckIds || [],
                    rating: c.rating || 0,
                  })),
                })
                for (const card of cards) {
                  if (card.sourceId)
                    dispatch({
                      type: 'BIND_CARD_TO_MATERIAL',
                      cardId: card.id,
                      materialId: card.sourceId,
                    })
                }
                dispatch({
                  type: 'ADD_TASK_ARTIFACT',
                  taskId,
                  artifact: { type: 'cards', label: 'Cards', count: cards.length },
                })
                // Update pipeline item
                const pipelineItemId = payload?.pipelineItemId as string | undefined
                if (pipelineItemId) {
                  dispatch({
                    type: 'UPDATE_PIPELINE_ITEM',
                    id: pipelineItemId,
                    updates: {
                      progress: `Extracted ${cards.length} cards...`,
                    },
                  })
                }
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
                dispatch({ type: 'ADD_TASK_LOG', taskId, message: `New deck: ${newDeck.title}` })
              } catch {
                /* ignore */
              }
              break
            }
            case 'material_curated': {
              try {
                const { materialId } = JSON.parse(evt.data)
                dispatch({
                  type: 'UPDATE_MATERIAL',
                  id: materialId,
                  updates: { status: 'curated' },
                })
              } catch {
                /* ignore */
              }
              break
            }
            case 'progress':
              dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
              break
            case 'done': {
              removeOp('curating')
              dispatch({ type: 'SET_STATUS', status: 'idle' })
              for (const mat of mats)
                dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, updates: { status: 'curated' } })
              // Clear isStreaming flag for all cards (consistent with inspire done handling)
              for (const card of project.cards) {
                if (card.isStreaming)
                  dispatch({ type: 'UPDATE_CARD', id: card.id, updates: { isStreaming: false } })
              }
              dispatch({ type: 'COMPLETE_TASK', taskId })
              requestIdMap.current.delete(taskId)
              const cardCount = project.cards.length
              updatePipelineItemForTask(payload, taskId, 'completed', 'Curation complete', {
                summary: `Extracted cards from ${mats.length} materials`,
                cardCount,
              })
              onComplete?.()
              break
            }
            case 'aborted':
              removeOp('curating')
              dispatch({ type: 'SET_STATUS', status: 'idle' })
              dispatch({
                type: 'UPDATE_TASK',
                id: taskId,
                updates: { status: 'cancelled', completedAt: Date.now() },
              })
              requestIdMap.current.delete(taskId)
              updatePipelineItemForTask(payload, taskId, 'error', 'Cancelled')
              break
            case 'error':
              removeOp('curating')
              setLastError(true)
              dispatch({ type: 'SET_STATUS', status: 'error' })
              dispatch({ type: 'FAIL_TASK', taskId, error: evt.data })
              requestIdMap.current.delete(taskId)
              updatePipelineItemForTask(payload, taskId, 'error', evt.data || 'Processing error')
              break
          }
        },
      )
      cancelRefs.current.set('curating', cancel)
    },
    [project, runningOps],
  )

  // ── Analyze → Outline ──
  const handleAnalyzeWithCallback = useCallback(
    (payload: Record<string, unknown> = {}, onComplete?: () => void) => {
      if (!deck || (!hasCards && !hasMaterials)) {
        onComplete?.()
        return
      }
      if (runningOps.has('analyzing')) return
      const taskId = createTask('Generate outline', deck.id, { taskType: 'analyze' })
      addOp('analyzing')
      dispatch({ type: 'SET_STATUS', status: 'analyzing' })
      updatePipelineItemForTask(
        payload,
        taskId,
        'executing',
        'Analyzing cards, generating outline...',
      )

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
                if (card.sourceId)
                  dispatch({
                    type: 'BIND_CARD_TO_MATERIAL',
                    cardId: card.id,
                    materialId: card.sourceId,
                  })
              } catch {
                /* ignore */
              }
              break
            }
            case 'progress':
              dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
              break
            case 'done': {
              removeOp('analyzing')
              dispatch({ type: 'SET_STATUS', status: 'idle' })
              dispatch({ type: 'COMPLETE_TASK', taskId })
              requestIdMap.current.delete(taskId)
              const slideCount = deck.outline.length
              updatePipelineItemForTask(payload, taskId, 'completed', 'Outline generated', {
                summary: `Generated ${slideCount} slides`,
                slideCount,
              })
              onComplete?.()
              break
            }
            case 'aborted':
              removeOp('analyzing')
              dispatch({ type: 'SET_STATUS', status: 'idle' })
              dispatch({
                type: 'UPDATE_TASK',
                id: taskId,
                updates: { status: 'cancelled', completedAt: Date.now() },
              })
              requestIdMap.current.delete(taskId)
              updatePipelineItemForTask(payload, taskId, 'error', 'Cancelled')
              break
            case 'error':
              removeOp('analyzing')
              setLastError(true)
              dispatch({ type: 'SET_STATUS', status: 'error' })
              dispatch({ type: 'FAIL_TASK', taskId, error: evt.data })
              requestIdMap.current.delete(taskId)
              updatePipelineItemForTask(payload, taskId, 'error', evt.data || 'Analysis error')
              break
          }
        },
      )
      cancelRefs.current.set('analyzing', cancel)
    },
    [deck, project, hasCards, hasMaterials, runningOps],
  )

  // ── Research ──
  const handleResearch = useCallback(
    (payload: Record<string, unknown> = {}) => {
      if (runningOps.has('researching')) return
      const topic = project.title || 'Research topic'
      const sessionId = genId()
      const angles: ResearchAngle[] = [
        {
          id: genId(),
          name: 'Deep Analysis',
          description: 'In-depth analysis of core ideas in existing materials',
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
          name: 'Case Studies',
          description: 'Find relevant concrete cases',
          status: 'idle',
          cardIds: [],
          logs: [],
        },
        {
          id: genId(),
          name: 'Counter Arguments',
          description: 'Explore opposing viewpoints and rebuttals',
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
      updatePipelineItemForTask(payload, taskId, 'executing', 'Researching from multiple angles...')

      const goals =
        ((window as unknown as Record<string, unknown>).__researchGoals as string[]) || []

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
              try {
                if (deck) {
                  const { outline } = JSON.parse(evt.data)
                  dispatch({ type: 'SET_OUTLINE', deckId: deck.id, outline })
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
                  message: `Research summary: ${summary.totalCards} new cards total`,
                })
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
              updatePipelineItemForTask(payload, taskId, 'completed', 'Research complete', {
                summary: `Multi-angle research complete, new cards produced`,
              })
              break
            case 'aborted':
              removeOp('researching')
              dispatch({ type: 'SET_STATUS', status: 'idle' })
              dispatch({
                type: 'UPDATE_TASK',
                id: taskId,
                updates: { status: 'cancelled', completedAt: Date.now() },
              })
              requestIdMap.current.delete(taskId)
              updatePipelineItemForTask(payload, taskId, 'error', 'Cancelled')
              break
            case 'error':
              removeOp('researching')
              setLastError(true)
              dispatch({ type: 'SET_STATUS', status: 'error' })
              dispatch({ type: 'FAIL_RESEARCH', sessionId, error: evt.data })
              dispatch({ type: 'FAIL_TASK', taskId, error: evt.data })
              requestIdMap.current.delete(taskId)
              updatePipelineItemForTask(payload, taskId, 'error', evt.data || 'Research error')
              break
          }
        },
      )
      cancelRefs.current.set('researching', cancel)
    },
    [project, deck, runningOps],
  )

  // ── Inspire ──
  const handleInspire = useCallback(
    (payload: Record<string, unknown> = {}) => {
      if (runningOps.has('inspiring')) return
      const taskId = createTask('Get inspiration')
      addOp('inspiring')
      dispatch({ type: 'SET_STATUS', status: 'curating' })
      updatePipelineItemForTask(
        payload,
        taskId,
        'executing',
        'AI is generating inspiration suggestions...',
      )

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
                  artifact: { type: 'cards', label: 'Inspiration cards', count: cards.length },
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
                if (card.isStreaming)
                  dispatch({ type: 'UPDATE_CARD', id: card.id, updates: { isStreaming: false } })
              }
              dispatch({ type: 'COMPLETE_TASK', taskId })
              requestIdMap.current.delete(taskId)
              updatePipelineItemForTask(payload, taskId, 'completed', 'Inspiration generated', {
                summary: 'New inspiration cards added to knowledge base',
              })
              break
            case 'aborted':
              removeOp('inspiring')
              dispatch({ type: 'SET_STATUS', status: 'idle' })
              dispatch({
                type: 'UPDATE_TASK',
                id: taskId,
                updates: { status: 'cancelled', completedAt: Date.now() },
              })
              requestIdMap.current.delete(taskId)
              updatePipelineItemForTask(payload, taskId, 'error', 'Cancelled')
              break
            case 'error':
              removeOp('inspiring')
              setLastError(true)
              dispatch({ type: 'SET_STATUS', status: 'error' })
              dispatch({ type: 'FAIL_TASK', taskId, error: evt.data })
              requestIdMap.current.delete(taskId)
              updatePipelineItemForTask(payload, taskId, 'error', evt.data || 'Inspiration error')
              break
          }
        },
      )
      cancelRefs.current.set('inspiring', cancel)
    },
    [project, deck, runningOps],
  )

  // ── Curate (simple wrapper) ──
  const handleCurate = useCallback(
    (materialIds?: string[], payload: Record<string, unknown> = {}) => {
      if (state.userSettings.autoPipeline && deckRef.current) {
        startPipeline(materialIds)
        return
      }
      handleCurateWithCallback(materialIds, payload)
    },
    [state.userSettings.autoPipeline, startPipeline, handleCurateWithCallback],
  )

  // ── Analyze (simple wrapper) ──
  const handleAnalyze = useCallback(
    (payload: Record<string, unknown> = {}) => {
      handleAnalyzeWithCallback(payload)
    },
    [handleAnalyzeWithCallback],
  )

  // ── Cancel all ──
  const handleCancel = useCallback(() => {
    for (const [, reqId] of requestIdMap.current) abortTask(reqId).catch(() => {})
    requestIdMap.current.clear()
    for (const [, cancelFn] of cancelRefs.current) cancelFn()
    cancelRefs.current.clear()
    setRunningOps(new Set())
    dispatch({ type: 'SET_STATUS', status: 'idle' })
    for (const t of project.tasks) {
      if (t.status === 'running')
        dispatch({
          type: 'UPDATE_TASK',
          id: t.id,
          updates: { status: 'cancelled', completedAt: Date.now() },
        })
    }
  }, [project.tasks])

  // ── Abort single task ──
  const handleAbortTask = useCallback(
    (taskId: string) => {
      const reqId = requestIdMap.current.get(taskId)
      if (reqId) {
        abortTask(reqId).catch(() => {})
        requestIdMap.current.delete(taskId)
      }
      const task = project.tasks.find((t) => t.id === taskId)
      if (task) {
        const opKey =
          task.taskType === 'curate'
            ? 'curating'
            : task.taskType === 'analyze'
              ? 'analyzing'
              : task.taskType === 'generate-ppt'
                ? 'generating'
                : task.taskType === 'update-ppt'
                  ? 'updating'
                  : task.taskType === 'research'
                    ? 'researching'
                    : task.taskType === 'inspire'
                      ? 'inspiring'
                      : task.name === 'Curate cards'
                        ? 'curating'
                        : task.name === 'Generate outline'
                          ? 'analyzing'
                          : task.name === 'Generate PPT'
                            ? 'generating'
                            : task.name === 'Update PPT'
                              ? 'updating'
                              : task.name === 'Deep Research'
                                ? 'researching'
                                : task.name === 'Get inspiration'
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
      }
      const stillRunning = project.tasks.filter((t) => t.status === 'running' && t.id !== taskId)
      if (stillRunning.length === 0) dispatch({ type: 'SET_STATUS', status: 'idle' })
    },
    [project.tasks],
  )

  // ── Unified dispatch interface (used by CommandHub) ──
  const dispatchAction = useCallback(
    (action: string, payload: Record<string, unknown> = {}) => {
      switch (action) {
        case 'curate':
          handleCurate(payload.materialIds as string[] | undefined, payload)
          break
        case 'analyze':
          handleAnalyze(payload)
          break
        case 'research':
          handleResearch(payload)
          break
        case 'inspire':
          handleInspire(payload)
          break
        case 'theme':
          // Handled by App (open theme drawer)
          break
        case 'new_deck':
          // Handled by App
          break
        case 'export':
          // Handled by App
          break
      }
    },
    [handleCurate, handleAnalyze, handleResearch, handleInspire],
  )

  return {
    dispatchAction,
    handleCurate,
    handleAnalyze,
    handleResearch,
    handleInspire,
    handleCancel,
    handleAbortTask,
    isOpRunning,
    isWorking,
    lastError,
    setLastError,
    hasMaterials,
    hasCards,
    hasOutline,
    runningOps,
    startPipeline,
  }
}
