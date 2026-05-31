import { Button, Card, CardContent, cn } from '@shadowob/ui'
import { CloudDownload, Download, FolderOpen, RefreshCw, Store, Trash2 } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  filterMarketplacePetPackEntitlements,
  installedMarketplacePack,
  localizedText,
  type MarketplacePetPackEntitlement,
} from '../lib/desktop-pet-marketplace'
import { petPackAssetUrl } from '../lib/pet-asset-packs'
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

type PetAssetSettingsApi = {
  getCommunityAuthToken?: () => Promise<string>
  showMainWindow?: () => Promise<void>
  showCommunity?: (path?: string) => Promise<void>
  communityFetchJson?: <T = unknown>(input: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
  }) => Promise<T>
  petAssets?: {
    importDirectory?: (path?: string) => Promise<DesktopPetAssetSettings>
    importMarketplace?: (input: {
      entitlementId: string
      fileId: string
      productId?: string
    }) => Promise<DesktopPetAssetSettings>
    setActive?: (packId: string) => Promise<DesktopPetAssetSettings>
    remove?: (packId: string) => Promise<DesktopPetAssetSettings>
  }
}

const PREVIEW_MOTIONS = [
  'idle',
  'pet',
  'feed',
  'play',
  'rest',
  'explore',
  'tea',
  'sick',
  'level-up',
] as const
const PREVIEW_EMOTIONS = [
  'excited',
  'content',
  'calm',
  'lonely',
  'hungry',
  'sleepy',
  'sick',
] as const
const DEFAULT_FRAME = { width: 256, height: 320, count: 1, fps: 8 }
const BUILT_IN_IDLE_FRAME_COUNT = 6
const BUILT_IN_IDLE_FPS = 8
type MarketplaceState = 'idle' | 'loading' | 'ready' | 'auth' | 'error'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function spriteFrame(sprite: DesktopPetAssetSprite) {
  return sprite.frame ?? DEFAULT_FRAME
}

