import { z } from 'zod'

export type DesktopPlatform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'
export type DesktopTtsProvider = 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'

const ipcObjectSchema = z.preprocess(
  (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  z.object({}).passthrough(),
)

const optionalStringSchema = z.string().optional()
const optionalBooleanSchema = z.boolean().optional()
const optionalTrimmedStringSchema = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional()

function requiredTrimmedStringSchema(field: string): z.ZodString {
  return z
    .string({ required_error: `Missing ${field}`, invalid_type_error: `Missing ${field}` })
    .trim()
    .min(1, `Missing ${field}`)
}

export const connectorStartSettingsSchema = ipcObjectSchema.pipe(
  z.object({
    connectorApiKey: optionalStringSchema,
    connectorComputerId: optionalStringSchema,
    connectorAutoStart: optionalBooleanSchema,
    connectorWorkDir: optionalStringSchema,
    httpProxy: optionalStringSchema,
    httpsProxy: optionalStringSchema,
    serverBaseUrl: optionalStringSchema,
  }),
)

export type ConnectorStartSettingsInput = z.infer<typeof connectorStartSettingsSchema>

export const forceOptionsSchema = ipcObjectSchema.pipe(
  z.object({
    force: optionalBooleanSchema,
  }),
)

export type ForceOptionsInput = z.infer<typeof forceOptionsSchema>

export const desktopWindowFullscreenInputSchema = z.boolean()

export type DesktopWindowFullscreenInput = z.infer<typeof desktopWindowFullscreenInputSchema>

export const desktopWindowChromeStateSchema = z.object({
  fullscreen: z.boolean(),
  maximized: z.boolean(),
})

export type DesktopWindowChromeState = z.infer<typeof desktopWindowChromeStateSchema>

export const runtimeIdInputSchema = ipcObjectSchema.pipe(
  z.object({
    runtimeId: requiredTrimmedStringSchema('runtime id'),
  }),
)

export type RuntimeIdInput = z.infer<typeof runtimeIdInputSchema>

export const createConnectorBuddySchema = ipcObjectSchema.pipe(
  z.object({
    runtimeId: requiredTrimmedStringSchema('runtime id'),
    name: requiredTrimmedStringSchema('Buddy name'),
    username: requiredTrimmedStringSchema('Buddy username'),
    description: optionalTrimmedStringSchema,
    avatarUrl: optionalTrimmedStringSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  }),
)

export type CreateConnectorBuddyInput = z.infer<typeof createConnectorBuddySchema>

export const connectorConnectionEnabledSchema = ipcObjectSchema.pipe(
  z.object({
    agentId: requiredTrimmedStringSchema('Buddy id'),
    enabled: z.boolean().catch(false),
  }),
)

export type ConnectorConnectionEnabledInput = z.infer<typeof connectorConnectionEnabledSchema>

export const connectorDeleteSchema = ipcObjectSchema.pipe(
  z.object({
    agentId: requiredTrimmedStringSchema('Buddy id'),
    deleteCloudBuddy: optionalBooleanSchema,
  }),
)

export type ConnectorDeleteInput = z.infer<typeof connectorDeleteSchema>

export const connectorWorkDirSchema = ipcObjectSchema.pipe(
  z.object({
    agentId: requiredTrimmedStringSchema('Buddy id'),
    workDir: optionalStringSchema,
  }),
)

export type ConnectorWorkDirInput = z.infer<typeof connectorWorkDirSchema>

const desktopPetAssetSpriteSchema = z
  .object({
    src: z.string(),
    frame: z
      .object({
        width: z.number(),
        height: z.number(),
        count: z.number(),
        fps: z.number(),
      })
      .optional(),
    atlas: z
      .object({
        columns: z.number(),
        rows: z.number(),
        row: z.number(),
      })
      .optional(),
    loop: z.boolean().optional(),
  })
  .passthrough()

const desktopPetAssetPackSchema = z
  .object({
    id: z.string(),
    version: z.string().optional(),
    spriteVersionNumber: z.union([z.literal(1), z.literal(2)]).default(1),
    displayName: z.record(z.string()),
    description: z.union([z.record(z.string()), z.string()]).optional(),
    spritesheetPath: z.string(),
    sprites: z.record(desktopPetAssetSpriteSchema),
    importedAt: z.string(),
    source: z.enum(['local', 'marketplace']),
    sourcePath: z.string(),
    marketplaceProductId: z.string().optional(),
    marketplaceEntitlementId: z.string().optional(),
    marketplacePaidFileId: z.string().optional(),
  })
  .passthrough()

const desktopShortcutSettingsSchema = z.object({
  openCommunity: z.string(),
  togglePet: z.string(),
  petVoice: z.string(),
  petChat: z.string(),
  showNotifications: z.string(),
})

export const desktopSettingsPatchSchema = ipcObjectSchema.pipe(
  z.object({
    serverBaseUrl: z.string().optional(),
    httpProxy: z.string().optional(),
    httpsProxy: z.string().optional(),
    connectorApiKey: z.string().optional(),
    connectorComputerId: z.string().optional(),
    connectorAutoStart: z.boolean().optional(),
    connectorWorkDir: z.string().optional(),
    connectorBuddyWorkDirs: z.record(z.string()).optional(),
    connectorDeletedConnectionIds: z.array(z.string()).optional(),
    connectorRuntimeNotifications: z.record(z.boolean()).optional(),
    ttsProvider: z.enum(['system', 'moss-tts-nano', 'sherpa-local', 'voxcpm2']).optional(),
    asrProvider: z.enum(['sherpa-local', 'web-speech']).optional(),
    desktopPetVisible: z.boolean().optional(),
    desktopPetPacks: z.array(z.record(z.unknown())).optional(),
    desktopPetActivePackId: z.string().optional(),
    shortcuts: desktopShortcutSettingsSchema.partial().optional(),
  }),
)

export type DesktopSettingsPatchInput = z.infer<typeof desktopSettingsPatchSchema>

export const optionalPathInputSchema = ipcObjectSchema.pipe(
  z.object({
    path: optionalStringSchema,
  }),
)

export type OptionalPathInput = z.infer<typeof optionalPathInputSchema>

export const petMarketplaceImportSchema = ipcObjectSchema.pipe(
  z.object({
    entitlementId: optionalStringSchema,
    fileId: requiredTrimmedStringSchema('paid file id'),
    productId: optionalStringSchema,
  }),
)

export type PetMarketplaceImportInput = z.infer<typeof petMarketplaceImportSchema>

export const petArchiveImportSchema = ipcObjectSchema.pipe(
  z.object({
    name: z.unknown().optional(),
    data: z.unknown().optional(),
  }),
)

export type PetArchiveImportInput = z.infer<typeof petArchiveImportSchema>

export const packIdInputSchema = ipcObjectSchema.pipe(
  z.object({
    packId: z.string().optional().default(''),
  }),
)

export type PackIdInput = z.infer<typeof packIdInputSchema>

export const startAgentSchema = z.object({
  name: z.string().min(1).max(120),
  scriptPath: z.string().min(1),
  args: z.array(z.string()).optional(),
})

export type StartAgentInput = z.infer<typeof startAgentSchema>

export const agentProcessIdSchema = z.string().min(1)

export type AgentProcessIdInput = z.infer<typeof agentProcessIdSchema>

export const desktopNotificationSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000),
  channelId: z.string().optional(),
  messageId: z.string().optional(),
  routePath: z.string().optional(),
  target: z.enum(['community', 'pet']).optional(),
})

