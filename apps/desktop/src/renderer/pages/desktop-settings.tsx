import { cn } from '@shadowob/ui'
import {
  Cable,
  Globe,
  Info,
  Keyboard,
  type LucideIcon,
  Mic2,
  Settings,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DesktopPetAssetsSettings } from '../components/desktop-pet-assets-settings'
import {
  AboutSettingsPanel,
  ConnectorSettingsPanel,
  GeneralSettingsPanel,
  NetworkSettingsPanel,
  ShortcutsSettingsPanel,
  VoiceSettingsPanel,
} from '../components/desktop-settings-panels'
import type {
  ConnectorBuddyCreateInput,
  ConnectorBuddyCreateResult,
  ConnectorConnection,
  ConnectorDaemonState,
  ConnectorRuntimeInfo,
  ConnectorRuntimeScanResult,
  ConnectorRuntimeSessionSnapshot,
  DesktopRuntimeSettings,
  DesktopSettingsAPI,
  DesktopSettingsTab,
  DesktopShortcutAction,
  DesktopShortcutSettings,
  TtsProvider,
  UpdateChannel,
  VoiceEngineStatus,
} from '../desktop-settings-types'
import {
  displayShortcut,
  shortcutActions,
  shortcutFromKeyboardEvent,
} from '../desktop-settings-utils'
import type { DesktopPetAssetSettings } from '../pet-types'

const DESKTOP_SETTINGS_STORAGE_KEY = 'shadow:desktop-runtime-settings:v1'
const DEFAULT_DESKTOP_SERVER_BASE_URL = 'https://shadowob.com'

const desktopSettingsTabs = new Set<DesktopSettingsTab>([
  'general',
  'connector',
  'shortcuts',
  'voice',
  'pet',
  'network',
  'about',
])

function getAPI(): DesktopSettingsAPI | null {
  if ('desktopAPI' in window) {
    const api = (window as Record<string, unknown>).desktopAPI as Record<string, unknown>
    return {
      platform: api.platform as string,
      showCreateBuddy: api.showCreateBuddy as DesktopSettingsAPI['showCreateBuddy'],
      showMainWindow: api.showMainWindow as DesktopSettingsAPI['showMainWindow'],
      showCommunity: api.showCommunity as DesktopSettingsAPI['showCommunity'],
      openCommunityLogin: api.openCommunityLogin as DesktopSettingsAPI['openCommunityLogin'],
      getCommunityAuthToken:
        api.getCommunityAuthToken as DesktopSettingsAPI['getCommunityAuthToken'],
      communityFetchJson: api.communityFetchJson as DesktopSettingsAPI['communityFetchJson'],
      openExternal: api.openExternal as DesktopSettingsAPI['openExternal'],
      selectDirectory: api.selectDirectory as DesktopSettingsAPI['selectDirectory'],
      getVersion: api.getVersion as DesktopSettingsAPI['getVersion'],
      checkForUpdate: api.checkForUpdate as DesktopSettingsAPI['checkForUpdate'],
      getUpdateSettings: api.getUpdateSettings as DesktopSettingsAPI['getUpdateSettings'],
      setUpdateSettings: api.setUpdateSettings as DesktopSettingsAPI['setUpdateSettings'],
      getUpdateState: api.getUpdateState as DesktopSettingsAPI['getUpdateState'],
      onUpdateState: api.onUpdateState as DesktopSettingsAPI['onUpdateState'],
      downloadUpdate: api.downloadUpdate as DesktopSettingsAPI['downloadUpdate'],
      setOpenAtLogin: api.setOpenAtLogin as DesktopSettingsAPI['setOpenAtLogin'],
      getOpenAtLogin: api.getOpenAtLogin as DesktopSettingsAPI['getOpenAtLogin'],
      quitAndRestart: api.quitAndRestart as DesktopSettingsAPI['quitAndRestart'],
      getDesktopSettings: api.getDesktopSettings as DesktopSettingsAPI['getDesktopSettings'],
      setDesktopSettings: api.setDesktopSettings as DesktopSettingsAPI['setDesktopSettings'],
      petAssets: api.petAssets as DesktopSettingsAPI['petAssets'],
      reloadShortcuts: api.reloadShortcuts as DesktopSettingsAPI['reloadShortcuts'],
      suspendShortcuts: api.suspendShortcuts as DesktopSettingsAPI['suspendShortcuts'],
      resumeShortcuts: api.resumeShortcuts as DesktopSettingsAPI['resumeShortcuts'],
      connector: api.connector as DesktopSettingsAPI['connector'],
      pet: api.pet as DesktopSettingsAPI['pet'],
      onConnectorState: api.onConnectorState as DesktopSettingsAPI['onConnectorState'],
      onConnectorRuntimeState:
        api.onConnectorRuntimeState as DesktopSettingsAPI['onConnectorRuntimeState'],
      onDesktopSettingsChanged:
        api.onDesktopSettingsChanged as DesktopSettingsAPI['onDesktopSettingsChanged'],
      onSettingsTabRequest: api.onSettingsTabRequest as DesktopSettingsAPI['onSettingsTabRequest'],
    }
  }
  return null
}

function readInitialSettingsTab(): DesktopSettingsTab {
  const tab = new URLSearchParams(window.location.search).get('tab')
  return desktopSettingsTabs.has(tab as DesktopSettingsTab)
    ? (tab as DesktopSettingsTab)
    : 'general'
}

