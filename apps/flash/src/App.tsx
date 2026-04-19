import { BookOpen, Layers, Loader2, Puzzle, RotateCcw, Settings, Square, X } from 'lucide-react'
import { useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { listSkills, loadProject, loadSettings, saveProject, saveSettings } from './api'
import CardGrid from './components/CardGrid'
import CommandHub from './components/CommandHub'
import OutlineEditor from './components/OutlineEditor'
import RequirementPipeline from './components/RequirementPipeline'
import SettingsPanel from './components/SettingsPanel'
import { useAIHandlers } from './hooks/useAIHandlers'
import { AppContext, createInitialState, getActiveDeck, reducer } from './store'
import type { UserSettings } from './types'

// ── App Wrapper (mounts inner component after providing Context) ──
export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <AppLayout />
    </AppContext.Provider>
  )
}

// ── Actual layout ──
function AppLayout() {
  const storeCtx = __useAppDirect()
  const { state, dispatch } = storeCtx

  const [showSettings, setShowSettings] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [showStoryboard, setShowStoryboard] = useState(false)
  const [commandHubCollapsed, setCommandHubCollapsed] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [linkingMode, setLinkingMode] = useState<{ deckId: string; outlineId: string } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')

  const activeDeck = getActiveDeck(state.project)
  const runningTasks = state.project.tasks.filter((t) => t.status === 'running')

  // ── AI handlers hook ──
  const ai = useAIHandlers()

  // ── Global functions exposed for heartbeat and TaskCenter ──
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>
    win.__handleCurate = (ids?: string[]) => ai.handleCurate(ids)
    win.__handleInspire = () => ai.handleInspire()
    win.__handleResearch = () => ai.handleResearch()
    win.__handleAnalyze = () => ai.handleAnalyze()
    win.__isOpRunning = ai.isOpRunning
    win.__handleAbortTask = ai.handleAbortTask
  }, [ai])

  // ── Persistence: load on startup ──
  useEffect(() => {
    loadProject()
      .then((res) => {
        if (res.ok && res.data) {
          const saved = res.data as { project?: unknown }
          if (saved.project) {
            dispatch({ type: 'SET_PROJECT', project: saved.project as import('./types').Project })
            lastSavedRef.current = JSON.stringify(saved)
          }
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // ── Persistence: auto-save ──
  useEffect(() => {
    if (!loaded) return
    const lightProject = {
      ...state.project,
      tasks: state.project.tasks.map((t) => {
        const { logs, ...rest } = t as unknown as Record<string, unknown>
        return rest
      }),
    }
    const fingerprint = JSON.stringify({ project: lightProject })
    if (fingerprint === lastSavedRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = fingerprint
      saveProject({ project: state.project }).catch(() => {})
    }, 1000)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [state.project, loaded])

  // ── Settings: load ──
  useEffect(() => {
    loadSettings()
      .then((res) => {
        if (res.ok && res.data) {
          if (res.data.userSettings)
            dispatch({
              type: 'SET_USER_SETTINGS',
              settings: res.data.userSettings as Partial<UserSettings>,
            })
        }
      })
      .catch(() => {})
  }, [])

  // ── Settings: auto-save ──
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current)
    settingsTimerRef.current = setTimeout(() => {
      saveSettings({ userSettings: state.userSettings }).catch(() => {})
    }, 1000)
    return () => {
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current)
    }
  }, [state.userSettings])

  // ── Skills: load ──
  useEffect(() => {
    listSkills()
      .then((res) => {
        if (res.ok && res.data) dispatch({ type: 'SET_SKILLS', skills: res.data })
      })
      .catch(() => {})
  }, [])

  // ══════════════════════════════════════════════
  // ❤️ Heartbeat mechanism
  // ══════════════════════════════════════════════
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastInspireRef = useRef(0)
  const lastAutoResearchRef = useRef(0)

  useEffect(() => {
    if (!loaded) return
    const interval = (state.userSettings.heartbeatInterval || 120) * 1000
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)

    heartbeatRef.current = setInterval(() => {
      const win = window as unknown as Record<string, unknown>
      const isOpRunning = win.__isOpRunning as ((op: string) => boolean) | undefined
      const isAnyRunning = isOpRunning
        ? isOpRunning('curating') ||
          isOpRunning('analyzing') ||
          isOpRunning('generating') ||
          isOpRunning('researching') ||
          isOpRunning('inspiring')
        : state.project.status !== 'idle'
      if (isAnyRunning) return

      const now = Date.now()
      const hasMats = state.project.materials.length > 0
      const hasCards = state.project.cards.length > 0

      if (state.userSettings.autoInspire && (hasMats || hasCards)) {
        if (now - lastInspireRef.current > 180_000) {
          lastInspireRef.current = now
          const handleInspire = win.__handleInspire as (() => void) | undefined
          if (handleInspire) {
            dispatch({ type: 'ADD_LOG', message: '💡 Heartbeat: auto-inspire triggered' })
            handleInspire()
          }
          return
        }
      }

      if (state.userSettings.autoResearch && hasMats) {
        if (now - lastAutoResearchRef.current > 300_000) {
          const uncuratedMats = state.project.materials.filter((m) => m.status === 'uploaded')
          const curatedMats = state.project.materials.filter((m) => m.status === 'curated')
          if (curatedMats.length > 0 && hasCards) {
            lastAutoResearchRef.current = now
            const handleResearch = win.__handleResearch as (() => void) | undefined
            if (handleResearch) {
              dispatch({ type: 'ADD_LOG', message: '🔬 Heartbeat: auto-research triggered' })
              handleResearch()
            }
            return
          }
          if (uncuratedMats.length > 0) {
            const handleCurate = win.__handleCurate as ((ids?: string[]) => void) | undefined
            if (handleCurate) {
              dispatch({
                type: 'ADD_LOG',
                message: '📋 Heartbeat: auto-curating unprocessed materials',
              })
              handleCurate(uncuratedMats.map((m) => m.id))
            }
            return
          }
        }
      }

      if (state.userSettings.autoConsumeTodos) {
        const pendingTodos = state.project.todos.filter((t) => !t.done)
        if (pendingTodos.length > 0 && hasCards) {
          const ad = getActiveDeck(state.project)
          if (ad && ad.outline.length > 0) {
            const handleAnalyze = win.__handleAnalyze as (() => void) | undefined
            if (handleAnalyze) {
              dispatch({
                type: 'ADD_LOG',
                message: `📝 Heartbeat: consuming requirement queue (${pendingTodos.length} pending)`,
              })
              handleAnalyze()
            }
          }
        }
      }
    }, interval)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [
    loaded,
    state.userSettings.heartbeatInterval,
    state.userSettings.autoInspire,
    state.userSettings.autoResearch,
    state.userSettings.autoConsumeTodos,
    state.project.materials.length,
    state.project.cards.length,
    state.project.todos.length,
    state.project.status,
  ])

  // ── CommandHub action dispatch ──
  const handleCommandAction = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      // Card commands are dispatched directly to the physics engine
      if (action === 'card_cmd' && payload?.rawCommand) {
        const win = window as unknown as Record<string, unknown>
        const exec = win.__executeCardCommand as ((text: string) => unknown) | undefined
        if (exec) {
          exec(payload.rawCommand as string)
        } else {
          dispatch({ type: 'ADD_LOG', message: '⚠️ Card command system not ready' })
        }
        return
      }
      ai.dispatchAction(action, payload || {})
    },
    [ai, dispatch],
  )

  // ── Outline card linking ──
  const handleRequestLinkCard = useCallback((deckId: string, outlineId: string) => {
    setLinkingMode({ deckId, outlineId })
  }, [])

  const handleLinkToOutline = useCallback(
    (deckId: string, outlineId: string, cardId: string) => {
      dispatch({ type: 'LINK_CARD_TO_OUTLINE', deckId, outlineId, cardId })
      setLinkingMode(null)
    },
    [dispatch],
  )

  const hasCards = state.project.cards.length > 0
  const outlineCount = activeDeck?.outline.length || 0

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      {/* ═══════════════ Main Body ═══════════════ */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Infinite canvas — always shows all cards */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <CardGrid linkingMode={linkingMode} onLinkToOutline={handleLinkToOutline} />

            {/* ── Top-right floating toolbar ── */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
              {runningTasks.length > 0 && (
                <div className="flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5">
                  <Loader2 className="h-3 w-3 animate-spin text-brand-400" />
                  <span className="text-[10px] text-brand-300">{runningTasks.length}</span>
                </div>
              )}
              {ai.isWorking && (
                <button
                  onClick={ai.handleCancel}
                  className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/20"
                >
                  <Square className="h-3 w-3" />
                  Cancel
                </button>
              )}
              {ai.lastError && !ai.isWorking && (
                <button
                  onClick={() => {
                    ai.setLastError(false)
                    dispatch({ type: 'SET_STATUS', status: 'idle' })
                  }}
                  className="rounded-md px-1.5 py-1 text-[11px] text-zinc-400 transition hover:bg-surface-3"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="rounded p-1.5 text-zinc-600 transition hover:text-zinc-300 hover:bg-surface-3/60"
                title="Personal Settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* ── Storyboard panel (right drawer) ── */}
            {showStoryboard && (
              <div className="absolute top-0 right-0 bottom-0 w-[380px] border-l border-border bg-surface z-20 flex flex-col animate-slide-in shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-xs font-semibold text-zinc-200">Storyboard</span>
                    {outlineCount > 0 && (
                      <span className="rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300 leading-none">
                        {outlineCount}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowStoryboard(false)}
                    className="rounded p-0.5 text-zinc-600 hover:text-zinc-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <OutlineEditor onRequestLinkCard={handleRequestLinkCard} />
                </div>
              </div>
            )}

            {/* ── Running Tasks + bottom floating CommandHub ── */}
            <div
              className={`command-hub-overlay ${commandHubCollapsed ? 'command-hub-overlay-collapsed' : ''}`}
            >
              {/* Pipeline items — above CommandHub */}
              <div className="mb-1.5 max-h-[30vh] overflow-y-auto">
                <RequirementPipeline />
              </div>
              <CommandHub
                onAction={handleCommandAction}
                collapsed={commandHubCollapsed}
                onToggleCollapse={() => setCommandHubCollapsed((prev) => !prev)}
                outlineCount={outlineCount}
                onShowStoryboard={() => setShowStoryboard((prev) => !prev)}
              />
            </div>
          </div>
        </main>

        {/* Settings Panel */}
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </div>

      {/* ═══════════════ Skills Overlay ═══════════════ */}
      {showSkills && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSkills(false)}
        >
          <div
            className="w-full max-w-lg max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-surface-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Puzzle className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-medium text-zinc-200">Skill Center</span>
              </div>
              <button
                onClick={() => setShowSkills(false)}
                className="rounded p-1 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {state.project.skills.length === 0 ? (
                <p className="text-center text-xs text-zinc-500 py-8">No skills available</p>
              ) : (
                state.project.skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <span className="text-xl">{skill.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-200">{skill.name}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{skill.description}</p>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        skill.status === 'installed'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : skill.builtin
                            ? 'bg-zinc-500/10 text-zinc-400'
                            : 'bg-surface-3 text-zinc-500'
                      }`}
                    >
                      {skill.status === 'installed'
                        ? 'Installed'
                        : skill.builtin
                          ? 'Built-in'
                          : 'Available'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Direct AppContext usage (avoid circular imports) ──
function __useAppDirect() {
  return useContext(AppContext)
}
