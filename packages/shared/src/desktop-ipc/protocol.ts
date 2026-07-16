import { z } from 'zod'
import {
  defineIPCProtocol,
  defineIPCService,
  type IPCClient,
  ipcProcedure,
  ipcVoidInputSchema,
  ipcVoidOutputSchema,
} from './rpc'
import {
  agentProcessIdSchema,
  asrAcceptSchema,
  badgeCountSchema,
  clipboardTextSchema,
  communityFetchJsonSchema,
  connectorConnectionEnabledSchema,
  connectorDeleteSchema,
  connectorStartSettingsSchema,
  connectorWorkDirSchema,
  createConnectorBuddySchema,
  type DesktopDiagnosticsSnapshot,
  type DesktopLogExportResult,
  type DesktopRuntimeSettingsSnapshot,
  type DesktopUpdateInfo,
  type DesktopUpdateSettings,
  type DesktopUpdateState,
  desktopNotificationSchema,
  desktopSettingsPatchSchema,
  desktopWindowChromeStateSchema,
  desktopWindowFullscreenInputSchema,
  downloadUpdateUrlSchema,
  externalUrlSchema,
  forceOptionsSchema,
  modelProxyStreamSchema,
  notificationModeSchema,
  openAtLoginSchema,
  openCommunityLoginInputSchema,
  optionalPathInputSchema,
  packIdInputSchema,
  petArchiveImportSchema,
  petCursorPositionSchema,
  petMarketplaceImportSchema,
  petPanelModeSchema,
  petWindowDragMoveSchema,
  petWindowDragStartSchema,
  petWindowMouseInteractiveSchema,
  petWindowPointerIdSchema,
  type ReaderStateSnapshot,
  readerIdInputSchema,
  readerOpenSchema,
  runtimeIdInputSchema,
  selectDirectorySchema,
  showCommunityInputSchema,
  showSettingsInputSchema,
  speechTextSchema,
  startAgentSchema,
  updateSettingsSchema,
  type VoiceEngineStatus,
  voiceModelInstallSchema,
} from './schema'

const desktopPlatformSchema = z.enum([
  'aix',
  'android',
  'darwin',
  'freebsd',
  'haiku',
  'linux',
  'openbsd',
  'sunos',
  'win32',
  'cygwin',
  'netbsd',
])

const desktopRuntimeSettingsSnapshotSchema = z.object({
  serverBaseUrl: z.string(),
  httpProxy: z.string(),
  httpsProxy: z.string(),
  connectorApiKey: z.string(),
  connectorComputerId: z.string(),
  connectorAutoStart: z.boolean(),
  connectorWorkDir: z.string(),
  connectorBuddyWorkDirs: z.record(z.string()),
  connectorRuntimeNotifications: z.record(z.boolean()),
  ttsProvider: z.enum(['system', 'moss-tts-nano', 'sherpa-local', 'voxcpm2']),
  asrProvider: z.enum(['sherpa-local', 'web-speech']),
  shortcuts: z.object({
    openCommunity: z.string(),
    togglePet: z.string(),
    petVoice: z.string(),
    petChat: z.string(),
    showNotifications: z.string(),
  }),
  desktopPetVisible: z.boolean(),
  desktopPetActivePackId: z.string(),
  desktopPetPacks: z.array(z.unknown()),
}) satisfies z.ZodType<DesktopRuntimeSettingsSnapshot>

const readerResourceSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceUrl: z.string(),
  displayAddress: z.string(),
  contentType: z.string(),
  fileName: z.string(),
  assetUrl: z.string(),
  createdAt: z.number(),
})

const readerStateSnapshotSchema = z.object({
  activeId: z.string().nullable(),
  tabs: z.array(readerResourceSnapshotSchema),
}) satisfies z.ZodType<ReaderStateSnapshot>

const desktopUpdateChannelSchema = z.enum(['production', 'beta'])

