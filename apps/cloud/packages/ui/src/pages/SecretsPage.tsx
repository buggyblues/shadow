import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  EmptyState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
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
import { EnvVarEditorDialog } from '@/components/EnvVarEditorDialog'
import { PageShell } from '@/components/PageShell'
import { api } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
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
  onDelete,
}: {
  groups: string[]
  activeGroup: string
  onSelect: (group: string) => void
  onCreate: (name: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
}) {
  const api = useApiClient()
  const { t } = useTranslation()
  const [showAdd, setShowAdd] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)

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

  const handleDelete = async (name: string) => {
    setDeletingGroup(null)
    await onDelete(name)
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-0 flex-1 flex-wrap">
        {groups.map((group) => {
          const isActive = group === activeGroup
          const isDeletable = group !== 'default'
          return (
            <div key={group} className="relative group/tab flex items-center">
              <button
                type="button"
                onClick={() => onSelect(group)}
                className={cn(
                  'flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
                  isDeletable && isActive && 'pr-7',
                  isDeletable && !isActive && 'group-hover/tab:pr-7',
                )}
              >
                {group}
              </button>
              {isDeletable && (
                <button
                  type="button"
                  title={t('secrets.deleteGroup')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingGroup(group)
                  }}
                  className={cn(
                    'absolute right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-text-muted transition-all hover:bg-danger/15 hover:text-danger',
                    isActive ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
                  )}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          )
        })}

        {showAdd ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate()
                if (e.key === 'Escape') {
                  setShowAdd(false)
                  setGroupName('')
                }
              }}
              placeholder={t('secrets.groupNamePlaceholder')}
              disabled={isCreating}
              autoFocus
              className="h-8 w-36 text-sm"
            />
            <Button
              type="button"
              variant="primary"
              size="xs"
              onClick={() => void handleCreate()}
              disabled={!groupName.trim() || isCreating}
            >
              {isCreating ? <Loader2 size={11} className="animate-spin" /> : t('common.add')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setShowAdd(false)
                setGroupName('')
              }}
              disabled={isCreating}
            >
              <X size={11} />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0 gap-1.5 text-text-muted hover:text-text-primary"
            onClick={() => setShowAdd(true)}
            title={t('secrets.createGroup')}
          >
            <FolderPlus size={13} />
            <span className="hidden sm:inline">{t('secrets.createGroup')}</span>
          </Button>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deletingGroup !== null}
        onOpenChange={(open) => !open && setDeletingGroup(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('secrets.deleteGroupTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('secrets.deleteGroupDescription', { group: deletingGroup ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => deletingGroup && void handleDelete(deletingGroup)}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SecretsPage() {
  const api = useApiClient()
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

  const deleteGroup = useMutation({
    mutationFn: (name: string) => api.env.deleteGroup(name),
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: ['env'] })
      const previous = queryClient.getQueryData<EnvListResponse>(['env'])
      queryClient.setQueryData<EnvListResponse>(['env'], (current) => ({
        envVars: (current?.envVars ?? []).filter((ev) => (ev.groupName ?? 'default') !== name),
        groups: sortGroups((current?.groups ?? []).filter((g) => g !== name)),
      }))
      if (activeGroup === name) setActiveGroup('default')
      return { previous }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['env'] })
      toast.success(t('secrets.groupDeleted'))
    },
    onError: (_error, _name, context) => {
      if (context?.previous) queryClient.setQueryData(['env'], context.previous)
      toast.error(t('secrets.groupDeleteFailed'))
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
    <PageShell
      breadcrumb={[{ label: t('secrets.title') }]}
      title={t('secrets.title')}
      description={t('secrets.description')}
      narrow
      actions={
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            setEditingEntry(null)
            setDialogMode('create')
          }}
        >
          <Plus size={14} />
          {t('secrets.addEnvironmentValue')}
        </Button>
      }
      headerContent={
        <div className="space-y-3">
          {/* Encryption status banner */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/20 bg-success/5 px-4 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
              <ShieldCheck size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-success">
                {t('secrets.encryptionActive')}
              </span>
              <span className="ml-2 text-xs text-text-muted">
                {t('secrets.allSecretsEncrypted')}
              </span>
              <code className="ml-1 rounded border border-success/20 bg-bg-primary/40 px-1.5 py-0.5 font-mono text-[11px] text-success/80">
                SHADOWOB_PASSPHRASE
              </code>
            </div>
            <span className="shrink-0 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
              {data?.envVars.length ?? 0} {t('secrets.encryptedValues')}
            </span>
          </div>

          {/* Group selector */}
          <GroupTabs
            groups={groups}
            activeGroup={activeGroup}
            onSelect={setActiveGroup}
            onCreate={(name) => createGroup.mutateAsync(name).then(() => undefined)}
            onDelete={(name) => deleteGroup.mutateAsync(name).then(() => undefined)}
          />
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-text-muted">
          <Loader2 size={18} className="mr-2 animate-spin" />
          {t('common.loading')}
        </div>
      ) : envVars.length === 0 ? (
        <Card variant="glass">
          <EmptyState
            icon={Variable}
            title={t('secrets.noValuesInGroup', { group: activeGroup })}
            description={t('secrets.description')}
            action={
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingEntry(null)
                  setDialogMode('create')
                }}
              >
                <Plus size={14} />
                {t('secrets.addEnvironmentValue')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card variant="glass">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                  {t('secrets.keyName')}
                </TableHead>
                <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                  {t('secrets.secretValue')}
                </TableHead>
                <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                  {t('common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {envVars.map((entry) => (
                <TableRow key={`${entry.scope}-${entry.key}`} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-text-primary">{entry.key}</code>
                      {entry.isSecret && <Lock size={12} className="text-warning" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-text-muted">{entry.maskedValue}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-primary)_36%,transparent)]"
                        onClick={() => void handleStartEdit(entry)}
                        title={t('common.edit')}
                      >
                        <Pencil size={13} />
                        <span className="sr-only">{t('common.edit')}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-danger/70 transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease hover:bg-danger/10 hover:text-danger active:translate-y-[0.5px] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-primary)_36%,transparent)]"
                        onClick={() => setDeleteTarget({ key: entry.key })}
                        title={t('common.delete')}
                      >
                        <Trash2 size={13} />
                        <span className="sr-only">{t('common.delete')}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      {dialogMode && (
        <EnvVarEditorDialog
          mode={dialogMode}
          overline={activeGroup}
          initial={editingEntry ?? undefined}
          isSubmitting={saveValue.isPending}
          titleCreate={t('secrets.addEnvironmentValue')}
          titleEdit={t('secrets.editEnvironmentValue')}
          subtitleCreate={t('secrets.addEnvironmentValueDescription', { group: activeGroup })}
          subtitleEdit={t('secrets.editEnvironmentValueDescription', { group: activeGroup })}
          onSubmit={(data) => {
            saveValue.mutate({
              scope: 'global',
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
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `${t('common.delete')} ${deleteTarget.key}?` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                loading={deleteValue.isPending}
                onClick={() => deleteTarget && deleteValue.mutate({ key: deleteTarget.key })}
              >
                {t('common.delete')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
