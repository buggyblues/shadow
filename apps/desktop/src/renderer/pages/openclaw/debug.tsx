/**
 * OpenClaw Debug Page
 *
 * Execute openclaw CLI commands and inspect results in a terminal-like interface.
 * Commands are run via the bundled openclaw entry point with full environment isolation.
 */

import { Loader2, Play, Terminal, Trash2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openClawApi } from '../../lib/openclaw-api'
import { OpenClawButton } from './openclaw-ui'

interface CommandResult {
  id: number
  args: string
  code: number | null
  stdout: string
  stderr: string
  timestamp: number
  durationMs: number
}

const COMMAND_PRESETS = [
  { label: 'version', args: '--version' },
  { label: 'help', args: '--help' },
  { label: 'gateway status', args: 'gateway --help' },
  { label: 'config show', args: 'config show' },
  { label: 'config validate', args: 'config validate' },
  { label: 'skills list', args: 'skills list' },
  { label: 'agents list', args: 'agents list' },
]

export function DebugPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState<CommandResult[]>([])
  const nextId = useRef(1)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const executeCommand = useCallback(
    async (rawArgs?: string) => {
      const cmd = rawArgs ?? input.trim()
      if (!cmd || running) return

      // Split arguments respecting quoted strings
      const args =
        cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((s) => s.replace(/^["']|["']$/g, '')) ?? []
      if (args.length === 0) return

      setRunning(true)
      const start = Date.now()

      try {
        const result = await openClawApi.execCli(args)
        const entry: CommandResult = {
          id: nextId.current++,
          args: cmd,
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
          timestamp: start,
          durationMs: Date.now() - start,
        }
        setHistory((prev) => [...prev, entry])
      } catch (err) {
        setHistory((prev) => [
          ...prev,
          {
            id: nextId.current++,
            args: cmd,
            code: 1,
            stdout: '',
            stderr: err instanceof Error ? err.message : String(err),
            timestamp: start,
            durationMs: Date.now() - start,
          },
        ])
      } finally {
        setRunning(false)
        if (!rawArgs) setInput('')
        // Scroll to bottom after render
        requestAnimationFrame(() => {
          outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' })
        })
      }
    },
    [input, running],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        executeCommand()
      }
    },
    [executeCommand],
  )

  return (
    <div className="flex flex-col h-full p-6 pt-8 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-bg-modifier-hover flex items-center justify-center">
            <Terminal className="w-5 h-5 text-text-muted" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary">
              {t('openclaw.debug.title', '调试控制台')}
            </h1>
            <p className="text-xs text-text-muted">
              {t('openclaw.debug.subtitle', '执行 openclaw CLI 命令并查看结果')}
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <OpenClawButton variant="ghost" size="sm" onClick={() => setHistory([])}>
            <Trash2 className="w-3.5 h-3.5" />
            {t('openclaw.debug.clear', '清空')}
          </OpenClawButton>
        )}
      </div>

      {/* Preset Commands */}
      <div className="flex flex-wrap gap-1.5 shrink-0">
        {COMMAND_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => executeCommand(preset.args)}
            disabled={running}
            className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium
              bg-bg-modifier-hover text-text-secondary hover:bg-bg-modifier-active
              hover:text-text-primary transition-colors disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Output Area */}
      <div
        ref={outputRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-[#1a1a2e] p-4 font-mono text-[12px] leading-relaxed space-y-3"
      >
        {history.length === 0 && (
          <div className="text-gray-500 text-center py-12">
            {t('openclaw.debug.emptyState', '输入命令或点击上方预设按钮开始调试')}
          </div>
        )}
        {history.map((entry) => (
          <div key={entry.id} className="space-y-1">
            {/* Command prompt */}
            <div className="flex items-center gap-2 text-emerald-400">
              <span className="text-gray-500 select-none">$</span>
              <span>openclaw {entry.args}</span>
              <span className="ml-auto text-gray-600 text-[10px]">{entry.durationMs}ms</span>
            </div>
            {/* Stdout */}
            {entry.stdout && (
              <pre className="text-gray-300 whitespace-pre-wrap break-all pl-4">{entry.stdout}</pre>
            )}
            {/* Stderr */}
            {entry.stderr && (
              <pre className="text-red-400 whitespace-pre-wrap break-all pl-4">{entry.stderr}</pre>
            )}
            {/* Exit code */}
            {entry.code !== 0 && (
              <div className="text-red-500 text-[10px] pl-4">exit code: {entry.code}</div>
            )}
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t('openclaw.debug.executing', '执行中...')}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-bg-secondary rounded-xl px-3 py-2 ring-1 ring-border-primary focus-within:ring-primary/50 transition-shadow">
          <span className="text-text-muted text-[12px] font-mono select-none shrink-0">
            openclaw
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('openclaw.debug.inputPlaceholder', '输入子命令和参数，例如 --version')}
            disabled={running}
            className="flex-1 bg-transparent text-[12px] font-mono text-text-primary placeholder:text-text-muted/50 outline-none"
          />
        </div>
        <OpenClawButton
          variant="primary"
          size="sm"
          onClick={() => executeCommand()}
          disabled={running || !input.trim()}
        >
          {running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {t('openclaw.debug.execute', '执行')}
        </OpenClawButton>
      </div>
    </div>
  )
}
