import { cn } from '@shadowob/ui'
import {
  Globe,
  Info,
  Keyboard,
  Laptop2,
  type LucideIcon,
  Mic2,
  Settings,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  ShortcutRegistrationResult,
  TtsProvider,
  UpdateChannel,
  VoiceEngineStatus,
} from '../desktop-settings-types'
import {
  displayShortcut,
  shortcutActions,
  shortcutFromKeyboardEvent,
} from '../desktop-settings-utils'
import {
  createLatestIntentToggle,
  resolveLatestIntentToggleValue,
} from '../lib/latest-intent-toggle'
import type { DesktopPetAssetSettings } from '../pet-types'

const DESKTOP_SETTINGS_STORAGE_KEY = 'shadow:desktop-runtime-settings:v1'
const DEFAULT_DESKTOP_SERVER_BASE_URL = 'https://shadowob.com'

function connectorBuddyDirectMessagePath(channelId: string): string {
  const search = new URLSearchParams({
    builtin: 'my-buddies',
    dm: channelId,
  })
  return `/space?${search.toString()}`
}

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
  const ipc = window.desktopIPC
  if (!ipc) return null
  const events = (window as Window & { desktopAPI?: DesktopSettingsAPI }).desktopAPI
  return {
    platform: events?.platform ?? 'desktop',
    showCreateBuddy: () => ipc.window.showCreateBuddy(),
    showMainWindow: () => ipc.window.showMainWindow(),
    showCommunity: (path) => ipc.window.showCommunity(path),
    openCommunityLogin: (redirect) => ipc.window.openCommunityLogin(redirect),
    getCommunityAuthToken: () => ipc.community.getAuthToken(),
    getCommunityAuthTokens: () => ipc.community.getAuthTokens(),
    communityFetchJson: (<T = unknown>(
      input: Parameters<NonNullable<DesktopSettingsAPI['communityFetchJson']>>[0],
    ) => ipc.community.fetchJson(input) as Promise<T>) as DesktopSettingsAPI['communityFetchJson'],
    openExternal: (url) => ipc.window.openExternal(url),
    diagnostics: {
      getSnapshot: () => ipc.diagnostics.getSnapshot(),
      exportLogs: () => ipc.diagnostics.exportLogs(),
    },
    selectDirectory: (defaultPath) => ipc.window.selectDirectory({ defaultPath }),
    getVersion: () => ipc.app.getVersion(),
    checkForUpdate: () => ipc.updates.check(),
    getUpdateSettings: () => ipc.updates.getSettings(),
    setUpdateSettings: (settings) => ipc.updates.setSettings(settings),
    getUpdateState: () => ipc.updates.getState(),
    onUpdateState: events?.onUpdateState,
    downloadUpdate: (url) => ipc.updates.download(url),
    setOpenAtLogin: (value) => {
      void ipc.app.setOpenAtLogin(value)
    },
    getOpenAtLogin: () => ipc.app.getOpenAtLogin(),
    quitAndRestart: () => {
      void ipc.app.quitAndRestart()
    },
    getDesktopSettings: () => ipc.settings.get() as Promise<DesktopRuntimeSettings>,
    setDesktopSettings: (settings) => ipc.settings.set(settings) as Promise<DesktopRuntimeSettings>,
    petAssets: {
      importDirectory: (path) =>
        ipc.petAssets.importDirectory({ path }) as Promise<DesktopPetAssetSettings>,
      importMarketplace: (input) =>
        ipc.petAssets.importMarketplace(input) as Promise<DesktopPetAssetSettings>,
      setActive: (packId) =>
        ipc.petAssets.setActive({ packId }) as Promise<DesktopPetAssetSettings>,
      remove: (packId) => ipc.petAssets.remove({ packId }) as Promise<DesktopPetAssetSettings>,
    },
    reloadShortcuts: () => ipc.shortcuts.reload() as Promise<ShortcutRegistrationResult>,
    suspendShortcuts: () => ipc.shortcuts.suspend() as Promise<ShortcutRegistrationResult>,
    resumeShortcuts: () => ipc.shortcuts.resume() as Promise<ShortcutRegistrationResult>,
    connector: {
      getStatus: () => ipc.connector.getStatus() as Promise<ConnectorDaemonState>,
      start: (settings) => ipc.connector.start(settings ?? {}) as Promise<ConnectorDaemonState>,
      stop: () => ipc.connector.stop() as Promise<ConnectorDaemonState>,
      scan: () => ipc.connector.scan(),
      scanRuntimes: (input) =>
        ipc.connector.scanRuntimes(input ?? {}) as Promise<ConnectorRuntimeScanResult>,
      installRuntime: (input) =>
        ipc.connector.installRuntime(input) as ReturnType<
          NonNullable<DesktopSettingsAPI['connector']['installRuntime']>
        >,
      createBuddy: (input) =>
        ipc.connector.createBuddy(input) as Promise<ConnectorBuddyCreateResult>,
      getConnections: () => ipc.connector.getConnections() as Promise<ConnectorConnection[]>,
      setConnectionEnabled: (input) =>
        ipc.connector.setConnectionEnabled(input) as Promise<ConnectorConnection[]>,
      deleteConnection: (input) =>
        ipc.connector.deleteConnection(input) as Promise<ConnectorConnection[]>,
      setConnectionWorkDir: (input) =>
        ipc.connector.setConnectionWorkDir(input) as Promise<ConnectorConnection[]>,
    },
    pet: {
      voiceEngineStatus: () => ipc.petVoice.voiceEngineStatus(),
      installVoiceModel: (input) => ipc.petVoice.installVoiceModel(input),
    },
    onConnectorState: events?.onConnectorState,
    onConnectorRuntimeState: events?.onConnectorRuntimeState,
    onDesktopSettingsChanged: events?.onDesktopSettingsChanged,
    onSettingsTabRequest: events?.onSettingsTabRequest,
  }
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
  const [exportingLogs, setExportingLogs] = useState(false)
  const [exportedLogPath, setExportedLogPath] = useState<string | null>(null)
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
  const [connectorToggleBusy, setConnectorToggleBusy] = useState(false)
  const [connectorRunningTarget, setConnectorRunningTarget] = useState<boolean | null>(null)
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
    api?.connector
      .scanRuntimes?.()
      .then((result) => {
        setRuntimes(result.runtimes)
        setRuntimeSessions(result.runtimeSessions ?? null)
        setConnectorError('')
      })
      .catch((error) => {
        setConnectorError(error instanceof Error ? error.message : String(error))
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
      setConnectorError(
        (current) => state.lastError ?? (/^Runtime (?:session )?scan/.test(current) ? '' : current),
      )
    })
    const unsubscribeConnectorRuntimes = api?.onConnectorRuntimeState?.(
      (result: ConnectorRuntimeScanResult) => {
        setRuntimes(result.runtimes)
        setRuntimeSessions(result.runtimeSessions ?? null)
        setConnectorError((current) => (/^Runtime (?:session )?scan/.test(current) ? '' : current))
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

  const handleExportLogs = useCallback(async () => {
    if (!api?.diagnostics?.exportLogs) return
    setExportingLogs(true)
    setExportedLogPath(null)
    try {
      const result = await api.diagnostics.exportLogs()
      setExportedLogPath(result.filePath)
    } finally {
      setExportingLogs(false)
    }
  }, [api])

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

  const performConnectorRunningChange = useCallback(
    async (enabled: boolean) => {
      if (!api) throw new Error(t('desktop.connectorComputerUnavailable'))
      if (!enabled) return api.connector.stop()

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
      return state
    },
    [api, connectorApiKey, connectorAutoStart, httpProxy, httpsProxy, serverBaseUrl, t],
  )

  const connectorRunningOperationRef = useRef(performConnectorRunningChange)
  connectorRunningOperationRef.current = performConnectorRunningChange
  const connectorRunningIntentVersionRef = useRef(0)

  const connectorRunningToggleController = useMemo(
    () =>
      createLatestIntentToggle<ConnectorDaemonState>({
        execute: (enabled) => connectorRunningOperationRef.current(enabled),
        onIntent: (enabled) => {
          connectorRunningIntentVersionRef.current += 1
          setConnectorRunningTarget(enabled)
          setConnectorError('')
        },
        onExecutionResult: setConnectorState,
        onResult: (state) => {
          setConnectorRunningTarget(null)
          setConnectorError(state.lastError ?? '')
        },
        onError: async (error) => {
          const failedIntentVersion = connectorRunningIntentVersionRef.current
          setConnectorError(error instanceof Error ? error.message : String(error))
          const state = await api?.connector.getStatus().catch(() => null)
          if (connectorRunningIntentVersionRef.current !== failedIntentVersion) return
          if (state) setConnectorState(state)
          setConnectorRunningTarget(null)
        },
        onBusyChange: setConnectorToggleBusy,
      }),
    [api],
  )

  const connectorRunning = connectorState?.running === true
  const connectorRunningToggleChecked = resolveLatestIntentToggleValue(
    connectorRunning,
    connectorRunningTarget,
  )
  const connectorActionBusy = connectorBusy || connectorToggleBusy

  const handleConnectorRunningToggle = useCallback(
    (enabled: boolean) => {
      void connectorRunningToggleController.request(enabled)
    },
    [connectorRunningToggleController],
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
        await api.showCommunity(connectorBuddyDirectMessagePath(dmChannelId))
      }
    },
    [api, t],
  )

  const handleOpenConnectorBuddyDm = useCallback(
    async (connection: ConnectorConnection) => {
      if (
        !api?.communityFetchJson ||
        !api.showCommunity ||
        connectorConnectionBusyId ||
        connectorActionBusy ||
        connectorRunningToggleController.isBusy()
      ) {
        return
      }
      setConnectorConnectionBusyId(connection.agentId)
      setConnectorConnectionErrors((current) => {
        const next = { ...current }
        delete next[connection.agentId]
        return next
      })
      try {
        const agent = await api.communityFetchJson<ConnectorBuddyCreateResult['agent']>({
          path: `/api/agents/${encodeURIComponent(connection.agentId)}`,
        })
        const buddyUserId = connectorCreateResultBuddyUserId(agent)
        if (!buddyUserId) throw new Error(t('desktop.connectorBuddyDmMissingUser'))
        const dm = await api.communityFetchJson<{ id: string }>({
          path: '/api/channels/dm',
          method: 'POST',
          body: { userId: buddyUserId },
        })
        await api.showCommunity(connectorBuddyDirectMessagePath(dm.id))
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
    [api, connectorActionBusy, connectorConnectionBusyId, connectorRunningToggleController, t],
  )

  const handleCreateConnectorBuddy = useCallback(
    async (runtime: ConnectorRuntimeInfo, input: ConnectorBuddyCreateInput) => {
      if (
        !api?.connector.createBuddy ||
        connectorActionBusy ||
        connectorRunningToggleController.isBusy()
      ) {
        return
      }
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
          const connectionName = connection?.displayName || connection?.label || input.name
          const connectionRuntime = connection?.runtimeLabel || runtime.label
          if (result.connectionError || !connection || connection.runtimeId !== runtime.id) {
            const bindingError =
              result.connectionError ||
              t('desktop.connectorBuddyBindingMissing', { runtime: runtime.label })
            setConnectorError(bindingError)
            setConnectorConnectionErrors((current) => ({
              ...current,
              [createdAgentId]: bindingError,
            }))
            setConnectorNotice(
              t('desktop.connectorBuddyConnectionFailed', {
                name: connectionName,
                runtime: connectionRuntime,
              }),
            )
            throw new Error(bindingError)
          }
          setConnectorNotice(
            connection.status === 'running'
              ? t('desktop.connectorBuddyConnected', {
                  name: connectionName,
                  runtime: connectionRuntime,
                })
              : t('desktop.connectorBuddyConnecting', {
                  name: connectionName,
                  runtime: connectionRuntime,
                }),
          )
          window.setTimeout(() => {
            setHighlightedConnectionId((current) => (current === createdAgentId ? null : current))
          }, 8000)
          await openCreatedConnectorBuddyDm(runtime, input, result, connection)
        } else {
          const bindingError =
            result.connectionError ||
            t('desktop.connectorBuddyBindingMissing', { runtime: runtime.label })
          setConnectorError(bindingError)
          setConnectorNotice(
            t('desktop.connectorBuddyConnectionFailed', {
              name: input.name,
              runtime: runtime.label,
            }),
          )
          throw new Error(bindingError)
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
      connectorActionBusy,
      connectorRunning,
      connectorRunningToggleController,
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
      if (
        !api ||
        connectorConnectionBusyId ||
        connectorActionBusy ||
        connectorRunningToggleController.isBusy()
      ) {
        return
      }
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
      connectorActionBusy,
      connectorConnectionBusyId,
      connectorRunning,
      connectorRunningToggleController,
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
      if (
        connectorConnectionBusyId ||
        connectorActionBusy ||
        connectorRunningToggleController.isBusy()
      ) {
        return
      }
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
    [api, connectorActionBusy, connectorConnectionBusyId, connectorRunningToggleController, t],
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
    if (
      !api?.connector.scanRuntimes ||
      runtimeScanBusy ||
      connectorActionBusy ||
      connectorRunningToggleController.isBusy()
    ) {
      return
    }
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
  }, [api, connectorActionBusy, connectorRunningToggleController, runtimeScanBusy])

  const handleInstallRuntime = useCallback(
    async (runtime: ConnectorRuntimeInfo) => {
      if (
        !api?.connector.installRuntime ||
        runtimeInstallBusyIds.includes(runtime.id) ||
        connectorActionBusy ||
        connectorRunningToggleController.isBusy()
      ) {
        return
      }
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
    [api, connectorActionBusy, connectorRunningToggleController, runtimeInstallBusyIds, t],
  )

  const handleRuntimeNotificationToggle = useCallback(
    async (runtime: ConnectorRuntimeInfo, enabled: boolean) => {
      if (
        !api ||
        runtimeNotificationBusyIds.includes(runtime.id) ||
        connectorActionBusy ||
        connectorRunningToggleController.isBusy()
      ) {
        return
      }
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
    [
      api,
      connectorActionBusy,
      connectorRunningToggleController,
      connectorRuntimeNotifications,
      runtimeNotificationBusyIds,
    ],
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
    connectorToggleBusy ||
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
    { id: 'connector', label: t('desktop.tabConnector'), icon: Laptop2 },
    { id: 'shortcuts', label: t('desktop.tabShortcuts'), icon: Keyboard },
    { id: 'voice', label: t('desktop.tabVoice'), icon: Mic2 },
    { id: 'pet', label: t('desktop.tabPetAssets'), icon: Sparkles },
    { id: 'network', label: t('desktop.tabNetwork'), icon: Globe },
    { id: 'about', label: t('desktop.tabAbout'), icon: Info },
  ]

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-black text-text-primary">
      <header className="desktop-drag-titlebar desktop-settings-titlebar sticky top-0 z-20 shrink-0 border-b border-border-subtle bg-[#1f1f1f]/95 px-4 pb-3 pt-3">
        <div className="mx-auto flex max-w-4xl min-w-0 flex-col items-center gap-2">
          <h1 className="text-sm font-bold text-text-secondary">{t('desktop.settingsTitle')}</h1>
          <nav
            className="flex w-full max-w-full items-end gap-2 overflow-x-auto pb-1 sm:w-auto"
            aria-label={t('desktop.settingsTitle')}
          >
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
                    'flex min-w-[72px] shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition sm:min-w-[78px]',
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

      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
        <div
          className={cn(
            'mx-auto grid max-w-[920px] gap-4',
            activeTab === 'connector' && 'h-full min-h-0',
          )}
        >
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
              connectorRunningToggleChecked={connectorRunningToggleChecked}
              connectorBusy={connectorBusy}
              connectorToggleBusy={connectorToggleBusy}
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
              runtimeScanBusy={runtimeScanBusy}
              runtimeInstallBusyIds={runtimeInstallBusyIds}
              runtimeInstallErrorIds={runtimeInstallErrorIds}
              runtimeNotificationBusyIds={runtimeNotificationBusyIds}
              openExternal={api?.openExternal}
              onOpenShadow={() => void api?.showCommunity?.()}
              onOpenBuddyDm={(connection) => void handleOpenConnectorBuddyDm(connection)}
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
              exportingLogs={exportingLogs}
              exportedLogPath={exportedLogPath}
              onExportLogs={() => void handleExportLogs()}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}
