import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Bot, Cloud, Terminal } from 'lucide-react-native'
import { pinyin } from 'pinyin-pro'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { SettingsHeader } from '../../src/components/common/settings-header'
import {
  AppText,
  BackgroundSurface,
  Button,
  PageScroll,
  Section,
  StatusNotice,
  TextField,
} from '../../src/components/ui'
import { fetchApi, getApiBaseUrl } from '../../src/lib/api'
import {
  CLOUD_BUDDY_RUNTIMES,
  type CloudBuddyAgent,
  type CloudBuddyRuntimeId,
  createCloudBuddy,
} from '../../src/lib/cloud-buddy'
import { showToast } from '../../src/lib/toast'
import { border, iconSize, radius, size, spacing, useColors } from '../../src/theme'

type ServerEntry = {
  server: {
    id: string
    name: string
  }
}

type CreateStep = 'runtime' | 'details'

type ConnectorRuntimeInfo = {
  id: string
  label: string
  kind: 'openclaw' | 'cli'
  status: 'available' | 'missing'
  version?: string | null
  command?: string | null
  iconId?: string | null
}

type ConnectorComputer = {
  id: string
  name: string
  status: 'pending' | 'online' | 'offline'
  hostname: string | null
  os: string | null
  arch: string | null
  daemonVersion: string | null
  runtimes: ConnectorRuntimeInfo[]
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

type ConnectorJob = {
  id: string
  status: string
  error?: string | null
}

type AgentStatusResponse = Pick<CloudBuddyAgent, 'id' | 'status' | 'lastHeartbeat'>

type RuntimeOption =
  | {
      key: string
      target: 'cloud'
      runtimeId: CloudBuddyRuntimeId
      label: string
      iconId: string
    }
  | {
      key: string
      target: 'local'
      runtimeId: string
      label: string
      iconId: string | null
      computer: ConnectorComputer
      runtime: ConnectorRuntimeInfo
    }

const CONNECTOR_JOB_POLL_INTERVAL_MS = 1500
const CONNECTOR_JOB_TIMEOUT_MS = 2 * 60 * 1000
const AGENT_ONLINE_POLL_INTERVAL_MS = 1500
const AGENT_ONLINE_TIMEOUT_MS = 90 * 1000

const RUNTIME_CARD_WIDTH = 84
const RUNTIME_CARD_GAP = spacing.sm

const RUNTIME_SORT_ORDER = [
  'openclaw',
  'hermes',
  'hermes-agent',
  'claude-code',
  'codex',
  'opencode',
  'gemini',
  'googlegemini',
  'cursor',
  'copilot',
  'antigravity',
  'cc-connect',
]

const RUNTIME_ICON_ASSETS = {
  anthropic: require('../../assets/runtime-icons/anthropic.png'),
  antigravity: require('../../assets/runtime-icons/antigravity.png'),
  'cc-connect': require('../../assets/runtime-icons/cc-connect.png'),
  'claude-code': require('../../assets/runtime-icons/claude-code.png'),
  codex: require('../../assets/runtime-icons/codex.png'),
  copilot: require('../../assets/runtime-icons/copilot.png'),
  cursor: require('../../assets/runtime-icons/cursor.png'),
  googlegemini: require('../../assets/runtime-icons/googlegemini.png'),
  'hermes-agent': require('../../assets/runtime-icons/hermes-agent.png'),
  kimi: require('../../assets/runtime-icons/kimi.png'),
  openclaw: require('../../assets/runtime-icons/openclaw.png'),
  opencode: require('../../assets/runtime-icons/opencode.png'),
} as const

type RuntimeIconKey = keyof typeof RUNTIME_ICON_ASSETS

const RUNTIME_ICON_ALIASES: Record<string, RuntimeIconKey> = {
  claude: 'claude-code',
  claude_code: 'claude-code',
  gemini: 'googlegemini',
  google: 'googlegemini',
  hermes: 'hermes-agent',
  open_code: 'opencode',
  openclaud: 'openclaw',
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForConnectorJob(jobId: string, messages: { failed: string; timeout: string }) {
  const deadline = Date.now() + CONNECTOR_JOB_TIMEOUT_MS

  while (Date.now() < deadline) {
    const response = await fetchApi<{ job: ConnectorJob }>(`/api/connector/jobs/${jobId}`)
    const job = response.job
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(job.error ? `${messages.failed}: ${job.error}` : messages.failed)
    }
    await delay(CONNECTOR_JOB_POLL_INTERVAL_MS)
  }

  throw new Error(messages.timeout)
}

async function waitForAgentOnline(agentId: string, messages: { timeout: string }) {
  const deadline = Date.now() + AGENT_ONLINE_TIMEOUT_MS

  while (Date.now() < deadline) {
    const agent = await fetchApi<AgentStatusResponse>(`/api/agents/${agentId}`)
    if (agent.status === 'running' && agent.lastHeartbeat) return agent
    await delay(AGENT_ONLINE_POLL_INTERVAL_MS)
  }

  throw new Error(messages.timeout)
}

function deriveBuddyUsername(name: string) {
  const base = name
    .trim()
    .replace(/[\u3400-\u9fff]+/g, (chunk) =>
      pinyin(chunk, { toneType: 'none', separator: '-', v: true }),
    )
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base || 'buddy'}-${suffix}`.slice(0, 32)
}

function runtimeSortIndex(runtimeId: string) {
  const normalized = runtimeId.toLowerCase()
  const index = RUNTIME_SORT_ORDER.indexOf(normalized)
  return index === -1 ? RUNTIME_SORT_ORDER.length : index
}

function normalizeRuntimeIconKey(value: string | null | undefined): RuntimeIconKey | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized in RUNTIME_ICON_ASSETS) return normalized as RuntimeIconKey
  return RUNTIME_ICON_ALIASES[normalized] ?? null
}

function getRuntimeIconSource(option: RuntimeOption) {
  const iconKey =
    normalizeRuntimeIconKey(option.iconId) ??
    normalizeRuntimeIconKey(option.runtimeId) ??
    normalizeRuntimeIconKey(option.label)
  return iconKey ? RUNTIME_ICON_ASSETS[iconKey] : null
}

function RuntimeIcon({ option, selected }: { option: RuntimeOption; selected: boolean }) {
  const colors = useColors()
  const source = getRuntimeIconSource(option)

  if (!source) {
    return (
      <Terminal
        size={iconSize.xl}
        color={selected ? colors.onPrimary : colors.text}
        strokeWidth={2.4}
      />
    )
  }

  return <Image source={source} style={styles.runtimeIconImage} contentFit="contain" />
}

export default function CreateBuddyScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const { landingTitle, landingDescription } = useLocalSearchParams<{
    landingTitle?: string
    landingDescription?: string
  }>()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<CreateStep>('runtime')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedRuntimeKey, setSelectedRuntimeKey] = useState<string>('cloud:openclaw')
  const abandonedRef = useRef(false)

  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'buddy-access'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const { data: connectorComputers = [], isFetched: hasLoadedConnectorComputers } = useQuery({
    queryKey: ['connector-computers', 'create-buddy'],
    queryFn: async () => {
      const response = await fetchApi<{ computers: ConnectorComputer[] }>(
        '/api/connector/computers',
      )
      return Array.isArray(response.computers) ? response.computers : []
    },
  })

  const runtimeOptions = useMemo<RuntimeOption[]>(() => {
    const localOptions = connectorComputers
      .filter((computer) => computer.status === 'online')
      .flatMap((computer) =>
        computer.runtimes
          .filter((runtime) => runtime.status === 'available')
          .map<RuntimeOption>((runtime) => ({
            key: `local:${computer.id}:${runtime.id}`,
            target: 'local',
            runtimeId: runtime.id,
            label: runtime.label,
            iconId: runtime.iconId ?? null,
            computer,
            runtime,
          })),
      )
      .sort((a, b) => {
        const sortDelta = runtimeSortIndex(a.runtimeId) - runtimeSortIndex(b.runtimeId)
        return sortDelta || a.label.localeCompare(b.label)
      })

    const cloudOptions = CLOUD_BUDDY_RUNTIMES.map<RuntimeOption>((runtime) => ({
      key: `cloud:${runtime.id}`,
      target: 'cloud',
      runtimeId: runtime.id,
      label: runtime.label,
      iconId: runtime.id === 'gemini' ? 'googlegemini' : runtime.id,
    }))

    return [...cloudOptions, ...localOptions]
  }, [connectorComputers])

  const selectedRuntimeOption =
    runtimeOptions.find((option) => option.key === selectedRuntimeKey) ?? runtimeOptions[0] ?? null

  const openBuddyDm = async (agent: CloudBuddyAgent) => {
    const buddyUserId = agent.botUser?.id
    if (!buddyUserId) throw new Error(t('agentMgmt.botUserMissing'))

    const channel = await fetchApi<{ id: string }>('/api/channels/dm', {
      method: 'POST',
      body: JSON.stringify({ userId: buddyUserId }),
    })

    await fetchApi(`/api/channels/${channel.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: t('agentMgmt.cloudGreetingMessage', {
          name: agent.botUser?.displayName ?? agent.name ?? name.trim(),
        }),
      }),
    })

    return channel.id
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRuntimeOption) throw new Error(t('agentMgmt.runtimeRequired'))

      const trimmedName = name.trim()
      const username = deriveBuddyUsername(trimmedName)
      const trimmedDescription = description.trim() || undefined
      const allowedServerIds = servers.map((entry) => entry.server.id)

      if (selectedRuntimeOption.target === 'local') {
        const serverUrl = await getApiBaseUrl()
        const result = await fetchApi<{ agent: CloudBuddyAgent; job?: ConnectorJob | null }>(
          `/api/connector/computers/${selectedRuntimeOption.computer.id}/buddies`,
          {
            method: 'POST',
            body: JSON.stringify({
              name: trimmedName,
              username,
              description: trimmedDescription,
              runtimeId: selectedRuntimeOption.runtime.id,
              serverUrl,
              buddyMode: 'private',
              allowedServerIds,
            }),
          },
        )

        if (result.job?.id) {
          await waitForConnectorJob(result.job.id, {
            failed: t('agentMgmt.connectorDeploymentFailed'),
            timeout: t('agentMgmt.connectorDeploymentTimeout'),
          })
        }

        await waitForAgentOnline(result.agent.id, {
          timeout: t('agentMgmt.agentOnlineTimeout'),
        })

        return fetchApi<CloudBuddyAgent>(`/api/agents/${result.agent.id}`)
      }

      return createCloudBuddy({
        name: trimmedName,
        username,
        description: trimmedDescription,
        runtimeId: selectedRuntimeOption.runtimeId,
        buddyMode: 'private',
        allowedServerIds,
        locale: i18n.language,
        timezone:
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
        messages: {
          deploymentFailed: t('agentMgmt.cloudDeploymentFailed'),
          deploymentTimeout: t('agentMgmt.cloudDeploymentTimeout'),
          onlineTimeout: t('agentMgmt.agentOnlineTimeout'),
        },
      })
    },
    onSuccess: async (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
      queryClient.invalidateQueries({ queryKey: ['cloud-saas'] })
      if (abandonedRef.current) return

      try {
        const dmChannelId = await openBuddyDm(agent)
        queryClient.invalidateQueries({ queryKey: ['messages', dmChannelId] })
        queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
        router.replace(`/(main)/dm/${dmChannelId}` as never)
      } catch (error) {
        showToast((error as Error).message || t('agentMgmt.createFailed'), 'error')
        router.replace('/(main)/buddy-management' as never)
      }
    },
    onError: (error: Error) => {
      if (abandonedRef.current) return
      showToast(error.message || t('agentMgmt.createFailed'), 'error')
    },
  })

  useEffect(() => {
    if (!createMutation.isPending) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => subscription.remove()
  }, [createMutation.isPending])

  useEffect(() => {
    const firstRuntimeOption = runtimeOptions[0]
    if (!firstRuntimeOption) return
    if (runtimeOptions.some((option) => option.key === selectedRuntimeKey)) return
    setSelectedRuntimeKey(firstRuntimeOption.key)
  }, [runtimeOptions, selectedRuntimeKey])

  const handleCreate = () => {
    abandonedRef.current = false
    createMutation.mutate()
  }

  const handleContinue = () => {
    if (!selectedRuntimeOption) return
    setStep('details')
  }

  const handleAbandon = () => {
    abandonedRef.current = true
    router.replace('/(main)' as never)
  }

  if (createMutation.isPending) {
    return (
      <BackgroundSurface>
        <View style={styles.loadingPage}>
          <ActivityIndicator size="large" color={colors.primary} />
          <View style={styles.loadingCopy}>
            <AppText variant="title" style={styles.loadingTitle}>
              {selectedRuntimeOption?.target === 'local'
                ? t('agentMgmt.connectorConfiguringTitle')
                : t('agentMgmt.cloudDeployingTitle')}
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.loadingDesc}>
              {selectedRuntimeOption?.target === 'local'
                ? t('agentMgmt.connectorConfiguringDesc')
                : t('agentMgmt.cloudDeployingDesc')}
            </AppText>
          </View>
          <Button variant="glass" size="lg" onPress={handleAbandon}>
            {t('agentMgmt.abandonCloudCreate')}
          </Button>
        </View>
      </BackgroundSurface>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <BackgroundSurface>
        <SettingsHeader title={landingTitle || t('agentMgmt.createTitle')} />
        <PageScroll compact>
          <Section
            title={
              step === 'runtime'
                ? landingTitle || t('agentMgmt.createRuntimeStepTitle')
                : t('agentMgmt.createDetailsStepTitle')
            }
            subtitle={
              step === 'runtime'
                ? landingDescription || t('agentMgmt.createRuntimeStepDesc')
                : t('agentMgmt.createDetailsStepDesc')
            }
            icon={Cloud}
            padded
            cardStyle={styles.card}
          >
            {step === 'runtime' ? (
              <>
                <StatusNotice
                  tone={selectedRuntimeOption?.target === 'local' ? 'accent' : 'primary'}
                >
                  {selectedRuntimeOption?.target === 'local'
                    ? t('agentMgmt.createRuntimeLocalHint')
                    : t('agentMgmt.createRuntimeCloudHint')}
                </StatusNotice>

                <View style={styles.runtimePicker}>
                  <AppText variant="label" tone="secondary">
                    {t('agentMgmt.runtimeLabel')}
                  </AppText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={RUNTIME_CARD_WIDTH + RUNTIME_CARD_GAP}
                    decelerationRate="fast"
                    contentContainerStyle={styles.runtimeRail}
                  >
                    {runtimeOptions.map((option) => {
                      const selected = option.key === selectedRuntimeOption?.key
                      return (
                        <Pressable
                          key={option.key}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('agentMgmt.runtimeLabel')}: ${option.label}`}
                          onPress={() => setSelectedRuntimeKey(option.key)}
                          style={[
                            styles.runtimeCard,
                            {
                              borderColor: selected ? colors.primary : colors.border,
                              backgroundColor: selected
                                ? colors.tonePrimarySurface
                                : colors.surface,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.runtimeIconShell,
                              {
                                backgroundColor: selected ? colors.primary : colors.inputBackground,
                              },
                            ]}
                          >
                            <RuntimeIcon option={option} selected={selected} />
                          </View>
                          <View
                            style={[
                              styles.runtimeTargetDot,
                              {
                                backgroundColor:
                                  option.target === 'local' ? colors.accent : colors.primary,
                                borderColor: colors.surface,
                              },
                            ]}
                          />
                        </Pressable>
                      )
                    })}
                  </ScrollView>
                </View>

                {hasLoadedConnectorComputers &&
                !connectorComputers.some((computer) =>
                  computer.runtimes.some((runtime) => runtime.status === 'available'),
                ) ? (
                  <StatusNotice tone="muted">
                    {t('agentMgmt.createNoLocalRuntimeHint')}
                  </StatusNotice>
                ) : null}

                <Button
                  variant="primary"
                  size="lg"
                  onPress={handleContinue}
                  disabled={!selectedRuntimeOption}
                >
                  {t('agentMgmt.connectorContinue')}
                </Button>
              </>
            ) : (
              <>
                {selectedRuntimeOption ? (
                  <View
                    style={[
                      styles.selectedRuntimeSummary,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.selectedRuntimeIcon,
                        {
                          backgroundColor: colors.inputBackground,
                        },
                      ]}
                    >
                      <RuntimeIcon option={selectedRuntimeOption} selected={false} />
                    </View>
                    <Pressable
                      onPress={() => setStep('runtime')}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.runtimeChangeButton,
                        pressed && { backgroundColor: colors.inputBackground },
                      ]}
                    >
                      <AppText variant="label" tone="primary">
                        {t('agentMgmt.createRuntimeBack')}
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}

                <TextField
                  icon={Bot}
                  label={t('agentMgmt.nameLabel')}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('agentMgmt.namePlaceholder')}
                  autoFocus
                  editable={!createMutation.isPending}
                />

                <TextField
                  label={t('agentMgmt.descLabel')}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('agentMgmt.descPlaceholder')}
                  multiline
                  numberOfLines={3}
                  style={styles.textArea}
                  inputStyle={styles.textAreaInput}
                  editable={!createMutation.isPending}
                />

                <Button
                  variant="primary"
                  size="lg"
                  onPress={handleCreate}
                  disabled={!name.trim() || createMutation.isPending}
                  loading={createMutation.isPending}
                >
                  {createMutation.isPending ? t('agentMgmt.creating') : t('agentMgmt.createTitle')}
                </Button>
              </>
            )}
          </Section>
        </PageScroll>
      </BackgroundSurface>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    gap: spacing.md,
  },
  runtimePicker: {
    gap: spacing.sm,
  },
  runtimeRail: {
    gap: RUNTIME_CARD_GAP,
    paddingVertical: spacing.xs,
  },
  runtimeCard: {
    width: RUNTIME_CARD_WIDTH,
    height: RUNTIME_CARD_WIDTH,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runtimeIconShell: {
    width: size.avatarLg,
    height: size.avatarLg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  runtimeIconImage: {
    width: size.controlSm,
    height: size.controlSm,
  },
  runtimeTargetDot: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: spacing.md,
    height: spacing.md,
    borderRadius: radius.full,
    borderWidth: border.hairline,
  },
  selectedRuntimeSummary: {
    minHeight: size.settingsRowMinHeight,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  selectedRuntimeIcon: {
    width: size.avatarLg,
    height: size.avatarLg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  runtimeChangeButton: {
    minHeight: size.controlSm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textArea: {
    minHeight: size.textareaLg,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  textAreaInput: {
    minHeight: size.textareaInputLg,
    textAlignVertical: 'top',
  },
  loadingPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  loadingCopy: {
    gap: spacing.xs,
  },
  loadingTitle: {
    textAlign: 'center',
  },
  loadingDesc: {
    textAlign: 'center',
  },
})
