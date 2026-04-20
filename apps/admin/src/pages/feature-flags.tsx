import { Flag, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { showConfirm } from '../components/confirm-dialog'
import { type ConfigEnv, configApi, type FeatureFlag } from '../lib/config-api'

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

  useEffect(() => {
    void load()
  }, [])

  const handleToggle = async (flag: FeatureFlag, envKey: ConfigEnv, value: boolean) => {
    const newEnvs = { ...flag.envs, [envKey]: value }
    try {
      const updated = await configApi.updateFlag(flag.id, {
        description: flag.description ?? undefined,
        envs: newEnvs,
      })
      setFlags((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
    } catch (e) {
      alert(String(e))
    }
  }

  const handleDelete = async (flag: FeatureFlag) => {
    const ok = await showConfirm({
      message: `Delete flag "${flag.key}"?`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await configApi.deleteFlag(flag.id)
    void load()
  }

  const ENVS: ConfigEnv[] = ['dev', 'staging', 'prod']

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Feature Flags</h1>
          <p className="text-sm text-zinc-400">Toggle features per environment</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> New flag
        </button>
      </div>

      {error && <p className="rounded bg-red-900/20 px-3 py-2 text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : flags.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-600 p-12 text-center">
          <Flag className="h-10 w-10 text-zinc-600" />
          <div>
            <p className="font-medium text-zinc-200">No feature flags</p>
            <p className="text-sm text-zinc-500">
              Create flags to control feature availability per environment
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create first flag
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-300">Key</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-300">Description</th>
                {ENVS.map((e) => (
                  <th
                    key={e}
                    className="px-4 py-3 text-center font-medium text-zinc-300 capitalize"
                  >
                    {e}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {flags.map((flag) => (
                <tr key={flag.id} className="hover:bg-zinc-900">
                  <td className="px-4 py-3">
                    <code className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs font-medium text-zinc-200">
                      {flag.key}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{flag.description ?? '—'}</td>
                  {ENVS.map((envKey) => (
                    <td key={envKey} className="px-4 py-3 text-center">
                      <Toggle
                        value={flag.envs[envKey]}
                        onChange={(v) => handleToggle(flag, envKey, v)}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(flag)}
                      className="rounded p-1.5 text-red-400 hover:bg-red-900/20"
                    >
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
          onCreated={() => {
            setShowCreate(false)
            void load()
          }}
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
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        value ? 'bg-indigo-600' : 'bg-zinc-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-4.5' : 'translate-x-0.5'
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
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">New Feature Flag</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-200">Key (kebab-case)</span>
            <input
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="enable-new-onboarding"
              pattern="[a-z0-9-]+"
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-200">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-900"
            >
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