export type DesktopNotificationInput = z.infer<typeof desktopNotificationSchema>

export const badgeCountSchema = z.number().int().min(0).max(9999).catch(0)

export type BadgeCountInput = z.infer<typeof badgeCountSchema>

export const notificationModeSchema = z.string().max(80)

export type NotificationModeInput = z.infer<typeof notificationModeSchema>

export const updateSettingsSchema = z.object({
  autoCheckOnLaunch: z.boolean().optional(),
  channel: z.enum(['production', 'beta']).optional(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

export const downloadUpdateUrlSchema = z.string().url()

export type DownloadUpdateUrlInput = z.infer<typeof downloadUpdateUrlSchema>

export const openAtLoginSchema = z.boolean()

export type OpenAtLoginInput = z.infer<typeof openAtLoginSchema>

export const voiceModelInstallSchema = ipcObjectSchema.pipe(
  z.object({
    provider: z.enum(['system', 'moss-tts-nano', 'sherpa-local', 'voxcpm2']).optional(),
  }),
)

export type VoiceModelInstallInput = z.infer<typeof voiceModelInstallSchema>

export const asrAcceptSchema = z.object({
  samples: z.instanceof(ArrayBuffer),
  sampleRate: z.number().positive(),
})

export type AsrAcceptInput = z.infer<typeof asrAcceptSchema>

export const speechTextSchema = z.string().max(8000)

export type SpeechTextInput = z.infer<typeof speechTextSchema>

export const rendererLogSchema = z
  .object({
    scope: z.string(),
    payload: z.unknown().optional(),
  })
  .passthrough()

export type RendererLogInput = z.infer<typeof rendererLogSchema>

export const externalUrlSchema = z.string()

export type ExternalUrlInput = z.infer<typeof externalUrlSchema>

export const clipboardTextSchema = z.string()

export type ClipboardTextInput = z.infer<typeof clipboardTextSchema>

export const readerOpenSchema = ipcObjectSchema.pipe(
  z.object({
    url: z.string().optional(),
    title: z.string().optional(),
    useDefaultApp: z.boolean().optional(),
    attachmentId: z.string().optional(),
  }),
)

export type ReaderOpenInput = z.infer<typeof readerOpenSchema>

export const readerIdInputSchema = ipcObjectSchema.pipe(
  z.object({
    id: z.string().optional().default(''),
  }),
)

export type ReaderIdInput = z.infer<typeof readerIdInputSchema>

export const selectDirectorySchema = ipcObjectSchema.pipe(
  z.object({
    defaultPath: z.string().optional(),
  }),
)

export type SelectDirectoryInput = z.infer<typeof selectDirectorySchema>

const communityAuthSnapshotReasonSchema = z.enum([
  'startup',
  'storage',
  'sync',
  'login',
  'refresh',
  'logout',
  'settings',
  'revoked',
])

export const communityAuthSnapshotSchema = ipcObjectSchema.pipe(
  z.object({
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    reason: communityAuthSnapshotReasonSchema.optional().default('sync'),
    sourceUrl: z.string().optional(),
  }),
)

export type CommunityAuthSnapshotInput = z.infer<typeof communityAuthSnapshotSchema>

export const communityFetchJsonSchema = z.object({
  path: z.string().min(1),
  method: z.string().optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string()).optional(),
  optional: z.boolean().optional(),
})

export type CommunityFetchJsonInput = z.infer<typeof communityFetchJsonSchema>

export const modelProxyStreamSchema = z.object({
  requestId: z.string().min(1),
  body: z.record(z.unknown()),
})

export type ModelProxyStreamInput = z.infer<typeof modelProxyStreamSchema>

function optionalStringValueFromPathInput(
  value: unknown,
  key: 'path' | 'redirect' | 'tab',
): string | undefined {
  if (typeof value === 'string') return value
  const parsed = ipcObjectSchema.pipe(z.object({ [key]: z.string().optional() })).parse(value)
  return parsed[key]
}

export type ShowCommunityIpcInput = string | { path?: string } | undefined
export const showCommunityInputSchema = z
  .unknown()
  .transform((value) => optionalStringValueFromPathInput(value, 'path')) as z.ZodType<
  string | undefined,
  z.ZodTypeDef,
  ShowCommunityIpcInput
>

export type ShowCommunityInput = z.infer<typeof showCommunityInputSchema>

export type OpenCommunityLoginIpcInput = string | { redirect?: string } | undefined
export const openCommunityLoginInputSchema = z
  .unknown()
  .transform(
    (value) => optionalStringValueFromPathInput(value, 'redirect') ?? '/discover',
  ) as z.ZodType<string, z.ZodTypeDef, OpenCommunityLoginIpcInput>

export type OpenCommunityLoginInput = z.infer<typeof openCommunityLoginInputSchema>

export type ShowSettingsIpcInput = string | { tab?: string } | undefined
export const showSettingsInputSchema = z
  .unknown()
  .transform((value) => optionalStringValueFromPathInput(value, 'tab')) as z.ZodType<
  string | undefined,
  z.ZodTypeDef,
  ShowSettingsIpcInput
>

export type ShowSettingsInput = z.infer<typeof showSettingsInputSchema>

export const petPanelModeSchema = z.enum(['compact', 'expanded'])

export type PetPanelModeInput = z.infer<typeof petPanelModeSchema>

export const petWindowDragStartSchema = ipcObjectSchema.pipe(
  z.object({
    pointerId: z.number().optional(),
    screenX: z.number().optional(),
    screenY: z.number().optional(),
  }),
)

export type PetWindowDragStartInput = z.infer<typeof petWindowDragStartSchema>

export const petWindowDragMoveSchema = ipcObjectSchema.pipe(
  z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    pointerId: z.number().optional(),
    screenX: z.number().optional(),
    screenY: z.number().optional(),
  }),
)