function persistRuntimeSettings(settings: DesktopRuntimeSettings): void {
  localStorage.setItem(
    DESKTOP_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      serverBaseUrl: resolveRuntimeServerBaseUrl(settings.serverBaseUrl),
      httpProxy: settings.httpProxy,
      httpsProxy: settings.httpsProxy,
    }),
  )
}

function resolveRuntimeServerBaseUrl(value: string): string {
  try {
    const url = new URL(value.trim() || DEFAULT_DESKTOP_SERVER_BASE_URL)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      url.search = ''
      url.hash = ''
      const path = url.pathname.replace(/\/+$/, '')
      return path && path !== '/' ? `${url.origin}${path}` : url.origin
    }
  } catch {
    // Fall through to the hosted community.
  }
  return DEFAULT_DESKTOP_SERVER_BASE_URL
}

function connectorCreateResultAgentId(agent: unknown): string | null {
  if (!agent || typeof agent !== 'object') return null
  const id = (agent as Record<string, unknown>).id
  return typeof id === 'string' && id.trim() ? id : null
}

function connectorCreateResultBuddyUserId(
  agent: ConnectorBuddyCreateResult['agent'],
): string | null {
  if (!agent || typeof agent !== 'object') return null
  const botUser = agent.botUser
  return (
    (typeof botUser?.id === 'string' && botUser.id.trim() ? botUser.id : null) ??
    (typeof agent.userId === 'string' && agent.userId.trim() ? agent.userId : null) ??
    (typeof agent.buddyUserId === 'string' && agent.buddyUserId.trim() ? agent.buddyUserId : null)
  )
}

