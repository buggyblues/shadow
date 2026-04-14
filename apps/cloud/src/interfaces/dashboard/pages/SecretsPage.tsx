import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  Checkbox,
  EmptyState,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@shadowob/ui'
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
import { api } from '@/lib/api'
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
    <div className="flex flex-wrap items-start gap-3">
      <Tabs value={activeGroup} onChange={onSelect}>
        <TabsList>
          {groups.map((group) => (
            <TabsTrigger key={group} value={group}>
              {group}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {showAdd ? (
        <div className="flex items-center gap-2 rounded-[24px] border border-border-subtle bg-bg-secondary/60 p-2 shadow-[var(--shadow-soft)]">
          <Input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
            placeholder={t('secrets.groupNamePlaceholder')}
            disabled={isCreating}
            autoFocus
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleCreate()}
            disabled={!groupName.trim() || isCreating}
          >
            {isCreating ? t('common.saving') : t('common.add')}
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
            <X size={12} />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="glass"
          size="sm"
          onClick={() => setShowAdd(true)}
          title={t('secrets.createGroup')}
        >
          <FolderPlus size={14} />
          {t('secrets.createGroup')}
        </Button>
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
  onSubmit: (data: { key: string; value: string; isSecret: boolean }) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [key, setKey] = useState(initial?.key ?? '')
  const [value, setValue] = useState(initial?.value ?? '')
  const [isSecret, setIsSecret] = useState(initial?.isSecret ?? true)
  const [showValue, setShowValue] = useState(mode === 'create')

  const canSubmit = key.trim().length > 0 && !isSubmitting

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-lg">
        <ModalHeader
          overline={groupName}
          icon={<Variable size={18} />}
          title={mode === 'edit' ? t('secrets.editEnvironmentValue') : t('secrets.addEnvironmentValue')}
          subtitle={
            mode === 'edit'
              ? t('secrets.editEnvironmentValueDescription', { group: groupName })
              : t('secrets.addEnvironmentValueDescription', { group: groupName })
          }
          onClose={onClose}
        />

        <ModalBody>
          <Input
            label={t('secrets.keyName')}
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="OPENAI_API_KEY"
            autoFocus
            disabled={mode === 'edit'}
          />

          <div className="space-y-1.5">
            <p className="ml-1 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
              {t('secrets.secretValue')}
            </p>
            <div className="relative">
              <Input
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={mode === 'edit' ? t('secrets.leaveEmptyKeep') : ''}
              />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowValue(!showValue)}
              >
                {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-[24px] border border-border-subtle bg-bg-secondary/50 px-4 py-3 text-sm font-semibold text-text-secondary">
            <Checkbox
              checked={isSecret}
              onCheckedChange={(checked) => setIsSecret(checked === true)}
            />
            <Lock size={14} className="text-text-muted" />
            <span>{t('secrets.secret')}</span>
          </label>
        </ModalBody>

        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => canSubmit && onSubmit({ key: key.trim(), value, isSecret })}
              disabled={!canSubmit}
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {mode === 'edit' ? t('common.save') : t('common.add')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
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
    <div className="mx-auto max-w-[1280px] space-y-6 px-6 py-6 md:px-8">
      <Breadcrumb items={[{ label: t('secrets.title') }]} className="mb-1" />

      <section className="glass-panel p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-[30px] font-black tracking-[-0.03em] text-text-primary">
              <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-primary/12 text-primary">
                <ShieldCheck size={20} />
              </span>
              {t('secrets.title')}
            </h1>
            <p className="mt-1 text-sm leading-7 text-text-muted">{t('secrets.description')}</p>
          </div>

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
        </div>

        <Card variant="glass">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-success/25 bg-success/10 text-success">
              <ShieldCheck size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-green-300">{t('secrets.encryptionActive')}</p>
              <p className="mt-0.5 text-xs text-green-200/70">
                {t('secrets.allSecretsEncrypted')}{' '}
                <code className="rounded-full border border-green-500/20 bg-[rgba(0,0,0,0.12)] px-2 py-0.5 font-mono text-[11px] text-green-200">
                  SHADOWOB_PASSPHRASE
                </code>
              </p>
            </div>
            <span className="rounded-full border border-success/25 bg-bg-primary/40 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-success/80">
              {data?.envVars.length ?? 0} {t('secrets.encryptedValues')}
            </span>
          </div>
        </Card>

        <GroupTabs
          groups={groups}
          activeGroup={activeGroup}
          onSelect={setActiveGroup}
          onCreate={(name) => createGroup.mutateAsync(name).then(() => undefined)}
        />
      </section>

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
                <TableHead>{t('secrets.keyName')}</TableHead>
                <TableHead>{t('secrets.secretValue')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {envVars.map((entry) => (
                <TableRow key={`${entry.scope}-${entry.key}`}>
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
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => void handleStartEdit(entry)}
                        title={t('common.edit')}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setDeleteTarget({ key: entry.key })}
                        title={t('common.delete')}
                      >
                        <Trash2 size={13} />
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
        <EnvDialog
          mode={dialogMode}
          groupName={activeGroup}
          initial={editingEntry ?? undefined}
          isSubmitting={saveValue.isPending}
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
            <AlertDialogTitle>
              {t('common.delete')}
            </AlertDialogTitle>
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
    </div>
  )
}
