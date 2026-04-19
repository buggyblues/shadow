import { CheckCircle2, Circle, ListTodo, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { genId } from '../api'
import { useApp } from '../store'
import type { TodoItem } from '../types'

export default function TodoPanel() {
  const { state, dispatch } = useApp()
  const todos = state.project.todos
  const [newText, setNewText] = useState('')
  const [showInput, setShowInput] = useState(false)

  const handleAdd = () => {
    if (!newText.trim()) return
    const todo: TodoItem = {
      id: genId(),
      text: newText.trim(),
      done: false,
      createdAt: Date.now(),
    }
    dispatch({ type: 'ADD_TODO', todo })
    setNewText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAdd()
    }
    if (e.key === 'Escape') {
      setShowInput(false)
      setNewText('')
    }
  }

  const pendingCount = todos.filter((t) => !t.done).length
  const doneCount = todos.filter((t) => t.done).length

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ListTodo className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Tasks
          </span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              {pendingCount}
            </span>
          )}
          {doneCount > 0 && (
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
              ✓{doneCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowInput(!showInput)}
          className="rounded p-1 text-zinc-500 transition hover:bg-surface-3 hover:text-zinc-300"
        >
          {showInput ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Add input */}
      {showInput && (
        <div className="animate-fade-in border-b border-border px-3 py-2">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter task (press Enter to add)..."
              className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500/50 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="rounded bg-brand-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-brand-500 disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">
            AI will automatically reference these tasks
          </p>
        </div>
      )}

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto">
        {todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center px-3">
            <ListTodo className="h-6 w-6 text-zinc-700 mb-1.5" />
            <p className="text-[11px] text-zinc-600">Add tasks for AI to help complete</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {todos.map((todo) => (
              <div
                key={todo.id}
                className={`group flex items-start gap-2 px-3 py-2 transition hover:bg-surface-hover ${
                  todo.done ? 'opacity-60' : ''
                }`}
              >
                <button
                  onClick={() => dispatch({ type: 'TOGGLE_TODO', id: todo.id })}
                  className="mt-0.5 shrink-0"
                >
                  {todo.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-zinc-600 hover:text-zinc-400" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs leading-relaxed ${todo.done ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}
                  >
                    {todo.text}
                  </p>
                  {todo.completionNote && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-400/70">
                      <Sparkles className="h-2.5 w-2.5" />
                      {todo.completionNote}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dispatch({ type: 'REMOVE_TODO', id: todo.id })}
                  className="shrink-0 rounded p-0.5 text-zinc-700 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
