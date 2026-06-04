import { Button, Card, CardContent, cn } from '@shadowob/ui'
import { CloudDownload, FolderOpen, RefreshCw, Store } from 'lucide-react'
import {
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  filterMarketplacePetPackEntitlements,
  installedMarketplacePack,
  localizedText,
  type MarketplacePetPackEntitlement,
} from '../lib/desktop-pet-marketplace'
import {
  DESKTOP_PET_ASSET_DROP_EVENT,
  type DesktopPetAssetDropEventDetail,
  fallbackFilePath,
  findCodexPetArchive,
  isFileDrag,
  isPreloadHandledPetAssetDrop,
} from '../lib/pet-asset-drag'
import { CODEX_PET_STATES, DEFAULT_CODEX_PET_PACK, petPackAssetUrl } from '../lib/pet-asset-packs'
import {
  communityErrorMessage,
  fetchShadow,
  isCommunityAuthRequiredError,
  onCommunityAuthRequired,
  readShadowAccessToken,
} from '../lib/pet-community'
import type {
  DesktopPetAssetPack,
  DesktopPetAssetSettings,
  DesktopPetAssetSprite,
} from '../pet-types'

export type PetAssetSettingsApi = {
  getCommunityAuthToken?: () => Promise<string>
  showMainWindow?: () => Promise<void>
  showCommunity?: (path?: string) => Promise<void>
  communityFetchJson?: <T = unknown>(input: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
    optional?: boolean
  }) => Promise<T>
  petAssets?: {
    importDirectory?: (path?: string) => Promise<DesktopPetAssetSettings>
    importFile?: (file: File) => Promise<DesktopPetAssetSettings>
    importMarketplace?: (input: {
      entitlementId: string
      fileId: string
      productId?: string
    }) => Promise<DesktopPetAssetSettings>
    setActive?: (packId: string) => Promise<DesktopPetAssetSettings>
    remove?: (packId: string) => Promise<DesktopPetAssetSettings>
  }
}

const PREVIEW_MOTIONS = CODEX_PET_STATES
const DEFAULT_FRAME = { width: 192, height: 208, count: 6, fps: 6 }
type MarketplaceState = 'idle' | 'loading' | 'ready' | 'auth' | 'error'
type PetAssetManagerVariant = 'settings' | 'panel'

const clampTextStyle = (lines: number): CSSProperties => ({
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: lines,
  overflow: 'hidden',
})

function spriteFrame(sprite: DesktopPetAssetSprite) {
  return sprite.frame ?? DEFAULT_FRAME
}

