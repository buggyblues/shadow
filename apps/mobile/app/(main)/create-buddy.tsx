import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Bot, Cloud } from 'lucide-react-native'
import { pinyin } from 'pinyin-pro'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { fetchApi } from '../../src/lib/api'
import {
  CLOUD_BUDDY_RUNTIMES,
  type CloudBuddyAgent,
  type CloudBuddyRuntimeId,
  createCloudBuddy,
} from '../../src/lib/cloud-buddy'
import { showToast } from '../../src/lib/toast'
import { border, radius, size, spacing, useColors } from '../../src/theme'

type ServerEntry = {
  server: {
    id: string
    name: string
  }
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

export default function CreateBuddyScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const { landingTitle, landingDescription } = useLocalSearchParams<{
    landingTitle?: string
    landingDescription?: string
  }>()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [runtimeId, setRuntimeId] = useState<CloudBuddyRuntimeId>('openclaw')
  const abandonedRef = useRef(false)

  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'buddy-access'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const openBuddyDm = async (agent: CloudBuddyAgent) => {
    const botUserId = agent.botUser?.id
    if (!botUserId) throw new Error(t('agentMgmt.botUserMissing'))

    const channel = await fetchApi<{ id: string }>('/api/channels/dm', {
      method: 'POST',
      body: JSON.stringify({ userId: botUserId }),
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
    mutationFn: () =>
      createCloudBuddy({
        name: name.trim(),
        username: deriveBuddyUsername(name),
        description: description.trim() || undefined,
        runtimeId,
        buddyMode: 'private',
        allowedServerIds: servers.map((entry) => entry.server.id),
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
      }),
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

  const handleCreate = () => {
    abandonedRef.current = false
    createMutation.mutate()
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
              {t('agentMgmt.cloudDeployingTitle')}
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.loadingDesc}>
              {t('agentMgmt.cloudDeployingDesc')}
            </AppText>
          </View>
          <Button variant="secondary" size="lg" onPress={handleAbandon}>
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
            title={landingTitle || t('agentMgmt.createTitle')}
            subtitle={landingDescription || t('agentMgmt.cloudCreateDesc')}
            icon={Cloud}
            padded
            cardStyle={styles.card}
          >
            <StatusNotice tone="primary">{t('agentMgmt.cloudRuntimeOpenClawDesc')}</StatusNotice>

            <View style={styles.runtimePicker}>
              <AppText variant="label" tone="secondary">
                {t('agentMgmt.runtimeLabel')}
              </AppText>
              <View style={styles.runtimeGrid}>
                {CLOUD_BUDDY_RUNTIMES.map((runtime) => {
                  const selected = runtime.id === runtimeId
                  return (
                    <Pressable
                      key={runtime.id}
                      accessibilityRole="button"
                      onPress={() => setRuntimeId(runtime.id)}
                      style={[
                        styles.runtimeCard,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.tonePrimarySurface : colors.surface,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.runtimeLogo,
                          { backgroundColor: selected ? colors.primary : colors.inputBackground },
                        ]}
                      >
                        <AppText
                          variant="bodyStrong"
                          style={{ color: selected ? colors.onPrimary : colors.text }}
                        >
                          {runtime.logo}
                        </AppText>
                      </View>
                      <AppText variant="label" numberOfLines={1} style={styles.runtimeName}>
                        {runtime.label}
                      </AppText>
                    </Pressable>
                  )
                })}
              </View>
            </View>

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
  runtimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  runtimeCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: size.settingsRowMinHeight,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  runtimeLogo: {
    width: size.controlSm,
    height: size.controlSm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runtimeName: {
    flex: 1,
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
