import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Heart,
  Layers,
  Loader2,
  Microscope,
  StopCircle,
  Wand2,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import type { TaskArtifact, TaskRecord } from '../types'

const TASK_ICON: Record<string, typeof Activity> = {
  'Organize Cards': Layers,
  'Generate Outline': FileText,
  'Generate PPT': Wand2,
  'Update PPT': Wand2,
  'Analyze Materials': FileText,
  'Deep Research': Microscope,
  'Get Inspiration': Zap,
  curate: Layers,
  analyze: FileText,
  generate: Wand2,
  research: Microscope,
  inspire: Zap,
  '💡 Heartbeat Inspiration': Heart,
  '🔬 Heartbeat Research': Heart,
  '📝 Heartbeat Task Consume': Heart,
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remainSecs = secs % 60
  return `${mins}m ${remainSecs}s`
}

function ArtifactBadge({ artifact }: { artifact: TaskArtifact }) {
  const colorMap: Record<string, string> = {
    cards: 'bg-brand-500/10 text-brand-400',
    outline: 'bg-cyan-500/10 text-cyan-400',
    material_analysis: 'bg-amber-500/10 text-amber-400',
    research: 'bg-purple-500/10 text-purple-400',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${colorMap[artifact.type] || 'bg-zinc-500/10 text-zinc-400'}`}
    >
      {artifact.label}
      {artifact.count !== undefined && ` (${artifact.count})`}
    </span>
  )
}

function TaskItem({ task }: { task: TaskRecord }) {
  const [expanded, setExpanded] = useState(false)
  const logsRef = useRef<HTMLDivElement>(null)
  const Icon = TASK_ICON[task.taskType || task.name] || TASK_ICON[task.name] || Activity
  const duration = (task.completedAt || Date.now()) - task.startedAt

  // Abort single task
  const handleAbort = (e: React.MouseEvent) => {
    e.stopPropagation()
    const fn = (window as unknown as Record<string, unknown>).__handleAbortTask as
      | ((taskId: string) => void)
      | undefined
    if (fn) fn(task.id)
  }

  useEffect(() => {
    if (expanded && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [expanded, task.logs.length])

  return (
    <div
      className={`rounded-lg border transition-all ${
        task.status === 'running'
          ? 'border-brand-400/30 bg-brand-500/5'
          : task.status === 'error'
            ? 'border-red-400/30 bg-red-500/5'
            : task.status === 'pending'
              ? 'border-zinc-700/50 bg-surface opacity-60'
              : 'border-border'
      }`}
    >
      {/* Task Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {task.status === 'pending' ? (
          <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
        ) : task.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-400" />
        ) : task.status === 'completed' ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : task.status === 'error' ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
        ) : (
          <X className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}

        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="flex-1 truncate text-xs font-medium text-zinc-300">{task.name}</span>

        {/* Dependencies badge */}
        {task.dependsOn && task.dependsOn.length > 0 && task.status === 'pending' && (
          <span className="rounded-full bg-zinc-700/50 px-1.5 py-0.5 text-[9px] text-zinc-500">
            Waiting for {task.dependsOn.length} prerequisite tasks
          </span>
        )}

        {/* Progress */}
        {task.progress !== undefined && task.progress > 0 && task.status === 'running' && (
          <span className="text-[10px] text-brand-400 font-medium">{task.progress}%</span>
        )}

        {/* Abort button — running tasks only */}
        {task.status === 'running' && (
          <button
            onClick={handleAbort}
            className="flex items-center gap-0.5 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
            title="Abort this task"
          >
            <StopCircle className="h-2.5 w-2.5" />
            Abort
          </button>
        )}

        {/* Duration */}
        <span className="flex items-center gap-1 text-[10px] text-zinc-600">
          <Clock className="h-2.5 w-2.5" />
          {formatDuration(duration)}
        </span>

        {/* Expand arrow */}
        {task.logs.length > 0 &&
          (expanded ? (
            <ChevronDown className="h-3 w-3 text-zinc-600" />
          ) : (
            <ChevronRight className="h-3 w-3 text-zinc-600" />
          ))}
      </div>

      {/* Artifacts */}
      {task.artifacts.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {task.artifacts.map((a, i) => (
            <ArtifactBadge key={i} artifact={a} />
          ))}
        </div>
      )}

      {/* Error */}
      {task.error && (
        <div className="px-3 pb-2">
          <p className="text-[11px] text-red-400">{task.error}</p>
        </div>
      )}

      {/* Expandable Logs */}
      {expanded && task.logs.length > 0 && (
        <div
          ref={logsRef}
          className="mx-3 mb-2 max-h-40 overflow-y-auto rounded border border-border/30 bg-surface p-2 font-mono text-[10px] leading-relaxed text-zinc-600 whitespace-pre-wrap"
        >
          {task.logs.join('\n')}
        </div>
      )}
    </div>
  )
}

interface TaskCenterProps {
  onClose?: () => void
}

export default function TaskCenter({ onClose }: TaskCenterProps) {
  const { state } = useApp()
  const tasks = [...state.project.tasks].reverse()
  const runningTasks = tasks.filter((t) => t.status === 'running')
  const completedTasks = tasks.filter((t) => t.status !== 'running')

  return (
    <div className="flex flex-col border-t border-border bg-surface-2/70">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Activity className="h-3 w-3 text-zinc-500" />
          <span className="text-[11px] font-medium text-zinc-500">
            Task Center
            {runningTasks.length > 0 && (
              <span className="ml-1 text-brand-400">({runningTasks.length} running)</span>
            )}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded p-0.5 text-zinc-600 hover:text-zinc-400">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="max-h-60 overflow-y-auto p-2 space-y-1.5">
        {tasks.length === 0 ? (
          <p className="text-center text-[11px] text-zinc-600 py-4">No tasks</p>
        ) : (
          <>
            {runningTasks.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
            {completedTasks.slice(0, 10).map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
