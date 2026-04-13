import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye,
  EyeOff,
  FolderPlus,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Variable,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

type EnvListResponse = Awaited<ReturnType<typeof api.env.list>>
type EnvListEntry = EnvListResponse['envVars'][number]

type EnvFormState = {
  mode: 'create' | 'edit'
  scope: string
  key: string
  value: string
  isSecret: boolean
  originalScope?: string
  originalKey?: string
}

function sortGroups(groups: Iterable<string>): string[] {
  return [...new Set(groups)].sort((a, b) =>
    a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b),
  )
}

function createEmptyFormState(): EnvFormState {
  return {
    mode: 'create',
    scope: 'global',
    key: '',
    value: '',
    isSecret: true,
  }
}

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

  const createGroup = async () => {
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
    <div className="flex items-center gap-1 mb-4 border-b border-gray-800 pb-2 flex-wrap">
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
            onChange={(event) => setGroupName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void createGroup()}
            placeholder={t('secrets.groupNamePlaceholder')}
            className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 w-32"
            disabled={isCreating}
            autoFocus
          />
          <button
            type="button"
            onClick={() => void createGroup()}
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
            ✕
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

function VariableRow({
  scope,
  envKey,
  maskedValue,
  isSecret,
  isEditLoading,
  onEdit,
  onDelete,
}: {
  scope: string
  envKey: string
  maskedValue: string
  isSecret: boolean
  isEditLoading: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 bg-gray-950 rounded-lg">
      <Variable size={13} className="text-gray-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
            {scope}
          </span>
          <span className="text-xs font-mono text-gray-300 break-all">{envKey}</span>
          {isSecret && <Lock size={10} className="text-yellow-600" />}
        </div>
        <p className="text-[10px] text-gray-600 font-mono mt-0.5 break-all">{maskedValue}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        disabled={isEditLoading}
        title={t('common.edit')}
        className="text-gray-600 hover:text-blue-400 transition-colors p-1 disabled:text-gray-700"
      >
        {isEditLoading ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={t('common.delete')}
        className="text-gray-600 hover:text-red-400 transition-colors p-1"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function EnvValueForm({
  groupName,
  form,
  isSubmitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  groupName: string
  form: EnvFormState
  isSubmitting: boolean
  onChange: (next: Partial<EnvFormState>) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const [showValue, setShowValue] = useState(false)

  const isEditing = form.mode === 'edit'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div>
        <h4 className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
          <Plus size={12} />
          {isEditing ? t('secrets.editEnvironmentValue') : t('secrets.addEnvironmentValue')}
        </h4>
        <p className="text-[11px] text-gray-600 mt-1">
          {isEditing
            ? t('secrets.editEnvironmentValueDescription', { group: groupName })
            : t('secrets.addEnvironmentValueDescription', { group: groupName })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="text"
          value={form.key}
          onChange={(event) => onChange({ key: event.target.value })}
          placeholder={t('secrets.keyName')}
          className="bg-gray-950 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
        <input
          type="text"
          value={form.scope}
          onChange={(event) => onChange({ scope: event.target.value })}
          placeholder={t('secrets.scope')}
          className="bg-gray-950 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type={showValue ? 'text' : 'password'}
            value={form.value}
            onChange={(event) => onChange({ value: event.target.value })}
            placeholder={t('secrets.secretValue')}
            className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 pr-8"
          />
          <button
            type="button"
            onClick={() => setShowValue(!showValue)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
          >
            {showValue ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={form.isSecret}
            onChange={(event) => onChange({ isSecret: event.target.checked })}
            className="accent-blue-500"
          />
          {t('secrets.secret')}
        </label>

        {isEditing && (
          <button
            type="button"
            onClick={onCancel}
            className="border border-gray-700 hover:border-gray-600 text-gray-300 px-3 py-2 rounded text-xs transition-colors"
          >
            {t('common.cancel')}
          </button>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={!form.key.trim() || isSubmitting}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-2 rounded text-xs transition-colors"
        >
          {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        </button>
      </div>
    </div>
  )
}

export function SecretsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [activeGroup, setActiveGroup] = useState('default')
  const [form, setForm] = useState<EnvFormState>(() => createEmptyFormState())
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)

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
    if (!groups.includes(activeGroup)) {
      setActiveGroup(groups[0] ?? 'default')
    }
  }, [groups, activeGroup])

  useEffect(() => {
    setForm((current) => (current.mode === 'edit' ? createEmptyFormState() : current))
    setEditingEntryId(null)
  }, [activeGroup])

  const createGroup = useMutation({
    mutationFn: (name: string) => api.env.createGroup(name),
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: ['env'] })
      const previous = queryClient.getQueryData<EnvListResponse>(['env'])
      const previousActiveGroup = activeGroup

      queryClient.setQueryData<EnvListResponse>(['env'], (current) => ({
        envVars: current?.envVars ?? [],
        groups: sortGroups(['default', ...(current?.groups ?? []), name]),
      }))

      setActiveGroup(name)
      return { previous, previousActiveGroup }
    },
    onSuccess: async ({ name }) => {
      queryClient.setQueryData<EnvListResponse>(['env'], (current) => ({
        envVars: current?.envVars ?? [],
        groups: sortGroups(['default', ...(current?.groups ?? []), name]),
      }))

      await queryClient.invalidateQueries({ queryKey: ['env'] })
      toast.success(t('secrets.groupCreated'))
    },
    onError: (_error, _name, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['env'], context.previous)
      }
      setActiveGroup(context?.previousActiveGroup ?? 'default')
      toast.error(t('secrets.groupCreateFailed'))
    },
  })

  const saveValue = useMutation({
    mutationFn: async (nextForm: EnvFormState) => {
      const scope = nextForm.scope.trim() || 'global'
      const key = nextForm.key.trim()

      await api.env.upsert(scope, key, nextForm.value, nextForm.isSecret, activeGroup)

      if (
        nextForm.mode === 'edit' &&
        nextForm.originalScope &&
        nextForm.originalKey &&
        (nextForm.originalScope !== scope || nextForm.originalKey !== key)
      ) {
        await api.env.delete(nextForm.originalScope, nextForm.originalKey)
      }
    },
    onSuccess: async (_result, nextForm) => {
      await queryClient.invalidateQueries({ queryKey: ['env'] })
      setForm(createEmptyFormState())
      toast.success(nextForm.mode === 'edit' ? t('secrets.valueUpdated') : t('secrets.valueSaved'))
    },
    onError: (_error, nextForm) => {
      toast.error(
        nextForm.mode === 'edit' ? t('secrets.valueUpdateFailed') : t('secrets.valueSaveFailed'),
      )
    },
  })

  const deleteValue = useMutation({
    mutationFn: ({ scope, key }: { scope: string; key: string }) => api.env.delete(scope, key),
    onSuccess: async (_result, deletedEntry) => {
      await queryClient.invalidateQueries({ queryKey: ['env'] })
      if (
        form.mode === 'edit' &&
        form.originalScope === deletedEntry.scope &&
        form.originalKey === deletedEntry.key
      ) {
        setForm(createEmptyFormState())
      }
      toast.success(t('secrets.valueDeleted'))
    },
    onError: () => toast.error(t('secrets.valueDeleteFailed')),
  })

  const startEditing = async (entry: EnvListEntry) => {
    const entryId = `${entry.scope}:${entry.key}`
    setEditingEntryId(entryId)

    try {
      const { envVar } = await api.env.getOne(entry.scope, entry.key)
      setForm({
        mode: 'edit',
        scope: envVar.scope,
        key: envVar.key,
        value: envVar.value,
        isSecret: envVar.isSecret,
        originalScope: envVar.scope,
        originalKey: envVar.key,
      })
    } catch {
      toast.error(t('secrets.valueLoadFailed'))
    } finally {
      setEditingEntryId(null)
    }
  }

  const envVars = (data?.envVars ?? []).filter(
    (entry) => (entry.groupName ?? 'default') === activeGroup,
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ShieldCheck size={20} className="text-blue-400" />
          {t('secrets.title')}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('secrets.description')}</p>
      </div>

      <div className="bg-green-950/20 border border-green-900/40 rounded-lg p-3 mb-5 flex items-center gap-3">
        <div className="bg-green-900/40 rounded-full p-1.5">
          <ShieldCheck size={14} className="text-green-400" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-green-300">{t('secrets.encryptionActive')}</p>
          <p className="text-[10px] text-green-600 mt-0.5">
            {t('secrets.allSecretsEncrypted')} {t('secrets.setPassphraseEnv')}{' '}
            <code className="bg-green-900/30 px-1 rounded">SHADOWOB_PASSPHRASE</code>{' '}
            {t('secrets.envVarToUseCustom')}
          </p>
        </div>
        <span className="text-[10px] text-green-700 px-2 py-0.5 bg-green-900/30 rounded-full border border-green-900/50">
          {data?.envVars.length ?? 0} {t('secrets.encryptedValues')}
        </span>
      </div>

      <GroupTabs
        groups={groups}
        activeGroup={activeGroup}
        onSelect={setActiveGroup}
        onCreate={(name) => createGroup.mutateAsync(name).then(() => undefined)}
      />

      <section>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
          <Variable size={14} />
          {t('secrets.environmentVariables')}
          <span className="text-xs text-gray-600 font-normal">({activeGroup})</span>
        </h2>
        <p className="text-xs text-gray-600 mb-4">{t('secrets.environmentValuesDescription')}</p>

        <EnvValueForm
          groupName={activeGroup}
          form={form}
          isSubmitting={saveValue.isPending}
          onChange={(next) => setForm((current) => ({ ...current, ...next }))}
          onCancel={() => setForm(createEmptyFormState())}
          onSubmit={() => saveValue.mutate(form)}
        />

        <div className="mt-3 space-y-1.5">
          {isLoading && (
            <div className="text-center py-4 text-xs text-gray-600">{t('common.loading')}</div>
          )}
          {!isLoading && envVars.length === 0 && (
            <div className="text-center py-6 text-sm text-gray-600 border border-dashed border-gray-800 rounded-lg">
              {t('secrets.noValuesInGroup', { group: activeGroup })}
            </div>
          )}
          {envVars.map((entry) => (
            <VariableRow
              key={`${entry.scope}-${entry.key}`}
              scope={entry.scope}
              envKey={entry.key}
              maskedValue={entry.maskedValue}
              isSecret={entry.isSecret}
              isEditLoading={editingEntryId === `${entry.scope}:${entry.key}`}
              onEdit={() => void startEditing(entry)}
              onDelete={() => deleteValue.mutate({ scope: entry.scope, key: entry.key })}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
