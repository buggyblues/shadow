import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../store'
import type { Pipeline, TaskRecord } from '../types'

interface PipelinePanelProps {
  onClose: () => void
}

// Pipeline step definitions
const PIPELINE_STEPS = [
  {
    key: 'curate',
    label: 'Curate Cards',
    emoji: '📥',
    description: 'Extract knowledge cards from materials',
  },
  {
    key: 'analyze',
    label: 'Generate Outline',
    emoji: '🧠',
    description: 'Analyze cards and generate a presentation outline',
  },
  {
    key: 'generate',
    label: 'Generate PPT',
    emoji: '✨',
    description: 'Generate slides based on the outline and cards',
  },
]

export default function PipelinePanel({ onClose }: PipelinePanelProps) {
  const { state } = useApp()
  const pipelines = state.pipelines
  const tasks = state.project.tasks
  const isAutoMode = state.userSettings.autoPipeline

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[75vh] overflow-y-auto rounded-xl border border-border bg-surface-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-zinc-200">Pipeline</span>
            {isAutoMode && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                <Zap className="h-2.5 w-2.5" />
                Auto Mode
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Pipeline template — standard pipeline */}
          <div className="rounded-lg border border-border p-3">
            <h4 className="text-[11px] font-semibold text-zinc-400 mb-3">
              Standard Generation Pipeline
            </h4>
            <div className="flex items-center gap-1">
              {PIPELINE_STEPS.map((step, i) => {
                // Find the latest running or completed task for this step
                const matchingTask = [...tasks]
                  .reverse()
                  .find(
                    (t) => t.taskType === step.key || t.name.includes(step.label.replace(' ', '')),
                  )
                const status = matchingTask?.status || 'pending'

                return (
                  <div key={step.key} className="flex items-center gap-1">
                    <div
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 transition-all ${
                        status === 'running'
                          ? 'border-brand-400/40 bg-brand-500/5 animate-pulse'
                          : status === 'completed'
                            ? 'border-emerald-400/30 bg-emerald-500/5'
                            : status === 'error'
                              ? 'border-red-400/30 bg-red-500/5'
                              : 'border-border/50 bg-surface'
                      }`}
                    >
                      <span className="text-base">{step.emoji}</span>
                      <div>
                        <p className="text-[11px] font-medium text-zinc-300">{step.label}</p>
                        <p className="text-[9px] text-zinc-600">{step.description}</p>
                      </div>
                      {status === 'running' && (
                        <Loader2 className="h-3 w-3 animate-spin text-brand-400 shrink-0" />
                      )}
                      {status === 'completed' && (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                      )}
                      {status === 'error' && (
                        <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                      )}
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-zinc-700 shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Active pipeline list */}
          {pipelines.length > 0 ? (
            [...pipelines]
              .reverse()
              .map((pipeline) => (
                <PipelineItem key={pipeline.id} pipeline={pipeline} tasks={tasks} />
              ))
          ) : (
            <div className="text-center py-6">
              <Workflow className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-500 mb-1">No active pipelines</p>
              <p className="text-[10px] text-zinc-600">
                {isAutoMode
                  ? 'Upload materials to auto-start the pipeline'
                  : 'Enable "Auto Mode" to auto-run the full pipeline on upload'}
              </p>
            </div>
          )}

          {/* Recent tasks (DAG view) */}
          <div>
            <h4 className="text-[11px] font-semibold text-zinc-400 mb-2">Recent Tasks</h4>
            <div className="space-y-1">
              {tasks.length === 0 ? (
                <p className="text-[11px] text-zinc-600 py-2 text-center">No task records</p>
              ) : (
                [...tasks]
                  .reverse()
                  .slice(0, 8)
                  .map((task) => <TaskRow key={task.id} task={task} allTasks={tasks} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PipelineItem({ pipeline, tasks }: { pipeline: Pipeline; tasks: TaskRecord[] }) {
  const [expanded, setExpanded] = useState(pipeline.status === 'running')
  const pTasks = pipeline.taskIds
    .map((tid) => tasks.find((t) => t.id === tid))
    .filter(Boolean) as TaskRecord[]
  const completed = pTasks.filter((t) => t.status === 'completed').length
  const total = pTasks.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div
      className={`rounded-lg border transition-all ${
        pipeline.status === 'running'
          ? 'border-brand-400/30 bg-brand-500/5'
          : pipeline.status === 'completed'
            ? 'border-emerald-400/20'
            : pipeline.status === 'error'
              ? 'border-red-400/20'
              : 'border-border'
      }`}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {pipeline.status === 'running' && (
          <Loader2 className="h-3 w-3 animate-spin text-brand-400" />
        )}
        {pipeline.status === 'completed' && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
        {pipeline.status === 'error' && <AlertCircle className="h-3 w-3 text-red-400" />}
        {pipeline.status === 'idle' && <Circle className="h-3 w-3 text-zinc-500" />}
        <span className="flex-1 text-xs font-medium text-zinc-300">{pipeline.name}</span>
        <span className="text-[10px] text-zinc-600">{pct}%</span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-zinc-600" />
        ) : (
          <ChevronRight className="h-3 w-3 text-zinc-600" />
        )}
      </div>

      {pipeline.status === 'running' && (
        <div className="mx-3 mb-2 h-1 rounded-full bg-surface-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {expanded && pTasks.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {pTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 rounded px-2 py-1 text-[11px]">
              {task.status === 'running' ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin text-brand-400" />
              ) : task.status === 'completed' ? (
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
              ) : task.status === 'error' ? (
                <AlertCircle className="h-2.5 w-2.5 text-red-400" />
              ) : task.status === 'pending' ? (
                <Circle className="h-2.5 w-2.5 text-zinc-600" />
              ) : (
                <X className="h-2.5 w-2.5 text-zinc-600" />
              )}
              <span className="text-zinc-400">{task.name}</span>
              {task.dependsOn.length > 0 && (
                <span className="text-[9px] text-zinc-700">
                  ← depends on {task.dependsOn.length} task(s)
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {pipeline.error && <div className="mx-3 mb-2 text-[10px] text-red-400">{pipeline.error}</div>}
    </div>
  )
}

function TaskRow({ task, allTasks }: { task: TaskRecord; allTasks: TaskRecord[] }) {
  const deps =
    task.dependsOn?.map((id) => allTasks.find((t) => t.id === id)?.name).filter(Boolean) || []

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition ${
        task.status === 'running' ? 'bg-brand-500/5' : ''
      }`}
    >
      {task.status === 'running' ? (
        <Loader2 className="h-3 w-3 animate-spin text-brand-400 shrink-0" />
      ) : task.status === 'completed' ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
      ) : task.status === 'error' ? (
        <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
      ) : task.status === 'pending' ? (
        <Circle className="h-3 w-3 text-zinc-600 shrink-0" />
      ) : (
        <X className="h-3 w-3 text-zinc-500 shrink-0" />
      )}
      <span className="flex-1 text-[11px] text-zinc-300 truncate">{task.name}</span>
      {deps.length > 0 && (
        <span className="text-[9px] text-zinc-600 truncate max-w-[120px]" title={deps.join(', ')}>
          ← {deps.join(', ')}
        </span>
      )}
      {task.progress !== undefined && task.progress > 0 && task.status === 'running' && (
        <span className="text-[10px] text-brand-400">{task.progress}%</span>
      )}
    </div>
  )
}
