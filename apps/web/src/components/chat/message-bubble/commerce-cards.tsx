import type { CommerceProductCard, PaidFileCard } from '@shadowob/shared'
import { Button, cn } from '@shadowob/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Lock,
  ShieldCheck,
  Store,
  Ticket,
  Unlock,
} from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { getApiErrorMessage } from '../../../lib/api-errors'
import { deliveryDetailHref } from '../../../lib/commerce-delivery'
import { PurchaseConfirmationModal } from '../../commerce/purchase-confirmation-modal'
import { formatFileSize } from '../../workspace/workspace-utils'
import { openPaidFileInPreview } from './media'
import type { Attachment } from './types'

type PaidFileState = {
  file: {
    id: string
    name: string
    mime?: string | null
    sizeBytes?: number | null
    previewUrl?: string | null
    paywalled?: boolean
  }
  entitlement: { id: string; status: string; expiresAt?: string | null } | null
  hasAccess: boolean
}

type CommerceCheckoutPreview = {
  offer: { id: string; status: string; available: boolean }
  shop: { id: string; name: string; scopeKind: 'server' | 'user'; logoUrl?: string | null }
  product: {
    id: string
    name: string
    summary?: string | null
    imageUrl?: string | null
    type: 'physical' | 'entitlement'
    billingMode?: 'one_time' | 'fixed_duration' | 'subscription'
    price: number
    currency: string
    durationSeconds?: number | null
  }
  entitlement: {
    resourceType: string
    resourceId: string
    capability: string
    access: {
      allowed: boolean
      status: string
      reasonCode?: string | null
      entitlement?: {
        id: string
        status: string
        capability: string
        expiresAt?: string | null
      } | null
    }
  } | null
  paidFile?: {
    id: string
    name: string
    mime?: string | null
    sizeBytes?: number | null
    previewUrl?: string | null
  } | null
  viewerState: 'not_purchased' | 'active' | 'expired' | 'revoked' | 'cancelled' | 'unavailable'
  primaryAction?:
    | 'purchase'
    | 'open_content'
    | 'renew'
    | 'view_detail'
    | 'view_progress'
    | 'unavailable'
  displayState?: {
    viewerState: string
    primaryAction: string
    price?: { amount: number; currency: string }
    balance?: { current: number; afterPurchase?: number; shortfall?: number } | null
    delivery?: { state: string; deliverableKind?: string | null } | null
  }
  nextAction: 'purchase' | 'open_paid_file' | 'view_entitlement'
}

type ServerRouteSummary = {
  id: string
  slug?: string | null
}

function formatCommercePrice(
  card: CommerceProductCard,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return formatPriceValue(card.snapshot.price, card.snapshot.currency, t)
}