const desktopUpdateInfoSchema = z.object({
  hasUpdate: z.boolean(),
  version: z.string(),
  downloadUrl: z.string(),
  releaseNotes: z.string(),
  channel: desktopUpdateChannelSchema,
}) satisfies z.ZodType<DesktopUpdateInfo>

const desktopUpdateStateSchema = z.object({
  status: z.enum(['idle', 'checking', 'update-available', 'up-to-date', 'error']),
  checkedAt: z.number().nullable(),
  info: desktopUpdateInfoSchema.nullable(),
  error: z.string().nullable(),
  channel: desktopUpdateChannelSchema,
}) satisfies z.ZodType<DesktopUpdateState>

const desktopUpdateSettingsSchema = z.object({
  autoCheckOnLaunch: z.boolean(),
  channel: desktopUpdateChannelSchema,
}) satisfies z.ZodType<DesktopUpdateSettings>

const desktopDiagnosticsSnapshotSchema = z.object({
  appName: z.string(),
  version: z.string(),
  platform: desktopPlatformSchema,
  arch: z.string(),
  pid: z.number(),
  electron: z.string(),
  node: z.string(),
  buildId: z.string(),
  logFilePath: z.string(),
  logFileExists: z.boolean(),
  connector: z.object({
    serverBaseUrl: z.string(),
    cliPath: z.string().nullable(),
    cliBundled: z.boolean(),
    nodeBinary: z.string(),
    state: z.unknown(),
  }),
}) as z.ZodType<DesktopDiagnosticsSnapshot>

const desktopLogExportResultSchema = z.object({
  filePath: z.string().nullable(),
}) satisfies z.ZodType<DesktopLogExportResult>

const voiceProviderStatusSchema = z.object({
  installed: z.boolean(),
  runtimeInstalled: z.boolean().optional(),
  modelInstalled: z.boolean().optional(),
  name: z.string(),
  sourceUrl: z.string(),
})

const voiceEngineStatusSchema = z.object({
  engine: z.string(),
  asrProvider: z.enum(['sherpa-local', 'web-speech']),
  ttsProvider: z.enum(['system', 'moss-tts-nano', 'sherpa-local', 'voxcpm2']),
  nativeAddonAvailable: z.boolean(),
  modelRoot: z.string(),
  asr: voiceProviderStatusSchema,
  tts: voiceProviderStatusSchema,
  ttsProviders: z.object({
    system: voiceProviderStatusSchema,
    'moss-tts-nano': voiceProviderStatusSchema,
    'sherpa-local': voiceProviderStatusSchema,
    voxcpm2: voiceProviderStatusSchema,
  }),
}) satisfies z.ZodType<VoiceEngineStatus>

const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})

const agentStartResultSchema = z.object({
  id: z.string(),
  pid: z.number().optional(),
})

const agentStatusSchema = z.object({
  running: z.boolean(),
  name: z.string().optional(),
  pid: z.number().optional(),
  uptime: z.number().optional(),
})

const agentListSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    pid: z.number().optional(),
    running: z.boolean(),
    uptime: z.number(),
  }),
)

const connectorScanOutputSchema = z.object({
  output: z.string(),
})

const petPanelModeResultSchema = z.object({
  stageOffsetY: z.number(),
})

const modelProxyStreamResultSchema = z.object({
  text: z.string(),
})

const okResultSchema = z.object({
  ok: z.boolean(),
})

const textResultSchema = z.object({
  text: z.string(),
})

const unknownResultSchema = z.unknown()
const booleanResultSchema = z.boolean()
const stringResultSchema = z.string()
const nullableStringResultSchema = z.string().nullable()

const voidProcedure = () =>
  ipcProcedure({
    input: ipcVoidInputSchema,
    output: ipcVoidOutputSchema,
  })

const legacyProcedure = <
  const InputSchema extends z.ZodTypeAny,
  const OutputSchema extends z.ZodTypeAny,
>(
  channel: string,
  input: InputSchema,
  output: OutputSchema,
) =>
  ipcProcedure({
    channel,
    input,
    output,
  })

