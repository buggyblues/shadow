import {
  AlertCircle,
  CheckCircle2,
  Code,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Image,
  Layers,
  Lightbulb,
  Loader2,
  Music,
  Search,
  Sparkles,
  Table,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  addTextMaterial,
  analyzeMaterial,
  genId,
  getMaterialDownloadUrl,
  uploadMaterials,
} from '../api'
import { useApp } from '../store'
import type { Card, Material, TaskRecord } from '../types'

// File type icon map
const TYPE_ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  text: FileText,
  markdown: FileText,
  image: Image,
  audio: Music,
  video: Video,
  docx: FileText,
  xlsx: FileSpreadsheet,
  csv: Table,
  json: Code,
  idea: Lightbulb,
  code: Code,
  unknown: File,
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

const statusConfig: Record<Material['status'], { icon: React.ReactNode; label: string }> = {
  uploading: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />,
    label: 'Uploading',
  },
  uploaded: { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, label: 'Uploaded' },
  curating: {
    icon: <Sparkles className="h-3.5 w-3.5 animate-pulse text-amber-400" />,
    label: 'Curating',
  },
  curated: { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, label: 'Curated' },
  analyzing: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />,
    label: 'Analyzing',
  },
  error: { icon: <AlertCircle className="h-3.5 w-3.5 text-red-400" />, label: 'Error' },
}

interface SidebarProps {
  collapsed: boolean
  onCurate: (materialIds: string[]) => void
}

