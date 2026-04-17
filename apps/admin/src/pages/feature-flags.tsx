import { Flag, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { configApi, type ConfigEnv, type FeatureFlag } from '../lib/config-api'
import { showConfirm } from '../components/confirm-dialog'

export function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setFlags(await configApi.listFlags())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleToggle = async (flag: FeatureFlag, envKey: ConfigEnv, value: boolean) => {
    const newEnvs = { ...flag.envs, [envKey]: value }
    try {
      const updated = await configApi.updateFlag(flag.id, { description: flag.description ?? undefined, envs: newEnvs })
      setFlags((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
    } catch (e) {
      alert(String(e))
    }
  }

  const handleDelete = async (flag: FeatureFlag) => {
    const ok = await showConfirm({ message: `Delete flag "${flag.key}"?`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await configApi.deleteFlag(flag.id)
    void load()
  }

  const ENVS: ConfigEnv[] = ['dev', 'staging', 'prod']

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Feature Flags</h1>
          <p className="text-sm text-gray-500">Toggle features per environment</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> New flag
        </button>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : flags.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Flag className="h-10 w-10 text-gray-300" />
          <div>
            <p className="font-medium text-gray-700">No feature flags</p>
            <p className="text-sm text-gray-400">Create flags to control feature availability per environment</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Create first flag
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Key</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Description</th>
                {ENVS.map((e) => (
                  <th key={e} className="px-4 py-3 text-center font-medium text-gray-600 capitalize">{e}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {flags.map((flag) => (
                <tr key={flag.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">{flag.key}</code>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{flag.description ?? '—'}</td>
                  {ENVS.map((envKey) => (
                    <td key={envKey} className="px-4 py-3 text-center">
                      <Toggle
                        value={flag.envs[envKey]}
                        onChange={(v) => handleToggle(flag, envKey, v)}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(flag)} className="rounded p-1.5 text-red-400 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateFlagModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void load() }}
        />
      )}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-gray-300'
        }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
      />
    </button>
  )
}

function CreateFlagModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await configApi.createFlag({ key, description: description || undefined })
      onCreated()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">New Feature Flag</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Key (kebab-case)</span>
            <input
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="enable-new-onboarding"
              pattern="[a-z0-9-]+"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
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