export type PetWindowDragMoveInput = z.infer<typeof petWindowDragMoveSchema>

export const petWindowPointerIdSchema = z.number().optional()

export type PetWindowPointerIdInput = z.infer<typeof petWindowPointerIdSchema>

export const petWindowMouseInteractiveSchema = z.boolean()

export type PetWindowMouseInteractiveInput = z.infer<typeof petWindowMouseInteractiveSchema>

export const petCursorPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export type PetCursorPosition = z.infer<typeof petCursorPositionSchema>

export type ReaderResourceSnapshot = {
  id: string
  title: string
  sourceUrl: string
  displayAddress: string
  contentType: string
  fileName: string
  assetUrl: string
  createdAt: number
}

export type ReaderStateSnapshot = {
  activeId: string | null
  tabs: ReaderResourceSnapshot[]
}

export type DesktopUpdateChannel = 'production' | 'beta'

export type DesktopUpdateInfo = {
  hasUpdate: boolean
  version: string
  downloadUrl: string
  releaseNotes: string
  channel: DesktopUpdateChannel
}

export type DesktopUpdateState = {
  status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error'
  checkedAt: number | null
  info: DesktopUpdateInfo | null
  error: string | null
  channel: DesktopUpdateChannel
}

export type DesktopUpdateSettings = {
  autoCheckOnLaunch: boolean
  channel: DesktopUpdateChannel
}