export default function Sidebar({ collapsed, onCurate }: SidebarProps) {
  const { state, dispatch } = useApp()
  const [textInput, setTextInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)

  // Trigger SubAgent auto-curation immediately after upload
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const placeholders: Material[] = acceptedFiles.map((f) => ({
        id: genId(),
        name: f.name,
        type: detectType(f),
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
        dispatch({ type: 'ADD_LOG', message: `Uploaded ${acceptedFiles.length} file(s)` })
        if (uploadedIds.length > 0) {
          onCurate(uploadedIds)
        }
      } else {
        for (const p of placeholders) {
          dispatch({
            type: 'UPDATE_MATERIAL',
            id: p.id,
            updates: { status: 'error', error: result.error || 'Upload failed' },
          })
        }
      }
    },
    [state.project.id, dispatch, onCurate],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 100 * 1024 * 1024,
  })

  const handleAddText = async () => {
    if (!textInput.trim()) return
    const name = textInput.slice(0, 40) + (textInput.length > 40 ? '...' : '')
    const result = await addTextMaterial(state.project.id, textInput.trim(), name, 'idea')
    if (result.ok && result.data) {
      const mat = { ...result.data, cardIds: result.data.cardIds || [] }
      dispatch({ type: 'ADD_MATERIALS', materials: [mat] })
      dispatch({ type: 'ADD_LOG', message: 'Idea added' })
      onCurate([mat.id])
    }
    setTextInput('')
    setShowTextInput(false)
  }

  // Analyze individual material
  const handleAnalyzeMaterial = (mat: Material) => {
    dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, updates: { status: 'analyzing' } })

    const taskId = genId()
    const task: TaskRecord = {
      id: taskId,
      name: `Analyze: ${mat.name}`,
      status: 'running',
      dependsOn: [],
      taskType: 'analyze_material',
      startedAt: Date.now(),
      artifacts: [],
      logs: [],
    }
    dispatch({ type: 'ADD_TASK', task })

    analyzeMaterial(state.project.id, mat, (evt) => {
      switch (evt.type) {
        case 'thinking':
        case 'text':
          dispatch({ type: 'ADD_TASK_LOG', taskId, message: evt.data })
          break
        case 'card': {
          try {
            const card = JSON.parse(evt.data) as Card
            dispatch({
              type: 'STREAM_CARD',
              card: { ...card, sourceId: mat.id, isStreaming: true },
            })
            dispatch({ type: 'BIND_CARD_TO_MATERIAL', cardId: card.id, materialId: mat.id })
            dispatch({ type: 'ADD_TASK_LOG', taskId, message: `Card: ${card.title}` })
          } catch {
            /* ignore */
          }
          break
        }
        case 'cards': {
          try {
            const cards = JSON.parse(evt.data) as Card[]
            dispatch({ type: 'ADD_CARDS', cards })
            for (const card of cards) {
              dispatch({ type: 'BIND_CARD_TO_MATERIAL', cardId: card.id, materialId: mat.id })
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
        case 'summary': {
          dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, updates: { summary: evt.data } })
          dispatch({
            type: 'ADD_TASK_ARTIFACT',
            taskId,
            artifact: { type: 'material_analysis', label: 'Analysis Summary' },
          })
          break
        }
        case 'done':
          dispatch({ type: 'UPDATE_MATERIAL', id: mat.id, updates: { status: 'curated' } })
          dispatch({ type: 'COMPLETE_TASK', taskId })
          break
        case 'error':
          dispatch({
            type: 'UPDATE_MATERIAL',
            id: mat.id,
            updates: { status: 'error', error: evt.data },
          })
          dispatch({ type: 'FAIL_TASK', taskId, error: evt.data })
          break
      }
    })
  }

  const materials = state.project.materials
  const cards = state.project.cards

  const getCardCount = (mat: Material) => {
    return cards.filter((c) => c.sourceId === mat.id).length
  }

  if (collapsed) {
    return (
      <div className="flex flex-1 flex-col items-center py-3 gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-3 text-zinc-500">
          <Upload className="h-4 w-4" />
        </div>
        {materials.length > 0 && (
          <span className="text-[10px] font-medium text-zinc-500">{materials.length}</span>
        )}
        {cards.length > 0 && (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600/10 text-brand-400">
            <Layers className="h-4 w-4" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h2 className="text-[11px] font-semibold text-zinc-500">
          Materials <span className="text-zinc-600 normal-case">({materials.length})</span>
        </h2>
        <button
          onClick={() => setShowTextInput(!showTextInput)}
          className="rounded p-1 text-zinc-500 transition hover:bg-surface-3 hover:text-zinc-300"
          title="Add idea / text"
        >
          <Lightbulb className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Drop Zone */}
      <div className="px-2 pt-2">
        <div
          {...getRootProps()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-3 py-4 transition-all ${
            isDragActive
              ? 'drop-active scale-[1.01]'
              : 'border-border hover:border-zinc-500 hover:bg-surface-2/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload
            className={`h-5 w-5 mb-1.5 ${isDragActive ? 'text-brand-400' : 'text-zinc-600'}`}
          />
          <p className="text-xs text-zinc-400">
            {isDragActive ? 'Drop to upload' : 'Drag & drop any file'}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">Auto-curated into cards after upload</p>
        </div>
      </div>

      {/* Text/Idea Input */}
      {showTextInput && (
        <div className="animate-fade-in px-2 pt-2">
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Write your idea, note, key point..."
            rows={3}
            className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500/50 focus:outline-none resize-none"
            autoFocus
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              onClick={() => setShowTextInput(false)}
              className="rounded px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              onClick={handleAddText}
              disabled={!textInput.trim()}
              className="rounded bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-brand-500 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Material List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {materials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <File className="h-8 w-8 text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-600">No materials yet</p>
            <p className="mt-0.5 text-[10px] text-zinc-700">Drop a file or add an idea to start</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {materials.map((mat) => {
              const Icon = TYPE_ICON[mat.type] || File
              const cardCount = getCardCount(mat)
              const st = statusConfig[mat.status]
              const isAnalyzing = mat.status === 'analyzing'
              const hasPath = !!mat.path // has path = downloadable

              return (
                <div key={mat.id} className="animate-fade-in">
                  <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-surface-hover">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="flex-1 truncate text-xs text-zinc-300">{mat.name}</span>
                    <div className="flex items-center gap-1">
                      {cardCount > 0 && (
                        <span className="rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-400">
                          {cardCount} card
                        </span>
                      )}
                      {st.icon}

                      {/* Download button */}
                      {(hasPath || mat.status === 'uploaded' || mat.status === 'curated') && (
                        <a
                          href={getMaterialDownloadUrl(mat.id)}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="rounded p-0.5 text-zinc-600 opacity-0 transition hover:text-zinc-300 group-hover:opacity-100"
                          title="Download"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      )}

                      {/* Analyze button */}
                      {!isAnalyzing && mat.status !== 'uploading' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAnalyzeMaterial(mat)
                          }}
                          className="rounded p-0.5 text-zinc-600 opacity-0 transition hover:text-cyan-400 group-hover:opacity-100"
                          title="Analyze"
                        >
                          <Search className="h-3 w-3" />
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch({ type: 'REMOVE_MATERIAL', id: mat.id })
                        }}
                        className="rounded p-0.5 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-7 pb-0.5">
                    <span className="text-[10px] text-zinc-600">{formatSize(mat.size)}</span>
                    <span className="text-[10px] text-zinc-700">·</span>
                    <span className="text-[10px] text-zinc-600">{mat.type}</span>
                    {mat.summary && (
                      <>
                        <span className="text-[10px] text-zinc-700">·</span>
                        <span
                          className="text-[10px] text-zinc-500 truncate max-w-[120px]"
                          title={mat.summary}
                        >
                          {mat.summary}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer — Flow Guide + Quick Actions */}
      {(materials.length > 0 || cards.length > 0) && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {/* Flow visualization */}
          <div className="flex items-center gap-1 text-[10px]">
            <span
              className={`flex items-center gap-0.5 ${materials.length > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}
            >
              📄 {materials.length} Material(s)
            </span>
            <span className="text-zinc-700">→</span>
            <span
              className={`flex items-center gap-0.5 ${cards.length > 0 ? 'text-brand-400' : 'text-zinc-600'}`}
            >
              🃏 {cards.length} Card(s)
            </span>
            <span className="text-zinc-700">→</span>
            <span className="text-zinc-500">📊 PPT</span>
          </div>
          {/* Tip */}
          <p className="text-[9px] text-zinc-600 leading-relaxed">
            💡 Materials are auto-curated into cards, which auto-generate an outline and PPT.
            Intermediate steps are optional — just upload your materials.
          </p>
        </div>
      )}
    </div>
  )
}

// Detect file type
function detectType(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const mimeMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'text/markdown': 'markdown',
    'text/csv': 'csv',
    'application/json': 'json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }
  if (mimeMap[file.type]) return mimeMap[file.type]
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  const extMap: Record<string, string> = {
    pdf: 'pdf',
    txt: 'text',
    md: 'markdown',
    csv: 'csv',
    json: 'json',
    docx: 'docx',
    doc: 'docx',
    xlsx: 'xlsx',
    xls: 'xlsx',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    svg: 'image',
    bmp: 'image',
    mp3: 'audio',
    wav: 'audio',
    ogg: 'audio',
    flac: 'audio',
    aac: 'audio',
    m4a: 'audio',
    mp4: 'video',
    mov: 'video',
    avi: 'video',
    mkv: 'video',
    webm: 'video',
    py: 'code',
    js: 'code',
    ts: 'code',
    jsx: 'code',
    tsx: 'code',
    html: 'code',
    css: 'code',
    sql: 'code',
    yaml: 'code',
    yml: 'code',
    xml: 'code',
    sh: 'code',
    go: 'code',
    rs: 'code',
    java: 'code',
  }
  return extMap[ext] || 'unknown'
}