function spriteFrameStyle(pack: DesktopPetAssetPack, sprite: DesktopPetAssetSprite, frame: number) {
  const { width, height, count } = spriteFrame(sprite)
  const frameCount = Math.max(1, count)
  return {
    aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}`,
    backgroundImage: `url("${petPackAssetUrl(pack, sprite.src)}")`,
    backgroundSize: `${frameCount * 100}% 100%`,
    backgroundPosition:
      frameCount <= 1 ? '0% 0%' : `${(frame / Math.max(1, frameCount - 1)) * 100}% 0%`,
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

function expressionSpriteKey(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  const expression = asRecord(value)
  for (const key of ['sprite', 'motion']) {
    const candidate = expression[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

function previewEntries(pack: DesktopPetAssetPack) {
  const entries: Array<{
    key: string
    labelType: 'motion' | 'emotion'
    labelKey: string
    sprite: DesktopPetAssetSprite
  }> = []
  for (const motion of PREVIEW_MOTIONS) {
    const sprite = pack.sprites[motion] ?? pack.sprites.idle
    if (sprite) {
      entries.push({
        key: `motion-${motion}`,
        labelType: 'motion',
        labelKey: motion === 'idle' ? 'pet' : motion === 'level-up' ? 'levelUp' : motion,
        sprite,
      })
    }
  }
  for (const emotion of PREVIEW_EMOTIONS) {
    const spriteKey = expressionSpriteKey(pack.expressions?.[emotion]) ?? emotion
    const sprite = pack.sprites[spriteKey]
    if (sprite) {
      entries.push({
        key: `emotion-${emotion}`,
        labelType: 'emotion',
        labelKey: emotion,
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
  const frame = useAnimatedFrame(BUILT_IN_IDLE_FRAME_COUNT, BUILT_IN_IDLE_FPS, active)
  return (
    <PackPreviewFrame active={active}>
      <img
        src={`/pet/animations/idle/${String(frame).padStart(2, '0')}.png`}
        alt=""
        className="h-[90px] w-auto max-w-full object-contain"
        aria-hidden="true"
      />
    </PackPreviewFrame>
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

export function DesktopPetAssetsSettings({
  api,
  settings,
  onSettings,
}: {
  api: PetAssetSettingsApi | null
  settings: DesktopPetAssetSettings
  onSettings: (settings: DesktopPetAssetSettings) => void
}) {
  const { i18n, t } = useTranslation()
  const [busy, setBusy] = useState<'import' | 'reset' | string | null>(null)
  const [error, setError] = useState('')
  const [marketplaceState, setMarketplaceState] = useState<MarketplaceState>('idle')
  const [marketplaceError, setMarketplaceError] = useState('')
  const [marketplaceEntitlements, setMarketplaceEntitlements] = useState<
    MarketplacePetPackEntitlement[]
  >([])
  const activePack = useMemo(
    () =>
      settings.desktopPetPacks.find((pack) => pack.id === settings.desktopPetActivePackId) ?? null,
    [settings.desktopPetActivePackId, settings.desktopPetPacks],
  )

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

  async function openCommunityLogin() {
    if (api?.showMainWindow) {
      await api.showMainWindow()
      return
    }
    await api?.showCommunity?.()
  }

  return (
    <div className="grid gap-4">
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
          <div className="grid gap-2 md:grid-cols-2">
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
                    <p className="mt-1 line-clamp-1 text-xs leading-5 text-text-muted">
                      {entitlement.product?.summary ||
                        entitlement.shop?.name ||
                        entitlement.paidFile?.name ||
                        t('desktop.petAssetsNoDesc')}
                    </p>
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
                        icon={Download}
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

      <div className="grid justify-center gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,220px))] sm:justify-start">
        <button
          type="button"
          className={cn(
            'rounded-2xl border p-3 text-left transition',
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
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-text-muted">
            {t('desktop.petAssetsDefaultDesc')}
          </span>
        </button>

        {settings.desktopPetPacks.map((pack) => {
          const selected = settings.desktopPetActivePackId === pack.id
          return (
            <article
              key={pack.id}
              className={cn(
                'rounded-2xl border p-3 transition',
                selected
                  ? 'border-primary/45 bg-primary/12'
                  : 'border-border-subtle bg-bg-primary/35',
              )}
            >
              <button
                type="button"
                className="block w-full text-left"
                onClick={() =>
                  void run(pack.id, () => api?.petAssets?.setActive?.(pack.id) ?? Promise.resolve())
                }
              >
                <PackCardPreview pack={pack} active={selected || !busy} />
                <span className="mt-2 block truncate text-sm font-semibold">
                  {localizedText(pack.displayName, i18n.language, pack.id)}
                </span>
                <span className="mt-1 block line-clamp-2 text-xs leading-5 text-text-muted">
                  {localizedText(pack.description, i18n.language, t('desktop.petAssetsNoDesc'))}
                </span>
                <span className="mt-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  {pack.source === 'marketplace'
                    ? t('desktop.petAssetsSourceMarketplace')
                    : t('desktop.petAssetsSourceLocal')}{' '}
                  · v{pack.version}
                </span>
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={selected ? 'glass' : 'primary'}
                  disabled={Boolean(busy)}
                  loading={busy === pack.id}
                  icon={Download}
                  onClick={() =>
                    void run(
                      pack.id,
                      () => api?.petAssets?.setActive?.(pack.id) ?? Promise.resolve(),
                    )
                  }
                >
                  {selected ? t('desktop.petAssetsActive') : t('desktop.petAssetsUse')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(busy)}
                  icon={Trash2}
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

        <article className="rounded-2xl border border-dashed border-primary/35 bg-primary/8 p-3 text-left transition hover:bg-primary/12">
          <PackPreviewFrame active={busy === 'import'} className="h-20 max-w-[112px]">
            <FolderOpen className="text-primary" size={30} />
          </PackPreviewFrame>
          <span className="mt-2 block truncate text-sm font-semibold">
            {t('desktop.petAssetsImport')}
          </span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-text-muted">
            {t('desktop.petAssetsDesc')}
          </span>
          <div className="mt-3 grid gap-2">
            <Button
              type="button"
              variant="glass"
              size="sm"
              icon={Store}
              className="w-full"
              onClick={() =>
                void api?.showCommunity?.(`/shop/tags/${encodeURIComponent('虾豆桌面宠物')}`)
              }
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

      {activePack ? (
        <Card variant="glassCard" className="p-0">
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-base font-semibold">{t('desktop.petAssetsPreview')}</p>
              <p className="mt-1 text-sm text-text-muted">
                {localizedText(activePack.displayName, i18n.language, activePack.id)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {previewEntries(activePack).map((entry) => {
                return (
                  <SpritePreview
                    key={entry.key}
                    pack={activePack}
                    sprite={entry.sprite}
                    label={
                      entry.labelType === 'emotion'
                        ? t(`desktopPet.emotions.${entry.labelKey}`)
                        : t(`desktopPet.actions.${entry.labelKey}`)
                    }
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