export type DesktopDiagnosticsSnapshot = {
  appName: string
  version: string
  platform: DesktopPlatform
  arch: string
  pid: number
  electron: string
  node: string
  buildId: string
  logFilePath: string
  logFileExists: boolean
  connector: {
    serverBaseUrl: string
    cliPath: string | null
    cliBundled: boolean
    nodeBinary: string
    state: unknown
  }
}

export type DesktopLogExportResult = {
  filePath: string | null
}

export type VoiceEngineStatus = {
  engine: string
  asrProvider: 'sherpa-local' | 'web-speech'
  ttsProvider: DesktopTtsProvider
  nativeAddonAvailable: boolean
  modelRoot: string
  asr: { installed: boolean; name: string; sourceUrl: string }
  tts: { installed: boolean; name: string; sourceUrl: string }
  ttsProviders: Record<
    DesktopTtsProvider,
    {
      installed: boolean
      runtimeInstalled?: boolean
      modelInstalled?: boolean
      name: string
      sourceUrl: string
    }
  >
}

export type DesktopRuntimeSettingsSnapshot = {
  serverBaseUrl: string
  httpProxy: string
  httpsProxy: string
  connectorApiKey: string
  connectorComputerId: string
  connectorAutoStart: boolean
  connectorWorkDir: string
  connectorBuddyWorkDirs: Record<string, string>
  connectorRuntimeNotifications: Record<string, boolean>
  ttsProvider: DesktopTtsProvider
  asrProvider: 'sherpa-local' | 'web-speech'
  shortcuts: {
    openCommunity: string
    togglePet: string
    petVoice: string
    petChat: string
    showNotifications: string
  }
  desktopPetVisible: boolean
  desktopPetActivePackId: string
  desktopPetPacks: unknown[]
}

