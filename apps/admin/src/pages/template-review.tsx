import { useEffect, useState } from 'react'

const API_BASE = '/api/admin'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token') ?? ''
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  })
  if (res.status === 403) {
    localStorage.removeItem('admin_token')
    window.location.href = '/'
    throw new Error('Admin access denied')
  }
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

interface CloudTemplate {
  id: string
  slug: string
  name: string
  description: string | null
  source: 'official' | 'community'
  reviewStatus: 'draft' | 'pending' | 'approved' | 'rejected'
  reviewNote: string | null
  tags: string[]
  category: string | null
  baseCost: number | null
  deployCount: number
  createdAt: string
  updatedAt: string
  submittedByUserId: string | null
}

type StatusFilter = 'all' | 'draft' | 'pending' | 'approved' | 'rejected'

export function TemplateReviewPage() {
  const [templates, setTemplates] = useState<CloudTemplate[]>([])
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selected, setSelected] = useState<CloudTemplate | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null)

  const load = async (status: StatusFilter) => {
    setLoading(true)
    setError('')
    try {
      const qs = status === 'all' ? '' : `?status=${status}`
      const data = await apiFetch<CloudTemplate[]>(`/cloud-templates${qs}`)
      setTemplates(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(filter)
  }, [filter])

  const handleApprove = async (id: string) => {
    setActionLoading(id)
    try {
      await apiFetch(`/cloud-templates/${id}/approve`, { method: 'POST' })
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, reviewStatus: 'approved', reviewNote: null } : t)),
      )
      if (selected?.id === id)
        setSelected((s) => s && { ...s, reviewStatus: 'approved', reviewNote: null })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const openRejectDialog = (id: string) => {
    setRejectTargetId(id)
    setRejectNote('')
    setRejectDialogOpen(true)
  }

  const handleRejectConfirm = async () => {
    if (!rejectTargetId) return
    const id = rejectTargetId
    setRejectDialogOpen(false)
    setActionLoading(id)
    try {
      const body = rejectNote.trim() ? { note: rejectNote.trim() } : {}
      await apiFetch(`/cloud-templates/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, reviewStatus: 'rejected', reviewNote: rejectNote.trim() || null }
            : t,
        ),
      )
      if (selected?.id === id)
        setSelected((s) =>
          s ? { ...s, reviewStatus: 'rejected', reviewNote: rejectNote.trim() || null } : s,
        )
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionLoading(null)
      setRejectTargetId(null)
      setRejectNote('')
    }
  }

  const statusBadge = (status: CloudTemplate['reviewStatus']) => {
    const styles: Record<CloudTemplate['reviewStatus'], string> = {
      draft: 'bg-zinc-500/20 text-zinc-300',
      pending: 'bg-yellow-500/20 text-yellow-300',
      approved: 'bg-green-500/20 text-green-300',
      rejected: 'bg-red-500/20 text-red-300',
    }
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>{status}</span>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <a href="/" className="text-zinc-400 hover:text-white text-sm">
            ← Dashboard
          </a>
          <h1 className="text-2xl font-bold">📋 Template Review</h1>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(['pending', 'approved', 'rejected', 'draft', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">{error}</div>
        )}

        <div className="flex gap-4">
          {/* Template list */}
          <div className="flex-1">
            {loading ? (
              <div className="text-zinc-500 text-sm py-8 text-center">Loading…</div>
            ) : templates.length === 0 ? (
              <div className="text-zinc-500 text-sm py-8 text-center">No templates found.</div>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      selected?.id === t.id
                        ? 'border-indigo-500 bg-zinc-800'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-white">{t.name}</span>
                          {statusBadge(t.reviewStatus)}
                          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                            {t.source}
                          </span>
                          {t.category && (
                            <span className="text-xs text-zinc-500">{t.category}</span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 mt-1 truncate">{t.slug}</p>
                        {t.description && (
                          <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{t.description}</p>
                        )}
                        {t.reviewStatus === 'rejected' && t.reviewNote && (
                          <p className="text-xs text-red-400 mt-1 line-clamp-1">✕ {t.reviewNote}</p>
                        )}
                      </div>
                      {t.reviewStatus === 'pending' && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleApprove(t.id)
                            }}
                            disabled={actionLoading === t.id}
                            className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openRejectDialog(t.id)
                            }}
                            disabled={actionLoading === t.id}
                            className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 transition"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="w-96 shrink-0 bg-zinc-900 rounded-xl border border-zinc-800 p-5 self-start sticky top-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-white">{selected.name}</h3>
                <button
                  onClick={() => setSelected(null)}
                  className="text-zinc-500 hover:text-white transition"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-zinc-500">Status</span>
                  <div className="mt-1">{statusBadge(selected.reviewStatus)}</div>
                </div>
                {selected.reviewStatus === 'rejected' && selected.reviewNote && (
                  <div className="rounded-lg bg-red-900/20 border border-red-800/40 p-3">
                    <span className="text-xs font-semibold text-red-400">Rejection Note</span>
                    <p className="mt-1 text-sm text-red-300">{selected.reviewNote}</p>
                  </div>
                )}
                <div>
                  <span className="text-zinc-500">Slug</span>
                  <p className="mt-1 text-zinc-300 font-mono text-xs">{selected.slug}</p>
                </div>
                {selected.description && (
                  <div>
                    <span className="text-zinc-500">Description</span>
                    <p className="mt-1 text-zinc-300">{selected.description}</p>
                  </div>
                )}
                <div>
                  <span className="text-zinc-500">Category</span>
                  <p className="mt-1 text-zinc-300">{selected.category ?? '—'}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Tags</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selected.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500">Base Cost</span>
                  <p className="mt-1 text-zinc-300">
                    {selected.baseCost != null ? `${selected.baseCost} coins` : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Deploy Count</span>
                  <p className="mt-1 text-zinc-300">{selected.deployCount}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Submitted By</span>
                  <p className="mt-1 text-zinc-300 font-mono text-xs">
                    {selected.submittedByUserId ?? '(system)'}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Created</span>
                  <p className="mt-1 text-zinc-300">
                    {new Date(selected.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              {selected.reviewStatus === 'pending' && (
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => void handleApprove(selected.id)}
                    disabled={actionLoading === selected.id}
                    className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 transition"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => openRejectDialog(selected.id)}
                    disabled={actionLoading === selected.id}
                    className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 transition"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reject dialog */}
      {rejectDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Reject Template</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Provide an optional reason for rejection. The author will see this note.
            </p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Missing required agent configuration, template content is incomplete..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 text-white text-sm p-3 resize-none h-28 focus:outline-none focus:border-red-500"
              maxLength={500}
            />
            <p className="text-xs text-zinc-500 mt-1 text-right">{rejectNote.length}/500</p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setRejectDialogOpen(false)
                  setRejectNote('')
                  setRejectTargetId(null)
                }}
                className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRejectConfirm()}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
