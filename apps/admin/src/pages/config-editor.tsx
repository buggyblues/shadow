import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Code2,
  Copy,
  Download,
  Eye,
  Globe,
  History,
  RotateCcw,
  Save,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import DiffViewer from 'react-diff-viewer-continued'
import { showConfirm } from '../components/confirm-dialog'
import {
  ArrayItemTemplate,
  BaseInputTemplate,
  customWidgets,
  RjsfFieldTemplate,
  RjsfObjectFieldTemplate,
  SortableArrayFieldTemplate,
} from '../components/rjsf-widgets'
import { type ConfigEnv, type ConfigSchema, type ConfigValue, configApi } from '../lib/config-api'

interface ConfigEditorProps {
  schema: ConfigSchema
  onBack: () => void
}

const ENVS: ConfigEnv[] = ['dev', 'staging', 'prod']

const ENV_LABELS: Record<ConfigEnv, string> = {
  dev: 'Development',
  staging: 'Staging',
  prod: 'Production',
}

const ENV_COLORS: Record<ConfigEnv, string> = {
  dev: 'bg-zinc-700 text-zinc-200',
  staging: 'bg-yellow-100 text-yellow-700',
  prod: 'bg-green-100 text-green-400',
}

export function ConfigEditorPage({ schema, onBack }: ConfigEditorProps) {
  const [env, setEnv] = useState<ConfigEnv>('prod')
  const [draft, setDraft] = useState<ConfigValue | null>(null)
  const [published, setPublished] = useState<ConfigValue | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown> | unknown[]>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState('')
  const [autoSaving, setAutoSaving] = useState(false)
  const [showDataJson, setShowDataJson] = useState(false)
  const [showSchemaDrawer, setShowSchemaDrawer] = useState(false)
  const [showCopyMenu, setShowCopyMenu] = useState(false)
  const [copyingToEnv, setCopyingToEnv] = useState<ConfigEnv | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await configApi.getValues(schema.name, env)
      setDraft(result.draft)
      setPublished(result.published)
      // Load draft data if exists, else published, else empty
      const data =
        result.draft?.data ??
        result.published?.data ??
        (schema.jsonSchema?.type === 'array' ? [] : {})
      setFormData(data as Record<string, unknown>)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [schema.name, env])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const saved = await configApi.saveDraft(schema.name, env, formData)
      setDraft(saved)
      setSuccess('Draft saved!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    const ok = await showConfirm({
      message: `Publish config "${schema.name}" to ${env}?`,
      confirmLabel: 'Publish',
      danger: env === 'prod',
    })
    if (!ok) return
    setPublishing(true)
    setError('')
    setSuccess('')
    try {
      const pub = await configApi.publish(schema.name, env)
      setPublished(pub)
      setDraft(pub)
      setPublishedUrl(`/api/v1/config/${schema.name}?env=${env}`)
      setSuccess('Published!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(String(e))
    } finally {
      setPublishing(false)
    }
  }

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(formData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${schema.name}-${env}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyToEnv = async (targetEnv: ConfigEnv) => {
    const ok = await showConfirm({
      message: `Copy current data to ${ENV_LABELS[targetEnv]}?`,
      confirmLabel: 'Copy',
    })
    if (!ok) return
    setCopyingToEnv(targetEnv)
    setShowCopyMenu(false)
    setError('')
    try {
      await configApi.saveDraft(schema.name, targetEnv, formData)
      setSuccess(`Copied to ${ENV_LABELS[targetEnv]}!`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(String(e))
    } finally {
      setCopyingToEnv(null)
    }
  }

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as Record<string, unknown> | unknown[]
        // Validate against the schema
        const { errors } = validator.validateFormData(parsed, schema.jsonSchema as never)
        if (errors.length > 0) {
          setError(`JSON validation failed: ${errors.map((e) => e.message).join('; ')}`)
          // Reset file input
          e.target.value = ''
          return
        }
        setFormData(parsed)
        setSuccess('JSON imported successfully')
        setTimeout(() => setSuccess(''), 3000)
      } catch {
        setError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  const versionLabel = (() => {
    if (!draft && !published) return 'No versions'
    const v = draft?.version ?? published?.version ?? 0
    const isPublished = draft?.isPublished || draft?.version === published?.version
    return `v${v} — ${isPublished ? '✓ published' : 'draft'}`
  })()

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white">{schema.displayName}</h1>
          <code className="text-xs text-zinc-400">{schema.name}</code>
        </div>
        <span className="text-sm text-zinc-300">{versionLabel}</span>
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-1 rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          <History className="h-3.5 w-3.5" /> History
        </button>
      </div>

      {/* Env tabs */}
      <div className="flex gap-1 rounded-xl bg-zinc-800 p-1">
        {ENVS.map((e) => (
          <button
            key={e}
            onClick={() => setEnv(e)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
              env === e ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {ENV_LABELS[e]}
            {e === 'prod' && <span className="ml-1 text-xs">🔴</span>}
          </button>
        ))}
      </div>

      {/* Published status banner */}
      {published && (
        <div className="flex items-center gap-2 rounded-lg bg-green-900/20 px-3 py-2 text-sm text-green-400">
          <Globe className="h-4 w-4" />
          Published: v{published.version} on {new Date(published.publishedAt!).toLocaleString()}
        </div>
      )}

      {publishedUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-900/30 px-3 py-2 text-sm">
          <span className="text-indigo-500 font-medium">Config URL (latest):</span>
          <code className="flex-1 text-indigo-300 font-mono text-xs">{publishedUrl}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(window.location.origin + publishedUrl)
              setSuccess('URL copied!')
              setTimeout(() => setSuccess(''), 2000)
            }}
            className="rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
          >
            Copy
          </button>
        </div>
      )}

      {error && <p className="rounded bg-red-900/20 px-3 py-2 text-sm text-red-400">{error}</p>}
      {success && (
        <p className="rounded bg-green-900/20 px-3 py-2 text-sm text-green-400">{success}</p>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportJson}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900"
        >
          <Upload className="h-3.5 w-3.5" /> Import JSON
        </button>
        <button
          onClick={() => setShowDataJson(true)}
          className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900"
        >
          <Eye className="h-3.5 w-3.5" /> View JSON
        </button>
        <button
          onClick={handleExportJson}
          className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900"
        >
          <Download className="h-3.5 w-3.5" /> Export JSON
        </button>
        <button
          onClick={() => setShowSchemaDrawer(true)}
          className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900"
        >
          <Code2 className="h-3.5 w-3.5" /> Schema
        </button>
        <div className="relative">
          <button
            onClick={() => setShowCopyMenu((v) => !v)}
            disabled={!!copyingToEnv}
            className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" />
            {copyingToEnv ? `Copying…` : 'Copy to'}
            <ChevronDown className="h-3 w-3" />
          </button>
          {showCopyMenu && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
              {ENVS.filter((e) => e !== env).map((targetEnv) => (
                <button
                  key={targetEnv}
                  onClick={() => handleCopyToEnv(targetEnv)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
                >
                  → {ENV_LABELS[targetEnv]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RJSF Form */}
      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5">
          <Form
            schema={schema.jsonSchema as never}
            uiSchema={schema.uiSchema as never}
            formData={formData}
            validator={validator}
            widgets={customWidgets}
            templates={{
              ArrayFieldItemTemplate: ArrayItemTemplate as never,
              ArrayFieldTemplate: SortableArrayFieldTemplate as never,
              FieldTemplate: RjsfFieldTemplate as never,
              ObjectFieldTemplate: RjsfObjectFieldTemplate as never,
              BaseInputTemplate: BaseInputTemplate as never,
            }}
            onChange={({ formData: fd }) => {
              setFormData(fd as Record<string, unknown>)
              if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
              autoSaveTimer.current = setTimeout(() => {
                setAutoSaving(true)
                configApi
                  .saveDraft(schema.name, env, fd as Record<string, unknown>)
                  .then((saved) => setDraft(saved))
                  .catch(() => {
                    /* silent */
                  })
                  .finally(() => setAutoSaving(false))
              }, 3000)
            }}
            onSubmit={({ formData: fd }) => {
              setFormData(fd as Record<string, unknown>)
              void handleSave()
            }}
          >
            {/* No submit button — use toolbar */}
            <div />
          </Form>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {autoSaving && <span className="text-xs text-zinc-400 mr-auto">Auto-saving…</span>}
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing || loading || !draft}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Globe className="h-4 w-4" />
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      {/* History drawer */}
      {showHistory && (
        <HistoryDrawer
          schemaName={schema.name}
          env={env}
          currentPublishedVersion={published?.version}
          onClose={() => setShowHistory(false)}
          onRolledBack={() => {
            setShowHistory(false)
            void load()
          }}
        />
      )}

      {/* Data JSON modal */}
      {showDataJson && (
        <DataJsonModal
          data={formData}
          schemaName={schema.name}
          env={env}
          onClose={() => setShowDataJson(false)}
          onExport={handleExportJson}
        />
      )}

      {/* Schema drawer */}
      {showSchemaDrawer && (
        <SchemaEditDrawer
          schema={schema}
          onClose={() => setShowSchemaDrawer(false)}
          onUpdated={(updated) => {
            // Parent would need to refresh schema — just close for now
            void updated
            setShowSchemaDrawer(false)
          }}
        />
      )}

      {/* Close copy menu on outside click */}
      {showCopyMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowCopyMenu(false)} />
      )}
    </div>
  )
}

// ── Data JSON Modal ───────────────────────────────────────────────────────────
function DataJsonModal({
  data,
  schemaName,
  env,
  onClose,
  onExport,
}: {
  data: Record<string, unknown> | unknown[]
  schemaName: string
  env: string
  onClose: () => void
  onExport: () => void
}) {
  const json = JSON.stringify(data, null, 2)
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-16 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-zinc-900 border border-zinc-700 shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold text-white">
            Data JSON —{' '}
            <code className="text-sm font-normal text-zinc-400">
              {schemaName} / {env}
            </code>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(json)
              }}
              className="flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button
              onClick={onExport}
              className="flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              <Download className="h-3.5 w-3.5" /> Export .json
            </button>
            <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:text-zinc-200">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <pre className="overflow-auto bg-zinc-950 p-5 text-xs font-mono text-zinc-300 max-h-[70vh]">
          {json}
        </pre>
      </div>
    </div>
  )
}