export type DesktopIpcInvokeMap = {
  'desktop:getSettings': { input: void; result: DesktopRuntimeSettingsSnapshot }
  'desktop:setSettings': {
    input: DesktopSettingsPatchInput
    result: DesktopRuntimeSettingsSnapshot
  }
  'desktop:showNotification': { input: DesktopNotificationInput; result: void }
  'desktop:setBadgeCount': { input: BadgeCountInput; result: void }
  'desktop:setNotificationMode': { input: NotificationModeInput; result: void }
  'desktop:minimizeToTray': { input: void; result: void }
  'desktop:window:chrome-state': { input: void; result: DesktopWindowChromeState }
  'desktop:window:set-full-screen': {
    input: DesktopWindowFullscreenInput
    result: DesktopWindowChromeState
  }
  'desktop:openExternal': { input: ExternalUrlInput; result: boolean }
  'desktop:clipboard:writeText': { input: ClipboardTextInput; result: boolean }
  'desktop:openReader': { input: ReaderOpenInput; result: boolean }
  'desktop:reader:getState': { input: void; result: ReaderStateSnapshot }
  'desktop:reader:activate': { input: ReaderIdInput; result: ReaderStateSnapshot }
  'desktop:reader:close': { input: ReaderIdInput; result: ReaderStateSnapshot }
  'desktop:reader:openDefault': { input: ReaderIdInput; result: boolean }
  'desktop:selectDirectory': { input: SelectDirectoryInput; result: string | null }
  'desktop:quit': { input: void; result: void }
  'desktop:getCommunityAuthToken': { input: void; result: string }
  'desktop:getCommunityAuthTokens': {
    input: void
    result: { accessToken: string; refreshToken: string }
  }
  'desktop:community:fetchJson': { input: CommunityFetchJsonInput; result: unknown }
  'desktop:diagnostics:getSnapshot': { input: void; result: DesktopDiagnosticsSnapshot }
  'desktop:diagnostics:exportLogs': { input: void; result: DesktopLogExportResult }
  'desktop:showMainWindow': { input: void; result: void }
  'desktop:showCommunity': { input: ShowCommunityIpcInput; result: void }
  'desktop:openCommunityLogin': { input: OpenCommunityLoginIpcInput; result: boolean }
  'desktop:showCreateBuddy': { input: void; result: void }
  'desktop:showContextMenu': { input: void; result: void }
  'desktop:showSettings': { input: ShowSettingsIpcInput; result: void }
  'desktop:pet:show': { input: void; result: void }
  'desktop:pet:hide': { input: void; result: void }
  'desktop:pet:cursor-position': { input: void; result: PetCursorPosition }
  'desktop:pet:panel-mode': { input: PetPanelModeInput; result: { stageOffsetY: number } }
  'desktop:pet:begin-window-drag': { input: PetWindowDragStartInput; result: void }
  'desktop:pet:move-window': { input: PetWindowDragMoveInput; result: void }
  'desktop:pet:end-window-drag': { input: PetWindowPointerIdInput; result: void }
  'desktop:pet:mouse-interactive': { input: PetWindowMouseInteractiveInput; result: void }
  'desktop:pet:modelProxyStream': { input: ModelProxyStreamInput; result: { text: string } }
  'desktop:pet:speak': { input: SpeechTextInput; result: boolean }
  'desktop:pet:cancelSpeech': { input: void; result: void }
  'desktop:pet:voiceEngineStatus': { input: void; result: VoiceEngineStatus }
  'desktop:pet:prewarmVoice': { input: void; result: boolean }
  'desktop:pet:installVoiceModel': { input: VoiceModelInstallInput; result: VoiceEngineStatus }
  'desktop:pet:asrStart': { input: void; result: { ok: boolean } }
  'desktop:pet:asrAccept': { input: AsrAcceptInput; result: { ok: boolean } }
  'desktop:pet:asrStop': { input: void; result: { text: string } }
  'desktop:startAgent': { input: StartAgentInput; result: { id: string; pid?: number } }
  'desktop:stopAgent': { input: AgentProcessIdInput; result: void }
  'desktop:getAgentStatus': {
    input: AgentProcessIdInput
    result: { running: boolean; name?: string; pid?: number; uptime?: number }
  }
  'desktop:listAgents': {
    input: void
    result: Array<{ id: string; name: string; pid?: number; running: boolean; uptime: number }>
  }
  'desktop:getVersion': { input: void; result: string }
  'desktop:checkForUpdate': { input: void; result: DesktopUpdateInfo }
  'desktop:getUpdateState': { input: void; result: DesktopUpdateState }
  'desktop:getUpdateSettings': { input: void; result: DesktopUpdateSettings }
  'desktop:setUpdateSettings': { input: UpdateSettingsInput; result: DesktopUpdateSettings }
  'desktop:downloadUpdate': { input: DownloadUpdateUrlInput; result: boolean }
  'desktop:setOpenAtLogin': { input: OpenAtLoginInput; result: void }
  'desktop:getOpenAtLogin': { input: void; result: boolean }
  'desktop:quitAndRestart': { input: void; result: boolean }
  'desktop:petAssets:importDirectory': { input: OptionalPathInput; result: unknown }
  'desktop:petAssets:importMarketplace': { input: PetMarketplaceImportInput; result: unknown }
  'desktop:petAssets:importArchiveBuffer': { input: PetArchiveImportInput; result: unknown }
  'desktop:petAssets:setActive': { input: PackIdInput; result: unknown }
  'desktop:petAssets:remove': { input: PackIdInput; result: unknown }
  'desktop:connector:getStatus': { input: void; result: unknown }
  'desktop:connector:start': { input: ConnectorStartSettingsInput; result: unknown }
  'desktop:connector:stop': { input: void; result: unknown }
  'desktop:connector:scan': { input: void; result: { output: string } }
  'desktop:connector:scanRuntimes': { input: ForceOptionsInput; result: unknown }
  'desktop:connector:scanRuntimeSessions': { input: ForceOptionsInput; result: unknown }
  'desktop:connector:installRuntime': { input: RuntimeIdInput; result: unknown }
  'desktop:connector:createBuddy': { input: CreateConnectorBuddyInput; result: unknown }
  'desktop:connector:getConnections': { input: void; result: unknown }
  'desktop:connector:setConnectionEnabled': {
    input: ConnectorConnectionEnabledInput
    result: unknown
  }
  'desktop:connector:deleteConnection': { input: ConnectorDeleteInput; result: unknown }
  'desktop:connector:setConnectionWorkDir': { input: ConnectorWorkDirInput; result: unknown }
  'desktop:shortcuts:reload': { input: void; result: unknown }
  'desktop:shortcuts:suspend': { input: void; result: unknown }
  'desktop:shortcuts:resume': { input: void; result: unknown }
}

