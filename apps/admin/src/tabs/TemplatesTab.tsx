import { useEffect, useState } from 'react'
import { apiFetch, type CloudTemplate } from '../lib/admin-api'

type StatusFilter = 'all' | 'draft' | 'pending' | 'approved' | 'rejected'

type TplForm = {
  slug: string
  name: string
  description: string
  source: 'official' | 'community'
  reviewStatus: CloudTemplate['reviewStatus']
  tags: string
  category: string
  baseCost: string
  content: string
}

const EMPTY_FORM: TplForm = {
  slug: '',
  name: '',
  description: '',
  source: 'official',
  reviewStatus: 'approved',
  tags: '',
  category: '',
  baseCost: '',
  content: '{}',
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: '全部',
  pending: '待审核',
  approved: '已上架',
  rejected: '已拒绝',
  draft: '草稿',
}

const STATUS_BADGE: Record<CloudTemplate['reviewStatus'], string> = {
  draft: 'bg-zinc-500/20 text-zinc-300',
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-red-500/20 text-red-300',
}

export function TemplatesTab() {
  const [templates, setTemplates] = useState<CloudTemplate[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<CloudTemplate | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  // Create/Edit modal
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<CloudTemplate | null>(null)
  const [form, setForm] = useState<TplForm>(EMPTY_FORM)
  // Reject dialog
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const load = async (status: StatusFilter = filter) => {
    setLoading(true)
    try {
      const qs = status === 'all' ? '' : `?status=${status}`
      setTemplates(await apiFetch<CloudTemplate[]>(`/cloud-templates${qs}`))
    } catch {
      /* */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const setFilterAndLoad = (s: StatusFilter) => {
    setFilter(s)
    load(s)
  }

  const approve = async (id: string) => {
    setActionLoading(id)
    try {
      await apiFetch(`/cloud-templates/${id}/approve`, { method: 'POST' })
      const patch = { reviewStatus: 'approved' as const, reviewNote: null }
      setTemplates((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      if (selected?.id === id) setSelected((s) => s && { ...s, ...patch })
    } catch {
      /* */
    } finally {
      setActionLoading(null)
    }
  }

  const openReject = (id: string) => {
    setRejectTargetId(id)
    setRejectNote('')
    setRejectOpen(true)
  }

  const confirmReject = async () => {
    if (!rejectTargetId) return
    const id = rejectTargetId
    setRejectOpen(false)
    setActionLoading(id)
    const note = rejectNote.trim() || null
    try {
      await apiFetch(`/cloud-templates/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(note ? { note } : {}),
      })
      setTemplates((p) =>
        p.map((t) => (t.id === id ? { ...t, reviewStatus: 'rejected', reviewNote: note } : t)),
      )
      if (selected?.id === id)
        setSelected((s) => s && { ...s, reviewStatus: 'rejected', reviewNote: note })
    } catch {
      /* */
    } finally {
      setActionLoading(null)
      setRejectTargetId(null)
      setRejectNote('')
    }
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditTarget(null)
    setModalMode('create')
  }

  const openEdit = (t: CloudTemplate) => {
    setForm({
      slug: t.slug,
      name: t.name,
      description: t.description ?? '',
      source: t.source,
      reviewStatus: t.reviewStatus,
      tags: t.tags.join(', '),
      category: t.category ?? '',
      baseCost: t.baseCost != null ? String(t.baseCost) : '',
      content: JSON.stringify(t.content, null, 2),
    })
    setEditTarget(t)
    setModalMode('edit')
  }

  const del = async (id: string) => {
    if (!confirm('确定要删除该模版？')) return
    await apiFetch(`/cloud-templates/${id}`, { method: 'DELETE' }).catch(() => {})
    setTemplates((p) => p.filter((t) => t.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const saveModal = async () => {
    let content: Record<string, unknown> = {}
    try {
      content = JSON.parse(form.content)
    } catch {
      alert('模版内容 JSON 格式错误')
      return
    }
    const body = {
      slug: form.slug,
      name: form.name,
      description: form.description || undefined,
      source: form.source,
      reviewStatus: form.reviewStatus,
      tags: form.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      category: form.category || undefined,
      baseCost: form.baseCost ? Number(form.baseCost) : undefined,
      content,
    }
    try {
      if (modalMode === 'create') {
        const created = await apiFetch<CloudTemplate>('/cloud-templates', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setTemplates((p) => [created, ...p])
      } else if (editTarget) {
        const updated = await apiFetch<CloudTemplate>(`/cloud-templates/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
        setTemplates((p) => p.map((t) => (t.id === editTarget.id ? updated : t)))
        if (selected?.id === editTarget.id) setSelected(updated)
      }
      setModalMode(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      {children}
    </div>
  )

  const input = (
    key: keyof TplForm,
    placeholder?: string,
    extra?: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <input
      value={form[key]}
      placeholder={placeholder}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
      {...extra}
    />
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">商店模版管理</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
        >
          + 新建模版
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['all', 'pending', 'approved', 'rejected', 'draft'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterAndLoad(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === s ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* List */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="text-zinc-500 text-sm py-8 text-center">加载中…</div>
          ) : templates.length === 0 ? (
            <div className="text-zinc-500 text-sm py-8 text-center">暂无模版</div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`p-4 rounded-xl border cursor-pointer transition ${selected?.id === t.id ? 'border-indigo-500 bg-zinc-800' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white">{t.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[t.reviewStatus]}`}
                        >
                          {t.reviewStatus}
                        </span>
                        <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                          {t.source}
                        </span>
                        {t.category && <span className="text-xs text-zinc-500">{t.category}</span>}
                      </div>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">{t.slug}</p>
                      {t.description && (
                        <p className="text-sm text-zinc-400 mt-1 line-clamp-1">{t.description}</p>
                      )}
                      {t.reviewStatus === 'rejected' && t.reviewNote && (
                        <p className="text-xs text-red-400 mt-1">✕ {t.reviewNote}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {t.reviewStatus === 'pending' && (
                        <>
                          <button
                            onClick={() => approve(t.id)}
                            disabled={actionLoading === t.id}
                            className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50 transition"
                          >
                            通过
                          </button>
                          <button
                            onClick={() => openReject(t.id)}
                            disabled={actionLoading === t.id}
                            className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50 transition"
                          >
                            拒绝
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => openEdit(t)}
                        className="px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => del(t.id)}
                        className="px-3 py-1 rounded-lg bg-red-900/40 hover:bg-red-700 text-red-400 hover:text-white text-xs font-medium transition"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 shrink-0 bg-zinc-900 rounded-xl border border-zinc-800 p-5 self-start sticky top-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">{selected.name}</h3>
              <button
                onClick={() => setSelected(null)}
                className="text-zinc-500 hover:text-white text-lg leading-none transition"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-zinc-500">Slug</span>
                <p className="mt-0.5 text-zinc-300 font-mono">{selected.slug}</p>
              </div>
              <div>
                <span className="text-zinc-500">状态</span>
                <div className="mt-0.5">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[selected.reviewStatus]}`}
                  >
                    {selected.reviewStatus}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-zinc-500">Source</span>
                <p className="mt-0.5 text-zinc-300">{selected.source}</p>
              </div>
              <div>
                <span className="text-zinc-500">Category</span>
                <p className="mt-0.5 text-zinc-300">{selected.category ?? '—'}</p>
              </div>
              <div>
                <span className="text-zinc-500">Base Cost</span>
                <p className="mt-0.5 text-zinc-300">
                  {selected.baseCost != null ? `${selected.baseCost} coins` : '—'}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Deploy Count</span>
                <p className="mt-0.5 text-zinc-300">{selected.deployCount}</p>
              </div>
              {selected.tags.length > 0 && (
                <div>
                  <span className="text-zinc-500">Tags</span>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {selected.tags.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selected.description && (
                <div>
                  <span className="text-zinc-500">Description</span>
                  <p className="mt-0.5 text-zinc-300">{selected.description}</p>
                </div>
              )}
              {selected.reviewStatus === 'rejected' && selected.reviewNote && (
                <div className="rounded-lg bg-red-900/20 border border-red-800/40 p-2">
                  <span className="text-red-400 font-semibold">拒绝原因</span>
                  <p className="mt-1 text-red-300">{selected.reviewNote}</p>
                </div>
              )}
              <div>
                <span className="text-zinc-500">创建时间</span>
                <p className="mt-0.5 text-zinc-300">
                  {new Date(selected.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">更新时间</span>
                <p className="mt-0.5 text-zinc-300">
                  {new Date(selected.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
            {selected.reviewStatus === 'pending' && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => approve(selected.id)}
                  disabled={actionLoading === selected.id}
                  className="flex-1 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50 transition"
                >
                  通过
                </button>
                <button
                  onClick={() => openReject(selected.id)}
                  disabled={actionLoading === selected.id}
                  className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50 transition"
                >
                  拒绝
                </button>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => openEdit(selected)}
                className="flex-1 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition"
              >
                编辑
              </button>
              <button
                onClick={() => del(selected.id)}
                className="flex-1 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-700 text-red-400 hover:text-white text-xs font-medium transition"
              >
                删除
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setModalMode(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-4">
              {modalMode === 'create' ? '新建模版' : '编辑模版'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {field(
                'Slug *',
                <input
                  value={form.slug}
                  placeholder="my-template"
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  disabled={modalMode === 'edit'}
                  className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono disabled:opacity-50"
                />,
              )}
              {field('名称 *', input('name', '模版名称'))}
              <div className="col-span-2">{field('描述', input('description', '模版简介'))}</div>
              {field(
                'Source',
                <select
                  value={form.source}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, source: e.target.value as 'official' | 'community' }))
                  }
                  className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="official">official</option>
                  <option value="community">community</option>
                </select>,
              )}
              {field(
                '状态',
                <select
                  value={form.reviewStatus}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      reviewStatus: e.target.value as CloudTemplate['reviewStatus'],
                    }))
                  }
                  className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="approved">approved</option>
                  <option value="pending">pending</option>
                  <option value="draft">draft</option>
                  <option value="rejected">rejected</option>
                </select>,
              )}
              {field('Category', input('category', 'demo / starter / advanced…'))}
              {field('Base Cost (coins)', input('baseCost', '0', { type: 'number', min: 0 }))}
              <div className="col-span-2">
                {field('Tags (逗号分隔)', input('tags', 'chat, ai, productivity'))}
              </div>
              <div className="col-span-2">
                {field(
                  '模版内容 (JSON)',
                  <textarea
                    value={form.content}
                    rows={12}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono resize-y"
                    spellCheck={false}
                  />,
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setModalMode(null)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition text-sm"
              >
                取消
              </button>
              <button
                onClick={saveModal}
                disabled={!form.slug.trim() || !form.name.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {modalMode === 'create' ? '创建' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-3">拒绝模版</h3>
            <p className="text-sm text-zinc-400 mb-3">填写拒绝原因（可选），作者将收到该反馈。</p>
            <textarea
              value={rejectNote}
              maxLength={500}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="例如：模版内容不完整，缺少必要的 Agent 配置…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 text-white text-sm p-3 resize-none h-28 focus:outline-none focus:border-red-500"
            />
            <p className="text-xs text-zinc-500 mt-1 text-right">{rejectNote.length}/500</p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setRejectOpen(false)
                  setRejectTargetId(null)
                  setRejectNote('')
                }}
                className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition"
              >
                取消
              </button>
              <button
                onClick={confirmReject}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition"
              >
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