function formatPriceValue(
  price: number,
  currency: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (currency === 'shrimp_coin') {
    return `${price.toLocaleString()} ${t('common.shrimpCoin')}`
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(price / 100)
}

function CommerceProductCardViewBase({
  card,
  messageId,
  onPreviewFile,
}: {
  card: CommerceProductCard
  messageId: string
  onPreviewFile?: (attachment: Attachment) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isBuying, setIsBuying] = useState(false)
  const [isOpening, setIsOpening] = useState(false)
  const [isDelivering, setIsDelivering] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkoutPreview, setCheckoutPreview] = useState<CommerceCheckoutPreview | null>(null)
  const [purchaseResult, setPurchaseResult] = useState<{
    order?: { id: string; orderNo: string; status: string; totalAmount: number }
    entitlement?: { id: string; status: string; expiresAt?: string | null }
    provisioning?: { status: string; code: string }
    nextAction?: string
  } | null>(null)
  const checkoutPreviewQueryKey = ['commerce-checkout-preview', card.offerId, card.skuId]
  const { data: shopServer } = useQuery({
    queryKey: ['server', card.shopScope.kind === 'server' ? card.shopScope.id : null],
    queryFn: () => fetchApi<ServerRouteSummary>(`/api/servers/${card.shopScope.id}`),
    enabled: card.shopScope.kind === 'server',
    staleTime: 60_000,
  })
  const productHref = `/app/shop/products/${card.productId}`
  const serverShopRouteKey = shopServer?.slug ?? card.shopScope.id
  const shopHref =
    card.shopScope.kind === 'server'
      ? `/app/servers/${serverShopRouteKey}/shop`
      : `/app/shop/users/${card.shopScope.id}?view=buyer`
  const purchaseDeliveryHref = deliveryDetailHref(purchaseResult?.entitlement?.id, {
    openContent: purchaseResult?.nextAction === 'open_paid_file',
  })
  const fetchCheckoutPreview = () =>
    fetchApi<CommerceCheckoutPreview>(
      `/api/commerce/offers/${card.offerId}/checkout-preview${
        card.skuId ? `?skuId=${encodeURIComponent(card.skuId)}` : ''
      }`,
    )
  const checkoutPreviewQuery = useQuery({
    queryKey: checkoutPreviewQueryKey,
    queryFn: fetchCheckoutPreview,
    enabled: !!card.offerId,
    staleTime: 10_000,
  })
  const currentCheckoutPreview = checkoutPreview ?? checkoutPreviewQuery.data ?? null
  const loadCheckoutPreview = async () => {
    if (!card.offerId) return null
    const preview = await queryClient.fetchQuery({
      queryKey: checkoutPreviewQueryKey,
      queryFn: fetchCheckoutPreview,
      staleTime: 10_000,
    })
    setCheckoutPreview(preview)
    return preview
  }
  const buy = async () => {
    setIsBuying(true)
    setError(null)
    try {
      const result = await fetchApi<NonNullable<typeof purchaseResult>>(
        `/api/messages/${messageId}/commerce-cards/${card.id}/purchase`,
        {
          method: 'POST',
          body: JSON.stringify({
            skuId: card.skuId,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      )
      setPurchaseResult(result)
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      queryClient.invalidateQueries({ queryKey: ['paid-file', card.snapshot.resourceId] })
      queryClient.invalidateQueries({ queryKey: checkoutPreviewQueryKey })
      const fileId = currentCheckoutPreview?.paidFile?.id ?? paidFileId
      if (fileId && (result.nextAction === 'open_paid_file' || currentCheckoutPreview?.paidFile)) {
        setIsDelivering(true)
        await new Promise((resolve) => setTimeout(resolve, 900))
        await openPaidFileInPreview({
          fileId,
          fallbackName: currentCheckoutPreview?.paidFile?.name ?? card.snapshot.name,
          fallbackMime: currentCheckoutPreview?.paidFile?.mime,
          fallbackSizeBytes: currentCheckoutPreview?.paidFile?.sizeBytes,
          onPreviewFile,
        })
        setShowPurchaseModal(false)
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t, 'chat.commercePurchaseFailed'))
    } finally {
      setIsBuying(false)
      setIsDelivering(false)
    }
  }

  const openPurchasedEntitlement = async () => {
    const file = currentCheckoutPreview?.paidFile
    const fileId =
      file?.id ??
      (card.snapshot.productType === 'entitlement' &&
      card.snapshot.resourceType === 'workspace_file'
        ? card.snapshot.resourceId
        : null)

    if (!fileId) {
      if (purchaseResult?.entitlement?.id) {
        window.location.assign(
          deliveryDetailHref(purchaseResult.entitlement.id, {
            openContent: purchaseResult.nextAction === 'open_paid_file',
          }),
        )
        return
      }
      setShowPurchaseModal(false)
      return
    }

    setIsOpening(true)
    setError(null)
    try {
      await openPaidFileInPreview({
        fileId,
        fallbackName: file?.name ?? card.snapshot.name,
        fallbackMime: file?.mime,
        fallbackSizeBytes: file?.sizeBytes,
        onPreviewFile,
      })
      setShowPurchaseModal(false)
    } catch (err) {
      setError(getApiErrorMessage(err, t, 'chat.paidFileOpenFailed'))
    } finally {
      setIsOpening(false)
    }
  }

  const paidFileId =
    card.snapshot.productType === 'entitlement' &&
    card.snapshot.resourceType === 'workspace_file' &&
    card.snapshot.resourceId
      ? card.snapshot.resourceId
      : null
  const resolveCardAction = async () => {
    if (!paidFileId) {
      setIsOpening(true)
      setError(null)
      try {
        await loadCheckoutPreview()
        setShowPurchaseModal(true)
      } catch (err) {
        setError(getApiErrorMessage(err, t, 'chat.commercePreviewFailed'))
      } finally {
        setIsOpening(false)
      }
      return
    }
    setIsOpening(true)
    setError(null)
    try {
      const preview = await loadCheckoutPreview()
      if (
        (preview?.primaryAction === 'open_content' || preview?.viewerState === 'active') &&
        preview.paidFile?.id
      ) {
        await openPaidFileInPreview({
          fileId: preview.paidFile.id,
          fallbackName: preview.paidFile.name || card.snapshot.name,
          fallbackMime: preview.paidFile.mime,
          fallbackSizeBytes: preview.paidFile.sizeBytes,
          onPreviewFile,
        })
        return
      }
      if (preview && preview.viewerState !== 'not_purchased') {
        setError(
          t(`commerce.viewerStateError.${preview.viewerState}`, {
            defaultValue: t('chat.paidFileOpenFailed'),
          }),
        )
        return
      }
      if (preview) {
        setShowPurchaseModal(true)
        return
      }
      const state = await fetchApi<PaidFileState>(`/api/paid-files/${paidFileId}`)
      if (!state.hasAccess) {
        setShowPurchaseModal(true)
        return
      }
      await openPaidFileInPreview({
        fileId: paidFileId,
        fallbackName: state.file.name || card.snapshot.name,
        fallbackMime: state.file.mime,
        fallbackSizeBytes: state.file.sizeBytes,
        onPreviewFile,
      })
    } catch (err) {
      setError(getApiErrorMessage(err, t, 'chat.commercePreviewFailed'))
    } finally {
      setIsOpening(false)
    }
  }
  const durationDays = card.snapshot.durationSeconds
    ? Math.ceil(card.snapshot.durationSeconds / 86400)
    : null
  const isManualDelivery =
    currentCheckoutPreview?.entitlement?.resourceType === 'service' ||
    card.snapshot.resourceType === 'service'
  const modalDetails = {
    name: currentCheckoutPreview?.product.name ?? card.snapshot.name,
    summary: currentCheckoutPreview?.product.summary ?? card.snapshot.summary,
    imageUrl: currentCheckoutPreview?.product.imageUrl ?? card.snapshot.imageUrl,
    priceLabel: currentCheckoutPreview
      ? formatPriceValue(
          currentCheckoutPreview.product.price,
          currentCheckoutPreview.product.currency,
          t,
        )
      : formatCommercePrice(card, t),
    billingModeLabel: t(
      `commerce.billingModes.${
        currentCheckoutPreview?.product.billingMode ?? card.snapshot.billingMode ?? 'one_time'
      }`,
      {
        defaultValue:
          (currentCheckoutPreview?.product.billingMode ?? card.snapshot.billingMode) ===
          'subscription'
            ? t('chat.commerceSubscription')
            : t('chat.commerceEntitlement'),
      },
    ),
    entitlementLabel:
      card.snapshot.productType === 'entitlement'
        ? t('chat.commerceEntitlement')
        : card.snapshot.productType,
    durationLabel: durationDays
      ? t('commerce.validDays', { count: durationDays })
      : t('commerce.permanent'),
    targetLabel: currentCheckoutPreview?.entitlement
      ? `${t(`commerce.resourceTypes.${currentCheckoutPreview.entitlement.resourceType}`, {
          defaultValue: currentCheckoutPreview.entitlement.resourceType,
        })} · ${t(`commerce.capabilities.${currentCheckoutPreview.entitlement.capability}`, {
          defaultValue: currentCheckoutPreview.entitlement.capability,
        })}`
      : (card.snapshot.summary ?? t('commerce.manualDelivery')),
    deliveryLabel: isManualDelivery
      ? t('commerce.manualDelivery')
      : t('commerce.immediateDelivery'),
    shopLabel: currentCheckoutPreview?.shop.name,
    paidFileLabel: currentCheckoutPreview?.paidFile
      ? `${currentCheckoutPreview.paidFile.name}${
          currentCheckoutPreview.paidFile.sizeBytes != null
            ? ` · ${formatFileSize(currentCheckoutPreview.paidFile.sizeBytes)}`
            : ''
        }`
      : null,
    accessStateLabel: purchaseResult
      ? isManualDelivery
        ? t('commerce.deliveryStatus.pending')
        : t('commerce.viewerState.active')
      : currentCheckoutPreview
        ? t(`commerce.viewerState.${currentCheckoutPreview.viewerState}`, {
            defaultValue: currentCheckoutPreview.viewerState,
          })
        : null,
  }

  const isUnlocked =
    !!purchaseResult ||
    currentCheckoutPreview?.viewerState === 'active' ||
    currentCheckoutPreview?.primaryAction === 'open_content'
  const opensPaidFile = Boolean(currentCheckoutPreview?.paidFile)
  const unlockedActionLabel = opensPaidFile
    ? t('chat.paidFileOpenAction')
    : t('chat.commerceViewEntitlement')

  return (
    <article
      className={cn(
        'relative w-full max-w-[460px] flex overflow-hidden rounded-[20px] border backdrop-blur-2xl shadow-xl text-left my-2 group',
        isUnlocked
          ? 'border-success/30 bg-bg-secondary/40'
          : 'border-border-subtle bg-bg-secondary/40',
      )}
    >
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-r from-transparent pointer-events-none',
          isUnlocked ? 'via-success/5 to-success/10' : 'via-primary/5 to-primary/10',
        )}
      />
      {isDelivering && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-bg-secondary/90 text-primary backdrop-blur-sm">
          <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <div className="text-sm font-black">{t('chat.commerceUnlocking')}</div>
        </div>
      )}
      <div className="flex-1 p-4 min-w-0 flex flex-col justify-center relative z-10">
        <button
          type="button"
          className="block w-full text-left transition hover:opacity-80 focus-visible:outline-none"
          onClick={resolveCardAction}
        >
          <div className="flex items-start gap-4">
            {card.snapshot.imageUrl ? (
              <img
                src={card.snapshot.imageUrl}
                alt={card.snapshot.name}
                className={cn(
                  'aspect-[3/2] w-20 shrink-0 rounded-xl bg-bg-tertiary object-cover shadow-sm',
                  !isUnlocked && 'opacity-90 grayscale-[20%]',
                )}
              />
            ) : (
              <div
                className={cn(
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-inner',
                  isUnlocked ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary',
                )}
              >
                <Ticket size={24} strokeWidth={2.5} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5',
                  isUnlocked ? 'text-success/80' : 'text-primary/80',
                )}
              >
                {isUnlocked ? (
                  <Unlock size={10} strokeWidth={3} />
                ) : (
                  <Lock size={10} strokeWidth={3} />
                )}
                {card.snapshot.billingMode === 'subscription'
                  ? t('chat.commerceSubscription')
                  : t('chat.commerceEntitlement')}
                <span className="opacity-30">·</span>
                <span className="font-mono truncate">{card.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <h4 className="line-clamp-2 text-[15px] font-black text-text-primary leading-tight">
                {card.snapshot.name}
              </h4>
              {card.snapshot.summary && (
                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">
                  {card.snapshot.summary}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-bg-primary/65 px-2 py-1 text-[11px] font-black text-text-muted">
                  <Store size={11} />
                  <span className="truncate">
                    {card.snapshot.shopName ?? t('commerce.consumerStorefront')}
                  </span>
                </span>
                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-black text-primary">
                  <ShieldCheck size={11} />
                  <span className="truncate">
                    {card.snapshot.deliveryPromise ??
                      card.snapshot.summary ??
                      t('commerce.immediateDelivery')}
                  </span>
                </span>
                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-[11px] font-black text-warning">
                  {t('chat.commerceRefundRule')}
                </span>
              </div>
            </div>
          </div>
        </button>
        {(error || purchaseResult) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium">
            {purchaseResult && (
              <span className="text-success flex items-center gap-1">
                <CheckCircle2 size={14} />
                {t('chat.commercePurchaseCompleted')}
              </span>
            )}
            {error && (
              <span className="text-danger flex items-center gap-1">
                <AlertCircle size={14} /> {error}
              </span>
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={productHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-bg-primary/55 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
          >
            <Ticket size={13} />
            {t('commerce.viewProduct')}
          </a>
          <a
            href={shopHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-bg-primary/55 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
          >
            <Store size={13} />
            {t('shop.openShop')}
          </a>
          {purchaseResult && (
            <a
              href={purchaseDeliveryHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-success/12 px-3 text-xs font-black text-success transition hover:bg-success/18"
            >
              <ShieldCheck size={13} />
              {purchaseResult.entitlement
                ? t('shop.viewDeliveryDetail')
                : t('shop.viewPurchaseDelivery')}
            </a>
          )}
        </div>
      </div>
      <div
        className={cn(
          'flex flex-col items-center justify-center relative w-0 border-l-2 border-dashed my-4 z-10',
          isUnlocked ? 'border-success/30' : 'border-border-subtle/60',
        )}
      />
      <div
        className={cn(
          'w-[130px] shrink-0 p-4 flex flex-col items-center justify-center gap-4 relative z-10',
          isUnlocked ? 'bg-success/5' : 'bg-primary/5',
        )}
      >
        <div className="flex flex-col items-center gap-1 w-full text-center">
          {isUnlocked ? (
            <>
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                {t('chat.commerceStatusLabel')}
              </span>
              <div className="inline-flex max-w-full px-2.5 py-1 rounded-lg bg-success/10 border border-success/20 text-success text-[12px] font-black tracking-wide justify-center">
                <span className="truncate">{t('member.status.active', 'ACTIVE')}</span>
              </div>
            </>
          ) : (
            <>
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                {t('chat.commercePriceLabel')}
              </span>
              <div className="inline-flex max-w-full px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[13px] font-black font-mono tracking-tight justify-center">
                <span className="truncate">{formatCommercePrice(card, t)}</span>
              </div>
            </>
          )}
        </div>
        <div className="w-full">
          {isUnlocked ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={resolveCardAction}
              disabled={isOpening}
              className="!rounded-[12px] w-full !px-0 !h-[36px] !text-[13px] !bg-success/15 hover:!bg-success/25 !text-success !border-none shadow-none"
              title={unlockedActionLabel}
            >
              <span className="truncate">
                {isOpening ? t('chat.paidFileOpening') : unlockedActionLabel}
              </span>
              {opensPaidFile ? (
                <FileText size={14} className="shrink-0" />
              ) : (
                <Unlock size={14} className="shrink-0" />
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={resolveCardAction}
              disabled={isBuying || isOpening}
              className="!rounded-[12px] w-full !px-0 !h-[36px] !text-[13px] shadow-[0_0_15px_rgba(0,198,209,0.2)] hover:shadow-[0_0_25px_rgba(0,198,209,0.35)]"
            >
              {currentCheckoutPreview?.primaryAction === 'open_content' || opensPaidFile
                ? t('chat.paidFileOpenAction')
                : t('chat.commerceBuy')}
            </Button>
          )}
        </div>
      </div>
      <PurchaseConfirmationModal
        open={showPurchaseModal}
        details={modalDetails}
        isPending={isBuying || isDelivering}
        isCompleted={!!purchaseResult}
        completionLabel={isManualDelivery ? t('commerce.purchaseOrderCreated') : undefined}
        error={error}
        provisioningStatus={
          isManualDelivery ? null : (purchaseResult?.provisioning?.status ?? null)
        }
        viewEntitlementHref={purchaseDeliveryHref}
        onClose={() => {
          setShowPurchaseModal(false)
          setError(null)
        }}
        onConfirm={buy}
        onViewEntitlement={openPurchasedEntitlement}
      />
    </article>
  )
}

function PaidFileCardViewBase({
  card,
  onPreviewFile,
}: {
  card: PaidFileCard
  onPreviewFile?: (attachment: Attachment) => void
}) {
  const { t } = useTranslation()
  const [isOpening, setIsOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: state } = useQuery({
    queryKey: ['paid-file', card.fileId],
    queryFn: () => fetchApi<PaidFileState>(`/api/paid-files/${card.fileId}`),
    staleTime: 10_000,
  })
  const isUnlocked = state?.hasAccess === true
  const fileStateLabel = isUnlocked ? t('chat.paidFileUnlocked') : t('chat.paidFileLocked')
  const fileAccessLabel = isUnlocked
    ? t('chat.paidFileReady')
    : t('chat.paidFileRequiresEntitlement')

  const openFile = async () => {
    setIsOpening(true)
    setError(null)
    try {
      await openPaidFileInPreview({
        fileId: card.fileId,
        fallbackName: card.snapshot.name,
        fallbackMime: card.snapshot.mime,
        fallbackSizeBytes: card.snapshot.sizeBytes,
        onPreviewFile,
      })
    } catch (err) {
      setError(getApiErrorMessage(err, t, 'chat.paidFileOpenFailed'))
    } finally {
      setIsOpening(false)
    }
  }

  return (
    <div
      className={cn(
        'relative w-full max-w-[440px] flex overflow-hidden rounded-[18px] border backdrop-blur-xl shadow-sm text-left my-2 group',
        isUnlocked
          ? 'border-primary/25 bg-bg-secondary/70'
          : 'border-border-subtle bg-bg-secondary/70',
      )}
    >
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-r from-transparent pointer-events-none',
          isUnlocked ? 'via-primary/5 to-primary/10' : 'via-text-muted/5 to-transparent',
        )}
      />
      <div className="flex-1 p-4 min-w-0 flex flex-col justify-center relative z-10">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-inner',
              isUnlocked ? 'bg-primary/10 text-primary' : 'bg-bg-tertiary text-text-muted',
            )}
          >
            <FileText size={24} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5',
                isUnlocked ? 'text-primary/80' : 'text-text-muted',
              )}
            >
              {isUnlocked ? (
                <Unlock size={10} strokeWidth={3} />
              ) : (
                <Lock size={10} strokeWidth={3} />
              )}
              {fileStateLabel}
              <span className="opacity-30">·</span>
              <span className="font-mono truncate">{card.fileId.slice(0, 8).toUpperCase()}</span>
            </div>
            <h4 className="truncate text-[15px] font-black text-text-primary leading-tight">
              {card.snapshot.name}
            </h4>
            <p className="mt-1 text-xs font-medium text-text-muted truncate">
              {card.snapshot.sizeBytes != null
                ? formatFileSize(card.snapshot.sizeBytes)
                : (card.snapshot.mime ?? t('chat.paidFile'))}
            </p>
            {card.snapshot.summary && (
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">
                {card.snapshot.summary}
              </p>
            )}
          </div>
        </div>
        {error && (
          <div className="mt-4 flex items-center gap-2 text-xs font-medium">
            <span className="text-danger flex items-center gap-1">
              <AlertCircle size={14} /> {error}
            </span>
          </div>
        )}
      </div>
      <div
        className={cn(
          'flex flex-col items-center justify-center relative w-0 border-l-2 border-dashed my-4 z-10',
          isUnlocked ? 'border-primary/25' : 'border-border-subtle/60',
        )}
      />
      <div
        className={cn(
          'w-[130px] shrink-0 p-4 flex flex-col items-center justify-center gap-4 relative z-10',
          isUnlocked ? 'bg-primary/5' : 'bg-bg-tertiary/30',
        )}
      >
        <div className="flex flex-col items-center gap-1 w-full text-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
            {t('chat.paidFileAccessLabel')}
          </span>
          <div
            className={cn(
              'inline-flex max-w-full px-2.5 py-1 rounded-lg border text-[12px] font-black tracking-wide justify-center',
              isUnlocked
                ? 'bg-primary/10 border-primary/20 text-primary'
                : 'bg-bg-secondary border-border-subtle text-text-muted',
            )}
          >
            <span className="truncate">{fileAccessLabel}</span>
          </div>
        </div>
        <div className="w-full">
          <Button
            size="sm"
            onClick={openFile}
            disabled={isOpening || !isUnlocked}
            className={cn(
              '!rounded-[12px] w-full !px-0 !h-[36px] !text-[13px]',
              isUnlocked
                ? '!bg-primary/15 hover:!bg-primary/25 !text-primary !border !border-primary/20 shadow-none'
                : '!bg-bg-secondary !text-text-muted !border !border-border-subtle shadow-none',
            )}
            title={isUnlocked ? t('chat.paidFileOpenAction') : fileAccessLabel}
          >
            {isOpening
              ? t('chat.paidFileOpening')
              : isUnlocked
                ? t('chat.paidFileOpenAction')
                : fileAccessLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export const CommerceProductCardView = memo(CommerceProductCardViewBase)
export const PaidFileCardView = memo(PaidFileCardViewBase)

CommerceProductCardView.displayName = 'CommerceProductCardView'
PaidFileCardView.displayName = 'PaidFileCardView'