const legacyVoidProcedure = (channel: string) =>
  legacyProcedure(channel, ipcVoidInputSchema, ipcVoidOutputSchema)

export const desktopIpcProtocol = defineIPCProtocol({
  app: defineIPCService({
    getVersion: legacyProcedure('desktop:getVersion', ipcVoidInputSchema, stringResultSchema),
    setOpenAtLogin: legacyProcedure(
      'desktop:setOpenAtLogin',
      openAtLoginSchema,
      ipcVoidOutputSchema,
    ),
    getOpenAtLogin: legacyProcedure(
      'desktop:getOpenAtLogin',
      ipcVoidInputSchema,
      booleanResultSchema,
    ),
    quitAndRestart: legacyProcedure(
      'desktop:quitAndRestart',
      ipcVoidInputSchema,
      booleanResultSchema,
    ),
  }),
  window: defineIPCService({
    minimizeToTray: legacyVoidProcedure('desktop:minimizeToTray'),
    getChromeState: legacyProcedure(
      'desktop:window:chrome-state',
      ipcVoidInputSchema,
      desktopWindowChromeStateSchema,
    ),
    setFullScreen: legacyProcedure(
      'desktop:window:set-full-screen',
      desktopWindowFullscreenInputSchema,
      desktopWindowChromeStateSchema,
    ),
    openExternal: legacyProcedure('desktop:openExternal', externalUrlSchema, booleanResultSchema),
    writeClipboardText: legacyProcedure(
      'desktop:clipboard:writeText',
      clipboardTextSchema,
      booleanResultSchema,
    ),
    selectDirectory: legacyProcedure(
      'desktop:selectDirectory',
      selectDirectorySchema,
      nullableStringResultSchema,
    ),
    quit: legacyVoidProcedure('desktop:quit'),
    showMainWindow: legacyVoidProcedure('desktop:showMainWindow'),
    showCommunity: legacyProcedure(
      'desktop:showCommunity',
      showCommunityInputSchema,
      ipcVoidOutputSchema,
    ),
    openCommunityLogin: legacyProcedure(
      'desktop:openCommunityLogin',
      openCommunityLoginInputSchema,
      booleanResultSchema,
    ),
    showCreateBuddy: legacyVoidProcedure('desktop:showCreateBuddy'),
    showContextMenu: legacyVoidProcedure('desktop:showContextMenu'),
    showSettings: legacyProcedure(
      'desktop:showSettings',
      showSettingsInputSchema,
      ipcVoidOutputSchema,
    ),
  }),
  settings: defineIPCService({
    get: legacyProcedure(
      'desktop:getSettings',
      ipcVoidInputSchema,
      desktopRuntimeSettingsSnapshotSchema,
    ),
    set: legacyProcedure(
      'desktop:setSettings',
      desktopSettingsPatchSchema,
      desktopRuntimeSettingsSnapshotSchema,
    ),
  }),
  notifications: defineIPCService({
    show: legacyProcedure(
      'desktop:showNotification',
      desktopNotificationSchema,
      ipcVoidOutputSchema,
    ),
    setBadgeCount: legacyProcedure('desktop:setBadgeCount', badgeCountSchema, ipcVoidOutputSchema),
    setMode: legacyProcedure(
      'desktop:setNotificationMode',
      notificationModeSchema,
      ipcVoidOutputSchema,
    ),
  }),
  reader: defineIPCService({
    open: legacyProcedure('desktop:openReader', readerOpenSchema, booleanResultSchema),
    getState: legacyProcedure(
      'desktop:reader:getState',
      ipcVoidInputSchema,
      readerStateSnapshotSchema,
    ),
    activate: legacyProcedure(
      'desktop:reader:activate',
      readerIdInputSchema,
      readerStateSnapshotSchema,
    ),
    close: legacyProcedure('desktop:reader:close', readerIdInputSchema, readerStateSnapshotSchema),
    openDefault: legacyProcedure(
      'desktop:reader:openDefault',
      readerIdInputSchema,
      booleanResultSchema,
    ),
  }),
  community: defineIPCService({
    getAuthToken: legacyProcedure(
      'desktop:getCommunityAuthToken',
      ipcVoidInputSchema,
      stringResultSchema,
    ),
    getAuthTokens: legacyProcedure(
      'desktop:getCommunityAuthTokens',
      ipcVoidInputSchema,
      authTokensSchema,
    ),
    fetchJson: legacyProcedure(
      'desktop:community:fetchJson',
      communityFetchJsonSchema,
      unknownResultSchema,
    ),
  }),
  diagnostics: defineIPCService({
    getSnapshot: ipcProcedure({
      input: ipcVoidInputSchema,
      output: desktopDiagnosticsSnapshotSchema,
    }),
    exportLogs: ipcProcedure({
      input: ipcVoidInputSchema,
      output: desktopLogExportResultSchema,
    }),
  }),
  petWindow: defineIPCService({
    show: legacyVoidProcedure('desktop:pet:show'),
    hide: legacyVoidProcedure('desktop:pet:hide'),
    getCursorPosition: legacyProcedure(
      'desktop:pet:cursor-position',
      ipcVoidInputSchema,
      petCursorPositionSchema,
    ),
    setPanelMode: legacyProcedure(
      'desktop:pet:panel-mode',
      petPanelModeSchema,
      petPanelModeResultSchema,
    ),
    beginWindowDrag: legacyProcedure(
      'desktop:pet:begin-window-drag',
      petWindowDragStartSchema,
      ipcVoidOutputSchema,
    ),
    moveWindow: legacyProcedure(
      'desktop:pet:move-window',
      petWindowDragMoveSchema,
      ipcVoidOutputSchema,
    ),
    endWindowDrag: legacyProcedure(
      'desktop:pet:end-window-drag',
      petWindowPointerIdSchema,
      ipcVoidOutputSchema,
    ),
    setMouseInteractive: legacyProcedure(
      'desktop:pet:mouse-interactive',
      petWindowMouseInteractiveSchema,
      ipcVoidOutputSchema,
    ),
  }),
  petModel: defineIPCService({
    modelProxyStream: legacyProcedure(
      'desktop:pet:modelProxyStream',
      modelProxyStreamSchema,
      modelProxyStreamResultSchema,
    ),
  }),
  petVoice: defineIPCService({
    speak: legacyProcedure('desktop:pet:speak', speechTextSchema, booleanResultSchema),
    cancelSpeech: legacyVoidProcedure('desktop:pet:cancelSpeech'),
    voiceEngineStatus: legacyProcedure(
      'desktop:pet:voiceEngineStatus',
      ipcVoidInputSchema,
      voiceEngineStatusSchema,
    ),
    prewarmVoice: legacyProcedure(
      'desktop:pet:prewarmVoice',
      ipcVoidInputSchema,
      booleanResultSchema,
    ),
    installVoiceModel: legacyProcedure(
      'desktop:pet:installVoiceModel',
      voiceModelInstallSchema,
      voiceEngineStatusSchema,
    ),
    asrStart: legacyProcedure('desktop:pet:asrStart', ipcVoidInputSchema, okResultSchema),
    asrAccept: legacyProcedure('desktop:pet:asrAccept', asrAcceptSchema, okResultSchema),
    asrStop: legacyProcedure('desktop:pet:asrStop', ipcVoidInputSchema, textResultSchema),
  }),
  agents: defineIPCService({
    start: legacyProcedure('desktop:startAgent', startAgentSchema, agentStartResultSchema),
    stop: legacyProcedure('desktop:stopAgent', agentProcessIdSchema, ipcVoidOutputSchema),
    getStatus: legacyProcedure('desktop:getAgentStatus', agentProcessIdSchema, agentStatusSchema),
    list: legacyProcedure('desktop:listAgents', ipcVoidInputSchema, agentListSchema),
  }),
  updates: defineIPCService({
    check: legacyProcedure('desktop:checkForUpdate', ipcVoidInputSchema, desktopUpdateInfoSchema),
    getState: legacyProcedure(
      'desktop:getUpdateState',
      ipcVoidInputSchema,
      desktopUpdateStateSchema,
    ),
    getSettings: legacyProcedure(
      'desktop:getUpdateSettings',
      ipcVoidInputSchema,
      desktopUpdateSettingsSchema,
    ),
    setSettings: legacyProcedure(
      'desktop:setUpdateSettings',
      updateSettingsSchema,
      desktopUpdateSettingsSchema,
    ),
    download: legacyProcedure(
      'desktop:downloadUpdate',
      downloadUpdateUrlSchema,
      booleanResultSchema,
    ),
  }),
  petAssets: defineIPCService({
    importDirectory: legacyProcedure(
      'desktop:petAssets:importDirectory',
      optionalPathInputSchema,
      unknownResultSchema,
    ),
    importMarketplace: legacyProcedure(
      'desktop:petAssets:importMarketplace',
      petMarketplaceImportSchema,
      unknownResultSchema,
    ),
    importArchiveBuffer: legacyProcedure(
      'desktop:petAssets:importArchiveBuffer',
      petArchiveImportSchema,
      unknownResultSchema,
    ),
    setActive: legacyProcedure(
      'desktop:petAssets:setActive',
      packIdInputSchema,
      unknownResultSchema,
    ),
    remove: legacyProcedure('desktop:petAssets:remove', packIdInputSchema, unknownResultSchema),
  }),
  connector: defineIPCService({
    getStatus: legacyProcedure(
      'desktop:connector:getStatus',
      ipcVoidInputSchema,
      unknownResultSchema,
    ),
    start: legacyProcedure(
      'desktop:connector:start',
      connectorStartSettingsSchema,
      unknownResultSchema,
    ),
    stop: legacyProcedure('desktop:connector:stop', ipcVoidInputSchema, unknownResultSchema),
    scan: legacyProcedure('desktop:connector:scan', ipcVoidInputSchema, connectorScanOutputSchema),
    scanRuntimes: legacyProcedure(
      'desktop:connector:scanRuntimes',
      forceOptionsSchema,
      unknownResultSchema,
    ),
    scanRuntimeSessions: legacyProcedure(
      'desktop:connector:scanRuntimeSessions',
      forceOptionsSchema,
      unknownResultSchema,
    ),
    installRuntime: legacyProcedure(
      'desktop:connector:installRuntime',
      runtimeIdInputSchema,
      unknownResultSchema,
    ),
    createBuddy: legacyProcedure(
      'desktop:connector:createBuddy',
      createConnectorBuddySchema,
      unknownResultSchema,
    ),
    getConnections: legacyProcedure(
      'desktop:connector:getConnections',
      ipcVoidInputSchema,
      unknownResultSchema,
    ),
    setConnectionEnabled: legacyProcedure(
      'desktop:connector:setConnectionEnabled',
      connectorConnectionEnabledSchema,
      unknownResultSchema,
    ),
    deleteConnection: legacyProcedure(
      'desktop:connector:deleteConnection',
      connectorDeleteSchema,
      unknownResultSchema,
    ),
    setConnectionWorkDir: legacyProcedure(
      'desktop:connector:setConnectionWorkDir',
      connectorWorkDirSchema,
      unknownResultSchema,
    ),
  }),
  shortcuts: defineIPCService({
    reload: legacyProcedure('desktop:shortcuts:reload', ipcVoidInputSchema, unknownResultSchema),
    suspend: legacyProcedure('desktop:shortcuts:suspend', ipcVoidInputSchema, unknownResultSchema),
    resume: legacyProcedure('desktop:shortcuts:resume', ipcVoidInputSchema, unknownResultSchema),
  }),
})

export type DesktopIpcProtocol = typeof desktopIpcProtocol
export type DesktopIPCApi = IPCClient<DesktopIpcProtocol>
