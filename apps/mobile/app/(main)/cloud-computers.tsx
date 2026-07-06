import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import {
  Bot,
  Cloud,
  FolderOpen,
  Globe2,
  HardDrive,
  Link2,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Send,
  Terminal,
  Wrench,
} from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native'
import {
  AppText,
  BackgroundSurface,
  Button,
  EmptyState,
  MobileBackButton,
  MobileNavigationBar,
  PageScroll,
  Spinner,
} from '../../src/components/ui'
import { fetchApi } from '../../src/lib/api'
import { getSocket } from '../../src/lib/socket'
import { border, iconSize, radius, size, spacing, useColors } from '../../src/theme'

type CloudComputer = {
  id: string
  name: string
  status: string
  agentCount: number
  errorMessage?: string | null
}

type CloudComputerBuddy = {
  id: string
  name: string
  status: string
}

type CloudComputerBackup = {
  id: string
  status: string
  createdAt?: string | null
}

type CloudFileNode = {
  id: string
  name: string
  kind: 'file' | 'dir'
}

type BrowserCapture = {
  ok: true
  image: string
  page: { title: string; url: string }
}

function statusColor(status: string, colors: ReturnType<typeof useColors>) {
  if (status === 'deployed') return colors.success
  if (status === 'pending' || status === 'deploying' || status === 'resuming') return colors.warning
  if (status === 'failed') return colors.error
  return colors.textMuted
}

