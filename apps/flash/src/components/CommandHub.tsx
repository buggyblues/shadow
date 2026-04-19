import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Command,
  FileText,
  Loader2,
  Microscope,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { addTextMaterial, genId, uploadMaterials } from '../api'
import { getActiveDeck, useApp } from '../store'
import type { Material, PipelineItem } from '../types'

// ── Quick action definitions ──
const QUICK_ACTIONS = [
  {
    id: 'curate',
    label: 'Curate',
    icon: RefreshCw,
    desc: 'Organize materials into cards',
    color: 'text-amber-400 hover:bg-amber-500/10',
  },
  {
    id: 'inspire',
    label: 'Inspire',
    icon: Sparkles,
    desc: 'AI-generated inspiration ideas',
    color: 'text-purple-400 hover:bg-purple-500/10',
  },
  {
    id: 'analyze',
    label: 'Outline',
    icon: FileText,
    desc: 'Generate outline from cards',
    color: 'text-cyan-400 hover:bg-cyan-500/10',
  },
  {
    id: 'research',
    label: 'Deep Research',
    icon: Microscope,
    desc: 'In-depth multi-angle research',
    color: 'text-emerald-400 hover:bg-emerald-500/10',
  },
]

// ── Slash commands (triggered when typing /) ──
const SLASH_COMMANDS = [
  {
    cmd: '/curate',
    label: 'Re-Curate',
    desc: 'Re-organize all materials into cards',
    action: 'curate',
  },
  {
    cmd: '/inspire',
    label: 'Get Inspiration',
    desc: 'AI-generated creative ideas and inspiration',
    action: 'inspire',
  },
  {
    cmd: '/outline',
    label: 'Generate Outline',
    desc: 'Intelligently generate outline from cards',
    action: 'analyze',
  },
  {
    cmd: '/research',
    label: 'Deep Research',
    desc: 'In-depth multi-angle research on current topic',
    action: 'research',
  },
  { cmd: '/new', label: 'New Deck', desc: 'Create a new Deck', action: 'new_deck' },
  { cmd: '/theme', label: 'Select Theme', desc: 'Change visual theme', action: 'theme' },
  // ── Card commands ──
  {
    cmd: '/move',
    label: 'Move Card',
    desc: 'Progressively move card to specified position',
    action: 'card_cmd',
  },
  { cmd: '/flip', label: 'Flip Card', desc: 'Flip card to the other side', action: 'card_cmd' },
  {
    cmd: '/rotate',
    label: 'Rotate Card',
    desc: 'Rotate card to specified angle',
    action: 'card_cmd',
  },
  {
    cmd: '/trash',
    label: 'Trash Card',
    desc: 'Move card to trash (with animation)',
    action: 'card_cmd',
  },
  {
    cmd: '/link',
    label: 'Link Cards',
    desc: 'Connect two cards with an elastic rope',
    action: 'card_cmd',
  },
  { cmd: '/toggle', label: 'Show/Hide', desc: 'Show or hide card', action: 'card_cmd' },
  {
    cmd: '/highlight',
    label: 'Highlight Card',
    desc: 'Highlight card (with pulse animation)',
    action: 'card_cmd',
  },
  {
    cmd: '/focus',
    label: 'Focus Card',
    desc: 'Focus canvas on specified card',
    action: 'card_cmd',
  },
  { cmd: '/lock', label: 'Lock Card', desc: 'Lock/unlock card position', action: 'card_cmd' },
  { cmd: '/play', label: 'Play Animation', desc: 'Play card animation', action: 'card_cmd' },
  { cmd: '/pause', label: 'Pause Animation', desc: 'Pause card animation', action: 'card_cmd' },
  { cmd: '/act', label: 'Trigger Action', desc: 'Trigger card custom action', action: 'card_cmd' },
  { cmd: '/add', label: 'Add Card', desc: 'Add new card to canvas', action: 'card_cmd' },
  {
    cmd: '/scan',
    label: 'Scan Nearby',
    desc: 'Check cards around the specified card',
    action: 'card_cmd',
  },
]

// ── Intent detection: natural language → ACP action ──
function detectIntent(text: string): string {
  const t = text.trim().toLowerCase()
  // research
  if (/(research|investigate|study|find|search)/.test(t)) return 'research'
  // inspire
  if (/(inspire|inspiration|idea|suggest|recommend)/.test(t)) return 'inspire'
  // analyze/outline
  if (/(outline|structure|analyze|plan|framework)/.test(t)) return 'analyze'
  // curate
  if (/(curate|organize|extract|summarize)/.test(t)) return 'curate'
  // new deck
  if (/^(new|create|add|make)/.test(t)) return 'new_deck'
  // fallback: record as requirement
  return 'todo'
}

