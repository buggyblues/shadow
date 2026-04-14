import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye,
  EyeOff,
  FolderPlus,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Variable,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Breadcrumb } from '@/components/Breadcrumb'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

type EnvListResponse = Awaited<ReturnType<typeof api.env.list>>
type EnvListEntry = EnvListResponse['envVars'][number]

function sortGroups(groups: Iterable<string>): string[] {
  return [...new Set(groups)].sort((a, b) =>
    a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b),
  )
}

// ── Group Tabs ────────────────────────────────────────────────────────────────

function GroupTabs({
  groups,
  activeGroup,
  onSelect,
  onCreate,
}: {
  groups: string[]
  activeGroup: string
  onSelect: (group: string) => void
  onCreate: (name: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [showAdd, setShowAdd] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    const name = groupName.trim()
    if (!name || isCreating) return
    setIsCreating(true)
    try {
      await onCreate(name)
      setGroupName('')
      setShowAdd(false)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex items-center gap-1 border-b border-gray-800 pb-2 flex-wrap">
      {groups.map((group) => (
        <button
          key={group}
          type="button"
          onClick={() => onSelect(group)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeGroup === group
              ? 'bg-blue-600/20 text-blue-400 border border-blue-800'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800',
          )}
        >
          {group}
        </button>
      ))}
      {showAdd ? (
        <div className="flex items-center gap-1 ml-1">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
            placeholder={t('secrets.groupNamePlaceholder')}
            className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 w-32"
            disabled={isCreating}
            autoFocus
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!groupName.trim() || isCreating}
            className="text-xs text-blue-400 hover:text-blue-300 px-1.5 py-1 disabled:text-gray-600"
          >
            {isCreating ? t('common.saving') : t('common.add')}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAdd(false)
              setGroupName('')
            }}
            disabled={isCreating}
            className="text-xs text-gray-500 hover:text-gray-300 px-1"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
          title={t('secrets.createGroup')}
        >
          <FolderPlus size={12} />
        </button>
      )}
    </div>
  )
}

// ── Add / Edit Dialog ─────────────────────────────────────────────────────────