function spriteFrameStyle(pack: DesktopPetAssetPack, sprite: DesktopPetAssetSprite, frame: number) {
  const { width, height, count } = spriteFrame(sprite)
  const atlas = sprite.atlas
  const columns = Math.max(1, atlas?.columns ?? count)
  const rows = Math.max(1, atlas?.rows ?? 1)
  const row = Math.max(0, Math.min(rows - 1, atlas?.row ?? 0))
  const x = columns <= 1 ? 0 : (frame / Math.max(1, columns - 1)) * 100
  const y = rows <= 1 ? 0 : (row / Math.max(1, rows - 1)) * 100
  return {
    aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}`,
    backgroundImage: `url("${petPackAssetUrl(pack, sprite.src)}")`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
    imageRendering: 'pixelated' as const,
  }
}

function spritePreviewSize(sprite: DesktopPetAssetSprite, maxHeight: number) {
  const { width, height } = spriteFrame(sprite)
  return {
    width: `${Math.round(maxHeight * (Math.max(1, width) / Math.max(1, height)))}px`,
    height: `${maxHeight}px`,
  }
}

function useAnimatedSpriteFrame(sprite: DesktopPetAssetSprite, active = true) {
  const { count, fps } = spriteFrame(sprite)
  return useAnimatedFrame(Math.max(1, count), Math.max(1, Math.min(30, fps)), active)
}

function useAnimatedFrame(frameCount: number, fps: number, active = true) {
  const [frame, setFrame] = useState(0)
  const normalizedFrameCount = Math.max(1, frameCount)
  const cappedFps = Math.max(1, Math.min(30, fps))

  useEffect(() => {
    if (!active || normalizedFrameCount <= 1) {
      setFrame(0)
      return
    }
    const timer = window.setInterval(() => {
      setFrame((value) => (value + 1) % normalizedFrameCount)
    }, 1000 / cappedFps)
    return () => window.clearInterval(timer)
  }, [active, cappedFps, normalizedFrameCount])

  return frame
}

function previewSprite(pack: DesktopPetAssetPack) {
  for (const motion of PREVIEW_MOTIONS) {
    const sprite = pack.sprites[motion]
    if (sprite) return sprite
  }
  return Object.values(pack.sprites)[0] ?? null
}

function previewEntries(pack: DesktopPetAssetPack) {
  const entries: Array<{
    key: string
    labelKey: string
    sprite: DesktopPetAssetSprite
  }> = []
  for (const motion of PREVIEW_MOTIONS) {
    const sprite = pack.sprites[motion] ?? pack.sprites.idle
    if (sprite) {
      entries.push({
        key: `motion-${motion}`,
        labelKey: motion,
        sprite,
      })
    }
  }
  return entries
}

function PackPreviewFrame({
  children,
  className,
}: {
  children?: ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'mx-auto flex h-24 w-full max-w-[132px] items-center justify-center overflow-hidden',
        className,
      )}
    >
      {children}
    </span>
  )
}

function PackCardPreview({ pack, active }: { pack: DesktopPetAssetPack; active?: boolean }) {
  const sprite = previewSprite(pack)
  if (!sprite) {
    return <PackPreviewFrame active={active} />
  }
  return <PackCardSprite pack={pack} sprite={sprite} active={active} />
}

function BuiltInPetPreview({ active }: { active?: boolean }) {
  return (
    <PackCardSprite
      pack={DEFAULT_CODEX_PET_PACK}
      sprite={DEFAULT_CODEX_PET_PACK.sprites.idle!}
      active={active}
    />
  )
}

function PackCardSprite({
  pack,
  sprite,
  active,
}: {
  pack: DesktopPetAssetPack
  sprite: DesktopPetAssetSprite
  active?: boolean
}) {
  const frame = useAnimatedSpriteFrame(sprite, active)
  return (
    <PackPreviewFrame active={active}>
      <span
        className="block max-w-full bg-contain bg-center bg-no-repeat"
        style={{
          ...spritePreviewSize(sprite, 90),
          ...spriteFrameStyle(pack, sprite, frame),
        }}
        aria-hidden="true"
      />
    </PackPreviewFrame>
  )
}

function SpritePreview({
  pack,
  sprite,
  label,
  active,
}: {
  pack: DesktopPetAssetPack
  sprite: DesktopPetAssetSprite
  label: string
  active?: boolean
}) {
  const frame = useAnimatedSpriteFrame(sprite, active)
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-primary/35 p-3">
      <PackPreviewFrame active={active} className="h-20 max-w-[96px]">
        <span
          className="block max-w-full bg-contain bg-center bg-no-repeat"
          style={{
            ...spritePreviewSize(sprite, 76),
            ...spriteFrameStyle(pack, sprite, frame),
          }}
          aria-hidden="true"
        />
      </PackPreviewFrame>
      <p className="mt-2 truncate text-center text-xs font-bold text-text-secondary">{label}</p>
    </div>
  )
}

function ClampedText({
  children,
  className,
  lines,
}: {
  children: ReactNode
  className?: string
  lines: number
}) {
  return (
    <span className={className} style={clampTextStyle(lines)}>
      {children}
    </span>
  )
}

export function DesktopPetAssetsManager({
  api,
  settings,
  onSettings,
  variant = 'settings',
}: {
  api: PetAssetSettingsApi | null
  settings: DesktopPetAssetSettings
  onSettings: (settings: DesktopPetAssetSettings) => void
  variant?: PetAssetManagerVariant
}) {
  const { i18n, t } = useTranslation()
  const [busy, setBusy] = useState<'import' | 'reset' | string | null>(null)
  const [error, setError] = useState('')
  const [marketplaceState, setMarketplaceState] = useState<MarketplaceState>('idle')
  const [marketplaceError, setMarketplaceError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [marketplaceEntitlements, setMarketplaceEntitlements] = useState<
    MarketplacePetPackEntitlement[]
  >([])
  const activePack = useMemo(
    () =>
      settings.desktopPetPacks.find((pack) => pack.id === settings.desktopPetActivePackId) ?? null,
    [settings.desktopPetActivePackId, settings.desktopPetPacks],
  )
  const previewPack = activePack ?? DEFAULT_CODEX_PET_PACK
  const compact = variant === 'panel'
  const descriptionLines = compact ? 2 : 3

  const loadMarketplaceEntitlements = useCallback(async () => {
    setMarketplaceState('loading')
    setMarketplaceError('')
    try {
      if (!(await readShadowAccessToken(api))) {
        setMarketplaceEntitlements([])
        setMarketplaceState('auth')
        return
      }
      const payload = await fetchShadow<unknown>(api, '/api/entitlements')
      setMarketplaceEntitlements(filterMarketplacePetPackEntitlements(payload))
      setMarketplaceState('ready')
    } catch (caught) {
      setMarketplaceEntitlements([])
      if (isCommunityAuthRequiredError(caught)) {
        setMarketplaceState('auth')
        return
      }
      setMarketplaceError(communityErrorMessage(caught))
      setMarketplaceState('error')
    }
  }, [api])

  useEffect(() => {
    void loadMarketplaceEntitlements()
  }, [loadMarketplaceEntitlements])

  useEffect(
    () =>
      onCommunityAuthRequired(() => {
        setError('')
        setMarketplaceError('')
        setMarketplaceEntitlements([])
        setMarketplaceState('auth')
      }),
    [],
  )

  async function run(action: string, task: () => Promise<DesktopPetAssetSettings | void>) {
    if (busy) return
    setBusy(action)
    setError('')
    try {
      const next = await task()
      if (next) onSettings(next)
    } catch (caught) {
      if (isCommunityAuthRequiredError(caught)) {
        setMarketplaceState('auth')
        setError('')
        return
      }
      setError(communityErrorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  async function importDroppedFile(file: File) {
    const fallbackPath = fallbackFilePath(file)
    if (!api?.petAssets?.importFile && !api?.petAssets?.importDirectory) {
      setError(t('desktopPet.petAssets.importUnavailable'))
      return
    }
    if (!api.petAssets.importFile && !fallbackPath) {
      setError(t('desktopPet.petAssets.dropPathUnavailable'))
      return
    }
    await run('import', async () =>
      api.petAssets?.importFile
        ? api.petAssets.importFile(file)
        : api.petAssets?.importDirectory?.(fallbackPath),
    )
  }

  useEffect(() => {
    const handleNativePetAssetDrop = (event: Event) => {
      const status = (event as CustomEvent<DesktopPetAssetDropEventDetail>).detail?.status
      if (!status) return
      setDragActive(false)
      if (status === 'started') {
        setBusy('import')
        setError('')
        return
      }
      setBusy(null)
      setError(status === 'failed' ? t('desktopPet.petAssets.importFailed') : '')
    }
    window.addEventListener(DESKTOP_PET_ASSET_DROP_EVENT, handleNativePetAssetDrop)
    return () => window.removeEventListener(DESKTOP_PET_ASSET_DROP_EVENT, handleNativePetAssetDrop)
  }, [t])

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setDragActive(false)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    setDragActive(false)
    if (isPreloadHandledPetAssetDrop(event)) return
    const file = findCodexPetArchive(event.dataTransfer.files)
    if (!file) {
      setError(t('desktopPet.petAssets.dropUnsupported'))
      return
    }
    void importDroppedFile(file)
  }

  async function openCommunityLogin() {
    if (api?.showMainWindow) {
      await api.showMainWindow()
      return
    }
    await api?.showCommunity?.()
  }

  async function openCommunityPetStore() {
    await api?.showCommunity?.(`/shop/tags/${encodeURIComponent('虾豆桌面宠物')}`)
  }

  return (
    <div
      data-testid="desktop-pet-assets-drop-zone"
      className={cn(
        'relative grid gap-4 rounded-2xl',
        compact ? 'desktop-pet-assets-manager-panel' : 'desktop-pet-assets-manager-settings',
        dragActive ? 'outline outline-2 outline-primary outline-offset-4' : '',
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-2xl border-2 border-primary border-dashed bg-bg-primary/80 backdrop-blur-sm">
          <div className="rounded-xl border border-primary/40 bg-bg-secondary px-4 py-3 text-center shadow-lg">
            <p className="text-sm font-semibold">{t('desktopPet.petAssets.dropTitle')}</p>
            <p className="mt-1 text-xs text-text-muted">{t('desktopPet.petAssets.dropHint')}</p>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs font-semibold text-danger">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{t('desktop.petAssetsOwnedTitle')}</p>
          <Button
            type="button"
            variant="glass"
            size="sm"
            icon={RefreshCw}
            loading={marketplaceState === 'loading'}
            disabled={marketplaceState === 'loading'}
            onClick={() => void loadMarketplaceEntitlements()}
          >
            {t('desktop.petAssetsRefreshOwned')}
          </Button>
        </div>

        {marketplaceState === 'auth' ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-text-muted">
            <span className="min-w-0 flex-1">{t('desktop.petAssetsOwnedAuthHint')}</span>
            {api?.showMainWindow || api?.showCommunity ? (
              <Button
                type="button"
                size="sm"
                variant="glass"
                icon={Store}
                onClick={openCommunityLogin}
              >
                {t('desktopPet.auth.openMain')}
              </Button>
            ) : null}
          </div>
        ) : marketplaceState === 'error' ? (
          <div className="rounded-2xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
            {marketplaceError || t('desktop.petAssetsOwnedLoadFailed')}
          </div>
        ) : marketplaceEntitlements.length === 0 ? (
          <p className="rounded-2xl border border-border-subtle bg-bg-primary/25 px-3 py-2 text-xs text-text-muted">
            {marketplaceState === 'loading'
              ? t('desktop.petAssetsOwnedLoading')
              : t('desktop.petAssetsOwnedEmpty')}
          </p>
        ) : (
          <div className={compact ? 'grid gap-2' : 'grid gap-2 md:grid-cols-2'}>
            {marketplaceEntitlements.map((entitlement) => {
              const installed = installedMarketplacePack(settings, entitlement)
              const actionId = `marketplace-${entitlement.id}`
              return (
                <article
                  key={entitlement.id}
                  className="rounded-2xl border border-border-subtle bg-bg-primary/30 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {entitlement.product?.name ||
                        entitlement.paidFile?.name ||
                        t('desktop.petAssetsOwnedUnnamed')}
                    </p>
                    <ClampedText className="mt-1 block text-xs leading-5 text-text-muted" lines={1}>
                      {entitlement.product?.summary ||
                        entitlement.shop?.name ||
                        entitlement.paidFile?.name ||
                        t('desktop.petAssetsNoDesc')}
                    </ClampedText>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="mr-auto text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
                      {installed
                        ? t('desktop.petAssetsOwnedInstalled')
                        : t('desktop.petAssetsOwnedReady')}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      icon={CloudDownload}
                      loading={busy === actionId}
                      disabled={
                        Boolean(busy) ||
                        !api?.petAssets?.importMarketplace ||
                        !entitlement.paidFile?.id
                      }
                      onClick={() =>
                        void run(
                          actionId,
                          () =>
                            api?.petAssets?.importMarketplace?.({
                              entitlementId: entitlement.id,
                              fileId: entitlement.paidFile?.id ?? '',
                              productId: entitlement.product?.id,
                            }) ?? Promise.resolve(),
                        )
                      }
                    >
                      {installed
                        ? t('desktop.petAssetsOwnedUpdate')
                        : t('desktop.petAssetsOwnedInstall')}
                    </Button>
                    {installed ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="glass"
                        disabled={Boolean(busy)}
                        loading={busy === installed.id}
                        onClick={() =>
                          void run(
                            installed.id,
                            () => api?.petAssets?.setActive?.(installed.id) ?? Promise.resolve(),
                          )
                        }
                      >
                        {settings.desktopPetActivePackId === installed.id
                          ? t('desktop.petAssetsActive')
                          : t('desktop.petAssetsUse')}
                      </Button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <div
        className={cn(
          'grid justify-center gap-3 sm:justify-start',
          compact
            ? '[grid-template-columns:repeat(auto-fill,minmax(142px,1fr))]'
            : '[grid-template-columns:repeat(auto-fill,minmax(180px,220px))]',
        )}
      >
        <button
          type="button"
          className={cn(
            'flex min-h-[220px] flex-col rounded-2xl border p-3 text-left transition',
            compact ? 'min-h-[188px]' : '',
            !settings.desktopPetActivePackId
              ? 'border-primary/45 bg-primary/12'
              : 'border-border-subtle bg-bg-primary/35 hover:bg-bg-primary/55',
          )}
          onClick={() =>
            void run('reset', () => api?.petAssets?.setActive?.('') ?? Promise.resolve())
          }
        >
          <BuiltInPetPreview active={!settings.desktopPetActivePackId || !busy} />
          <span className="mt-2 block truncate text-sm font-semibold">
            {t('desktop.petAssetsDefault')}
          </span>
          <ClampedText className="mt-1 block text-xs leading-5 text-text-muted" lines={2}>
            {t('desktop.petAssetsDefaultDesc')}
          </ClampedText>
        </button>

        {settings.desktopPetPacks.map((pack) => {
          const selected = settings.desktopPetActivePackId === pack.id
          return (
            <article
              key={pack.id}
              className={cn(
                'flex min-h-[220px] flex-col rounded-2xl border p-3 transition',
                compact ? 'min-h-[188px]' : '',
                selected
                  ? 'border-primary/45 bg-primary/12'
                  : 'border-border-subtle bg-bg-primary/35',
              )}
            >
              <button
                type="button"
                className="block min-h-0 flex-1 text-left"
                onClick={() =>
                  void run(pack.id, () => api?.petAssets?.setActive?.(pack.id) ?? Promise.resolve())
                }
              >
                <PackCardPreview pack={pack} active={selected || !busy} />
                <span className="mt-2 block truncate text-sm font-semibold">
                  {localizedText(pack.displayName, i18n.language, pack.id)}
                </span>
                <ClampedText
                  className="mt-1 block text-xs leading-5 text-text-muted"
                  lines={descriptionLines}
                >
                  {localizedText(pack.description, i18n.language, t('desktop.petAssetsNoDesc'))}
                </ClampedText>
                <span className="mt-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {pack.source === 'marketplace'
                    ? t('desktop.petAssetsSourceMarketplace')
                    : t('desktop.petAssetsSourceLocal')}
                  {pack.version ? ` · v${pack.version}` : null}
                </span>
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={selected ? 'glass' : 'primary'}
                  disabled={Boolean(busy)}
                  loading={busy === pack.id}
                  onClick={() =>
                    void run(
                      pack.id,
                      () => api?.petAssets?.setActive?.(pack.id) ?? Promise.resolve(),
                    )
                  }
                >
                  {t('desktop.petAssetsUseShort')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      `remove-${pack.id}`,
                      () => api?.petAssets?.remove?.(pack.id) ?? Promise.resolve(),
                    )
                  }
                >
                  {t('desktop.petAssetsRemove')}
                </Button>
              </div>
            </article>
          )
        })}

        <article
          className={cn(
            'flex min-h-[220px] flex-col rounded-2xl border border-dashed border-primary/35 bg-primary/8 p-3 text-left transition hover:bg-primary/12',
            compact ? 'min-h-[188px]' : '',
            dragActive ? 'border-primary bg-primary/14' : '',
          )}
        >
          <PackPreviewFrame active={busy === 'import'} className="h-20 max-w-[112px]">
            <FolderOpen className="text-primary" size={30} />
          </PackPreviewFrame>
          <span className="mt-2 block truncate text-sm font-semibold">
            {t('desktop.petAssetsImport')}
          </span>
          <ClampedText className="mt-1 block text-xs leading-5 text-text-muted" lines={2}>
            {t('desktop.petAssetsDesc')}
          </ClampedText>
          <div className="mt-auto grid gap-2 pt-3">
            <Button
              type="button"
              variant="glass"
              size="sm"
              icon={Store}
              disabled={!api?.showCommunity}
              className="w-full"
              onClick={() => void openCommunityPetStore()}
            >
              {t('desktop.petAssetsOpenStore')}
            </Button>
            <Button
              type="button"
              size="sm"
              icon={FolderOpen}
              loading={busy === 'import'}
              disabled={Boolean(busy) || !api?.petAssets?.importDirectory}
              className="w-full"
              onClick={() =>
                void run('import', () => api?.petAssets?.importDirectory?.() ?? Promise.resolve())
              }
            >
              {t('desktop.petAssetsImport')}
            </Button>
          </div>
        </article>
      </div>

      {!compact && previewPack ? (
        <Card variant="glassCard" className="p-0">
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-base font-semibold">{t('desktop.petAssetsPreview')}</p>
              <p className="mt-1 text-sm text-text-muted">
                {localizedText(previewPack.displayName, i18n.language, previewPack.id)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {previewEntries(previewPack).map((entry) => {
                return (
                  <SpritePreview
                    key={entry.key}
                    pack={previewPack}
                    sprite={entry.sprite}
                    label={t(`desktopPet.codexStates.${entry.labelKey}`)}
                    active
                  />
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export function DesktopPetAssetsSettings({
  api,
  settings,
  onSettings,
}: {
  api: PetAssetSettingsApi | null
  settings: DesktopPetAssetSettings
  onSettings: (settings: DesktopPetAssetSettings) => void
}) {
  return (
    <DesktopPetAssetsManager
      api={api}
      settings={settings}
      onSettings={onSettings}
      variant="settings"
    />
  )
}