export default function CloudComputersMobileScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [buddyName, setBuddyName] = useState('')
  const [browserUrl, setBrowserUrl] = useState('')
  const [browserImage, setBrowserImage] = useState<string | null>(null)
  const [browserTitle, setBrowserTitle] = useState('')
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([])
  const [terminalInput, setTerminalInput] = useState('')
  const [desktopMessage, setDesktopMessage] = useState('')
  const [workspaceServerId, setWorkspaceServerId] = useState('')
  const [workspaceMessage, setWorkspaceMessage] = useState('')
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [createName, setCreateName] = useState('')
  const createInFlightRef = useRef(false)

  const computersQuery = useQuery({
    queryKey: ['cloud-computers'],
    queryFn: () => fetchApi<CloudComputer[]>('/api/cloud-computers?limit=100&offset=0'),
  })

  const computers = computersQuery.data ?? []
  const selected = computers.find((computer) => computer.id === selectedId) ?? computers[0] ?? null

  useEffect(() => {
    if (!selectedId && computers[0]) setSelectedId(computers[0].id)
  }, [computers, selectedId])

  useEffect(() => {
    setBrowserImage(null)
    setBrowserTitle('')
    setBrowserUrl('')
    setTerminalSessionId(null)
    setTerminalOutput([])
    setTerminalInput('')
    setDesktopMessage('')
    setWorkspaceMessage('')
  }, [selected?.id])

  useEffect(() => {
    const socket = getSocket()
    const handleData = (payload: { sessionId?: string; data?: string }) => {
      if (!terminalSessionId || payload.sessionId !== terminalSessionId || !payload.data) return
      setTerminalOutput((current) => [...current.slice(-20), payload.data ?? ''])
    }
    const handleExit = (payload: { sessionId?: string; exitCode?: number }) => {
      if (!terminalSessionId || payload.sessionId !== terminalSessionId) return
      setTerminalOutput((current) => [
        ...current.slice(-20),
        t('cloudComputers.terminalExited', { code: payload.exitCode ?? 0 }),
      ])
      setTerminalSessionId(null)
    }
    socket.on('cloud-computer:terminal:data', handleData)
    socket.on('cloud-computer:terminal:exit', handleExit)
    return () => {
      socket.off('cloud-computer:terminal:data', handleData)
      socket.off('cloud-computer:terminal:exit', handleExit)
    }
  }, [terminalSessionId, t])

  const createComputer = useMutation({
    mutationFn: (name: string) =>
      fetchApi<CloudComputer>('/api/cloud-computers', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (computer) => {
      setSelectedId(computer.id)
      setCreateModalVisible(false)
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
  })

  const repairRuntime = useMutation({
    mutationFn: (computerId: string) =>
      fetchApi(`/api/cloud-computers/${computerId}/runtime/repair`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cloud-computers'] }),
  })

  const buddiesQuery = useQuery({
    queryKey: ['cloud-computer-buddies', selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: () =>
      fetchApi<{ buddies: CloudComputerBuddy[] }>(`/api/cloud-computers/${selected?.id}/buddies`),
  })

  const backupsQuery = useQuery({
    queryKey: ['cloud-computer-backups', selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: () =>
      fetchApi<{ backups: CloudComputerBackup[] }>(`/api/cloud-computers/${selected?.id}/backups`),
  })

  const filesQuery = useQuery({
    queryKey: ['cloud-computer-files', selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: () => fetchApi<CloudFileNode[]>(`/api/cloud-computers/${selected?.id}/files`),
  })

  const addBuddy = useMutation({
    mutationFn: () =>
      fetchApi(`/api/cloud-computers/${selected?.id}/buddies`, {
        method: 'POST',
        body: JSON.stringify({ name: buddyName.trim() }),
      }),
    onSuccess: () => {
      setBuddyName('')
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-buddies', selected?.id] })
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
  })

  const createBackup = useMutation({
    mutationFn: () =>
      fetchApi(`/api/cloud-computers/${selected?.id}/backups`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-backups', selected?.id] }),
  })

  const workspaceMount = useMutation({
    mutationFn: () =>
      fetchApi(`/api/cloud-computers/${selected?.id}/workspace-mounts`, {
        method: 'POST',
        body: JSON.stringify({ serverId: workspaceServerId.trim(), readOnly: false }),
      }),
    onSuccess: () => setWorkspaceMessage(t('cloudComputers.workspaceMounted')),
    onError: (error: Error) => setWorkspaceMessage(error.message),
  })

  const desktopSession = useMutation({
    mutationFn: () =>
      fetchApi<{ ok: true; runtimeEnsured?: boolean }>(
        `/api/cloud-computers/${selected?.id}/desktop/session`,
        { method: 'POST' },
      ),
    onSuccess: (session) =>
      setDesktopMessage(
        session.runtimeEnsured
          ? t('cloudComputers.desktopReady')
          : t('cloudComputers.desktopNeedsRepair'),
      ),
    onError: (error: Error) => setDesktopMessage(error.message),
  })

  const desktopRepair = useMutation({
    mutationFn: () =>
      fetchApi(`/api/cloud-computers/${selected?.id}/desktop/repair`, { method: 'POST' }),
    onSuccess: () => setDesktopMessage(t('cloudComputers.desktopReady')),
    onError: (error: Error) => setDesktopMessage(error.message),
  })

  const browserCapture = useMutation({
    mutationFn: (input?: { url?: string }) =>
      fetchApi<BrowserCapture>(
        `/api/cloud-computers/${selected?.id}/browser/${input?.url ? 'navigate' : 'screenshot'}`,
        {
          method: 'POST',
          ...(input?.url ? { body: JSON.stringify({ url: input.url }) } : {}),
        },
      ),
    onSuccess: (capture) => {
      setBrowserImage(capture.image)
      setBrowserTitle(capture.page.title)
      setBrowserUrl(capture.page.url)
    },
  })

  const canAddBuddy = Boolean(selected?.id && buddyName.trim() && !addBuddy.isPending)
  const canMountWorkspace = Boolean(
    selected?.id && workspaceServerId.trim() && !workspaceMount.isPending,
  )

  const startTerminal = () => {
    if (!selected?.id) return
    getSocket().emit(
      'cloud-computer:terminal:start',
      { computerId: selected.id, cols: 80, rows: 24 },
      (response: { ok?: boolean; sessionId?: string; error?: string }) => {
        if (!response.ok || !response.sessionId) {
          setTerminalOutput([response.error ?? t('cloudComputers.terminalStartFailed')])
          return
        }
        setTerminalSessionId(response.sessionId)
        setTerminalOutput([t('cloudComputers.terminalConnected')])
      },
    )
  }

  const sendTerminalInput = () => {
    if (!terminalSessionId || !terminalInput) return
    getSocket().emit('cloud-computer:terminal:input', {
      sessionId: terminalSessionId,
      data: terminalInput.endsWith('\n') ? terminalInput : `${terminalInput}\n`,
    })
    setTerminalOutput((current) => [...current.slice(-20), `$ ${terminalInput}`])
    setTerminalInput('')
  }

  const openCreateDialog = () => {
    if (createComputer.isPending || createInFlightRef.current) return
    createComputer.reset()
    setCreateName(t('cloudComputers.defaultName'))
    setCreateModalVisible(true)
  }

  const closeCreateDialog = () => {
    if (!createComputer.isPending) setCreateModalVisible(false)
  }

  const submitCreateComputer = () => {
    const trimmedName = createName.trim()
    if (!trimmedName || createComputer.isPending || createInFlightRef.current) return
    createInFlightRef.current = true
    createComputer.mutate(trimmedName, {
      onSettled: () => {
        createInFlightRef.current = false
      },
    })
  }

  return (
    <BackgroundSurface>
      <MobileNavigationBar
        title={t('cloudComputers.title')}
        left={<MobileBackButton onPress={() => router.back()} />}
        right={
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            disabled={createComputer.isPending}
            onPress={openCreateDialog}
          >
            {t('cloudComputers.create')}
          </Button>
        }
      />
      <PageScroll compact contentContainerStyle={styles.content}>
        {computersQuery.isLoading ? (
          <Spinner />
        ) : computers.length === 0 ? (
          <EmptyState
            icon={Cloud}
            title={t('cloudComputers.emptyTitle')}
            description={t('cloudComputers.emptyDesc')}
            action={
              <Button icon={Plus} disabled={createComputer.isPending} onPress={openCreateDialog}>
                {t('cloudComputers.create')}
              </Button>
            }
          />
        ) : (
          <>
            <View style={styles.grid}>
              {computers.map((computer) => (
                <Pressable
                  key={computer.id}
                  onPress={() => setSelectedId(computer.id)}
                  style={[
                    styles.computerCard,
                    {
                      backgroundColor:
                        selected?.id === computer.id ? colors.surfaceHover : colors.surface,
                      borderColor: selected?.id === computer.id ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={styles.computerIcon}>
                    <Cloud size={iconSize.xl} color={colors.primary} />
                  </View>
                  <View style={styles.computerBody}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {computer.name}
                    </AppText>
                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: statusColor(computer.status, colors) },
                        ]}
                      />
                      <AppText variant="label" tone="secondary">
                        {t(`cloudComputers.status.${computer.status}`, {
                          defaultValue: computer.status,
                        })}
                      </AppText>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>

            {selected && (
              <View style={styles.detail}>
                <View
                  style={[
                    styles.panel,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.panelHeader}>
                    <Wrench size={iconSize.lg} color={colors.textMuted} />
                    <AppText variant="bodyStrong">{t('cloudComputers.recovery')}</AppText>
                  </View>
                  <Button
                    variant="secondary"
                    icon={Wrench}
                    iconColor={colors.text}
                    disabled={repairRuntime.isPending}
                    onPress={() => repairRuntime.mutate(selected.id)}
                  >
                    {t('cloudComputers.repairRuntime')}
                  </Button>
                </View>

                <View
                  style={[
                    styles.panel,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.panelHeader}>
                    <FolderOpen size={iconSize.lg} color={colors.textMuted} />
                    <AppText variant="bodyStrong">{t('cloudComputers.files')}</AppText>
                  </View>
                  {filesQuery.isLoading ? (
                    <Spinner />
                  ) : (filesQuery.data ?? []).length === 0 ? (
                    <AppText variant="label" tone="secondary">
                      {t('cloudComputers.noFiles')}
                    </AppText>
                  ) : (
                    (filesQuery.data ?? []).slice(0, 6).map((node) => (
                      <View key={node.id} style={styles.row}>
                        <AppText variant="body" numberOfLines={1}>
                          {node.kind === 'dir' ? '▸ ' : ''}
                          {node.name}
                        </AppText>
                        <AppText variant="label" tone="secondary">
                          {node.kind}
                        </AppText>
                      </View>
                    ))
                  )}
                  <Button
                    variant="secondary"
                    icon={RefreshCw}
                    iconColor={colors.text}
                    disabled={filesQuery.isFetching}
                    onPress={() => filesQuery.refetch()}
                  >
                    {t('common.refresh')}
                  </Button>
                </View>

                <View
                  style={[
                    styles.panel,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.panelHeader}>
                    <Terminal size={iconSize.lg} color={colors.textMuted} />
                    <AppText variant="bodyStrong">{t('cloudComputers.terminal')}</AppText>
                  </View>
                  <View
                    style={[styles.terminalSurface, { backgroundColor: colors.inputBackground }]}
                  >
                    {(terminalOutput.length
                      ? terminalOutput
                      : [t('cloudComputers.terminalIdle')]
                    ).map((line, index) => (
                      <AppText key={`${index}-${line}`} variant="label" numberOfLines={2}>
                        {line}
                      </AppText>
                    ))}
                  </View>
                  <View style={styles.inlineForm}>
                    <TextInput
                      value={terminalInput}
                      onChangeText={setTerminalInput}
                      placeholder={t('cloudComputers.terminalInputPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    />
                    {terminalSessionId ? (
                      <Button
                        size="sm"
                        icon={Send}
                        disabled={!terminalInput}
                        onPress={sendTerminalInput}
                      >
                        {t('cloudComputers.send')}
                      </Button>
                    ) : (
                      <Button size="sm" icon={Terminal} onPress={startTerminal}>
                        {t('cloudComputers.startTerminal')}
                      </Button>
                    )}
                  </View>
                </View>

                <View
                  style={[
                    styles.panel,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.panelHeader}>
                    <Bot size={iconSize.lg} color={colors.textMuted} />
                    <AppText variant="bodyStrong">{t('cloudComputers.buddies')}</AppText>
                  </View>
                  {(buddiesQuery.data?.buddies ?? []).map((buddy) => (
                    <View key={buddy.id} style={styles.row}>
                      <AppText variant="body" numberOfLines={1}>
                        {buddy.name}
                      </AppText>
                      <AppText variant="label" tone="secondary">
                        {buddy.status}
                      </AppText>
                    </View>
                  ))}
                  <View style={styles.inlineForm}>
                    <TextInput
                      value={buddyName}
                      onChangeText={setBuddyName}
                      placeholder={t('cloudComputers.buddyNamePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    />
                    <Button
                      size="sm"
                      icon={Plus}
                      disabled={!canAddBuddy}
                      onPress={() => addBuddy.mutate()}
                    >
                      {t('common.create')}
                    </Button>
                  </View>
                </View>

                <View
                  style={[
                    styles.panel,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.panelHeader}>
                    <HardDrive size={iconSize.lg} color={colors.textMuted} />
                    <AppText variant="bodyStrong">{t('cloudComputers.backups')}</AppText>
                  </View>
                  {(backupsQuery.data?.backups ?? []).slice(0, 3).map((backup) => (
                    <View key={backup.id} style={styles.row}>
                      <AppText variant="body" numberOfLines={1}>
                        {backup.id}
                      </AppText>
                      <AppText variant="label" tone="secondary">
                        {backup.status}
                      </AppText>
                    </View>
                  ))}
                  <Button
                    variant="secondary"
                    icon={Save}
                    iconColor={colors.text}
                    disabled={createBackup.isPending}
                    onPress={() => createBackup.mutate()}
                  >
                    {t('cloudComputers.createBackup')}
                  </Button>
                </View>

                <View
                  style={[
                    styles.panel,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.panelHeader}>
                    <Link2 size={iconSize.lg} color={colors.textMuted} />
                    <AppText variant="bodyStrong">{t('cloudComputers.workspaceMount')}</AppText>
                  </View>
                  <View style={styles.inlineForm}>
                    <TextInput
                      value={workspaceServerId}
                      onChangeText={setWorkspaceServerId}
                      placeholder={t('cloudComputers.serverIdPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    />
                    <Button
                      size="sm"
                      icon={Link2}
                      disabled={!canMountWorkspace}
                      onPress={() => workspaceMount.mutate()}
                    >
                      {t('cloudComputers.mountWorkspace')}
                    </Button>
                  </View>
                  {workspaceMessage ? (
                    <AppText variant="label" tone="secondary">
                      {workspaceMessage}
                    </AppText>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.panel,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.panelHeader}>
                    <Globe2 size={iconSize.lg} color={colors.textMuted} />
                    <AppText variant="bodyStrong">{t('cloudComputers.browser')}</AppText>
                  </View>
                  <View style={styles.inlineForm}>
                    <TextInput
                      value={browserUrl}
                      onChangeText={setBrowserUrl}
                      placeholder={t('cloudComputers.browserAddressPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    />
                    <Button
                      size="sm"
                      icon={Globe2}
                      disabled={browserCapture.isPending || !browserUrl.trim()}
                      onPress={() => browserCapture.mutate({ url: browserUrl.trim() })}
                    >
                      {t('cloudComputers.go')}
                    </Button>
                  </View>
                  {browserImage ? (
                    <Image
                      source={{ uri: browserImage }}
                      style={styles.browserImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <Button
                      variant="secondary"
                      icon={RefreshCw}
                      iconColor={colors.text}
                      disabled={browserCapture.isPending}
                      onPress={() => browserCapture.mutate({})}
                    >
                      {t('common.refresh')}
                    </Button>
                  )}
                  {browserTitle ? (
                    <AppText variant="label" tone="secondary" numberOfLines={1}>
                      {browserTitle}
                    </AppText>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.panel,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.panelHeader}>
                    <Monitor size={iconSize.lg} color={colors.textMuted} />
                    <AppText variant="bodyStrong">{t('cloudComputers.desktop')}</AppText>
                  </View>
                  <View style={styles.inlineForm}>
                    <Button
                      variant="secondary"
                      icon={Monitor}
                      iconColor={colors.text}
                      disabled={desktopSession.isPending}
                      onPress={() => desktopSession.mutate()}
                    >
                      {t('cloudComputers.openDesktop')}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={Wrench}
                      iconColor={colors.text}
                      disabled={desktopRepair.isPending}
                      onPress={() => desktopRepair.mutate()}
                    >
                      {t('cloudComputers.repairDesktop')}
                    </Button>
                  </View>
                  {desktopMessage ? (
                    <AppText variant="label" tone="secondary">
                      {desktopMessage}
                    </AppText>
                  ) : null}
                </View>
              </View>
            )}
          </>
        )}
      </PageScroll>
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCreateDialog}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalIcon}>
                <Monitor size={iconSize.xl} color={colors.primary} />
              </View>
              <View style={styles.modalTitleBlock}>
                <AppText variant="bodyStrong">{t('cloudComputers.createDialogTitle')}</AppText>
                <AppText variant="label" tone="secondary">
                  {t('cloudComputers.createDialogDesc')}
                </AppText>
              </View>
            </View>
            <View style={styles.modalField}>
              <AppText variant="label" tone="secondary">
                {t('cloudComputers.createNameLabel')}
              </AppText>
              <TextInput
                value={createName}
                onChangeText={setCreateName}
                placeholder={t('cloudComputers.createNamePlaceholder')}
                placeholderTextColor={colors.textMuted}
                maxLength={80}
                editable={!createComputer.isPending}
                autoCapitalize="none"
                style={[
                  styles.input,
                  styles.modalInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.inputBackground,
                  },
                ]}
              />
            </View>
            {createComputer.error ? (
              <AppText variant="label" style={{ color: colors.error }}>
                {createComputer.error.message}
              </AppText>
            ) : null}
            <View style={styles.modalActions}>
              <Button
                variant="secondary"
                disabled={createComputer.isPending}
                onPress={closeCreateDialog}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                icon={Plus}
                disabled={!createName.trim() || createComputer.isPending}
                onPress={submitCreateComputer}
              >
                {createComputer.isPending
                  ? t('cloudComputers.creatingComputer')
                  : t('cloudComputers.confirmCreate')}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  grid: {
    gap: spacing.sm,
  },
  computerCard: {
    minHeight: size.listItemLg,
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  computerIcon: {
    width: size.controlMd,
    height: size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  computerBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: {
    width: size.dotMd,
    height: size.dotMd,
    borderRadius: radius.full,
  },
  detail: {
    gap: spacing.md,
  },
  panel: {
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  inlineForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: size.controlMd,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  browserImage: {
    width: '100%',
    height: size.mediaPlaceholderMinHeight,
    borderRadius: radius.lg,
  },
  terminalSurface: {
    minHeight: size.composerInputMaxHeight,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    borderWidth: border.hairline,
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  modalIcon: {
    width: size.controlMd,
    height: size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  modalField: {
    gap: spacing.xs,
  },
  modalInput: {
    flex: 0,
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
})
