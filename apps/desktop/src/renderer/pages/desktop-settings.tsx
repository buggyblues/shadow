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
  ConnectorConnection,
  ConnectorDaemonState,
  ConnectorRuntimeInfo,
  DesktopRuntimeSettings,
  DesktopSettingsAPI,
  DesktopSettingsTab,
  DesktopShortcutAction,
  DesktopShortcutSettings,
  TtsProvider,
  VoiceEngineStatus,
} from '../desktop-settings-types'
import {
  displayShortcut,
  shortcutActions,
  shortcutFromKeyboardEvent,
} from '../desktop-settings-utils'
import type { DesktopPetAssetSettings } from '../pet-types'

const DESKTOP_SETTINGS_STORAGE_KEY = 'shadow:desktop-runtime-settings:v1'

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
      serverBaseUrl: settings.serverBaseUrl,
      httpProxy: settings.httpProxy,
      httpsProxy: settings.httpsProxy,
    }),
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
  const [serverBaseUrl, setServerBaseUrl] = useState('https://shadowob.com')
  const [httpProxy, setHttpProxy] = useState('')
  const [httpsProxy, setHttpsProxy] = useState('')
  const [connectorApiKey, setConnectorApiKey] = useState('')
  const [connectorAutoStart, setConnectorAutoStart] = useState(false)
  const [shortcuts, setShortcuts] = useState<DesktopShortcutSettings>({
    openCommunity: 'CommandOrControl+Alt+Shift+S',
    togglePet: 'CommandOrControl+Alt+Shift+P',
    petVoice: 'CommandOrControl+Alt+Shift+V',
    petChat: 'CommandOrControl+Alt+Shift+C',
    showNotifications: 'CommandOrControl+Alt+Shift+N',
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
  const [connectionWorkDirs, setConnectionWorkDirs] = useState<Record<string, string>>({})
  const [runtimes, setRuntimes] = useState<ConnectorRuntimeInfo[]>([])
  const [runtimesCollapsed, setRuntimesCollapsed] = useState(false)
  const [runtimeScanBusy, setRuntimeScanBusy] = useState(false)
  const [runtimeInstallBusyIds, setRuntimeInstallBusyIds] = useState<string[]>([])
  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean
    version: string
    downloadUrl: string
    releaseNotes: string
  } | null>(null)

  const refreshVoiceStatus = useCallback(async () => {
    const status = await api?.pet?.voiceEngineStatus?.().catch(() => null)
    if (status) setVoiceStatus(status)
    return status
  }, [api])

  useEffect(() => {
    api?.getVersion().then(setVersion)
    api?.getOpenAtLogin().then(setOpenAtLogin)
    api?.getUpdateSettings().then((s) => setAutoCheckOnLaunch(s.autoCheckOnLaunch))
    api?.getDesktopSettings().then((settings) => {
      setServerBaseUrl(settings.serverBaseUrl)
      setHttpProxy(settings.httpProxy)
      setHttpsProxy(settings.httpsProxy)
      setConnectorApiKey(settings.connectorApiKey)
      setConnectorAutoStart(settings.connectorAutoStart)
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
    api?.connector.scanRuntimes?.().then((result) => setRuntimes(result.runtimes))
    api?.connector.getConnections?.().then((connections) => {
      setConnectorState((state) => (state ? { ...state, connections } : state))
    })
    api?.getUpdateState().then((state) => {
      if (state.info) setUpdateInfo(state.info)
      setChecking(state.status === 'checking')
    })

    const unsubscribe = api?.onUpdateState?.((state) => {
      if (state.info) setUpdateInfo(state.info)
      setChecking(state.status === 'checking')
    })
    const unsubscribeConnector = api?.onConnectorState?.((state) => {
      setConnectorState(state)
      if (state.lastError) setConnectorError(state.lastError)
    })
    const unsubscribeSettings = api?.onDesktopSettingsChanged?.((settings) => {
      setPetAssetSettings({
        desktopPetActivePackId: settings.desktopPetActivePackId,
        desktopPetPacks: settings.desktopPetPacks,
      })
    })
    return () => {
      unsubscribe?.()
      unsubscribeConnector?.()
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

  const handleCreateConnectorBuddy = useCallback(async () => {
    if (!api || connectorBusy) return
    setConnectorBusy(true)
    setConnectorError('')
    try {
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
      await api.showCreateBuddy?.()
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

  const handleConnectorConnectionToggle = useCallback(
    async (connection: ConnectorConnection, enabled: boolean) => {
      if (!api || connectorConnectionBusyId) return
      setConnectorConnectionBusyId(connection.agentId)
      setConnectorError('')
      try {
        const connections = await api.connector.setConnectionEnabled({
          agentId: connection.agentId,
          enabled,
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
    try {
      const result = await api.connector.scanRuntimes()
      setRuntimes(result.runtimes)
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
      setConnectorError('')
      try {
        const result = await api.connector.installRuntime({ runtimeId: runtime.id })
        setRuntimes(result.runtimes)
      } catch (error) {
        setConnectorError(error instanceof Error ? error.message : String(error))
      } finally {
        setRuntimeInstallBusyIds((current) => current.filter((id) => id !== runtime.id))
      }
    },
    [api, runtimeInstallBusyIds],
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
  const connectorRunning = connectorState?.running === true
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
              connectorConnections={connectorConnections}
              connectorConnectionBusyId={connectorConnectionBusyId}
              connectionWorkDirs={connectionWorkDirs}
              runtimes={runtimes}
              runtimesCollapsed={runtimesCollapsed}
              runtimeScanBusy={runtimeScanBusy}
              runtimeInstallBusyIds={runtimeInstallBusyIds}
              openExternal={api?.openExternal}
              onConnectorRunningToggle={handleConnectorRunningToggle}
              onCreateConnectorBuddy={() => void handleCreateConnectorBuddy()}
              onConnectorConnectionToggle={(connection, enabled) =>
                void handleConnectorConnectionToggle(connection, enabled)
              }
              onChooseConnectionWorkDir={(connection) =>
                void handleChooseConnectionWorkDir(connection)
              }
              onToggleRuntimesCollapsed={() => setRuntimesCollapsed((value) => !value)}
              onScanRuntimes={() => void handleScanRuntimes()}
              onInstallRuntime={(runtime) => void handleInstallRuntime(runtime)}
            />
          ) : null}

          {activeTab === 'shortcuts' ? (
            <ShortcutsSettingsPanel
              platform={api?.platform}
              shortcuts={shortcuts}
              recordingShortcut={recordingShortcut}
              shortcutRegistrationError={shortcutRegistrationError}
              onRecordingShortcut={setRecordingShortcut}
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
              updateInfo={updateInfo}
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