function EnvDialog({
  mode,
  groupName,
  initial,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'edit'
  groupName: string
  initial?: { key: string; value: string; isSecret: boolean }
  isSubmitting: boolean
  onSubmit: (data: { scope: string; key: string; value: string; isSecret: boolean }) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [key, setKey] = useState(initial?.key ?? '')
  const [value, setValue] = useState(initial?.value ?? '')
  const [isSecret, setIsSecret] = useState(initial?.isSecret ?? true)
  const [showValue, setShowValue] = useState(mode === 'create')

  const canSubmit = key.trim().length > 0 && !isSubmitting

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Variable size={16} className="text-blue-400" />
            {mode === 'edit' ? t('secrets.editEnvironmentValue') : t('secrets.addEnvironmentValue')}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-gray-500">
          {mode === 'edit'
            ? t('secrets.editEnvironmentValueDescription', { group: groupName })
            : t('secrets.addEnvironmentValueDescription', { group: groupName })}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">{t('secrets.keyName')}</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="OPENAI_API_KEY"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
              autoFocus
              disabled={mode === 'edit'}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">{t('secrets.secretValue')}</label>
            <div className="relative">
              <input
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={mode === 'edit' ? t('secrets.leaveEmptyKeep') : ''}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
              >
                {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={isSecret}
              onChange={(e) => setIsSecret(e.target.checked)}
              className="accent-blue-500 rounded"
            />
            <Lock size={12} />
            {t('secrets.secret')}
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() =>
              canSubmit && onSubmit({ scope: 'global', key: key.trim(), value, isSecret })
            }
            disabled={!canSubmit}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {mode === 'edit' ? t('common.save') : t('common.add')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SecretsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [activeGroup, setActiveGroup] = useState('default')
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editingEntry, setEditingEntry] = useState<{
    key: string
    value: string
    isSecret: boolean
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ key: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['env'],
    queryFn: api.env.list,
  })

  const groups = useMemo(() => {
    const uniqueGroups = new Set<string>(['default'])
    for (const group of data?.groups ?? []) uniqueGroups.add(group)
    for (const envVar of data?.envVars ?? []) uniqueGroups.add(envVar.groupName ?? 'default')
    return sortGroups(uniqueGroups)
  }, [data])

  useEffect(() => {
    if (!groups.includes(activeGroup)) setActiveGroup(groups[0] ?? 'default')
  }, [groups, activeGroup])

  const createGroup = useMutation({
    mutationFn: (name: string) => api.env.createGroup(name),
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: ['env'] })
      const previous = queryClient.getQueryData<EnvListResponse>(['env'])
      queryClient.setQueryData<EnvListResponse>(['env'], (current) => ({
        envVars: current?.envVars ?? [],
        groups: sortGroups(['default', ...(current?.groups ?? []), name]),
      }))
      setActiveGroup(name)
      return { previous }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['env'] })
      toast.success(t('secrets.groupCreated'))
    },
    onError: (_error, _name, context) => {
      if (context?.previous) queryClient.setQueryData(['env'], context.previous)
      toast.error(t('secrets.groupCreateFailed'))
    },
  })

  const saveValue = useMutation({
    mutationFn: async (form: {
      scope: string
      key: string
      value: string
      isSecret: boolean
      originalKey?: string
    }) => {
      await api.env.upsert(form.scope, form.key, form.value, form.isSecret, activeGroup)
      if (form.originalKey && form.originalKey !== form.key) {
        await api.env.delete('global', form.originalKey)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['env'] })
      setDialogMode(null)
      setEditingEntry(null)
      toast.success(dialogMode === 'edit' ? t('secrets.valueUpdated') : t('secrets.valueSaved'))
    },
    onError: () => {
      toast.error(
        dialogMode === 'edit' ? t('secrets.valueUpdateFailed') : t('secrets.valueSaveFailed'),
      )
    },
  })

  const deleteValue = useMutation({
    mutationFn: ({ key }: { key: string }) => api.env.delete('global', key),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['env'] })
      setDeleteTarget(null)
      toast.success(t('secrets.valueDeleted'))
    },
    onError: () => toast.error(t('secrets.valueDeleteFailed')),
  })

  const handleStartEdit = async (entry: EnvListEntry) => {
    try {
      const { envVar } = await api.env.getOne(entry.scope, entry.key)
      setEditingEntry({
        key: envVar.key,
        value: envVar.value,
        isSecret: envVar.isSecret,
      })
      setDialogMode('edit')
    } catch {
      toast.error(t('secrets.valueLoadFailed'))
    }
  }

  const envVars = (data?.envVars ?? []).filter(
    (entry) => (entry.groupName ?? 'default') === activeGroup,
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Breadcrumb items={[{ label: t('secrets.title') }]} className="mb-4" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck size={20} className="text-blue-400" />
            {t('secrets.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('secrets.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingEntry(null)
            setDialogMode('create')
          }}
          className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={14} />
          {t('secrets.addEnvironmentValue')}
        </button>
      </div>

      {/* Encryption banner */}
      <div className="bg-green-950/20 border border-green-900/40 rounded-lg p-3 mb-5 flex items-center gap-3">
        <div className="bg-green-900/40 rounded-full p-1.5">
          <ShieldCheck size={14} className="text-green-400" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-green-300">{t('secrets.encryptionActive')}</p>
          <p className="text-[10px] text-green-600 mt-0.5">
            {t('secrets.allSecretsEncrypted')}{' '}
            <code className="bg-green-900/30 px-1 rounded">SHADOWOB_PASSPHRASE</code>
          </p>
        </div>
        <span className="text-[10px] text-green-700 px-2 py-0.5 bg-green-900/30 rounded-full border border-green-900/50">
          {data?.envVars.length ?? 0} {t('secrets.encryptedValues')}
        </span>
      </div>

      {/* Group tabs */}
      <GroupTabs
        groups={groups}
        activeGroup={activeGroup}
        onSelect={setActiveGroup}
        onCreate={(name) => createGroup.mutateAsync(name).then(() => undefined)}
      />

      {/* Table */}
      <div className="mt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
            <Loader2 size={16} className="animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : envVars.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-lg">
            <Variable size={28} className="mx-auto mb-3 text-gray-700" />
            <p className="text-sm text-gray-500">
              {t('secrets.noValuesInGroup', { group: activeGroup })}
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingEntry(null)
                setDialogMode('create')
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-lg px-4 py-2 transition-colors"
            >
              <Plus size={12} />
              {t('secrets.addEnvironmentValue')}
            </button>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    {t('secrets.keyName')}
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    {t('secrets.secretValue')}
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {envVars.map((entry) => (
                  <tr
                    key={`${entry.scope}-${entry.key}`}
                    className="hover:bg-gray-800/20 transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-mono text-gray-200">{entry.key}</span>
                        {entry.isSecret && <Lock size={10} className="text-yellow-600" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-600">{entry.maskedValue}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button
                          type="button"
                          onClick={() => void handleStartEdit(entry)}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"
                          title={t('common.edit')}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ key: entry.key })}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                          title={t('common.delete')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      {dialogMode && (
        <EnvDialog
          mode={dialogMode}
          groupName={activeGroup}
          initial={editingEntry ?? undefined}
          isSubmitting={saveValue.isPending}
          onSubmit={(data) => {
            saveValue.mutate({
              ...data,
              originalKey: editingEntry?.key,
            })
          }}
          onClose={() => {
            setDialogMode(null)
            setEditingEntry(null)
          }}
        />
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title={t('common.delete')}
          message={`${t('common.delete')} ${deleteTarget.key}?`}
          confirmLabel={t('common.delete')}
          confirmingLabel={t('common.loading')}
          isConfirming={deleteValue.isPending}
          onConfirm={() => deleteValue.mutate({ key: deleteTarget.key })}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
