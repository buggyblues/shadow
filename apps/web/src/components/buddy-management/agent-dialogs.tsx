import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
} from '@shadowob/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchApi } from '../../lib/api'
import { toPinyinSlug } from '../../lib/pinyin'
import { AvatarEditor } from '../common/avatar-editor'
import { type Agent, type BuddyMode, getAgentAllowedServerIds, getAgentBuddyMode } from './types'

type ServerEntry = {
  server: {
    id: string
    name: string
    slug?: string | null
  }
}

function deriveBuddyUsername(name: string) {
  return toPinyinSlug(name, 'buddy')
}

type BuddyModeControlStyle = 'cards' | 'switch'
type QuickCreateStep = 'basic' | 'advanced'

function BuddyModeControl({
  buddyMode,
  onModeChange,
  t,
  style = 'cards',
}: {
  buddyMode: BuddyMode
  onModeChange: (mode: BuddyMode) => void
  t: (key: string) => string
  style?: BuddyModeControlStyle
}) {
  if (style === 'switch') {
    const shareable = buddyMode === 'shareable'
    return (
      <div className="rounded-[14px] border border-border-subtle bg-bg-tertiary/40 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-black text-text-primary">
              {shareable ? t('agentMgmt.modeShareable') : t('agentMgmt.modePrivate')}
            </div>
            <div className="mt-1 text-xs leading-5 text-text-muted">
              {shareable ? t('agentMgmt.modeShareableDesc') : t('agentMgmt.modePrivateDesc')}
            </div>
          </div>
          <Switch
            checked={shareable}
            onCheckedChange={(checked) => onModeChange(checked ? 'shareable' : 'private')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onModeChange('private')}
        className={`text-left rounded-[14px] border-2 px-4 py-3 transition ${
          buddyMode === 'private'
            ? 'border-primary bg-primary/10'
            : 'border-border-subtle bg-bg-tertiary/50'
        }`}
      >
        <div className="text-sm font-black text-text-primary">{t('agentMgmt.modePrivate')}</div>
        <div className="text-xs leading-5 text-text-muted">{t('agentMgmt.modePrivateDesc')}</div>
      </button>
      <button
        type="button"
        onClick={() => onModeChange('shareable')}
        className={`text-left rounded-[14px] border-2 px-4 py-3 transition ${
          buddyMode === 'shareable'
            ? 'border-primary bg-primary/10'
            : 'border-border-subtle bg-bg-tertiary/50'
        }`}
      >
        <div className="text-sm font-black text-text-primary">{t('agentMgmt.modeShareable')}</div>
        <div className="text-xs leading-5 text-text-muted">{t('agentMgmt.modeShareableDesc')}</div>
      </button>
    </div>
  )
}

function BuddyAccessControls({
  buddyMode,
  allowedServerIds,
  servers,
  onModeChange,
  onAllowedServerIdsChange,
  t,
  modeControlStyle = 'cards',
  showModeControl = true,
  showServerAllowlist = true,
  showPolicyNote = true,
}: {
  buddyMode: BuddyMode
  allowedServerIds: string[]
  servers: ServerEntry[]
  onModeChange: (mode: BuddyMode) => void
  onAllowedServerIdsChange: (ids: string[]) => void
  t: (key: string) => string
  modeControlStyle?: BuddyModeControlStyle
  showModeControl?: boolean
  showServerAllowlist?: boolean
  showPolicyNote?: boolean
}) {
  const toggleServer = (serverId: string) => {
    onAllowedServerIdsChange(
      allowedServerIds.includes(serverId)
        ? allowedServerIds.filter((id) => id !== serverId)
        : [...allowedServerIds, serverId],
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
        {t('agentMgmt.accessSection')}
      </div>
      {showModeControl && (
        <BuddyModeControl
          buddyMode={buddyMode}
          onModeChange={onModeChange}
          style={modeControlStyle}
          t={t}
        />
      )}
      {showPolicyNote && (
        <div className="rounded-[14px] border border-border-subtle bg-bg-tertiary/40 px-4 py-3">
          <div className="text-xs font-black text-text-primary">
            {t('agentMgmt.defaultReplyPolicy')}
          </div>
          <div className="mt-1 text-xs leading-5 text-text-muted">
            {t('agentMgmt.defaultReplyPolicyDesc')}
          </div>
        </div>
      )}
      {showServerAllowlist && buddyMode === 'private' && (
        <div className="space-y-2">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
            {t('agentMgmt.allowedServersLabel')}
          </div>
          <p className="text-xs leading-5 text-text-muted">{t('agentMgmt.allowedServersDesc')}</p>
          {servers.length === 0 ? (
            <div className="text-xs text-text-muted">{t('agentMgmt.allowedServersEmpty')}</div>
          ) : (
            <div className="max-h-36 overflow-y-auto rounded-[14px] border border-border-subtle bg-bg-tertiary/30 p-2">
              {servers.map((entry) => (
                <label
                  key={entry.server.id}
                  className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-sm font-bold text-text-primary hover:bg-bg-modifier-hover"
                >
                  <input
                    type="checkbox"
                    checked={allowedServerIds.includes(entry.server.id)}
                    onChange={() => toggleServer(entry.server.id)}
                    className="h-4 w-4 rounded border-border-subtle text-primary"
                  />
                  <span className="truncate">{entry.server.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Create Agent Dialog ──────────────────────────────── */

export function CreateAgentDialog({
  onClose,
  onSuccess,
  onError,
  t,
  initialData,
  embedded = false,
  quick = false,
  hideTitle = false,
  modalSections = false,
  onQuickStepChange,
}: {
  onClose: () => void
  onSuccess: (agent: Agent) => void
  onError: (message?: string) => void
  t: (key: string) => string
  initialData?: { name?: string; username?: string; description?: string }
  embedded?: boolean
  quick?: boolean
  hideTitle?: boolean
  modalSections?: boolean
  onQuickStepChange?: (step: QuickCreateStep) => void
}) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [username, setUsername] = useState(initialData?.username ?? '')
  const [usernameTouched, setUsernameTouched] = useState(Boolean(initialData?.username))
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [buddyMode, setBuddyMode] = useState<BuddyMode>('private')
  const [allowedServerIds, setAllowedServerIds] = useState<string[]>([])
  const [quickStep, setQuickStep] = useState<QuickCreateStep>('basic')
  const isQuickAdvanced = quick && quickStep === 'advanced'
  const nameInputRef = useRef<HTMLInputElement>(null)
  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'buddy-access'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string
      username: string
      description?: string
      avatarUrl?: string
      buddyMode: BuddyMode
      allowedServerIds: string[]
    }) =>
      fetchApi<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          username: data.username,
          description: data.description,
          avatarUrl: data.avatarUrl,
          kernelType: 'openclaw',
          config: {},
          buddyMode: data.buddyMode,
          allowedServerIds: data.allowedServerIds,
        }),
      }),
    onSuccess: (agent) => onSuccess(agent),
    onError: (err: Error) => {
      if (err.message?.toLowerCase().includes('username already taken')) {
        const suffix = Math.random().toString(36).slice(2, 6)
        setUsername((prev) => `${(prev || 'buddy').slice(0, 27)}_${suffix}`)
        setUsernameTouched(true)
        onError(t('agentMgmt.usernameTaken'))
      } else {
        onError(err.message || t('agentMgmt.createFailed'))
      }
    },
  })

  useEffect(() => {
    if (!quick || isQuickAdvanced) return
    const timeoutId = window.setTimeout(() => nameInputRef.current?.focus(), 80)
    return () => window.clearTimeout(timeoutId)
  }, [isQuickAdvanced, quick])

  useEffect(() => {
    if (!quick) return
    onQuickStepChange?.(quickStep)
  }, [onQuickStepChange, quick, quickStep])

  const handleNameChange = (value: string) => {
    setName(value)
    if (!usernameTouched) {
      setUsername(deriveBuddyUsername(value))
    }
  }

  const handleUsernameChange = (value: string) => {
    setUsernameTouched(true)
    setUsername(
      value
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 32),
    )
  }

  const handleSubmit = () => {
    if (!name.trim() || !username.trim()) return
    createMutation.mutate({
      name: name.trim(),
      username: username.trim(),
      description: description.trim() || undefined,
      avatarUrl: selectedAvatar ?? undefined,
      buddyMode,
      allowedServerIds: buddyMode === 'private' ? allowedServerIds : [],
    })
  }
  const footerClassName = quick ? '' : embedded ? 'mt-2 pt-2 border-t border-border-subtle' : ''
  const nameField = (
    <div className="space-y-2">
      <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
        {t('agentMgmt.nameLabel')}
      </label>
      <Input
        ref={nameInputRef}
        value={name}
        onChange={(e) => handleNameChange(e.target.value)}
        placeholder={t('agentMgmt.namePlaceholder')}
        maxLength={64}
        autoFocus={quick && !isQuickAdvanced}
      />
    </div>
  )
  const usernameField = (
    <div className="space-y-2">
      <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
        {t(quick ? 'agentMgmt.buddyIdLabel' : 'agentMgmt.usernameLabel')}
      </label>
      <Input
        value={username}
        onChange={(e) => handleUsernameChange(e.target.value)}
        placeholder={t(quick ? 'agentMgmt.buddyIdPlaceholder' : 'agentMgmt.usernamePlaceholder')}
        maxLength={32}
      />
      <p className="px-1 text-xs leading-5 text-text-muted">
        {t(quick ? 'agentMgmt.buddyIdHint' : 'agentMgmt.usernameHint')}
      </p>
    </div>
  )
  const profileFields = (
    <>
      <div className={embedded ? 'space-y-2' : 'space-y-3'}>
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
          {t('agentMgmt.profileSection')}
        </div>
        <div className="space-y-2">
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
            {t('agentMgmt.descLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('agentMgmt.descPlaceholder')}
            className="w-full bg-bg-tertiary border-2 border-border-subtle text-text-primary rounded-[20px] px-5 py-4 text-sm font-bold leading-6 outline-none transition-all placeholder:text-text-muted/30 focus:border-primary focus:shadow-[0_0_0_5px_rgba(0,198,209,0.1)] resize-none"
            rows={quick ? 3 : 4}
            maxLength={500}
          />
          <p className="px-1 text-xs leading-5 text-text-muted">{t('agentMgmt.descriptionHint')}</p>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-3">
          {t('agentMgmt.avatarLabel')}
        </label>
        <AvatarEditor value={selectedAvatar ?? undefined} onChange={setSelectedAvatar} />
      </div>
    </>
  )
  const renderAccessControls = (
    showModeControl = true,
    showServerAllowlist = true,
    showPolicyNote = true,
  ) => (
    <BuddyAccessControls
      buddyMode={buddyMode}
      allowedServerIds={allowedServerIds}
      servers={servers}
      onModeChange={setBuddyMode}
      onAllowedServerIdsChange={setAllowedServerIds}
      t={t}
      modeControlStyle="switch"
      showModeControl={showModeControl}
      showServerAllowlist={showServerAllowlist}
      showPolicyNote={showPolicyNote}
    />
  )
  const footerButtons = (
    <ModalButtonGroup>
      <Button variant="ghost" size="sm" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={handleSubmit}
        disabled={!name.trim() || !username.trim() || createMutation.isPending}
      >
        {createMutation.isPending ? t('agentMgmt.creating') : t('common.create')}
      </Button>
    </ModalButtonGroup>
  )

  const content = (
    <>
      {!embedded ? (
        <ModalHeader title={t('agentMgmt.createTitle')} closeLabel={t('common.close')} />
      ) : hideTitle ? null : (
        <h2 className="text-base leading-6 font-bold text-text-primary">
          {t('agentMgmt.createTitle')}
        </h2>
      )}

      <div className={quick ? 'space-y-3' : embedded ? 'space-y-3' : 'space-y-5 py-5'}>
        {isQuickAdvanced ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
            <button
              type="button"
              onClick={() => setQuickStep('basic')}
              className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-xs font-black text-text-muted transition hover:bg-bg-tertiary/60 hover:text-text-primary"
            >
              <ArrowLeft size={15} />
              {t('common.back')}
            </button>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
              {t('agentMgmt.advancedOptions')}
            </div>
            <div className="space-y-5">
              {usernameField}
              {profileFields}
              {renderAccessControls(true, false, false)}
            </div>
          </div>
        ) : (
          <>
            {!quick && (
              <p
                className={
                  embedded
                    ? 'text-[11px] leading-4 text-text-muted'
                    : 'text-sm leading-6 text-text-secondary'
                }
              >
                {t('agentMgmt.createIntro')}
              </p>
            )}

            <div className={embedded ? 'space-y-2' : 'space-y-3'}>
              {!quick && (
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                  {t('agentMgmt.identitySection')}
                </div>
              )}
              <div className={quick ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'}>
                {nameField}
                {!quick && usernameField}
              </div>
            </div>

            {!quick && profileFields}
            {!quick && renderAccessControls(true, false, false)}

            {quick && (
              <button
                type="button"
                onClick={() => setQuickStep('advanced')}
                className="flex w-full items-center justify-between rounded-2xl border border-border-subtle bg-bg-tertiary/40 px-4 py-3 text-left text-sm font-black text-text-secondary transition hover:bg-bg-tertiary/70 hover:text-text-primary"
              >
                <span>{t('agentMgmt.advancedOptions')}</span>
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </div>

      {!modalSections && embedded && (
        <div className={footerClassName}>
          <div className="flex justify-end">{footerButtons}</div>
        </div>
      )}
    </>
  )

  if (embedded) {
    if (modalSections) {
      return (
        <>
          <ModalBody className="min-h-0 space-y-4 py-5">{content}</ModalBody>
          <ModalFooter className="justify-end">{footerButtons}</ModalFooter>
        </>
      )
    }
    return <div className="animate-in fade-in slide-in-from-right-4 duration-300">{content}</div>
  }

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-[560px]" className="shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
        <ModalBody className="space-y-5 py-5">{content}</ModalBody>
        <ModalFooter className="justify-end">{footerButtons}</ModalFooter>
      </ModalContent>
    </Modal>
  )
}

/* ── Edit Agent Dialog ────────────────────────────────── */

export function EditAgentDialog({
  agent,
  onClose,
  onSuccess,
  onError,
  t,
}: {
  agent: Agent
  onClose: () => void
  onSuccess: (agent: Agent) => void
  onError: () => void
  t: (key: string) => string
}) {
  const [name, setName] = useState(agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy')
  const [description, setDescription] = useState((agent.config?.description as string) ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(
    agent.botUser?.avatarUrl ?? null,
  )
  const [buddyMode, setBuddyMode] = useState<BuddyMode>(getAgentBuddyMode(agent))
  const [allowedServerIds, setAllowedServerIds] = useState<string[]>(
    getAgentAllowedServerIds(agent),
  )
  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'buddy-access'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      avatarUrl?: string | null
      buddyMode: BuddyMode
      allowedServerIds: string[]
    }) =>
      fetchApi<Agent>(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (agent) => onSuccess(agent),
    onError: () => onError(),
  })

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-[480px]" className="shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
        <ModalHeader title={t('agentMgmt.editTitle')} closeLabel={t('common.close')} />

        <ModalBody className="space-y-4 py-5">
          <div className="space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
              {t('agentMgmt.nameLabel')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agentMgmt.namePlaceholder')}
              maxLength={64}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
              {t('agentMgmt.descLabel')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('agentMgmt.descPlaceholder')}
              className="w-full bg-bg-tertiary border-2 border-border-subtle text-text-primary rounded-[24px] px-6 py-4 text-base font-bold outline-none transition-all placeholder:text-text-muted/30 focus:border-primary focus:shadow-[0_0_0_5px_rgba(0,198,209,0.1)] resize-none"
              rows={3}
              maxLength={500}
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-3">
              {t('agentMgmt.avatarLabel')}
            </label>
            <AvatarEditor value={selectedAvatar ?? undefined} onChange={setSelectedAvatar} />
          </div>

          <BuddyAccessControls
            buddyMode={buddyMode}
            allowedServerIds={allowedServerIds}
            servers={servers}
            onModeChange={setBuddyMode}
            onAllowedServerIdsChange={setAllowedServerIds}
            t={t}
          />
        </ModalBody>

        <ModalFooter>
          <ModalButtonGroup>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                name.trim() &&
                updateMutation.mutate({
                  name: name.trim(),
                  description: description.trim() || undefined,
                  avatarUrl: selectedAvatar,
                  buddyMode,
                  allowedServerIds: buddyMode === 'private' ? allowedServerIds : [],
                })
              }
              disabled={!name.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
