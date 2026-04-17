import { useEffect, useRef, useState } from 'react'
import { FileCode, Plus, Trash2, Eye, Edit } from 'lucide-react'
import { configApi, type ConfigSchema } from '../lib/config-api'
import { showConfirm } from '../components/confirm-dialog'

interface SchemaManagerProps {
  onSelectSchema: (schema: ConfigSchema) => void
}

export function SchemaManagerPage({ onSelectSchema }: SchemaManagerProps) {
  const [schemas, setSchemas] = useState<ConfigSchema[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setSchemas(await configApi.listSchemas())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleDelete = async (schema: ConfigSchema) => {
    const ok = await showConfirm({ message: `Delete schema "${schema.name}"? This removes all config values too.`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await configApi.deleteSchema(schema.id)
    void load()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Schema Manager</h1>
          <p className="text-sm text-gray-500">Define JSON Schemas to generate config forms</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> New schema
        </button>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : schemas.length === 0 ? (
        <EmptyState onAdd={() => setShowCreate(true)} />
      ) : (
        <div className="flex flex-col gap-3">
          {schemas.map((s) => (
            <SchemaCard
              key={s.id}
              schema={s}
              onEdit={() => onSelectSchema(s)}
              onDelete={() => handleDelete(s)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateSchemaModal
          onClose={() => setShowCreate(false)}
          onCreated={(s) => { void load(); onSelectSchema(s) }}
        />
      )}
    </div>
  )
}

function SchemaCard({ schema, onEdit, onDelete }: { schema: ConfigSchema; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
        <FileCode className="h-5 w-5 text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{schema.displayName}</span>
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{schema.name}</code>
        </div>
        {schema.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{schema.description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onEdit} className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50">
          <Edit className="h-3.5 w-3.5" /> Edit
        </button>
        <button onClick={onDelete} className="rounded p-1.5 text-red-400 hover:bg-red-50">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-300 p-12 text-center">
      <FileCode className="h-10 w-10 text-gray-400" />
      <div>
        <p className="font-medium text-gray-700">No schemas yet</p>
        <p className="text-sm text-gray-500">Create a JSON Schema to start managing configs</p>
      </div>
      <button
        onClick={onAdd}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Create first schema
      </button>
    </div>
  )
}

function CreateSchemaModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: ConfigSchema) => void }) {
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [jsonSchemaText, setJsonSchemaText] = useState(JSON.stringify({
    type: 'object',
    title: 'My Config',
    properties: {
      title: { type: 'string', title: 'Title' },
      description: { type: 'string', title: 'Description' },
    },
  }, null, 2))
  const [uiSchemaText, setUiSchemaText] = useState('{}')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setJsonSchemaText(reader.result as string) }
    reader.readAsText(file)
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setError('')
    try {
      const jsonSchema = JSON.parse(jsonSchemaText) as Record<string, unknown>
      let uiSchema: Record<string, unknown> = {}
      try { uiSchema = JSON.parse(uiSchemaText) as Record<string, unknown> } catch { }
      setSaving(true)
      const s = await configApi.createSchema({ name, displayName, description: description || undefined, jsonSchema, uiSchema })
      onCreated(s)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 overflow-y-auto pt-16">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">New Schema</h2>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Name (kebab-case)</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="homepage-plays"
                pattern="[a-z0-9-]+"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Display name</span>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Homepage Plays"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">JSON Schema</span>
              <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-indigo-600 hover:underline">
                Import from file
              </button>
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
            </div>
            <textarea
              required
              value={jsonSchemaText}
              onChange={(e) => setJsonSchemaText(e.target.value)}
              rows={10}
              className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">UISchema (optional)</span>
            <textarea
              value={uiSchemaText}
              onChange={(e) => setUiSchemaText(e.target.value)}
              rows={4}
              className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
