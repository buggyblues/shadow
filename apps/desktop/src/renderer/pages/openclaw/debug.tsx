/**
 * OpenClaw Debug Page
 *
 * Execute openclaw CLI commands and inspect results in a terminal-like interface.
 * Commands are run via the bundled openclaw entry point with full environment isolation.
 */

import { ChevronDown, ChevronRight, Loader2, Play, Terminal, Trash2 } from 'lucide-react'
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

interface CommandGroup {
  label: string
  commands: { label: string; args: string; desc?: string }[]
}

const COMMAND_GROUPS: CommandGroup[] = [
  {
    label: '基础信息',
    commands: [
      { label: '--version', args: '--version', desc: '查看版本' },
      { label: '--help', args: '--help', desc: '帮助信息' },
      { label: 'status', args: 'status', desc: '渠道健康与会话信息' },
      { label: 'health', args: 'health', desc: '网关健康检查' },
    ],
  },
  {
    label: '配置管理',
    commands: [
      { label: 'config show', args: 'config show', desc: '显示当前配置' },
      { label: 'config validate', args: 'config validate', desc: '验证配置合规性' },
      { label: 'config file', args: 'config file', desc: '配置文件路径' },
    ],
  },
  {
    label: '智能体',
    commands: [
      { label: 'agents list', args: 'agents list', desc: '列出智能体' },
      { label: 'agents bindings', args: 'agents bindings', desc: '路由绑定' },
    ],
  },
  {
    label: '模型',
    commands: [
      { label: 'models list', args: 'models list', desc: '列出已配置模型' },
      { label: 'models scan', args: 'models scan', desc: '扫描可用模型' },
    ],
  },
  {
    label: '技能 & 插件',
    commands: [
      { label: 'skills list', args: 'skills list', desc: '列出已安装技能' },
      { label: 'plugins list', args: 'plugins list', desc: '列出插件' },
    ],
  },
  {
    label: '频道 & 通讯',
    commands: [
      { label: 'channels list', args: 'channels list', desc: '列出频道' },
      { label: 'sessions', args: 'sessions', desc: '会话列表' },
    ],
  },
  {
    label: '网关 & 系统',
    commands: [
      { label: 'gateway --help', args: 'gateway --help', desc: '网关命令帮助' },
      { label: 'doctor', args: 'doctor', desc: '诊断检查' },
      { label: 'doctor --fix', args: 'doctor --fix', desc: '自动修复' },
      { label: 'cron list', args: 'cron list', desc: '定时任务列表' },
    ],
  },
  {
    label: '安全 & 维护',
    commands: [
      { label: 'security audit', args: 'security audit', desc: '安全审计' },
      { label: 'backup create', args: 'backup create', desc: '创建备份' },
      { label: 'update status', args: 'update status', desc: '更新状态' },
    ],
  },
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

  const [showPalette, setShowPalette] = useState(false)

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
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <OpenClawButton variant="ghost" size="sm" onClick={() => setHistory([])}>
              <Trash2 className="w-3.5 h-3.5" />
              {t('openclaw.debug.clear', '清空')}
            </OpenClawButton>
          )}
        </div>
      </div>

      {/* Command Palette Toggle */}
      <button
        type="button"
        onClick={() => setShowPalette(!showPalette)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-secondary border border-bg-tertiary text-sm text-text-secondary hover:text-text-primary hover:border-primary/30 transition shrink-0"
      >
        {showPalette ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        常用指令集
        <span className="text-[10px] text-text-muted">
          {COMMAND_GROUPS.reduce((n, g) => n + g.commands.length, 0)} 条命令
        </span>
      </button>

      {/* Expandable Palette */}
      {showPalette && (
        <div className="grid grid-cols-2 gap-3 shrink-0 max-h-[40vh] overflow-y-auto pr-1">
          {COMMAND_GROUPS.map((group) => (
            <div
              key={group.label}
              className="rounded-xl bg-bg-secondary border border-bg-tertiary p-3"
            >
              <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.commands.map((cmd) => (
                  <button
                    key={cmd.args}
                    type="button"
                    onClick={() => {
                      executeCommand(cmd.args)
                      setShowPalette(false)
                    }}
                    disabled={running}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left
                      hover:bg-bg-modifier-hover transition-colors disabled:opacity-50 group"
                  >
                    <span className="text-[11px] font-mono text-primary group-hover:text-text-primary">
                      {cmd.label}
                    </span>
                    {cmd.desc && (
                      <span className="text-[10px] text-text-muted ml-2 truncate">{cmd.desc}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
