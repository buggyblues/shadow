import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Clock, Copy, Edit3, GitBranch, GitFork, Loader2, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

// ── Template List ─────────────────────────────────────────────────────────────

function TemplateCard({
  name,
  slug,
  templateSlug,
  version,
  updatedAt,
  onEdit,
  onDelete,
  onShare,
}: {
  name: string
  slug: string
  templateSlug: string | null
  version: number
  updatedAt: string
  onEdit: () => void
  onDelete: () => void
  onShare: () => void
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-200 truncate">{name}</h3>
            <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded font-mono">
              v{version}
            </span>
          </div>
          {templateSlug && (
            <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1">
              <GitFork size={10} />
              Forked from <span className="text-gray-500">{templateSlug}</span>
            </p>
          )}
          <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
            <Clock size={10} />
            {new Date(updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onShare}
            className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-gray-800 rounded transition-colors"
            title="Share"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"
            title="Edit"
          >
            <Edit3 size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded py-1.5 transition-colors"
        >
          <Edit3 size={11} />
          Edit
        </button>
        <Link
          to="/store/$name/deploy"
          params={{ name: slug }}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-800/50 rounded py-1.5 transition-colors"
        >
          Deploy
        </Link>
      </div>
    </div>
  )
}

// ── Fork Dialog ───────────────────────────────────────────────────────────────

function ForkDialog({
  onFork,
  onClose,
}: {
  onFork: (sourceTemplate: string, newName: string) => void
  onClose: () => void
}) {
  const { i18n } = useTranslation()
  const { data: templates } = useQuery({
    queryKey: ['templates', i18n.language],
    queryFn: () => api.templates.listByLocale(i18n.language),
  })
  const [selected, setSelected] = useState('')
  const [newName, setNewName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filteredTemplates = useMemo(() => {
    if (!templates) return []
    if (!searchQuery) return templates
    const q = searchQuery.toLowerCase()
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
    )
  }, [templates, searchQuery])

  useEffect(() => {
    if (selected && !newName) {
      setNewName(`my-${selected}`)
    }
  }, [selected, newName])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitFork size={18} className="text-blue-400" />
          Fork Template
        </h3>
        <p className="text-sm text-gray-500">
          Choose a store template to fork. You'll get an editable copy.
        </p>

        <div ref={dropdownRef} className="relative">
          <label className="text-xs text-gray-400 mb-1.5 block">Source Template</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={selected ? selected : searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSelected('')
                setNewName('')
                setDropdownOpen(true)
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Search templates..."
              className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          {dropdownOpen && filteredTemplates.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg max-h-48 overflow-y-auto shadow-xl">
              {filteredTemplates.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => {
                    setSelected(t.name)
                    setSearchQuery('')
                    setNewName(`my-${t.name}`)
                    setDropdownOpen(false)
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition-colors flex items-center justify-between',
                    selected === t.name && 'bg-blue-900/30 text-blue-400',
                  )}
                >
                  <span className="truncate">{t.name}</span>
                  <span className="text-xs text-gray-600 ml-2 shrink-0">{t.agentCount} agents</span>
                </button>
              ))}
            </div>
          )}
          {dropdownOpen && searchQuery && filteredTemplates.length === 0 && (
            <div className="absolute z-10 w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs text-gray-500 text-center">
              No templates match "{searchQuery}"
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">New Template Name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="my-custom-template"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (selected && newName.trim()) onFork(selected, newName.trim())
            }}
            disabled={!selected || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            <GitFork size={14} />
            Fork
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Import from Git Dialog ────────────────────────────────────────────────────

function ImportGitDialog({
  onImport,
  onClose,
  isPending,
}: {
  onImport: (url: string, name?: string, path?: string, branch?: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [path, setPath] = useState('')

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch size={18} className="text-green-400" />
          Import from Git
        </h3>
        <p className="text-sm text-gray-500">
          Clone a git repository and import the template config.
        </p>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Repository URL *</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/org/repo.git"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="auto-detect from repo"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="default branch"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Config file path</label>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="auto-detect (shadowob.json, *.template.json)"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (url.trim())
                onImport(
                  url.trim(),
                  name.trim() || undefined,
                  path.trim() || undefined,
                  branch.trim() || undefined,
                )
            }}
            disabled={!url.trim() || isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
            {isPending ? 'Cloning...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function MyTemplatesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [showGitImport, setShowGitImport] = useState(false)

  const { data: myTemplates, isLoading } = useQuery({
    queryKey: ['my-templates'],
    queryFn: api.myTemplates.list,
  })

  const forkMutation = useMutation({
    mutationFn: ({ source, name }: { source: string; name: string }) =>
      api.myTemplates.fork(source, name),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      setShowForkDialog(false)
      navigate({ to: '/my-templates/$name', params: { name: data.name } })
      toast.success(`Forked as "${data.name}"`)
    },
    onError: (err) => toast.error(`Fork failed: ${err.message}`),
  })

  const gitImportMutation = useMutation({
    mutationFn: (args: { url: string; name?: string; path?: string; branch?: string }) =>
      api.myTemplates.importGit(args),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      setShowGitImport(false)
      navigate({ to: '/my-templates/$name', params: { name: data.name } })
      toast.success(`Imported "${data.name}" from git`)
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.myTemplates.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      toast.success('Template deleted')
    },
    onError: () => toast.error('Failed to delete'),
  })

  const templates = myTemplates ?? []

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Copy size={20} className="text-blue-400" />
            {t('templates.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('templates.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGitImport(true)}
            className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition-colors"
          >
            <GitBranch size={14} />
            {t('templates.importGit')}
          </button>
          <button
            type="button"
            onClick={() => setShowForkDialog(true)}
            className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <GitFork size={14} />
            {t('templates.forkFromStore')}
          </button>
        </div>
      </div>

      {/* Templates grid */}
      {isLoading && (
        <div className="text-center text-gray-500 text-sm py-12">Loading templates...</div>
      )}

      {!isLoading && templates.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mx-auto">
            <Copy size={28} className="text-gray-600" />
          </div>
          <div>
            <p className="text-sm text-gray-400">{t('templates.noCustomTemplates')}</p>
            <p className="text-xs text-gray-600 mt-1">{t('templates.forkTemplateStart')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForkDialog(true)}
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-lg px-4 py-2 transition-colors"
          >
            <GitFork size={14} />
            Fork a Template
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <TemplateCard
              key={t.slug}
              name={t.name}
              slug={t.slug}
              templateSlug={t.templateSlug}
              version={t.version ?? 1}
              updatedAt={t.updatedAt}
              onEdit={() => navigate({ to: '/my-templates/$name', params: { name: t.name } })}
              onShare={async () => {
                try {
                  const shareData = await api.myTemplates.share(t.name)
                  const json = JSON.stringify(shareData, null, 2)
                  await navigator.clipboard.writeText(json)
                  toast.success('Template JSON copied to clipboard — share with others!')
                } catch {
                  toast.error('Failed to generate share link')
                }
              }}
              onDelete={() => {
                if (confirm(`Delete template "${t.name}"?`)) {
                  deleteMutation.mutate(t.name)
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Fork Dialog */}
      {showForkDialog && (
        <ForkDialog
          onFork={(source, name) => forkMutation.mutate({ source, name })}
          onClose={() => setShowForkDialog(false)}
        />
      )}

      {/* Git Import Dialog */}
      {showGitImport && (
        <ImportGitDialog
          onImport={(url, name, path, branch) =>
            gitImportMutation.mutate({ url, name, path, branch })
          }
          onClose={() => setShowGitImport(false)}
          isPending={gitImportMutation.isPending}
        />
      )}
    </div>
  )
}