// ── Schema Edit Drawer ────────────────────────────────────────────────────────
function SchemaEditDrawer({
  schema,
  onClose,
  onUpdated,
}: {
  schema: ConfigSchema
  onClose: () => void
  onUpdated: (s: ConfigSchema) => void
}) {
  const [tab, setTab] = useState<'json-schema' | 'ui-schema'>('json-schema')
  const [jsonSchemaText, setJsonSchemaText] = useState(JSON.stringify(schema.jsonSchema, null, 2))
  const [uiSchemaText, setUiSchemaText] = useState(JSON.stringify(schema.uiSchema ?? {}, null, 2))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const activeText = tab === 'json-schema' ? jsonSchemaText : uiSchemaText
  const setActiveText = tab === 'json-schema' ? setJsonSchemaText : setUiSchemaText

  const handleExport = () => {
    const blob = new Blob([activeText], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download =
      tab === 'json-schema' ? `${schema.name}.schema.json` : `${schema.name}.uischema.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      let jsonSchema: Record<string, unknown>
      let uiSchema: Record<string, unknown>
      try {
        jsonSchema = JSON.parse(jsonSchemaText) as Record<string, unknown>
      } catch {
        throw new Error('Invalid JSON Schema JSON')
      }
      try {
        uiSchema = JSON.parse(uiSchemaText) as Record<string, unknown>
      } catch {
        throw new Error('Invalid UISchema JSON')
      }
      const updated = await configApi.updateSchema(schema.id, { jsonSchema, uiSchema })
      setSuccess('Schema saved!')
      setTimeout(() => setSuccess(''), 3000)
      onUpdated(updated)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[600px] flex flex-col bg-zinc-900 border-l border-zinc-700 shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Code2 className="h-4 w-4" /> Schema —{' '}
            <code className="text-sm font-normal text-zinc-400">{schema.name}</code>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void navigator.clipboard.writeText(activeText)}
              className="flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:text-zinc-200">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b px-5 pt-2">
          {(['json-schema', 'ui-schema'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t === 'json-schema' ? 'JSON Schema' : 'UI Schema'}
            </button>
          ))}
        </div>

        <textarea
          value={activeText}
          onChange={(e) => setActiveText(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none bg-zinc-950 p-5 font-mono text-xs text-zinc-100 outline-none"
        />

        {error && <p className="px-5 py-2 text-xs text-red-400">{error}</p>}
        {success && <p className="px-5 py-2 text-xs text-green-600">{success}</p>}

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-900"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save schema'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── History Drawer ────────────────────────────────────────────────────────────
function HistoryDrawer({
  schemaName,
  env,
  currentPublishedVersion,
  onClose,
  onRolledBack,
}: {
  schemaName: string
  env: ConfigEnv
  currentPublishedVersion?: number
  onClose: () => void
  onRolledBack: () => void
}) {
  const [history, setHistory] = useState<ConfigValue[]>([])
  const [loading, setLoading] = useState(true)
  const [diffItem, setDiffItem] = useState<ConfigValue | null>(null)
  const [rollingBack, setRollingBack] = useState<number | null>(null)

  useEffect(() => {
    configApi
      .getHistory(schemaName, env)
      .then(setHistory)
      .finally(() => setLoading(false))
  }, [schemaName, env])

  const handleRollback = async (version: number) => {
    const ok = await showConfirm({
      message: `Roll back to v${version}?`,
      confirmLabel: 'Rollback',
      danger: true,
    })
    if (!ok) return
    setRollingBack(version)
    try {
      await configApi.rollback(schemaName, env, version)
      onRolledBack()
    } finally {
      setRollingBack(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[520px] overflow-y-auto bg-zinc-900 border-l border-zinc-700 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <History className="h-4 w-4" /> Version history
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="p-5 text-sm text-zinc-400">Loading…</p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-700">
            {history.map((item) => (
              <div key={item.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">v{item.version}</span>
                    {item.isPublished && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-400">
                        live
                      </span>
                    )}
                    {item.version === currentPublishedVersion && !item.isPublished && (
                      <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                        was live
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setDiffItem(diffItem?.id === item.id ? null : item)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
                    >
                      <Eye className="h-3.5 w-3.5" /> Diff
                    </button>
                    {!item.isPublished && (
                      <button
                        onClick={() => handleRollback(item.version)}
                        disabled={rollingBack === item.version}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-900/30 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {rollingBack === item.version ? 'Rolling back…' : 'Rollback'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-zinc-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(item.createdAt).toLocaleString()}
                  {item.publishedAt &&
                    ` · published ${new Date(item.publishedAt).toLocaleString()}`}
                </p>
                {diffItem?.id === item.id && (
                  <div className="overflow-x-auto rounded border text-xs">
                    <DiffViewer
                      oldValue={JSON.stringify(
                        history[history.indexOf(item) + 1]?.data ?? {},
                        null,
                        2,
                      )}
                      newValue={JSON.stringify(item.data, null, 2)}
                      splitView={false}
                      useDarkTheme={false}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