export function DesktopSettingsPage() {
  const { t } = useTranslation()
  const api = useMemo(() => getAPI(), [])

  const [activeTab, setActiveTab] = useState<DesktopSettingsTab>(() => readInitialSettingsTab())
  const [version, setVersion] = useState('')
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [checking, setChecking] = useState(false)
  const [savingNetwork, setSavingNetwork] = useState(false)
  const [networkSaved, setNetworkSaved] = useState(false)
  const [autoCheckOnLaunch, setAutoCheckOnLaunch] = useState(true)
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>('production')
  const [serverBaseUrl, setServerBaseUrl] = useState('')
  const [httpProxy, setHttpProxy] = useState('')
  const [httpsProxy, setHttpsProxy] = useState('')
  const [connectorApiKey, setConnectorApiKey] = useState('')
  const [connectorAutoStart, setConnectorAutoStart] = useState(false)
  const [shortcuts, setShortcuts] = useState<DesktopShortcutSettings>({
    openCommunity: 'CommandOrControl+Alt+Shift+1',
    togglePet: 'CommandOrControl+Alt+Shift+2',
    petVoice: 'CommandOrControl+Alt+Shift+3',
    petChat: 'CommandOrControl+Alt+Shift+4',
    showNotifications: 'CommandOrControl+Alt+Shift+5',
  })
  const [recordingShortcut, setRecordingShortcut] = useState<DesktopShortcutAction | null>(null)
  const [shortcutRegistrationError, setShortcutRegistrationError] = useState('')
  const [ttsProvider, setTtsProvider] = useState<DesktopRuntimeSettings['ttsProvider']>('system')
  const [asrProvider, setAsrProvider] =
    useState<DesktopRuntimeSettings['asrProvider']>('sherpa-local')
  const [petAssetSettings, setPetAssetSettings] = useState<DesktopPetAssetSettings>({
    desktopPetActivePackId: '',
    desktopPetPacks: [],
  })
  const [voiceStatus, setVoiceStatus] = useState<VoiceEngineStatus | null>(null)
  const [voiceInstallBusyProvider, setVoiceInstallBusyProvider] = useState<TtsProvider | null>(null)
  const [voiceError, setVoiceError] = useState('')
  const [connectorState, setConnectorState] = useState<ConnectorDaemonState | null>(null)
  const [connectorBusy, setConnectorBusy] = useState(false)
  const [connectorConnectionBusyId, setConnectorConnectionBusyId] = useState<string | null>(null)
  const [connectorError, setConnectorError] = useState('')
  const [connectorNotice, setConnectorNotice] = useState('')
  const [connectorConnectionErrors, setConnectorConnectionErrors] = useState<
    Record<string, string>
  >({})
  const [highlightedConnectionId, setHighlightedConnectionId] = useState<string | null>(null)
  const [connectionWorkDirs, setConnectionWorkDirs] = useState<Record<string, string>>({})
  const [connectorRuntimeNotifications, setConnectorRuntimeNotifications] = useState<
    Record<string, boolean>
  >({})
  const [runtimes, setRuntimes] = useState<ConnectorRuntimeInfo[]>([])
  const [runtimeSessions, setRuntimeSessions] = useState<ConnectorRuntimeSessionSnapshot | null>(
    null,
  )
  const [runtimesCollapsed, setRuntimesCollapsed] = useState(false)
  const [runtimeScanBusy, setRuntimeScanBusy] = useState(false)
  const [runtimeInstallBusyIds, setRuntimeInstallBusyIds] = useState<string[]>([])
  const [runtimeInstallErrorIds, setRuntimeInstallErrorIds] = useState<string[]>([])
  const [runtimeNotificationBusyIds, setRuntimeNotificationBusyIds] = useState<string[]>([])
  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean
    version: string
    downloadUrl: string
    releaseNotes: string
    channel: UpdateChannel
  } | null>(null)

  const refreshVoiceStatus = useCallback(async () => {
    const status = await api?.pet?.voiceEngineStatus?.().catch(() => null)
    if (status) setVoiceStatus(status)
    return status
  }, [api])

  useEffect(() => {
    api?.getVersion().then(setVersion)
    api?.getOpenAtLogin().then(setOpenAtLogin)
    api?.getUpdateSettings().then((s) => {
      setAutoCheckOnLaunch(s.autoCheckOnLaunch)
      setUpdateChannel(s.channel)
    })
    api?.getDesktopSettings().then((settings) => {
      setServerBaseUrl(settings.serverBaseUrl)
      setHttpProxy(settings.httpProxy)
      setHttpsProxy(settings.httpsProxy)
      setConnectorApiKey(settings.connectorApiKey)
      setConnectorAutoStart(settings.connectorAutoStart)
      setConnectorRuntimeNotifications(settings.connectorRuntimeNotifications ?? {})
      setTtsProvider(settings.ttsProvider)
      setAsrProvider(settings.asrProvider)
      setShortcuts(settings.shortcuts)
      setPetAssetSettings({
        desktopPetActivePackId: settings.desktopPetActivePackId,
        desktopPetPacks: settings.desktopPetPacks,
      })
      persistRuntimeSettings(settings)
    })
    void refreshVoiceStatus()
    api?.connector.getStatus().then(setConnectorState)
    api?.connector.scanRuntimes?.().then((result) => {
      setRuntimes(result.runtimes)
      setRuntimeSessions(result.runtimeSessions ?? null)
    })
    api?.connector.getConnections?.().then((connections) => {
      setConnectorState((state) => (state ? { ...state, connections } : state))
    })
    api?.getUpdateState().then((state) => {
      if (state.info) setUpdateInfo(state.info)
      setUpdateChannel(state.channel)
      setChecking(state.status === 'checking')
    })

    const unsubscribe = api?.onUpdateState?.((state) => {
      if (state.info) setUpdateInfo(state.info)
      setUpdateChannel(state.channel)
      setChecking(state.status === 'checking')
    })
    const unsubscribeConnector = api?.onConnectorState?.((state) => {
      setConnectorState(state)
      if (state.lastError) setConnectorError(state.lastError)
    })
    const unsubscribeConnectorRuntimes = api?.onConnectorRuntimeState?.(
      (result: ConnectorRuntimeScanResult) => {
        setRuntimes(result.runtimes)
        setRuntimeSessions(result.runtimeSessions ?? null)
      },
    )
    const unsubscribeSettings = api?.onDesktopSettingsChanged?.((settings) => {
      setConnectorRuntimeNotifications(settings.connectorRuntimeNotifications ?? {})
      setPetAssetSettings({
        desktopPetActivePackId: settings.desktopPetActivePackId,
        desktopPetPacks: settings.desktopPetPacks,
      })
    })
    return () => {
      unsubscribe?.()
      unsubscribeConnector?.()
      unsubscribeConnectorRuntimes?.()
      unsubscribeSettings?.()
    }
  }, [api, refreshVoiceStatus])

  useEffect(() => {
    return api?.onSettingsTabRequest?.((tab) => setActiveTab(tab))
  }, [api])

  useEffect(() => {
    if (!api || !voiceStatus || ttsProvider === 'system') return
    if (voiceStatus.ttsProviders[ttsProvider]?.installed) return
    setTtsProvider('system')
    void api
      .setDesktopSettings({ ttsProvider: 'system', asrProvider })
      .then((settings) => {
        setTtsProvider(settings.ttsProvider)
        setAsrProvider(settings.asrProvider)
      })
      .catch(() => {})
  }, [api, asrProvider, ttsProvider, voiceStatus])

  const handleCheckUpdate = useCallback(async () => {
    if (!api || checking) return
    setChecking(true)
    try {
      const info = await api.checkForUpdate()
      setUpdateInfo(info)
    } finally {
      setChecking(false)
    }
  }, [api, checking])

  const handleDownload = useCallback(() => {
    if (!updateInfo?.downloadUrl || !api) return
    api.downloadUpdate(updateInfo.downloadUrl)
  }, [api, updateInfo])

  const handleOpenAtLoginToggle = useCallback(
    (v: boolean) => {
      setOpenAtLogin(v)
      api?.setOpenAtLogin(v)
    },
    [api],
  )

  const handleAutoCheckToggle = useCallback(
    async (v: boolean) => {
      setAutoCheckOnLaunch(v)
      await api?.setUpdateSettings({ autoCheckOnLaunch: v })
    },
    [api],
  )

  const handleUpdateChannelChange = useCallback(
    async (channel: UpdateChannel) => {
      setUpdateChannel(channel)
      setUpdateInfo(null)
      const next = await api?.setUpdateSettings({ channel })
      if (!next) return
      setAutoCheckOnLaunch(next.autoCheckOnLaunch)
      setUpdateChannel(next.channel)
    },
    [api],
  )

  const handleSaveNetwork = useCallback(async () => {
    if (!api || savingNetwork) return
    setSavingNetwork(true)
    setNetworkSaved(false)
    try {
      const next = await api.setDesktopSettings({ serverBaseUrl, httpProxy, httpsProxy })
      setServerBaseUrl(next.serverBaseUrl)
      setHttpProxy(next.httpProxy)
      setHttpsProxy(next.httpsProxy)
      persistRuntimeSettings(next)
      setNetworkSaved(true)
    } finally {
      setSavingNetwork(false)
    }
  }, [api, httpProxy, httpsProxy, savingNetwork, serverBaseUrl])

  const handleConnectorAutoStartToggle = useCallback(
    async (v: boolean) => {
      setConnectorAutoStart(v)
      setConnectorError('')
      try {
        const next = await api?.setDesktopSettings({
          connectorApiKey,
          connectorAutoStart: v,
        })
        if (!next) return
        setConnectorApiKey(next.connectorApiKey)
        setConnectorAutoStart(next.connectorAutoStart)
        persistRuntimeSettings(next)
      } catch (error) {
        setConnectorError(error instanceof Error ? error.message : String(error))
      }
    },
    [api, connectorApiKey],
  )

  const handleStartConnector = useCallback(async () => {
    if (!api || connectorBusy) return
    setConnectorBusy(true)
    setConnectorError('')
    try {
      const next = await api.setDesktopSettings({
        serverBaseUrl,
        httpProxy,
        httpsProxy,
        connectorApiKey,
        connectorAutoStart,
      })
      setServerBaseUrl(next.serverBaseUrl)
      setHttpProxy(next.httpProxy)
      setHttpsProxy(next.httpsProxy)
      setConnectorApiKey(next.connectorApiKey)
      setConnectorAutoStart(next.connectorAutoStart)
      persistRuntimeSettings(next)
      const state = await api.connector.start(next)
      setConnectorState(state)
      const authorizedSettings = await api.getDesktopSettings()
      setConnectorApiKey(authorizedSettings.connectorApiKey)
      setConnectorAutoStart(authorizedSettings.connectorAutoStart)
      persistRuntimeSettings(authorizedSettings)
    } catch (error) {
      setConnectorError(error instanceof Error ? error.message : String(error))
    } finally {
      setConnectorBusy(false)
    }
  }, [
    api,
    connectorApiKey,
    connectorAutoStart,
    connectorBusy,
    httpProxy,
    httpsProxy,
    serverBaseUrl,
  ])

  const handleStopConnector = useCallback(async () => {
    if (!api || connectorBusy) return
    setConnectorBusy(true)
    setConnectorError('')
    try {
      const state = await api.connector.stop()
      setConnectorState(state)
    } catch (error) {
      setConnectorError(error instanceof Error ? error.message : String(error))
    } finally {
      setConnectorBusy(false)
    }
  }, [api, connectorBusy])

  const connectorRunning = connectorState?.running === true

  const handleConnectorRunningToggle = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        void handleStartConnector()
      } else {
        void handleStopConnector()
      }
    },
    [handleStartConnector, handleStopConnector],
  )

  const openCreatedConnectorBuddyDm = useCallback(
    async (
      runtime: ConnectorRuntimeInfo,
      input: ConnectorBuddyCreateInput,
      result: ConnectorBuddyCreateResult,
      connection: ConnectorConnection | undefined,
    ) => {
      if (!api?.communityFetchJson || !api.showCommunity) return
      const buddyUserId = connectorCreateResultBuddyUserId(result.agent)
      if (!buddyUserId) {
        setConnectorError(t('desktop.connectorBuddyDmMissingUser'))
        return
      }
      let dmChannelId = ''
      try {
        const dm = await api.communityFetchJson<{ id: string }>({
          path: '/api/channels/dm',
          method: 'POST',
          body: { userId: buddyUserId },
        })
        dmChannelId = dm.id
        await api.communityFetchJson({
          path: `/api/channels/${encodeURIComponent(dmChannelId)}/messages`,
          method: 'POST',
          body: {
            content: t('desktop.connectorBuddyGreeting', {
              name: connection?.displayName || connection?.label || input.name,
              runtime: connection?.runtimeLabel || runtime.label,
            }),
          },
        })
      } catch (error) {
        setConnectorError(error instanceof Error ? error.message : String(error))
      }
      if (dmChannelId) {
        await api.showCommunity(`/dm/${dmChannelId}`)
      }
    },
    [api, t],
  )

  const handleCreateConnectorBuddy = useCallback(
    async (_runtime: ConnectorRuntimeInfo, input: ConnectorBuddyCreateInput) => {
      if (!api?.connector.createBuddy || connectorBusy) return
      setConnectorBusy(true)
      setConnectorError('')
      setConnectorNotice('')
      try {
        const beforeIds = new Set((connectorState?.connections ?? []).map((item) => item.agentId))
        if (!connectorRunning) {
          const next = await api.connector.start({
            serverBaseUrl,
            httpProxy,
            httpsProxy,
            connectorApiKey,
            connectorAutoStart,
          })
          setConnectorState(next)
          const authorizedSettings = await api.getDesktopSettings()
          setConnectorApiKey(authorizedSettings.connectorApiKey)
          setConnectorAutoStart(authorizedSettings.connectorAutoStart)
          persistRuntimeSettings(authorizedSettings)
        }
        const result = await api.connector.createBuddy(input)
        const createdAgentId =
          connectorCreateResultAgentId(result.agent) ??
          result.connections.find((connection) => !beforeIds.has(connection.agentId))?.agentId ??
          null
        setConnectorState((state) =>
          state ? { ...state, connections: result.connections } : state,
        )
        if (!connectorState) {
          const nextState = await api.connector.getStatus().catch(() => null)
          if (nextState) setConnectorState({ ...nextState, connections: result.connections })
        }
        if (createdAgentId) {
          const connection = result.connections.find((item) => item.agentId === createdAgentId)
          setHighlightedConnectionId(createdAgentId)
          setRuntimesCollapsed(false)
          const connectionName = connection?.displayName || connection?.label || input.name
          const connectionRuntime = connection?.runtimeLabel || _runtime.label
          if (result.connectionError) {
            setConnectorError(result.connectionError)
            setConnectorConnectionErrors((current) => ({
              ...current,
              [createdAgentId]: result.connectionError ?? '',
            }))
            setConnectorNotice(
              t('desktop.connectorBuddyConnectionFailed', {
                name: connectionName,
                runtime: connectionRuntime,
              }),
            )
          } else {
            setConnectorNotice(
              connection?.status === 'running'
                ? t('desktop.connectorBuddyConnected', {
                    name: connectionName,
                    runtime: connectionRuntime,
                  })
                : t('desktop.connectorBuddyConnecting', {
                    name: connectionName,
                    runtime: connectionRuntime,
                  }),
            )
          }
          window.setTimeout(() => {
            setHighlightedConnectionId((current) => (current === createdAgentId ? null : current))
          }, 8000)
          if (!result.connectionError && connection?.status === 'running') {
            await openCreatedConnectorBuddyDm(_runtime, input, result, connection)
          }
        } else if (result.connectionError) {
          setConnectorError(result.connectionError)
          setConnectorNotice(
            t('desktop.connectorBuddyConnectionFailed', {
              name: input.name,
              runtime: _runtime.label,
            }),
          )
        }
      } catch (error) {
        setConnectorError(error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        setConnectorBusy(false)
      }
    },
    [
      api,
      connectorApiKey,
      connectorAutoStart,
      connectorBusy,
      connectorRunning,
      connectorState,
      httpProxy,
      httpsProxy,
      openCreatedConnectorBuddyDm,
      serverBaseUrl,
      t,
    ],
  )

  const handleConnectorConnectionToggle = useCallback(
    async (connection: ConnectorConnection, enabled: boolean) => {
      if (!api || connectorConnectionBusyId || connectorBusy) return
      setConnectorConnectionBusyId(connection.agentId)
      setConnectorError('')
      setConnectorNotice('')
      setConnectorConnectionErrors((current) => {
        const next = { ...current }
        delete next[connection.agentId]
        return next
      })
      try {
        if (enabled && !connectorRunning) {
          const next = await api.setDesktopSettings({
            serverBaseUrl,
            httpProxy,
            httpsProxy,
            connectorApiKey,
            connectorAutoStart,
          })
          setServerBaseUrl(next.serverBaseUrl)
          setHttpProxy(next.httpProxy)
          setHttpsProxy(next.httpsProxy)
          setConnectorApiKey(next.connectorApiKey)
          setConnectorAutoStart(next.connectorAutoStart)
          persistRuntimeSettings(next)
          setConnectorState(await api.connector.start(next))
        }
        const connections = await api.connector.setConnectionEnabled({
          agentId: connection.agentId,
          enabled,
        })
        setConnectorState((state) => (state ? { ...state, connections } : state))
        const nextConnection = connections.find((item) => item.agentId === connection.agentId)
        setConnectorNotice(
          enabled
            ? t('desktop.connectorConnectionStarted', {
                name: nextConnection?.displayName || nextConnection?.label || connection.label,
                runtime: nextConnection?.runtimeLabel || connection.runtimeLabel,
              })
            : t('desktop.connectorConnectionStopped', {
                name: nextConnection?.displayName || nextConnection?.label || connection.label,
              }),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setConnectorError(message)
        setConnectorConnectionErrors((current) => ({
          ...current,
          [connection.agentId]: message,
        }))
      } finally {
        setConnectorConnectionBusyId(null)
      }
    },
    [
      api,
      connectorApiKey,
      connectorAutoStart,
      connectorBusy,
      connectorConnectionBusyId,
      connectorRunning,
      httpProxy,
      httpsProxy,
      serverBaseUrl,
      t,
    ],
  )

  const handleDeleteConnectorConnection = useCallback(
    async (connection: ConnectorConnection, options: { deleteCloudBuddy?: boolean } = {}) => {
      if (!api?.connector.deleteConnection) {
        const message = t('desktop.connectorConnectionDeleteUnavailable')
        setConnectorError(message)
        setConnectorConnectionErrors((current) => ({
          ...current,
          [connection.agentId]: message,
        }))
        return
      }
      if (connectorConnectionBusyId || connectorBusy) return
      const name = connection.displayName || connection.label
      setConnectorConnectionBusyId(connection.agentId)
      setConnectorError('')
      setConnectorNotice('')
      setConnectorConnectionErrors((current) => {
        const next = { ...current }
        delete next[connection.agentId]
        return next
      })
      try {
        const connections = await api.connector.deleteConnection({
          agentId: connection.agentId,
          deleteCloudBuddy: options.deleteCloudBuddy,
        })
        setConnectorState((state) => (state ? { ...state, connections } : state))
        setConnectionWorkDirs((current) => {
          const next = { ...current }
          delete next[connection.agentId]
          return next
        })
        setConnectorNotice(
          options.deleteCloudBuddy
            ? t('desktop.connectorConnectionDeletedWithBuddy', { name })
            : t('desktop.connectorConnectionDeleted', { name }),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setConnectorError(message)
        setConnectorConnectionErrors((current) => ({
          ...current,
          [connection.agentId]: message,
        }))
      } finally {
        setConnectorConnectionBusyId(null)
      }
    },
    [api, connectorBusy, connectorConnectionBusyId, t],
  )

  const handleConnectionWorkDirChange = useCallback((agentId: string, workDir: string) => {
    setConnectionWorkDirs((current) => ({ ...current, [agentId]: workDir }))
  }, [])

  const handleSaveConnectionWorkDir = useCallback(
    async (connection: ConnectorConnection, workDir: string) => {
      if (!api?.connector.setConnectionWorkDir || connectorConnectionBusyId) return
      setConnectorConnectionBusyId(connection.agentId)
      setConnectorError('')
      try {
        const connections = await api.connector.setConnectionWorkDir({
          agentId: connection.agentId,
          workDir,
        })
        setConnectorState((state) => (state ? { ...state, connections } : state))
      } catch (error) {
        setConnectorError(error instanceof Error ? error.message : String(error))
      } finally {
        setConnectorConnectionBusyId(null)
      }
    },
    [api, connectorConnectionBusyId],
  )

  const handleChooseConnectionWorkDir = useCallback(
    async (connection: ConnectorConnection) => {
      if (!api?.selectDirectory) return
      const currentWorkDir = connectionWorkDirs[connection.agentId] ?? connection.workDir
      const selected = await api.selectDirectory(currentWorkDir)
      if (!selected) return
      handleConnectionWorkDirChange(connection.agentId, selected)
      await handleSaveConnectionWorkDir(connection, selected)
    },
    [api, connectionWorkDirs, handleConnectionWorkDirChange, handleSaveConnectionWorkDir],
  )

  const handleSaveVoice = useCallback(
    async (incoming: Partial<Pick<DesktopRuntimeSettings, 'ttsProvider' | 'asrProvider'>>) => {
      if (!api) return
      const nextTtsProvider = incoming.ttsProvider ?? ttsProvider
      const providerStatus = voiceStatus?.ttsProviders[nextTtsProvider]
      if (nextTtsProvider !== 'system' && !providerStatus?.installed) {
        setVoiceError(t('desktop.voiceProviderRequiresInstall'))
        return
      }
      const next = await api.setDesktopSettings({
        ttsProvider,
        asrProvider,
        ...incoming,
      })
      setTtsProvider(next.ttsProvider)
      setAsrProvider(next.asrProvider)
      setVoiceError('')
      void refreshVoiceStatus()
    },
    [api, asrProvider, refreshVoiceStatus, t, ttsProvider, voiceStatus],
  )

  const handleInstallTtsProvider = useCallback(
    async (provider: TtsProvider) => {
      if (!api?.pet?.installVoiceModel || voiceInstallBusyProvider) return
      setVoiceInstallBusyProvider(provider)
      setVoiceError('')
      try {
        const status = await api.pet.installVoiceModel({ provider })
        setVoiceStatus(status)
      } catch (error) {
        setVoiceError(error instanceof Error ? error.message : String(error))
      } finally {
        setVoiceInstallBusyProvider(null)
      }
    },
    [api, voiceInstallBusyProvider],
  )

  const handleSaveShortcut = useCallback(
    async (action: DesktopShortcutAction, accelerator: string) => {
      if (!api) return
      const nextShortcuts = { ...shortcuts, [action]: accelerator }
      for (const candidate of shortcutActions) {
        if (candidate !== action && nextShortcuts[candidate] === accelerator) {
          nextShortcuts[candidate] = ''
        }
      }
      setShortcuts(nextShortcuts)
      const next = await api.setDesktopSettings({ shortcuts: nextShortcuts })
      setShortcuts(next.shortcuts)
      const result = await api.reloadShortcuts?.()
      const failed = result?.failed ?? []
      setShortcutRegistrationError(
        failed.length
          ? t('desktop.shortcutRegistrationFailed', {
              shortcuts: failed
                .map((entry) => displayShortcut(entry.accelerator, api.platform))
                .join(', '),
            })
          : '',
      )
    },
    [api, shortcuts, t],
  )

  useEffect(() => {
    if (!recordingShortcut) return
    void api?.suspendShortcuts?.()
    const handler = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setRecordingShortcut(null)
        return
      }
      const next = shortcutFromKeyboardEvent(event, api?.platform)
      if (!next) return
      void handleSaveShortcut(recordingShortcut, next)
      setRecordingShortcut(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      void api?.resumeShortcuts?.()
    }
  }, [api, handleSaveShortcut, recordingShortcut])

  const handleScanRuntimes = useCallback(async () => {
    if (!api?.connector.scanRuntimes || runtimeScanBusy) return
    setRuntimeScanBusy(true)
    setConnectorError('')
    setConnectorNotice('')
    try {
      const result = await api.connector.scanRuntimes({ force: true })
      setRuntimes(result.runtimes)
      setRuntimeSessions(result.runtimeSessions ?? null)
    } catch (error) {
      setConnectorError(error instanceof Error ? error.message : String(error))
    } finally {
      setRuntimeScanBusy(false)
    }
  }, [api, runtimeScanBusy])

  const handleInstallRuntime = useCallback(
    async (runtime: ConnectorRuntimeInfo) => {
      if (!api?.connector.installRuntime || runtimeInstallBusyIds.includes(runtime.id)) return
      setRuntimeInstallBusyIds((current) => [...current, runtime.id])
      setRuntimeInstallErrorIds((current) => current.filter((id) => id !== runtime.id))
      setConnectorError('')
      setConnectorNotice('')
      try {
        const result = await api.connector.installRuntime({ runtimeId: runtime.id })
        setRuntimes(result.runtimes)
        setRuntimeSessions(result.runtimeSessions ?? null)
        setConnectorNotice(
          t('desktop.runtimeInstallComplete', {
            name: result.installed?.label || runtime.label,
          }),
        )
      } catch (error) {
        setRuntimeInstallErrorIds((current) =>
          current.includes(runtime.id) ? current : [...current, runtime.id],
        )
        setConnectorError(error instanceof Error ? error.message : String(error))
      } finally {
        setRuntimeInstallBusyIds((current) => current.filter((id) => id !== runtime.id))
      }
    },
    [api, runtimeInstallBusyIds, t],
  )

  const handleRuntimeNotificationToggle = useCallback(
    async (runtime: ConnectorRuntimeInfo, enabled: boolean) => {
      if (!api || runtimeNotificationBusyIds.includes(runtime.id)) return
      setRuntimeNotificationBusyIds((current) => [...current, runtime.id])
      const next = { ...connectorRuntimeNotifications, [runtime.id]: enabled }
      setConnectorRuntimeNotifications(next)
      setConnectorError('')
      try {
        const settings = await api.setDesktopSettings({ connectorRuntimeNotifications: next })
        setConnectorRuntimeNotifications(settings.connectorRuntimeNotifications ?? next)
      } catch (error) {
        setConnectorRuntimeNotifications(connectorRuntimeNotifications)
        setConnectorError(error instanceof Error ? error.message : String(error))
      } finally {
        setRuntimeNotificationBusyIds((current) => current.filter((id) => id !== runtime.id))
      }
    },
    [api, connectorRuntimeNotifications, runtimeNotificationBusyIds],
  )

  const handleSelectTtsProvider = useCallback(
    (provider: TtsProvider) => {
      setTtsProvider(provider)
      void handleSaveVoice({ ttsProvider: provider })
    },
    [handleSaveVoice],
  )

  const handleSelectAsrProvider = useCallback(
    (provider: DesktopRuntimeSettings['asrProvider']) => {
      setAsrProvider(provider)
      void handleSaveVoice({ asrProvider: provider })
    },
    [handleSaveVoice],
  )

  const platformLabel =
    api?.platform === 'darwin' ? 'macOS' : api?.platform === 'win32' ? 'Windows' : 'Linux'
  const connectorStatusCopy = connectorRunning
    ? t('desktop.connectorRunning')
    : t('desktop.connectorStopped')
  const connectorPhase = connectorState?.phase ?? (connectorRunning ? 'running' : 'idle')
  const connectorProgressVisible =
    connectorBusy ||
    connectorPhase === 'authorizing' ||
    connectorPhase === 'connecting' ||
    connectorPhase === 'starting' ||
    connectorPhase === 'stopping'
  const connectorProgressValue = connectorProgressVisible
    ? Math.max(connectorState?.progress ?? 12, 8)
    : connectorRunning
      ? 100
      : 0
  const connectorConnections = connectorState?.connections ?? []
  useEffect(() => {
    setConnectionWorkDirs((current) => {
      const next: Record<string, string> = {}
      for (const connection of connectorState?.connections ?? []) {
        next[connection.agentId] = current[connection.agentId] ?? connection.workDir ?? ''
      }
      return next
    })
  }, [connectorState?.connections])
  const connectorPhaseCopy = t(`desktop.connectorPhase_${connectorPhase}`)
  const installedRuntimeCount = runtimes.filter((runtime) => runtime.status === 'available').length
  const settingsTabs: Array<{
    id: DesktopSettingsTab
    label: string
    icon: LucideIcon
  }> = [
    { id: 'general', label: t('desktop.tabGeneral'), icon: Settings },
    { id: 'connector', label: t('desktop.tabConnector'), icon: Cable },
    { id: 'shortcuts', label: t('desktop.tabShortcuts'), icon: Keyboard },
    { id: 'voice', label: t('desktop.tabVoice'), icon: Mic2 },
    { id: 'pet', label: t('desktop.tabPetAssets'), icon: Sparkles },
    { id: 'network', label: t('desktop.tabNetwork'), icon: Globe },
    { id: 'about', label: t('desktop.tabAbout'), icon: Info },
  ]

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-black text-text-primary">
      <header className="desktop-drag-titlebar desktop-settings-titlebar sticky top-0 z-20 shrink-0 border-b border-border-subtle bg-[#1f1f1f]/95 px-4 pb-3 pt-3">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2">
          <h1 className="text-sm font-bold text-text-secondary">{t('desktop.settingsTitle')}</h1>
          <nav className="flex items-end gap-2" aria-label={t('desktop.settingsTitle')}>
            {settingsTabs.map((tab) => {
              const Icon = tab.icon
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-no-drag
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex min-w-[78px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition',
                    selected
                      ? 'bg-white/12 text-white'
                      : 'text-text-muted hover:bg-white/7 hover:text-text-primary',
                  )}
                >
                  <Icon size={22} strokeWidth={2.3} />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto grid max-w-[920px] gap-4">
          {activeTab === 'general' ? (
            <GeneralSettingsPanel
              openAtLogin={openAtLogin}
              connectorAutoStart={connectorAutoStart}
              autoCheckOnLaunch={autoCheckOnLaunch}
              installedRuntimeCount={installedRuntimeCount}
              runtimeCount={runtimes.length}
              connectorRunning={connectorRunning}
              connectorStatusCopy={connectorStatusCopy}
              onOpenAtLoginToggle={handleOpenAtLoginToggle}
              onConnectorAutoStartToggle={handleConnectorAutoStartToggle}
              onAutoCheckToggle={handleAutoCheckToggle}
            />
          ) : null}

          {activeTab === 'connector' ? (
            <ConnectorSettingsPanel
              connectorRunning={connectorRunning}
              connectorBusy={connectorBusy}
              connectorStatusCopy={connectorStatusCopy}
              connectorProgressVisible={connectorProgressVisible}
              connectorProgressValue={connectorProgressValue}
              connectorPhaseCopy={connectorPhaseCopy}
              connectorState={connectorState}
              connectorError={connectorError}
              connectorNotice={connectorNotice}
              connectorConnections={connectorConnections}
              highlightedConnectionId={highlightedConnectionId}
              connectorConnectionBusyId={connectorConnectionBusyId}
              connectorConnectionErrors={connectorConnectionErrors}
              connectionWorkDirs={connectionWorkDirs}
              connectorRuntimeNotifications={connectorRuntimeNotifications}
              runtimes={runtimes}
              runtimeSessions={runtimeSessions}
              runtimesCollapsed={runtimesCollapsed}
              runtimeScanBusy={runtimeScanBusy}
              runtimeInstallBusyIds={runtimeInstallBusyIds}
              runtimeInstallErrorIds={runtimeInstallErrorIds}
              runtimeNotificationBusyIds={runtimeNotificationBusyIds}
              openExternal={api?.openExternal}
              onConnectorRunningToggle={handleConnectorRunningToggle}
              onCreateConnectorBuddy={handleCreateConnectorBuddy}
              onConnectorConnectionToggle={(connection, enabled) =>
                void handleConnectorConnectionToggle(connection, enabled)
              }
              onConnectorConnectionDelete={(connection, options) =>
                void handleDeleteConnectorConnection(connection, options)
              }
              onChooseConnectionWorkDir={(connection) =>
                void handleChooseConnectionWorkDir(connection)
              }
              onToggleRuntimesCollapsed={() => setRuntimesCollapsed((value) => !value)}
              onScanRuntimes={() => void handleScanRuntimes()}
              onInstallRuntime={(runtime) => void handleInstallRuntime(runtime)}
              onRuntimeNotificationToggle={(runtime, enabled) =>
                void handleRuntimeNotificationToggle(runtime, enabled)
              }
            />
          ) : null}

          {activeTab === 'shortcuts' ? (
            <ShortcutsSettingsPanel
              platform={api?.platform}
              shortcuts={shortcuts}
              recordingShortcut={recordingShortcut}
              shortcutRegistrationError={shortcutRegistrationError}
              onRecordingShortcut={setRecordingShortcut}
              onClearShortcut={(action) => void handleSaveShortcut(action, '')}
            />
          ) : null}

          {activeTab === 'voice' ? (
            <VoiceSettingsPanel
              ttsProvider={ttsProvider}
              asrProvider={asrProvider}
              voiceStatus={voiceStatus}
              voiceError={voiceError}
              voiceInstallBusyProvider={voiceInstallBusyProvider}
              onSelectTtsProvider={handleSelectTtsProvider}
              onSelectAsrProvider={handleSelectAsrProvider}
              onInstallTtsProvider={(provider) => void handleInstallTtsProvider(provider)}
            />
          ) : null}

          {activeTab === 'pet' ? (
            <DesktopPetAssetsSettings
              api={api}
              settings={petAssetSettings}
              onSettings={setPetAssetSettings}
            />
          ) : null}

          {activeTab === 'network' ? (
            <NetworkSettingsPanel
              serverBaseUrl={serverBaseUrl}
              httpProxy={httpProxy}
              httpsProxy={httpsProxy}
              networkSaved={networkSaved}
              savingNetwork={savingNetwork}
              onServerBaseUrlChange={(value) => {
                setNetworkSaved(false)
                setServerBaseUrl(value)
              }}
              onHttpProxyChange={(value) => {
                setNetworkSaved(false)
                setHttpProxy(value)
              }}
              onHttpsProxyChange={(value) => {
                setNetworkSaved(false)
                setHttpsProxy(value)
              }}
              onSaveNetwork={() => void handleSaveNetwork()}
            />
          ) : null}

          {activeTab === 'about' ? (
            <AboutSettingsPanel
              version={version}
              platformLabel={platformLabel}
              checking={checking}
              updateChannel={updateChannel}
              updateInfo={updateInfo}
              onUpdateChannelChange={(channel) => void handleUpdateChannelChange(channel)}
              onCheckUpdate={() => void handleCheckUpdate()}
              onDownload={handleDownload}
              onRestart={() => api?.quitAndRestart()}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}