export type DesktopIpcInvokeChannel = keyof DesktopIpcInvokeMap
export type DesktopIpcInvokeInput<C extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[C]['input']
export type DesktopIpcInvokeResult<C extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[C]['result']
export type DesktopIpcInvokeArgs<C extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeInput<C> extends void ? [] : [DesktopIpcInvokeInput<C>]
export type DesktopIpcInvokeFn = <C extends DesktopIpcInvokeChannel>(
  channel: C,
  ...args: DesktopIpcInvokeArgs<C>
) => Promise<DesktopIpcInvokeResult<C>>
export type DesktopIpcClient = {
  invoke: DesktopIpcInvokeFn
}

export const desktopIpcInvokeSchemas = {
  'desktop:getSettings': undefined,
  'desktop:setSettings': desktopSettingsPatchSchema,
  'desktop:showNotification': desktopNotificationSchema,
  'desktop:setBadgeCount': badgeCountSchema,
  'desktop:setNotificationMode': notificationModeSchema,
  'desktop:minimizeToTray': undefined,
  'desktop:window:chrome-state': undefined,
  'desktop:window:set-full-screen': desktopWindowFullscreenInputSchema,
  'desktop:openExternal': externalUrlSchema,
  'desktop:clipboard:writeText': clipboardTextSchema,
  'desktop:openReader': readerOpenSchema,
  'desktop:reader:getState': undefined,
  'desktop:reader:activate': readerIdInputSchema,
  'desktop:reader:close': readerIdInputSchema,
  'desktop:reader:openDefault': readerIdInputSchema,
  'desktop:selectDirectory': selectDirectorySchema,
  'desktop:quit': undefined,
  'desktop:getCommunityAuthToken': undefined,
  'desktop:getCommunityAuthTokens': undefined,
  'desktop:community:fetchJson': communityFetchJsonSchema,
  'desktop:diagnostics:getSnapshot': undefined,
  'desktop:diagnostics:exportLogs': undefined,
  'desktop:showMainWindow': undefined,
  'desktop:showCommunity': showCommunityInputSchema,
  'desktop:openCommunityLogin': openCommunityLoginInputSchema,
  'desktop:showCreateBuddy': undefined,
  'desktop:showContextMenu': undefined,
  'desktop:showSettings': showSettingsInputSchema,
  'desktop:pet:show': undefined,
  'desktop:pet:hide': undefined,
  'desktop:pet:cursor-position': undefined,
  'desktop:pet:panel-mode': petPanelModeSchema,
  'desktop:pet:begin-window-drag': petWindowDragStartSchema,
  'desktop:pet:move-window': petWindowDragMoveSchema,
  'desktop:pet:end-window-drag': petWindowPointerIdSchema,
  'desktop:pet:mouse-interactive': petWindowMouseInteractiveSchema,
  'desktop:pet:modelProxyStream': modelProxyStreamSchema,
  'desktop:pet:speak': speechTextSchema,
  'desktop:pet:cancelSpeech': undefined,
  'desktop:pet:voiceEngineStatus': undefined,
  'desktop:pet:prewarmVoice': undefined,
  'desktop:pet:installVoiceModel': voiceModelInstallSchema,
  'desktop:pet:asrStart': undefined,
  'desktop:pet:asrAccept': asrAcceptSchema,
  'desktop:pet:asrStop': undefined,
  'desktop:startAgent': startAgentSchema,
  'desktop:stopAgent': agentProcessIdSchema,
  'desktop:getAgentStatus': agentProcessIdSchema,
  'desktop:listAgents': undefined,
  'desktop:getVersion': undefined,
  'desktop:checkForUpdate': undefined,
  'desktop:getUpdateState': undefined,
  'desktop:getUpdateSettings': undefined,
  'desktop:setUpdateSettings': updateSettingsSchema,
  'desktop:downloadUpdate': downloadUpdateUrlSchema,
  'desktop:setOpenAtLogin': openAtLoginSchema,
  'desktop:getOpenAtLogin': undefined,
  'desktop:quitAndRestart': undefined,
  'desktop:petAssets:importDirectory': optionalPathInputSchema,
  'desktop:petAssets:importMarketplace': petMarketplaceImportSchema,
  'desktop:petAssets:importArchiveBuffer': petArchiveImportSchema,
  'desktop:petAssets:setActive': packIdInputSchema,
  'desktop:petAssets:remove': packIdInputSchema,
  'desktop:connector:getStatus': undefined,
  'desktop:connector:start': connectorStartSettingsSchema,
  'desktop:connector:stop': undefined,
  'desktop:connector:scan': undefined,
  'desktop:connector:scanRuntimes': forceOptionsSchema,
  'desktop:connector:scanRuntimeSessions': forceOptionsSchema,
  'desktop:connector:installRuntime': runtimeIdInputSchema,
  'desktop:connector:createBuddy': createConnectorBuddySchema,
  'desktop:connector:getConnections': undefined,
  'desktop:connector:setConnectionEnabled': connectorConnectionEnabledSchema,
  'desktop:connector:deleteConnection': connectorDeleteSchema,
  'desktop:connector:setConnectionWorkDir': connectorWorkDirSchema,
  'desktop:shortcuts:reload': undefined,
  'desktop:shortcuts:suspend': undefined,
  'desktop:shortcuts:resume': undefined,
} satisfies Record<DesktopIpcInvokeChannel, z.ZodTypeAny | undefined>

export type DesktopIpcInvokeSchemaMap = typeof desktopIpcInvokeSchemas
export type DesktopIpcInvokeParsedInput<C extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeSchemaMap[C] extends z.ZodTypeAny ? z.infer<DesktopIpcInvokeSchemaMap[C]> : void