interface CommandHubProps {
  onAction: (action: string, payload?: Record<string, unknown>) => void
  /** Whether collapsed */
  collapsed: boolean
  /** Toggle collapse/expand */
  onToggleCollapse: () => void
  /** Storyboard outline count */
  outlineCount?: number
  /** Click storyboard badge */
  onShowStoryboard?: () => void
}

export default function CommandHub({
  onAction,
  collapsed,
  onToggleCollapse,
  outlineCount = 0,
  onShowStoryboard,
}: CommandHubProps) {
  const { state, dispatch } = useApp()
  const activeDeck = getActiveDeck(state.project)
  const [input, setInput] = useState('')
  const [showSlash, setShowSlash] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus
  useEffect(() => {
    if (collapsed) return
    textareaRef.current?.focus()
  }, [collapsed])

  // ── Textarea auto-grow ──
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  // ── Material drag-and-drop handler ──
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      // Auto-expand on drop
      if (collapsed) onToggleCollapse()
      setIsUploading(true)

      // Create pipeline item
      const pipelineId = genId()
      const pipelineItem: PipelineItem = {
        id: pipelineId,
        title: `Upload ${acceptedFiles.length} file(s)`,
        status: 'reading',
        progress: 'Uploading materials...',
        taskId: '',
        actionType: 'curate',
        deckId: activeDeck?.id || null,
        createdAt: Date.now(),
      }
      dispatch({ type: 'ADD_PIPELINE_ITEM', item: pipelineItem })

      // Upload placeholders
      const placeholders: Material[] = acceptedFiles.map((f) => ({
        id: genId(),
        name: f.name,
        type: detectFileType(f),
        mimeType: f.type,
        size: f.size,
        status: 'uploading' as const,
        cardIds: [],
        uploadedAt: Date.now(),
      }))
      dispatch({ type: 'ADD_MATERIALS', materials: placeholders })

      const result = await uploadMaterials(state.project.id, acceptedFiles)
      if (result.ok && result.data) {
        const uploadedIds: string[] = []
        for (let i = 0; i < placeholders.length; i++) {
          const serverMat = result.data[i]
          if (serverMat) {
            dispatch({
              type: 'UPDATE_MATERIAL',
              id: placeholders[i].id,
              updates: { ...serverMat, id: placeholders[i].id, status: 'uploaded', cardIds: [] },
            })
            uploadedIds.push(placeholders[i].id)
          }
        }
        // Update pipeline status
        dispatch({
          type: 'UPDATE_PIPELINE_ITEM',
          id: pipelineId,
          updates: {
            status: 'executing',
            progress: `Uploaded ${acceptedFiles.length} file(s), extracting cards...`,
          },
        })
        // Trigger curate
        if (uploadedIds.length > 0) {
          onAction('curate', { materialIds: uploadedIds, pipelineItemId: pipelineId })
        }
      } else {
        for (const p of placeholders) {
          dispatch({
            type: 'UPDATE_MATERIAL',
            id: p.id,
            updates: { status: 'error', error: result.error || 'Upload failed' },
          })
        }
        dispatch({
          type: 'UPDATE_PIPELINE_ITEM',
          id: pipelineId,
          updates: { status: 'error', progress: 'Upload failed, please retry' },
        })
      }
      setIsUploading(false)
    },
    [state.project.id, activeDeck, dispatch, onAction, collapsed, onToggleCollapse],
  )

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openFileDialog,
  } = useDropzone({
    onDrop,
    maxSize: 100 * 1024 * 1024,
    noClick: true,
    noKeyboard: true,
  })

  // ── Send command ──
  const handleSend = () => {
    const text = input.trim()
    if (!text) return

    // Save history
    setHistory((prev) => [text, ...prev.slice(0, 49)])
    setHistoryIdx(-1)

    // Slash command
    const slashCmd = SLASH_COMMANDS.find((c) => text.startsWith(c.cmd))
    if (slashCmd) {
      // Card commands are dispatched directly to the physics engine
      if (slashCmd.action === 'card_cmd') {
        onAction('card_cmd', { rawCommand: text })
        setInput('')
        setShowSlash(false)
        return
      }
      const extra = text.slice(slashCmd.cmd.length).trim()
      // Create pipeline item (slash commands also enter the pipeline)
      const pipelineId = genId()
      const pipelineItem: PipelineItem = {
        id: pipelineId,
        title: `${slashCmd.label}${extra ? `: ${extra}` : ''}`,
        status: 'queued',
        progress: 'Waiting to execute...',
        taskId: '',
        actionType: slashCmd.action,
        deckId: activeDeck?.id || null,
        createdAt: Date.now(),
      }
      dispatch({ type: 'ADD_PIPELINE_ITEM', item: pipelineItem })
      onAction(slashCmd.action, { instruction: extra || undefined, pipelineItemId: pipelineId })
      setInput('')
      setShowSlash(false)
      return
    }

    // Natural language intent
    const intent = detectIntent(text)

    // Create pipeline item
    const pipelineId = genId()
    const pipelineItem: PipelineItem = {
      id: pipelineId,
      title: text,
      status: intent === 'todo' ? 'queued' : 'reading',
      progress:
        intent === 'todo' ? 'Waiting to execute...' : '📖 AI is understanding your request...',
      taskId: '',
      actionType: intent,
      deckId: activeDeck?.id || null,
      createdAt: Date.now(),
    }
    dispatch({ type: 'ADD_PIPELINE_ITEM', item: pipelineItem })

    if (intent === 'todo') {
      // Add as TODO requirement — keep queued status, don't auto-complete
      dispatch({
        type: 'ADD_TODO',
        todo: { id: genId(), text, done: false, createdAt: Date.now() },
      })
      dispatch({
        type: 'UPDATE_PIPELINE_ITEM',
        id: pipelineId,
        updates: {
          status: 'queued',
          progress: 'Requirement recorded, will be included in next generation',
        },
      })
    } else {
      onAction(intent, { instruction: text, pipelineItemId: pipelineId })
    }

    setInput('')
    setShowSlash(false)
  }

  // ── Quick action buttons ──
  const handleQuickAction = (actionId: string) => {
    const pipelineId = genId()
    const action = QUICK_ACTIONS.find((a) => a.id === actionId)
    const pipelineItem: PipelineItem = {
      id: pipelineId,
      title: action?.desc || actionId,
      status: 'queued',
      progress: 'Waiting to execute...',
      taskId: '',
      actionType: actionId,
      deckId: activeDeck?.id || null,
      createdAt: Date.now(),
    }
    dispatch({ type: 'ADD_PIPELINE_ITEM', item: pipelineItem })
    onAction(actionId, { pipelineItemId: pipelineId })
  }

  // ── Keyboard handling ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // History navigation
    if (e.key === 'ArrowUp' && !input) {
      e.preventDefault()
      const nextIdx = Math.min(historyIdx + 1, history.length - 1)
      setHistoryIdx(nextIdx)
      if (history[nextIdx]) setInput(history[nextIdx])
    }
    if (e.key === 'ArrowDown' && historyIdx >= 0) {
      e.preventDefault()
      const nextIdx = historyIdx - 1
      setHistoryIdx(nextIdx)
      setInput(nextIdx >= 0 ? history[nextIdx] : '')
    }
    // Slash command trigger
    if (e.key === '/' && !input) {
      setShowSlash(true)
    }
    if (e.key === 'Escape') {
      setShowSlash(false)
      // Collapse on Esc
      if (!showSlash) onToggleCollapse()
    }
  }

  // ── Collapsed state search box Enter handling ──
  const handleCollapsedKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // Expand, transfer search content to textarea
      onToggleCollapse()
      // input doesn't need to sync because input state is already bound
    }
    if (e.key === '/' && !input) {
      // Expand and show slash menu
      onToggleCollapse()
      setShowSlash(true)
    }
  }

  // ── Input change ──
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    if (val.startsWith('/')) {
      setShowSlash(true)
      setSlashFilter(val.slice(1))
    } else {
      setShowSlash(false)
      setSlashFilter('')
    }
  }

  // ── Search box input change when collapsed ──
  const handleCollapsedInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const filteredCommands = SLASH_COMMANDS.filter(
    (c) => !slashFilter || c.cmd.includes(slashFilter) || c.label.includes(slashFilter),
  )

  const isWorking =
    state.project.status !== 'idle' &&
    state.project.status !== 'done' &&
    state.project.status !== 'error'
  const hasMaterials = state.project.materials.length > 0
  const hasCards = state.project.cards.length > 0
  const runningTasks = state.project.tasks.filter((t) => t.status === 'running')
  const runningPipeline =
    state.pipelineItems?.filter((p) => p.status === 'reading' || p.status === 'executing') || []

  // ── Task carousel ──
  const [carouselIdx, setCarouselIdx] = useState(0)
  const carouselItems = [
    ...runningTasks.map((t) => t.name || t.taskType || 'Processing'),
    ...runningPipeline.map((p) => p.title || p.progress || 'Processing'),
  ]

  useEffect(() => {
    if (carouselItems.length <= 1) {
      setCarouselIdx(0)
      return
    }
    const timer = setInterval(() => {
      setCarouselIdx((prev) => (prev + 1) % carouselItems.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [carouselItems.length])

  // ══════════════════════════════════════════════════
  // Collapsed state — show only search box + dashed drag area
  // ══════════════════════════════════════════════════
  // Calculate progress percentage (average of all executing tasks)
  const executingItems = (state.pipelineItems || []).filter(
    (p) => p.status === 'executing' || p.status === 'reading',
  )
  const avgPercent =
    executingItems.length > 0
      ? Math.round(
          executingItems.reduce((sum, p) => sum + (p.percent || 0), 0) / executingItems.length,
        )
      : 0

  if (collapsed) {
    return (
      <div
        className={`command-hub-floating command-hub-collapsed ${isWorking ? 'command-hub-active' : ''}`}
        {...getRootProps()}
      >
        {/* Rainbow glow */}
        <div className="command-hub-rainbow-glow" />
        {/* Light effect layer */}
        <div className="command-hub-glow-inner" />
        <div className="command-hub-scanline" />
        <div className="command-hub-highlight" />
        <input {...getInputProps()} />

        {/* Drag-and-drop overlay */}
        {isDragActive && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-400 bg-brand-500/10 backdrop-blur-sm">
            <Upload className="h-5 w-5 text-brand-300 mr-2" />
            <p className="text-xs font-medium text-brand-300">Drop to upload</p>
          </div>
        )}

        <div className="command-hub-content">
          {/* Single row: input + expand button */}
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleCollapsedInputChange}
                onKeyDown={handleCollapsedKeyDown}
                onFocus={onToggleCollapse}
                placeholder={
                  isWorking ? 'AI is working...' : 'Drop files here, or type your request...'
                }
                className="w-full rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/30 transition"
              />
            </div>

            <button
              onClick={onToggleCollapse}
              className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition hover:text-zinc-400 hover:bg-white/[0.04]"
              title="Expand"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Progress indicator (shown only when working) */}
          {isWorking && (
            <div className="flex items-center gap-2 mt-1.5 px-0.5 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1 text-brand-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
                {carouselItems[carouselIdx] || 'Processing'}
                {executingItems.length > 1 && (
                  <span className="text-[9px] text-zinc-600 ml-0.5">
                    {carouselIdx + 1}/{carouselItems.length}
                  </span>
                )}
              </span>

              {/* Compact progress bar */}
              {avgPercent > 0 && (
                <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden ml-1">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${avgPercent}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════
  // Expanded state — full command hub
  // ══════════════════════════════════════════════════
  return (
    <div
      className={`command-hub-floating command-hub-expanded ${isWorking ? 'command-hub-active' : ''}`}
      {...getRootProps()}
    >
      {/* Rainbow glow */}
      <div className="command-hub-rainbow-glow" />
      {/* Light effect layer */}
      <div className="command-hub-glow-inner" />
      <div className="command-hub-scanline" />
      <div className="command-hub-highlight" />
      <input {...getInputProps()} />

      {/* Drag-and-drop overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-400 bg-brand-500/10 backdrop-blur-sm">
          <div className="text-center">
            <Upload className="h-8 w-8 text-brand-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-brand-300">Drop to upload materials</p>
            <p className="text-xs text-brand-400/60 mt-1">
              Supports PDF, Word, PPT, images, text, and more
            </p>
          </div>
        </div>
      )}

      {/* Slash command panel */}
      {showSlash && (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-30 max-h-64 overflow-y-auto rounded-lg border border-white/[0.06] bg-[#0e0e12]/90 shadow-xl animate-fade-in backdrop-blur-xl">
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.cmd}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/[0.04]"
              onClick={() => {
                setInput(cmd.cmd + ' ')
                setShowSlash(false)
                textareaRef.current?.focus()
              }}
            >
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                {cmd.cmd}
              </span>
              <span className="text-xs font-medium text-zinc-300">{cmd.label}</span>
              <span className="flex-1 text-right text-[10px] text-zinc-600">{cmd.desc}</span>
            </button>
          ))}
        </div>
      )}

      <div className="command-hub-content">
        {/* ═══ Collapse button ═══ */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Command className="h-3 w-3" />
            <span>Command Hub</span>
            {isWorking && (
              <span className="flex items-center gap-1 text-brand-400 ml-2">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                AI working
              </span>
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            className="rounded-md p-1 text-zinc-600 transition hover:text-zinc-400 hover:bg-surface/50"
            title="Collapse command hub (Esc)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ═══ Material drop area — above input, large dashed border ═══ */}
        <div
          onClick={openFileDialog}
          className={`mb-2 flex items-center justify-center rounded-xl border-2 border-dashed transition-all cursor-pointer ${
            isDragActive
              ? 'border-brand-400 bg-brand-500/10 py-6'
              : isUploading
                ? 'border-brand-400/40 bg-brand-500/5 py-5'
                : 'border-zinc-700/40 hover:border-brand-500/40 hover:bg-brand-500/5 py-5'
          }`}
        >
          <div className="flex items-center gap-3 text-center">
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-brand-400" />
            ) : (
              <Upload className={`h-5 w-5 ${isDragActive ? 'text-brand-300' : 'text-zinc-600'}`} />
            )}
            <div>
              <p
                className={`text-xs font-medium ${isDragActive ? 'text-brand-300' : isUploading ? 'text-brand-400' : 'text-zinc-500'}`}
              >
                {isDragActive
                  ? 'Drop to upload materials'
                  : isUploading
                    ? 'Uploading...'
                    : 'Drop files here, or click to select'}
              </p>
              <p className="text-[10px] text-zinc-700 mt-0.5">
                Supports PDF, Word, PPT, images, text, and more
              </p>
            </div>
          </div>
        </div>

        {/* ═══ Main input area ═══ */}
        <div
          className={`rounded-xl border transition-all ${'border-border/50 bg-surface/30 focus-within:border-brand-500/40 focus-within:shadow-[0_0_12px_0_rgba(59,130,246,0.06)]'}`}
        >
          {/* Textarea section */}
          <div className="px-3 pt-3 pb-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder={
                isWorking
                  ? 'AI is working...you can continue typing new commands'
                  : 'Enter your request, e.g. "Create a PPT about AI trends"\nType / to view slash commands\nShift+Enter for new line, Enter to send'
              }
              className="w-full resize-none bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none leading-relaxed"
              style={{ minHeight: '72px', maxHeight: '160px' }}
            />
          </div>

          {/* Divider */}
          <div className="mx-3 border-t border-border/30" />

          {/* Bottom action bar: material stats + send */}
          <div className="flex items-center gap-2 px-3 py-2">
            {/* Material count hint */}
            {hasMaterials && (
              <span className="text-[10px] text-zinc-600">
                {state.project.materials.length} material(s)
                {hasCards && `, ${state.project.cards.length} card(s)`}
              </span>
            )}

            {/* Right spacer */}
            <div className="flex-1" />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                input.trim()
                  ? 'bg-brand-600 text-white hover:bg-brand-500'
                  : 'bg-surface-3/50 text-zinc-600 cursor-not-allowed'
              }`}
              title="Send (Enter)"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          </div>
        </div>

        {/* ═══ Quick actions bar ═══ */}
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto scrollbar-none">
          <Zap className="h-3 w-3 text-zinc-600 shrink-0" />
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.id)}
                className={`flex items-center gap-1 shrink-0 rounded-md border border-transparent px-2 py-1 text-[11px] font-medium transition ${action.color}`}
                title={action.desc}
              >
                <Icon className="h-3 w-3" />
                {action.label}
              </button>
            )
          })}

          {/* Storyboard badge — bottom right */}
          <div className="flex-1" />
          <button
            onClick={onShowStoryboard}
            className="flex shrink-0 items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/25 px-2.5 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/25 transition"
            title="Storyboard"
          >
            <BookOpen className="h-3 w-3" />
            Storyboard
            {outlineCount > 0 && (
              <span className="rounded-full bg-cyan-500/30 px-1.5 text-[9px] text-cyan-200 leading-4">
                {outlineCount}
              </span>
            )}
          </button>
        </div>
      </div>
      {/* end command-hub-content */}
    </div>
  )
}

// ── File type detection ──
function detectFileType(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  const map: Record<string, string> = {
    pdf: 'pdf',
    txt: 'text',
    md: 'markdown',
    csv: 'csv',
    json: 'json',
    docx: 'docx',
    xlsx: 'xlsx',
  }
  return map[ext] || 'unknown'
}
