import type {
  CommerceProductCard,
  MessageMention,
  OAuthLinkCard,
  PaidFileCard,
} from '@shadowob/shared'
import { segmentTextByMentions } from '@shadowob/shared'
import { Button, cn } from '@shadowob/ui'
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow, type Locale } from 'date-fns'
import { enUS, ja, ko, zhCN, zhTW } from 'date-fns/locale'
import {
  AlertCircle,
  AtSign,
  Check,
  CheckCircle2,
  CheckSquare,
  Copy,
  ExternalLink,
  FileText,
  Gift,
  HandCoins,
  Hash,
  Lock,
  MoreHorizontal,
  Pencil,
  Reply,
  Smile,
  Square,
  Ticket,
  Trash2,
  Unlock,
  Wallet,
  X,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchApi } from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api-errors'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { PurchaseConfirmationModal } from '../commerce/purchase-confirmation-modal'
import { UserAvatar } from '../common/avatar'
import { useConfirmStore } from '../common/confirm-dialog'
import { EmojiPicker } from '../common/emoji-picker'
import { UserProfileCard } from '../common/user-profile-card'
import { CommunityEconomySendModal } from '../community-economy/community-economy-send-modal'
import { formatFileSize } from '../workspace/workspace-utils'
import { FileCard } from './file-card'
import { ImageContextMenu } from './image-context-menu'
import { OAuthLinkCardView, type OAuthLinkPreview } from './oauth-link-card'

function lowerText(value: unknown) {
  return typeof value === 'string' ? value.toLocaleLowerCase() : ''
}

interface Author {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
}

interface ReactionGroup {
  emoji: string
  count: number
  userIds: string[]
}

interface Attachment {
  id: string
  filename: string
  url: string
  contentType: string
  size: number
  paidFileId?: string
}

export interface Message {
  id: string
  content: string
  channelId?: string
  authorId: string
  threadId?: string | null
  replyToId: string | null
  isEdited: boolean
  isPinned?: boolean
  createdAt: string
  updatedAt?: string
  author?: Author
  reactions?: ReactionGroup[]
  attachments?: Attachment[]
  /** Optional metadata blob — includes interactive blocks (Phase 2). */
  metadata?: {
    mentions?: MessageMention[]
    interactive?: InteractiveBlock
    interactiveResponse?: InteractiveResponseMetadata
    interactiveState?: InteractiveStateMetadata
    commerceCards?: CommerceProductCard[]
    paidFileCards?: PaidFileCard[]
    oauthLinkCards?: OAuthLinkCard[]
    [key: string]: unknown
  }
  /** Optimistic send status — only set on client-side pending messages */
  sendStatus?: 'sending' | 'failed'
}

/** Phase 2 interactive block shape — mirrors server schema. */
export interface InteractiveButtonItem {
  id: string
  label: string
  style?: 'primary' | 'secondary' | 'destructive'
  value?: string
}
export interface InteractiveSelectItem {
  id: string
  label: string
  value: string
}
export interface InteractiveFormField {
  id: string
  kind: 'text' | 'textarea' | 'number' | 'checkbox' | 'select'
  label: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
  options?: InteractiveSelectItem[]
  maxLength?: number
  min?: number
  max?: number
}
export interface InteractiveBlock {
  id: string
  kind: 'buttons' | 'select' | 'form' | 'approval'
  prompt?: string
  buttons?: InteractiveButtonItem[]
  options?: InteractiveSelectItem[]
  fields?: InteractiveFormField[]
  submitLabel?: string
  responsePrompt?: string
  approvalCommentLabel?: string
  oneShot?: boolean
}
export interface InteractiveResponseMetadata {
  blockId: string
  sourceMessageId: string
  actionId: string
  value: string
  values?: Record<string, string>
  submissionId?: string
  responseMessageId?: string | null
  submittedAt?: string
}
export interface InteractiveStateMetadata {
  sourceMessageId: string
  blockId: string
  submitted: boolean
  response?: InteractiveResponseMetadata
}

export type { Attachment, Author, ReactionGroup }

interface MessagesPage {
  messages: Message[]
  hasMore: boolean
}

interface WalletRechargeMetadata {
  requiredAmount?: number
  balance?: number
  shortfall?: number
  model?: string
}

export interface MessageBubbleProps {
  message: Message
  currentUserId: string
  serverId?: string
  onReply?: (messageId: string) => void
  onReact?: (messageId: string, emoji: string) => void
  onMessageUpdate?: (msg: Message) => void
  onMessageDelete?: (msgId: string) => void
  onPreviewFile?: (attachment: Attachment) => void
  onPreviewOAuthLink?: (preview: OAuthLinkPreview) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  /** Custom edit API — defaults to PATCH /api/messages/:id */
  editApi?: (messageId: string, content: string) => Promise<Message>
  /** Custom delete API — defaults to DELETE /api/messages/:id */
  deleteApi?: (messageId: string) => Promise<void>
  highlight?: boolean
  replyToMessage?: Message | null
  /** Multi-select mode */
  selectionMode?: boolean
  isSelected?: boolean
  submittedInteractiveResponse?: InteractiveResponseMetadata | null
  onToggleSelect?: (messageId: string) => void
  onEnterSelectionMode?: (messageId: string) => void
  /** When true, this message is grouped with the previous message (same author, within 1 min) — hide avatar & name */
  isGrouped?: boolean
}

const quickEmojis = ['👍', '❤️', '😂', '🎉', '🤔', '👀']

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

async function openPaidFileInPreview(input: {
  fileId: string
  fallbackName: string
  fallbackMime?: string | null
  fallbackSizeBytes?: number | null
  onPreviewFile?: (attachment: Attachment) => void
}) {
  const result = await fetchApi<{ viewerUrl: string }>(`/api/paid-files/${input.fileId}/open`, {
    method: 'POST',
  })
  const attachment = {
    id: `paid-file-${input.fileId}`,
    filename: input.fallbackName,
    url: result.viewerUrl,
    contentType: input.fallbackMime ?? 'text/html; charset=utf-8',
    size: input.fallbackSizeBytes ?? 0,
    paidFileId: input.fileId,
  }
  if (input.onPreviewFile) {
    input.onPreviewFile(attachment)
    return
  }
  window.location.assign(result.viewerUrl)
}
const WALLET_RECHARGE_MARKER_PATTERN = /<!--\s*shadow:wallet-recharge\s+([A-Za-z0-9_-]+)\s*-->/u

function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

type SignedMediaUrl = {
  url: string
  expiresAt: string
}

const signedMediaCache = new Map<string, SignedMediaUrl>()

function isSignedMediaCacheFresh(entry: SignedMediaUrl): boolean {
  return new Date(entry.expiresAt).getTime() - 30_000 > Date.now()
}

async function resolveAttachmentMediaUrl(
  attachmentId: string,
  disposition: 'inline' | 'attachment',
): Promise<SignedMediaUrl> {
  const cacheKey = `channel:${attachmentId}:${disposition}`
  const cached = signedMediaCache.get(cacheKey)
  if (cached && isSignedMediaCacheFresh(cached)) return cached

  const path = `/api/attachments/${attachmentId}/media-url?disposition=${disposition}`
  const resolved = await fetchApi<SignedMediaUrl>(path)
  signedMediaCache.set(cacheKey, resolved)
  return resolved
}

function formatCoinValue(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'
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

function decodeWalletRechargeMarker(content: string): WalletRechargeMetadata | null {
  const match = content.match(WALLET_RECHARGE_MARKER_PATTERN)
  const encoded = match?.[1]
  if (!encoded || typeof window === 'undefined') return null
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const parsed = JSON.parse(window.atob(padded)) as Record<string, unknown>
    const pickNumber = (key: string) => {
      const value = parsed[key]
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined
    }
    return {
      requiredAmount: pickNumber('requiredAmount'),
      balance: pickNumber('balance'),
      shortfall: pickNumber('shortfall'),
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
    }
  } catch {
    return null
  }
}

function stripWalletRechargeMarker(content: string): string {
  return content.replace(WALLET_RECHARGE_MARKER_PATTERN, '').trim()
}

function openRechargeModal() {
  if (typeof window === 'undefined') return
  let acked = false
  const onAck = () => {
    acked = true
    window.removeEventListener('shadow:open-recharge:ack', onAck)
  }
  window.addEventListener('shadow:open-recharge:ack', onAck)
  window.dispatchEvent(new CustomEvent('shadow:open-recharge', { detail: { source: 'chat' } }))
  window.setTimeout(() => {
    window.removeEventListener('shadow:open-recharge:ack', onAck)
    if (!acked) window.location.href = '/app/settings/wallet'
  }, 500)
}

function WalletRechargeCard({ data }: { data: WalletRechargeMetadata }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 max-w-lg rounded-2xl bg-warning/10 p-4 text-left shadow-[0_0_0_1px_rgba(245,158,11,0.18)_inset]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
          <Wallet size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-black text-text-primary">
            {t('chat.modelWalletRechargeTitle')}
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            {t('chat.modelWalletRechargeBody')}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-bg-primary/35 px-3 py-2">
          <p className="text-[11px] font-semibold text-text-muted">
            {t('chat.modelWalletRechargeNeeded')}
          </p>
          <p className="mt-1 text-sm font-black text-text-primary">
            {formatCoinValue(data.requiredAmount)}
          </p>
        </div>
        <div className="rounded-xl bg-bg-primary/35 px-3 py-2">
          <p className="text-[11px] font-semibold text-text-muted">
            {t('chat.modelWalletRechargeBalance')}
          </p>
          <p className="mt-1 text-sm font-black text-text-primary">
            {formatCoinValue(data.balance)}
          </p>
        </div>
        <div className="rounded-xl bg-bg-primary/35 px-3 py-2">
          <p className="text-[11px] font-semibold text-text-muted">
            {t('chat.modelWalletRechargeShortfall')}
          </p>
          <p className="mt-1 text-sm font-black text-warning">{formatCoinValue(data.shortfall)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={openRechargeModal} className="!rounded-xl">
          <Wallet size={14} />
          {t('chat.modelWalletRechargeAction')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            window.location.href = '/app/settings/tasks'
          }}
          className="!rounded-xl"
        >
          {t('chat.modelWalletTasksAction')}
        </Button>
      </div>
    </div>
  )
}

function CommerceProductCardView({
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
    deliveryLabel: t('commerce.immediateDelivery'),
    shopLabel: currentCheckoutPreview?.shop.name,
    paidFileLabel: currentCheckoutPreview?.paidFile
      ? `${currentCheckoutPreview.paidFile.name}${
          currentCheckoutPreview.paidFile.sizeBytes != null
            ? ` · ${formatFileSize(currentCheckoutPreview.paidFile.sizeBytes)}`
            : ''
        }`
      : null,
    accessStateLabel: purchaseResult
      ? t('commerce.viewerState.active')
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
    <div
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
                  'h-14 w-14 shrink-0 rounded-xl object-cover shadow-sm bg-bg-tertiary',
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
        error={error}
        provisioningStatus={purchaseResult?.provisioning?.status ?? null}
        onClose={() => {
          setShowPurchaseModal(false)
          setError(null)
        }}
        onConfirm={buy}
        onViewEntitlement={openPurchasedEntitlement}
      />
    </div>
  )
}

function PaidFileCardView({
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

function CodeBlockWithCopy({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)

  const handleCopyCode = () => {
    const _codeEl = document.createElement('div')
    let text = ''
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node
      if (typeof node === 'number') return String(node)
      if (!node) return ''
      if (Array.isArray(node)) return node.map(extractText).join('')
      if (
        typeof node === 'object' &&
        node !== null &&
        'props' in (node as unknown as Record<string, unknown>)
      ) {
        return extractText(
          (node as React.ReactElement<{ children?: React.ReactNode }>).props.children,
        )
      }
      return ''
    }
    text = extractText(children)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group">
      <pre className="!m-0">{children}</pre>
      <Button
        variant="ghost"
        size="xs"
        onClick={handleCopyCode}
        className="absolute top-2 right-2 !p-1.5 !h-auto !w-auto !rounded-md !font-normal !normal-case !tracking-normal opacity-0 group-hover:opacity-100 bg-bg-secondary/50 backdrop-blur-sm border border-white/10 text-text-muted hover:text-text-primary"
        title="Copy code"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </Button>
    </div>
  )
}

function AttachmentView({
  attachment,
  onPreviewFile,
  onSaveToWorkspace,
  onImageContextMenu,
}: {
  attachment: Attachment
  onPreviewFile?: (attachment: Attachment) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  onImageContextMenu: (event: React.MouseEvent, attachment: Attachment) => void
}) {
  const [inlineUrl, setInlineUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const isImage = isImageType(attachment.contentType)

  useEffect(() => {
    let cancelled = false
    const disposition = isImage ? 'inline' : 'attachment'
    resolveAttachmentMediaUrl(attachment.id, disposition)
      .then((resolved) => {
        if (!cancelled) {
          if (isImage) setInlineUrl(resolved.url)
          else setDownloadUrl(resolved.url)
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (isImage) setInlineUrl(null)
          else setDownloadUrl(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [attachment.id, isImage])

  const resolveDownload = useCallback(async () => {
    const resolved = await resolveAttachmentMediaUrl(attachment.id, 'attachment')
    setDownloadUrl(resolved.url)
    return resolved.url
  }, [attachment.id])

  if (isImage) {
    const href = downloadUrl ?? inlineUrl ?? '#'
    const src = inlineUrl ?? undefined
    return (
      <div className="relative">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-xs rounded-xl overflow-hidden border border-border-subtle"
          onClick={async (event) => {
            if (downloadUrl) return
            event.preventDefault()
            const url = await resolveDownload()
            window.open(url, '_blank', 'noopener,noreferrer')
          }}
          onContextMenu={(event) => onImageContextMenu(event, attachment)}
        >
          {src ? (
            <img src={src} alt={attachment.filename} className="max-h-60 object-contain" />
          ) : (
            <div className="h-40 w-60 bg-surface-2" />
          )}
        </a>
      </div>
    )
  }

  return (
    <FileCard
      filename={attachment.filename}
      url={downloadUrl ?? '#'}
      contentType={attachment.contentType}
      size={attachment.size}
      onClick={async () => {
        const url = downloadUrl ?? (await resolveDownload())
        onPreviewFile?.({ ...attachment, url })
      }}
      onSaveToWorkspace={onSaveToWorkspace ? () => onSaveToWorkspace(attachment) : undefined}
    />
  )
}

function MessageBubbleInner({
  message,
  currentUserId,
  serverId,
  onReply,
  onReact,
  onMessageUpdate,
  onMessageDelete,
  onPreviewFile,
  onPreviewOAuthLink,
  onSaveToWorkspace,
  editApi,
  deleteApi,
  highlight,
  replyToMessage,
  selectionMode,
  isSelected,
  submittedInteractiveResponse,
  onToggleSelect,
  onEnterSelectionMode,
  isGrouped = false,
}: MessageBubbleProps) {
  const { t, i18n } = useTranslation()
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFullPicker, setShowFullPicker] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [economyMode, setEconomyMode] = useState<'tip' | 'gift' | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [copied, setCopied] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  const [avatarHover, setAvatarHover] = useState(false)
  const [avatarPinned, setAvatarPinned] = useState(false)
  const [avatarCardPos, setAvatarCardPos] = useState<{ left: number; top: number } | null>(null)
  const [avatarContextMenu, setAvatarContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [imageContextMenu, setImageContextMenu] = useState<{
    x: number
    y: number
    att: Attachment
  } | null>(null)
  const avatarHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  const showActions = isHovered && !selectionMode

  // Close all menus on scroll (find nearest scrollable ancestor)
  useEffect(() => {
    if (!showActions && !showEmojiPicker && !showFullPicker && !showMoreMenu) return
    const scrollParent = messageRef.current?.closest(
      '[class*="overflow-y-auto"]',
    ) as HTMLElement | null
    if (!scrollParent) return
    const handleScroll = () => {
      setIsHovered(false)
      setShowEmojiPicker(false)
      setShowFullPicker(false)
      setShowMoreMenu(false)
    }
    scrollParent.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollParent.removeEventListener('scroll', handleScroll)
  }, [showActions, showEmojiPicker, showFullPicker, showMoreMenu])

  const activateHover = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setIsHovered(true)
  }, [])

  const deactivateHover = useCallback(() => {
    if (showMoreMenu || showEmojiPicker || showFullPicker) return
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
      setShowEmojiPicker(false)
      setShowFullPicker(false)
    }, 150)
  }, [showMoreMenu, showEmojiPicker, showFullPicker])

  const isOwn = message.authorId === currentUserId
  const getFloatingControlsStyle = useCallback(
    (offsetTop: number, estimatedWidth: number): React.CSSProperties | null => {
      if (typeof window === 'undefined') return null
      const rect = messageRef.current?.getBoundingClientRect()
      if (!rect) return null

      const maxTop = Math.max(8, window.innerHeight - 56)
      const maxLeft = Math.max(8, window.innerWidth - estimatedWidth - 8)
      const desiredLeft = rect.right - estimatedWidth - 16

      return {
        top: Math.min(Math.max(8, rect.top - offsetTop), maxTop),
        left: Math.min(Math.max(8, desiredLeft), maxLeft),
      }
    },
    [],
  )
  const queryClient = useQueryClient()
  const author = message.author
  const canSendEconomyAction = Boolean(author && !isOwn && !author.isBot)

  const handleEdit = useCallback(() => {
    setEditContent(message.content)
    setIsEditing(true)
    setShowMoreMenu(false)
    setTimeout(() => editInputRef.current?.focus(), 50)
  }, [message.content])

  const handleSaveEdit = useCallback(async () => {
    if (!editContent.trim() || editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    try {
      const updated = editApi
        ? await editApi(message.id, editContent.trim())
        : await fetchApi<Message>(`/api/messages/${message.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ content: editContent.trim() }),
          })
      onMessageUpdate?.(updated)
      setIsEditing(false)
    } catch {
      /* keep editing on error */
    }
  }, [editContent, message.id, message.content, onMessageUpdate, editApi])

  const handleDelete = useCallback(async () => {
    setShowMoreMenu(false)
    const ok = await useConfirmStore.getState().confirm({
      title: t('chat.deleteMessage'),
      message: t('chat.deleteConfirm'),
    })
    if (!ok) return
    try {
      if (deleteApi) {
        await deleteApi(message.id)
      } else {
        await fetchApi(`/api/messages/${message.id}`, { method: 'DELETE' })
      }
      onMessageDelete?.(message.id)
    } catch {
      /* ignore */
    }
  }, [message.id, onMessageDelete, deleteApi, t])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setShowMoreMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const handleShareLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?msg=${message.id}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setShowMoreMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }, [message.id])

  // Avatar hover handlers
  const handleAvatarMouseEnter = useCallback(() => {
    if (avatarPinned) return
    if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
    avatarHoverTimerRef.current = setTimeout(() => {
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect()
        setAvatarCardPos({
          left: rect.right + 12,
          top: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
        })
        setAvatarHover(true)
      }
    }, 350)
  }, [avatarPinned])

  const handleAvatarMouseLeave = useCallback(() => {
    if (avatarPinned) return
    if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
    avatarHoverTimerRef.current = setTimeout(() => setAvatarHover(false), 200)
  }, [avatarPinned])

  const handleAvatarClick = useCallback(() => {
    if (author) {
      setAvatarPinned(true)
      setAvatarHover(true)
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect()
        setAvatarCardPos({
          left: rect.right + 12,
          top: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
        })
      }
    }
  }, [author])

  const handleAvatarContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setAvatarContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeAvatarCard = useCallback(() => {
    setAvatarPinned(false)
    setAvatarHover(false)
  }, [])

  // Look up server member info from cache for role/buddy metadata.
  const membersList = serverId
    ? (queryClient.getQueryData<MemberEntry[]>(['members', serverId]) ?? [])
    : []
  const authorMember = membersList.find((m: MemberEntry) => m.userId === author?.id)
  const buddyAgentsList = serverId
    ? (queryClient.getQueryData<BuddyAgentEntry[]>(['members-buddy-agents', serverId]) ?? [])
    : []
  const buddyAgent = author?.isBot
    ? buddyAgentsList.find((a: BuddyAgentEntry) => a.botUser?.id === author.id)
    : undefined
  const currentMember = membersList.find((m: MemberEntry) => m.userId === currentUserId)
  const canKick = !!serverId && (currentMember?.role === 'owner' || currentMember?.role === 'admin')
  // Allow deletion for own messages OR messages from a bot owned by the current user
  const canDelete = isOwn || (author?.isBot && buddyAgent?.ownerId === currentUserId)

  const dateFnsLocaleMap: Record<string, Locale> = {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    en: enUS,
    ja,
    ko,
  }
  const time = formatDistanceToNow(new Date(message.createdAt), {
    locale: dateFnsLocaleMap[i18n.language] ?? zhCN,
    addSuffix: true,
  })

  const resolveMentionLabel = useCallback(
    (mention: string) => {
      if (!mention.startsWith('@')) return mention
      const username = mention.slice(1)
      const member = membersList.find(
        (m: MemberEntry) => m.user?.username === username || m.user?.displayName === username,
      )
      const display = member?.user?.displayName ?? member?.user?.username
      return display ? `@${display}` : mention
    },
    [membersList],
  )

  const structuredMentions = useMemo(() => {
    return Array.isArray(message.metadata?.mentions)
      ? (message.metadata.mentions as MessageMention[]).filter((mention) => mention.token)
      : []
  }, [message.metadata])

  const resolveLegacyEntityMention = useCallback(
    (token: string): MessageMention | null => {
      const key = token.slice(1).toLocaleLowerCase()
      if (!key) return null

      if (token.startsWith('@')) {
        const hasUserMatch = membersList.some((member) => {
          const username = member.user?.username?.toLocaleLowerCase()
          const displayName = member.user?.displayName?.toLocaleLowerCase()
          return username === key || displayName === key
        })
        if (hasUserMatch) return null

        const serverRows = queryClient.getQueriesData<LegacyServerEntry[]>({
          queryKey: ['servers'],
        })
        const servers = serverRows.flatMap(([, data]) => (Array.isArray(data) ? data : []))
        const server = servers.find((candidate) => {
          const slug = lowerText(candidate.slug)
          const name = lowerText(candidate.name)
          return slug === key || name === key
        })
        if (!server) return null
        const serverName = typeof server.name === 'string' && server.name.trim() ? server.name : key
        return {
          kind: 'server',
          targetId: server.id,
          token,
          sourceToken: token,
          label: `@${serverName}`,
          serverId: server.id,
          serverSlug: server.slug,
          serverName,
        }
      }

      if (!token.startsWith('#')) return null
      const channelRows = queryClient.getQueriesData<LegacyChannelEntry[]>({
        queryKey: ['channels'],
      })
      const channels = channelRows.flatMap(([, data]) => (Array.isArray(data) ? data : []))
      const channel = channels.find((candidate) => lowerText(candidate.name) === key)
      if (!channel || !serverId) return null
      const channelName =
        typeof channel.name === 'string' && channel.name.trim() ? channel.name : key

      return {
        kind: 'channel',
        targetId: channel.id,
        token,
        sourceToken: token,
        label: `#${channelName}`,
        channelId: channel.id,
        channelName,
        serverId,
        isPrivate: channel.isPrivate,
      }
    },
    [membersList, queryClient, serverId],
  )

  /**
   * Process react children to highlight structured mentions and legacy @username patterns.
   */
  const renderMentions = useCallback(
    (children: React.ReactNode): React.ReactNode => {
      if (!children) return children
      const childArray = Array.isArray(children) ? children : [children]
      return childArray.map((child, idx) => {
        if (typeof child !== 'string') return child
        const structuredSegments = segmentTextByMentions(child, structuredMentions)
        const hasStructuredMention = structuredSegments.some(
          (segment) => segment.type === 'mention',
        )
        const parts = hasStructuredMention
          ? structuredSegments
          : [{ type: 'text' as const, text: child }]

        return parts.flatMap((part, pi) => {
          if (part.type === 'mention') {
            const structuredMention = part.mention
            if (structuredMention.kind === 'user' || structuredMention.kind === 'buddy') {
              return [
                <MentionSpan
                  key={`${idx}-${pi}`}
                  mention={part.text}
                  label={structuredMention.label}
                  structuredMention={structuredMention}
                />,
              ]
            }
            return [<EntityMentionSpan key={`${idx}-${pi}`} mention={structuredMention} />]
          }

          const legacyParts = part.text.split(/([@#][\p{L}\p{N}_-]+)/gu).filter(Boolean)
          if (legacyParts.length === 1) return [part.text]
          return legacyParts.map((legacyPart, legacyIndex) => {
            const legacyEntity = resolveLegacyEntityMention(legacyPart)
            if (legacyEntity) {
              return (
                <EntityMentionSpan key={`${idx}-${pi}-${legacyIndex}`} mention={legacyEntity} />
              )
            }
            if (/^@[\p{L}\p{N}_-]+$/u.test(legacyPart)) {
              return (
                <MentionSpan
                  key={`${idx}-${pi}-${legacyIndex}`}
                  mention={legacyPart}
                  label={resolveMentionLabel(legacyPart)}
                />
              )
            }
            return legacyPart
          })
        })
      })
    },
    [resolveLegacyEntityMention, resolveMentionLabel, structuredMentions],
  )

  const walletRecharge = useMemo(
    () => decodeWalletRechargeMarker(message.content),
    [message.content],
  )
  const markdownContent = useMemo(
    () => (walletRecharge ? stripWalletRechargeMarker(message.content) : message.content),
    [message.content, walletRecharge],
  )
  const markdownNode = useMemo(() => {
    if (!markdownContent || markdownContent === '\u200B') return null

    return (
      <div className="text-[15px] text-text-primary leading-[1.6] tracking-[0.01em] break-words msg-markdown pt-[2px]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            img: ({ src, alt }) => (
              <a href={src} target="_blank" rel="noopener noreferrer">
                <img src={src} alt={alt ?? ''} loading="lazy" />
              </a>
            ),
            a: ({ href, children }) => {
              const handleClick = (e: React.MouseEvent) => {
                e.preventDefault()
                if (href) {
                  window.open(href, '_blank', 'noopener,noreferrer')
                }
              }
              return (
                <a
                  href={href}
                  onClick={handleClick}
                  className="text-primary hover:underline cursor-pointer"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              )
            },
            p: ({ children }) => <p>{renderMentions(children)}</p>,
            li: ({ children }) => <li>{renderMentions(children)}</li>,
            table: ({ children }) => (
              <div className="msg-markdown-table-scroll">
                <table>{children}</table>
              </div>
            ),
            td: ({ children }) => <td>{renderMentions(children)}</td>,
            code: ({ className, children, ...props }) => {
              if (className) {
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              }
              return (
                <code className="bg-bg-modifier-hover rounded px-1.5" {...props}>
                  {children}
                </code>
              )
            },
            pre: ({ children }) => <CodeBlockWithCopy>{children}</CodeBlockWithCopy>,
          }}
        >
          {markdownContent}
        </ReactMarkdown>
      </div>
    )
  }, [markdownContent, renderMentions])

  return (
    <div
      ref={messageRef}
      id={`msg-${message.id}`}
      className={`group relative flex gap-4 px-4 ${isGrouped ? 'py-0.5 pl-[72px]' : 'py-2'} mx-1 message-row hover:bg-bg-tertiary/20 ${highlight ? 'bg-primary/10 animate-pulse' : 'mt-[2px]'} ${isSelected ? 'bg-primary/10' : ''} ${selectionMode ? 'cursor-pointer' : ''}`}
      onMouseEnter={activateHover}
      onMouseLeave={deactivateHover}
      onClick={selectionMode ? () => onToggleSelect?.(message.id) : undefined}
      onTouchStart={() => {
        longPressTimerRef.current = setTimeout(() => {
          setIsHovered(true)
        }, 500)
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
      onTouchMove={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="flex-shrink-0 flex items-center mr-[-8px]">
          {isSelected ? (
            <CheckSquare size={18} className="text-primary" />
          ) : (
            <Square size={18} className="text-text-muted" />
          )}
        </div>
      )}
      {/* Avatar container — hidden in grouped mode */}
      {!isGrouped && (
        <div
          ref={avatarRef}
          className={`flex-shrink-0 ${replyToMessage ? 'mt-6' : 'mt-0.5'} cursor-pointer`}
          onMouseEnter={handleAvatarMouseEnter}
          onMouseLeave={handleAvatarMouseLeave}
          onClick={handleAvatarClick}
          onContextMenu={handleAvatarContextMenu}
        >
          <UserAvatar
            userId={author?.id}
            avatarUrl={author?.avatarUrl}
            displayName={author?.displayName ?? author?.username}
            size="md"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Reply reference */}
        {replyToMessage && (
          <div className="mb-1 flex w-full justify-start">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`msg-${replyToMessage.id}`)
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
              className="grid max-w-[min(100%,42rem)] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1.5 border-l-2 border-primary/70 py-0.5 pl-2 text-left text-xs text-text-muted transition hover:text-text-secondary"
            >
              <Reply size={12} className="shrink-0 text-primary/75" />
              <span className="min-w-0 truncate">
                <span className="font-semibold text-text-secondary/90">
                  {replyToMessage.author?.displayName ??
                    replyToMessage.author?.username ??
                    t('common.unknownUser')}
                </span>
                <span className="opacity-70"> {replyToMessage.content}</span>
              </span>
            </button>
          </div>
        )}
        {/* Author line — hidden in grouped mode */}
        {!isGrouped && (
          <div className="flex items-baseline gap-2 leading-none mb-1">
            <span
              className={`font-bold text-[15px] hover:underline cursor-pointer ${author?.isBot ? 'text-primary' : 'text-text-primary'}`}
            >
              {author?.displayName ?? author?.username ?? t('common.unknownUser')}
            </span>
            {author?.isBot && (
              <span className="text-[11px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-black uppercase tracking-widest flex items-center gap-1">
                <Check size={8} />
                {t('common.bot')}
              </span>
            )}
            <span className="text-xs text-text-muted ml-0.5">{time}</span>
            {message.isEdited && (
              <span
                className="text-[11px] text-text-muted cursor-help"
                title={format(new Date(message.updatedAt ?? message.createdAt), 'PPpp', {
                  locale: dateFnsLocaleMap[i18n.language] ?? zhCN,
                })}
              >
                {t('chat.edited')}
              </span>
            )}
          </div>
        )}

        {/* Inline edit mode */}
        {isEditing ? (
          <div className="mt-1">
            <textarea
              ref={editInputRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault()
                  handleSaveEdit()
                } else if (e.key === 'Escape') {
                  setIsEditing(false)
                }
              }}
              className="w-full bg-bg-secondary/80 text-text-primary rounded-2xl px-3 py-2 text-sm outline-none border-2 border-border-subtle focus:ring-2 focus:ring-primary/20 resize-none"
              rows={Math.min(editContent.split('\n').length + 1, 8)}
            />
            <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
              <span>Esc {t('common.cancel')}</span>
              <span>·</span>
              <span>Enter {t('common.save')}</span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="!p-1 !h-auto !w-auto !font-normal !normal-case !tracking-normal"
              >
                <X size={14} />
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                className="!p-1 !h-auto !w-auto !font-normal !normal-case !tracking-normal"
              >
                <Check size={14} />
              </Button>
            </div>
          </div>
        ) : (
          markdownNode
        )}

        {walletRecharge && <WalletRechargeCard data={walletRecharge} />}

        {message.metadata?.commerceCards && message.metadata.commerceCards.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {message.metadata.commerceCards.map((card) => (
              <CommerceProductCardView
                key={card.id}
                card={card}
                messageId={message.id}
                onPreviewFile={onPreviewFile}
              />
            ))}
          </div>
        )}

        {message.metadata?.paidFileCards && message.metadata.paidFileCards.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {message.metadata.paidFileCards.map((card) => (
              <PaidFileCardView key={card.id} card={card} onPreviewFile={onPreviewFile} />
            ))}
          </div>
        )}

        {message.metadata?.oauthLinkCards && message.metadata.oauthLinkCards.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {message.metadata.oauthLinkCards.map((card) => (
              <OAuthLinkCardView
                key={card.id}
                card={card}
                messageId={message.id}
                channelId={message.channelId}
                onPreview={onPreviewOAuthLink ?? (() => undefined)}
              />
            ))}
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {message.attachments.map((att) => (
              <AttachmentView
                key={att.id}
                attachment={att}
                onPreviewFile={onPreviewFile}
                onSaveToWorkspace={onSaveToWorkspace}
                onImageContextMenu={(event, attachment) => {
                  event.preventDefault()
                  setImageContextMenu({ x: event.clientX, y: event.clientY, att: attachment })
                }}
              />
            ))}
            {imageContextMenu &&
              createPortal(
                <ImageContextMenu
                  x={imageContextMenu.x}
                  y={imageContextMenu.y}
                  attachment={imageContextMenu.att}
                  onClose={() => setImageContextMenu(null)}
                  onSaveToWorkspace={
                    onSaveToWorkspace ? () => onSaveToWorkspace(imageContextMenu.att) : undefined
                  }
                />,
                document.body,
              )}
          </div>
        )}

        {/* Interactive block (Phase 2 POC — buttons / select) */}
        {message.metadata?.interactive && (
          <InteractiveBlockRenderer
            block={message.metadata.interactive}
            messageId={message.id}
            disabled={message.sendStatus === 'sending'}
            submittedResponse={submittedInteractiveResponse}
          />
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {message.reactions.map((r) => (
              <Button
                variant="ghost"
                size="sm"
                key={r.emoji}
                onClick={() => onReact?.(message.id, r.emoji)}
                className={cn(
                  '!rounded-[10px] !h-[26px] !px-2 !font-normal !normal-case !tracking-normal !text-xs hover:!translate-y-0 transition-colors',
                  (r.userIds ?? []).includes(currentUserId)
                    ? 'bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20'
                    : 'bg-white/5 dark:bg-[#1A1D24]/50 border border-black/5 dark:border-white/5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10',
                )}
              >
                <span className="mr-1">{r.emoji}</span>
                <span className="font-medium opacity-80">{r.count}</span>
              </Button>
            ))}
          </div>
        )}

        {/* Send status indicator — only show on failure */}
        {message.sendStatus === 'failed' && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-danger">
            <AlertCircle size={12} />
            <span>{t('chat.sendFailed')}</span>
            <button
              type="button"
              onClick={() => {
                const channelId = message.channelId
                if (!channelId) return
                queryClient.setQueryData<InfiniteData<MessagesPage>>(
                  ['messages', channelId],
                  (old) => {
                    if (!old) return old
                    return {
                      ...old,
                      pages: old.pages.map((page) => ({
                        ...page,
                        messages: page.messages.filter((m) => m.id !== message.id),
                      })),
                    }
                  },
                )
                const tempId = `temp-${Date.now()}`
                const retryMsg = { ...message, id: tempId, sendStatus: 'sending' as const }
                queryClient.setQueryData<InfiniteData<MessagesPage>>(
                  ['messages', channelId],
                  (old) => {
                    if (!old || old.pages.length === 0) return old
                    const pages = [...old.pages]
                    const firstPage = pages[0]!
                    pages[0] = { ...firstPage, messages: [...firstPage.messages, retryMsg] }
                    return { ...old, pages }
                  },
                )
                fetchApi(`/api/channels/${channelId}/messages`, {
                  method: 'POST',
                  body: JSON.stringify({ content: message.content, replyToId: message.replyToId }),
                }).catch(() => {
                  queryClient.setQueryData<InfiniteData<MessagesPage>>(
                    ['messages', channelId],
                    (old) => {
                      if (!old) return old
                      return {
                        ...old,
                        pages: old.pages.map((page) => ({
                          ...page,
                          messages: page.messages.map((m) =>
                            m.id === tempId ? { ...m, sendStatus: 'failed' as const } : m,
                          ),
                        })),
                      }
                    },
                  )
                })
              }}
              className="ml-1 px-2 py-0.5 bg-danger/10 hover:bg-danger/20 rounded text-danger text-xs font-medium transition"
            >
              {t('chat.retry')}
            </button>
          </div>
        )}
      </div>

      {/* Hover actions */}
      {showActions &&
        messageRef.current &&
        (() => {
          const floatingStyle = getFloatingControlsStyle(16, canSendEconomyAction ? 184 : 116)
          if (!floatingStyle) return null
          return createPortal(
            <div
              ref={actionsRef}
              className="fixed flex items-center bg-white/90 dark:bg-[#1A1D24]/90 backdrop-blur-xl rounded-[14px] border border-black/5 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-0.5 z-[65] transition-all"
              style={floatingStyle}
              onMouseEnter={activateHover}
              onMouseLeave={deactivateHover}
            >
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title={t('chat.addEmoji')}
              >
                <Smile size={18} strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onReply?.(message.id)}
                className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title={t('chat.reply')}
              >
                <Reply size={18} strokeWidth={2} />
              </Button>
              {canSendEconomyAction && (
                <>
                  <div className="mx-0.5 h-5 w-px bg-black/5 dark:bg-white/10" />
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setShowMoreMenu(false)
                      setEconomyMode('tip')
                    }}
                    className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                    title={t('communityEconomy.sendTip')}
                  >
                    <HandCoins size={18} strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setShowMoreMenu(false)
                      setEconomyMode('gift')
                    }}
                    className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                    title={t('communityEconomy.sendGift')}
                  >
                    <Gift size={18} strokeWidth={2} />
                  </Button>
                </>
              )}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className={`!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal transition-colors ${showMoreMenu ? 'bg-black/5 dark:bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}
                  title={t('chat.more')}
                >
                  <MoreHorizontal size={18} strokeWidth={2} />
                </Button>
                {/* More dropdown menu */}
                {showMoreMenu && (
                  <div className="absolute top-[calc(100%+4px)] right-0 origin-top-right bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] z-50 flex flex-col gap-0.5 px-1.5 animate-in fade-in zoom-in-95 duration-100">
                    {isOwn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleEdit}
                        className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      >
                        <Pencil size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                        {t('chat.editMessage')}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopy}
                      className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    >
                      <Copy size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                      {copied ? t('common.copied') : t('chat.copyMessage')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleShareLink}
                      className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    >
                      <ExternalLink size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                      {t('chat.shareLink')}
                    </Button>
                    {canSendEconomyAction && (
                      <>
                        <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowMoreMenu(false)
                            setEconomyMode('tip')
                          }}
                          className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          <HandCoins size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                          {t('communityEconomy.sendTip')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowMoreMenu(false)
                            setEconomyMode('gift')
                          }}
                          className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          <Gift size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                          {t('communityEconomy.sendGift')}
                        </Button>
                      </>
                    )}
                    {onEnterSelectionMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowMoreMenu(false)
                          onEnterSelectionMode(message.id)
                        }}
                        className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      >
                        <CheckSquare size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                        {t('chat.selectMessages')}
                      </Button>
                    )}
                    {canDelete && (
                      <>
                        <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDelete}
                          className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-danger hover:!bg-danger/10 hover:text-danger transition-colors group"
                        >
                          <Trash2
                            size={16}
                            strokeWidth={2}
                            className="mr-1.5 opacity-80 group-hover:opacity-100"
                          />
                          {t('chat.deleteMessage')}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        })()}

      {/* Quick emoji picker */}
      {showEmojiPicker &&
        messageRef.current &&
        (() => {
          const floatingStyle = getFloatingControlsStyle(44, 284)
          if (!floatingStyle) return null
          return createPortal(
            <div
              className="fixed flex items-center bg-white/90 dark:bg-[#1A1D24]/90 backdrop-blur-xl rounded-[14px] border border-black/5 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-0.5 z-[66] transition-all"
              style={floatingStyle}
              onMouseEnter={activateHover}
              onMouseLeave={() => {
                hoverTimeoutRef.current = setTimeout(() => {
                  setIsHovered(false)
                  setShowEmojiPicker(false)
                }, 150)
              }}
            >
              {quickEmojis.map((emoji) => (
                <Button
                  variant="ghost"
                  size="xs"
                  key={emoji}
                  onClick={() => {
                    onReact?.(message.id, emoji)
                    setShowEmojiPicker(false)
                  }}
                  className="!w-8 !h-8 !rounded-[10px] !px-0 !font-normal !normal-case !tracking-normal text-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  {emoji}
                </Button>
              ))}
              <div className="w-px h-5 bg-black/5 dark:bg-white/10 mx-0.5 shrink-0" />
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setShowEmojiPicker(false)
                  setShowFullPicker(true)
                }}
                className="!w-8 !h-8 !rounded-[10px] !px-0 !font-normal !normal-case !tracking-normal text-sm text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title={t('chat.addEmoji')}
              >
                +
              </Button>
            </div>,
            document.body,
          )
        })()}

      {/* Full emoji picker — still needs portal due to size and overflow */}
      {showFullPicker &&
        messageRef.current &&
        createPortal(
          (() => {
            const rect = messageRef.current.getBoundingClientRect()
            const top = Math.max(8, rect.top - 440)
            const fullPickerPosStyle = { top, right: window.innerWidth - rect.right + 16 }
            return (
              <div
                className="fixed z-[70]"
                style={fullPickerPosStyle}
                onMouseLeave={() => {
                  setShowFullPicker(false)
                  hoverTimeoutRef.current = setTimeout(() => {
                    setIsHovered(false)
                  }, 150)
                }}
              >
                <EmojiPicker
                  onSelect={(emoji) => {
                    onReact?.(message.id, emoji)
                  }}
                  onClose={() => setShowFullPicker(false)}
                  position="bottom"
                />
              </div>
            )
          })(),
          document.body,
        )}

      {/* Avatar hover card (portal) */}
      {avatarHover &&
        !avatarPinned &&
        author &&
        avatarCardPos &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{ left: avatarCardPos.left, top: avatarCardPos.top }}
            onMouseEnter={() => {
              if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
            }}
            onMouseLeave={handleAvatarMouseLeave}
          >
            <UserProfileCard
              user={author}
              role={(authorMember?.role as 'owner' | 'admin' | 'member') ?? null}
              ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
              description={
                typeof buddyAgent?.config?.description === 'string'
                  ? buddyAgent.config.description
                  : undefined
              }
            />
          </div>,
          document.body,
        )}

      {/* Avatar pinned card (modal overlay) */}
      {avatarPinned &&
        avatarHover &&
        author &&
        createPortal(
          <div
            className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
            onClick={closeAvatarCard}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <UserProfileCard
                user={author}
                role={(authorMember?.role as 'owner' | 'admin' | 'member') ?? null}
                ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
                description={
                  typeof buddyAgent?.config?.description === 'string'
                    ? buddyAgent.config.description
                    : undefined
                }
              />
            </div>
          </div>,
          document.body,
        )}

      {/* Avatar right-click context menu */}
      {avatarContextMenu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setAvatarContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setAvatarContextMenu(null)
              }}
            />
            <div
              className="fixed z-[61] bg-bg-primary/95 backdrop-blur-xl rounded-[24px] border border-border-subtle shadow-[0_16px_64px_rgba(0,0,0,0.4)] py-1.5 min-w-[160px]"
              style={{ left: avatarContextMenu.x, top: avatarContextMenu.y }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAvatarContextMenu(null)
                  handleAvatarClick()
                }}
                className="!w-full !justify-start !rounded-none !font-normal !normal-case !tracking-normal !px-3 !py-2 !text-sm !h-auto text-text-secondary hover:text-text-primary"
              >
                {t('member.viewProfile')}
              </Button>
              {canKick && author?.id !== currentUserId && authorMember?.role !== 'owner' && (
                <>
                  <div className="h-px bg-border-subtle my-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const name = author?.displayName ?? author?.username
                      const confirmKey = author?.isBot
                        ? 'member.removeBotConfirm'
                        : 'member.kickConfirm'
                      const titleKey = author?.isBot ? 'member.removeBot' : 'member.kickMember'
                      const ok = await useConfirmStore.getState().confirm({
                        title: t(titleKey),
                        message: t(confirmKey, { name }),
                      })
                      if (ok && serverId) {
                        fetchApi(`/api/servers/${serverId}/members/${author?.id}`, {
                          method: 'DELETE',
                        }).then(() => {
                          queryClient.invalidateQueries({
                            queryKey: ['members', serverId],
                          })
                        })
                      }
                      setAvatarContextMenu(null)
                    }}
                    className="!w-full !justify-start !rounded-none !font-normal !normal-case !tracking-normal !px-3 !py-2 !text-sm !h-auto text-danger hover:!bg-danger/10"
                  >
                    {author?.isBot ? t('member.removeBot') : t('member.kickMember')}
                  </Button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
      {author && canSendEconomyAction && (
        <CommunityEconomySendModal
          open={economyMode !== null}
          mode={economyMode ?? 'tip'}
          recipient={{
            id: author.id,
            username: author.username,
            displayName: author.displayName,
            avatarUrl: author.avatarUrl,
          }}
          onClose={() => setEconomyMode(null)}
        />
      )}
    </div>
  )
}

/**
 * Phase 2 POC — renders interactive controls (buttons / select) attached to
 * a message and POSTs the user's choice to the server, which echoes a
 * follow-up reply that the buddy agent receives via normal chat flow.
 */
function InteractiveBlockRenderer({
  block,
  messageId,
  disabled,
  submittedResponse,
}: {
  block: InteractiveBlock
  messageId: string
  disabled?: boolean
  submittedResponse?: InteractiveResponseMetadata | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const [submitting, setSubmitting] = React.useState(false)
  const [serverResponse, setServerResponse] = React.useState<InteractiveResponseMetadata | null>(
    null,
  )
  const effectiveResponse = submittedResponse ?? serverResponse
  const [done, setDone] = React.useState<string | null>(submittedResponse?.actionId ?? null)
  const [error, setError] = React.useState<string | null>(null)
  const submittingRef = React.useRef(false)

  React.useEffect(() => {
    if (submittedResponse) {
      setServerResponse(null)
    }
  }, [submittedResponse])

  React.useEffect(() => {
    if (block.oneShot === false || submittedResponse?.actionId) return
    let alive = true
    const query = new URLSearchParams({ blockId: block.id }).toString()
    fetchApi<InteractiveStateMetadata>(`/api/messages/${messageId}/interactive-state?${query}`)
      .then((state) => {
        if (alive && state.submitted && state.response) {
          setServerResponse(state.response)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [block.id, block.oneShot, messageId, submittedResponse?.actionId])

  React.useEffect(() => {
    if (effectiveResponse?.actionId) {
      setDone(effectiveResponse.actionId)
    }
  }, [effectiveResponse?.actionId])

  const send = React.useCallback(
    async (actionId: string, value: string, label: string, values?: Record<string, string>) => {
      if (submittingRef.current || (block.oneShot !== false && done)) return
      submittingRef.current = true
      const previousDone = done
      setSubmitting(true)
      if (block.oneShot !== false) setDone(actionId)
      setError(null)
      try {
        const result = await fetchApi<
          | {
              metadata?: {
                interactiveResponse?: InteractiveResponseMetadata
                interactiveState?: InteractiveStateMetadata
              }
            }
          | { interactiveState?: InteractiveStateMetadata }
        >(`/api/messages/${messageId}/interactive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockId: block.id,
            actionId,
            value,
            label,
            ...(values ? { values } : {}),
          }),
        })
        const resultRecord = result as {
          metadata?: {
            interactiveResponse?: InteractiveResponseMetadata
            interactiveState?: InteractiveStateMetadata
          }
          interactiveState?: InteractiveStateMetadata
        }
        const nextResponse =
          resultRecord.metadata?.interactiveState?.response ??
          resultRecord.metadata?.interactiveResponse ??
          resultRecord.interactiveState?.response
        if (nextResponse) setServerResponse(nextResponse)
        setDone(actionId)
        if (activeChannelId) {
          queryClient.invalidateQueries({ queryKey: ['messages', activeChannelId] })
        }
      } catch (e) {
        if (block.oneShot !== false) setDone(previousDone)
        setError(e instanceof Error ? e.message : t('chat.interactiveSubmitFailed'))
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [activeChannelId, block.id, block.oneShot, done, messageId, queryClient, t],
  )

  const isLocked =
    disabled || submitting || (block.oneShot !== false && (done !== null || !!effectiveResponse))

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border-subtle bg-black/5 dark:bg-white/5 p-3">
      {block.prompt && (
        <div className="text-sm text-text-secondary whitespace-pre-wrap">{block.prompt}</div>
      )}

      {block.kind === 'buttons' && block.buttons && (
        <div className="flex flex-wrap gap-2">
          {block.buttons.map((b) => {
            const value = b.value ?? b.id
            const isPicked = done === b.id
            return (
              <Button
                key={b.id}
                size="sm"
                variant={
                  b.style === 'destructive'
                    ? 'danger'
                    : b.style === 'primary' || isPicked
                      ? 'primary'
                      : 'outline'
                }
                disabled={isLocked}
                onClick={() => send(b.id, value, b.label)}
              >
                {isPicked ? (
                  <>
                    <Check size={14} />
                    <span>{b.label}</span>
                  </>
                ) : (
                  b.label
                )}
              </Button>
            )
          })}
        </div>
      )}

      {block.kind === 'select' && block.options && (
        <select
          className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm"
          disabled={isLocked}
          value={done ?? ''}
          onChange={(e) => {
            const id = e.target.value
            if (!id) return
            const opt = block.options?.find((o) => o.id === id)
            if (opt) send(opt.id, opt.value, opt.label)
          }}
        >
          <option value="" disabled>
            {t('chat.interactiveChoose')}
          </option>
          {block.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {(block.kind === 'form' || block.kind === 'approval') && (
        <InteractiveFormBody
          block={block}
          isLocked={isLocked}
          submittedValues={effectiveResponse?.values}
          onSubmit={(actionId, label, values) => send(actionId, actionId, label, values)}
        />
      )}

      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  )
}

/**
 * Renders a `kind: 'form' | 'approval'` block as a controlled mini-form.
 * - 'form': renders fields + Submit button (single action 'submit').
 * - 'approval': renders fields (typically a single comment textarea) + Approve / Reject pair.
 */
function InteractiveFormBody({
  block,
  isLocked,
  submittedValues,
  onSubmit,
}: {
  block: InteractiveBlock
  isLocked: boolean
  submittedValues?: Record<string, string>
  onSubmit: (actionId: string, label: string, values: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  const initial = React.useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const f of block.fields ?? []) {
      out[f.id] =
        submittedValues?.[f.id] ?? f.defaultValue ?? (f.kind === 'checkbox' ? 'false' : '')
    }
    return out
  }, [block.fields, submittedValues])
  const [values, setValues] = React.useState<Record<string, string>>(initial)
  const [touched, setTouched] = React.useState(false)

  React.useEffect(() => {
    if (submittedValues) {
      setValues(initial)
    }
  }, [initial, submittedValues])

  const setField = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }))

  const missingRequired = (block.fields ?? []).some((f) => f.required && !values[f.id]?.trim())

  const submit = (actionId: string, label: string) => {
    if (isLocked) return
    setTouched(true)
    if (missingRequired) return
    onSubmit(actionId, label, values)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        {(block.fields ?? []).map((f) => {
          const v = values[f.id] ?? ''
          const showError = touched && f.required && !v.trim()
          return (
            <label key={f.id} className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">
                {f.label}
                {f.required ? <span className="text-danger ml-0.5">*</span> : null}
              </span>
              {f.kind === 'textarea' ? (
                <textarea
                  className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm min-h-[60px]"
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  value={v}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.value)}
                />
              ) : f.kind === 'select' ? (
                <select
                  className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm"
                  value={v}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.value)}
                >
                  <option value="" disabled>
                    {t('chat.interactiveChoose')}
                  </option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.kind === 'checkbox' ? (
                <input
                  type="checkbox"
                  className="self-start"
                  checked={v === 'true'}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.checked ? 'true' : 'false')}
                />
              ) : (
                <input
                  type={f.kind === 'number' ? 'number' : 'text'}
                  className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm"
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  min={f.min}
                  max={f.max}
                  value={v}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.value)}
                />
              )}
              {showError && (
                <span className="text-xs text-danger">{t('chat.interactiveRequired')}</span>
              )}
            </label>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {block.kind === 'form' ? (
          <Button
            size="sm"
            variant="primary"
            disabled={isLocked}
            onClick={() => submit('submit', block.submitLabel ?? t('chat.interactiveSubmit'))}
          >
            {block.submitLabel ?? t('chat.interactiveSubmit')}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="primary"
              disabled={isLocked}
              onClick={() => submit('approve', t('chat.interactiveApprove'))}
            >
              <Check size={14} />
              <span>{t('chat.interactiveApprove')}</span>
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={isLocked}
              onClick={() => submit('reject', t('chat.interactiveReject'))}
            >
              <X size={14} />
              <span>{t('chat.interactiveReject')}</span>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function interactiveValuesEqual(
  prev?: Record<string, string>,
  next?: Record<string, string>,
): boolean {
  const prevKeys = Object.keys(prev ?? {})
  const nextKeys = Object.keys(next ?? {})
  if (prevKeys.length !== nextKeys.length) return false
  for (const key of prevKeys) {
    if (prev?.[key] !== next?.[key]) return false
  }
  return true
}

function interactiveResponseEqual(
  prev?: InteractiveResponseMetadata | null,
  next?: InteractiveResponseMetadata | null,
): boolean {
  if (!prev && !next) return true
  if (!prev || !next) return false
  return (
    prev.blockId === next.blockId &&
    prev.sourceMessageId === next.sourceMessageId &&
    prev.actionId === next.actionId &&
    prev.value === next.value &&
    prev.submissionId === next.submissionId &&
    prev.responseMessageId === next.responseMessageId &&
    interactiveValuesEqual(prev.values, next.values)
  )
}

/** Memoized MessageBubble — prevents unnecessary re-renders when props haven't changed. */
export const MessageBubble = React.memo(MessageBubbleInner, (prev, next) => {
  // Shallow compare all props. For stable references from parent (useCallback),
  // this prevents re-rendering when sibling messages update.
  if (prev.message.id !== next.message.id) return false
  if (prev.message.content !== next.message.content) return false
  if (prev.message.isEdited !== next.message.isEdited) return false
  if (prev.message.sendStatus !== next.message.sendStatus) return false
  if (prev.message.updatedAt !== next.message.updatedAt) return false
  if (prev.currentUserId !== next.currentUserId) return false
  if (prev.serverId !== next.serverId) return false
  if (prev.highlight !== next.highlight) return false
  if (prev.isGrouped !== next.isGrouped) return false
  if (prev.selectionMode !== next.selectionMode) return false
  if (prev.isSelected !== next.isSelected) return false
  if (
    !interactiveResponseEqual(prev.submittedInteractiveResponse, next.submittedInteractiveResponse)
  ) {
    return false
  }

  // Deep compare reactions (frequently updated via WS)
  const prevReactions = prev.message.reactions
  const nextReactions = next.message.reactions
  if (prevReactions?.length !== nextReactions?.length) return false
  if (prevReactions && nextReactions) {
    for (let i = 0; i < prevReactions.length; i++) {
      const prevReaction = prevReactions[i]
      const nextReaction = nextReactions[i]
      if (!prevReaction || !nextReaction) return false
      if (prevReaction.emoji !== nextReaction.emoji) return false
      if (prevReaction.count !== nextReaction.count) return false
    }
  }

  // Deep compare replyToMessage
  if (prev.replyToMessage?.id !== next.replyToMessage?.id) return false
  if (prev.replyToMessage?.content !== next.replyToMessage?.content) return false

  // Deep compare attachments
  const prevAtt = prev.message.attachments
  const nextAtt = next.message.attachments
  if (prevAtt?.length !== nextAtt?.length) return false
  if (prevAtt && nextAtt) {
    for (let i = 0; i < prevAtt.length; i++) {
      const prevAttachment = prevAtt[i]
      const nextAttachment = nextAtt[i]
      if (!prevAttachment || !nextAttachment) return false
      if (prevAttachment.id !== nextAttachment.id) return false
      if (prevAttachment.url !== nextAttachment.url) return false
    }
  }

  return true
})

MessageBubble.displayName = 'MessageBubble'

/* ── MentionSpan — @username with hover card ──────────────── */

interface MemberUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: string
  isBot: boolean
}

interface MemberEntry {
  id: string
  userId: string
  role: string
  user?: MemberUser
}

interface BuddyAgentEntry {
  id: string
  ownerId: string
  config?: Record<string, unknown>
  owner?: {
    id: string
    username: string
    displayName: string | null
  } | null
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

interface LegacyChannelEntry {
  id: string
  name?: string | null
  isPrivate?: boolean
}

interface LegacyServerEntry {
  id: string
  name?: string | null
  slug?: string | null
}

type EntityPopoverPosition = {
  left: number
  top: number
  placement: 'top' | 'bottom'
  arrowLeft: number
}

const ENTITY_MENTION_POPOVER_WIDTH = 320
const ENTITY_MENTION_POPOVER_HEIGHT = 178
const ENTITY_MENTION_POPOVER_GAP = 12
const ENTITY_MENTION_POPOVER_MARGIN = 12

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function prefixedEntityLabel(prefix: '@' | '#', value: string) {
  const trimmed = value.trim()
  if (!trimmed) return prefix
  return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`
}

function EntityMentionSpan({ mention }: { mention: MessageMention }) {
  const { t } = useTranslation()
  const [showCard, setShowCard] = useState(false)
  const [cardPos, setCardPos] = useState<EntityPopoverPosition | null>(null)
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spanRef = useRef<HTMLButtonElement>(null)

  const isUnknownPrivateChannel =
    mention.kind === 'channel' && mention.isPrivate === true && !mention.channelId

  const targetPath = useMemo(() => {
    if (mention.kind === 'channel' && mention.channelId && mention.serverId) {
      const serverSegment = mention.serverSlug || mention.serverId
      return `/app/servers/${serverSegment}/channels/${mention.channelId}`
    }
    if (mention.kind === 'server' && mention.serverId) {
      const serverSegment = mention.serverSlug || mention.serverId
      return `/app/servers/${serverSegment}`
    }
    return null
  }, [mention])

  const navigate = useCallback(() => {
    if (!targetPath) return
    window.location.href = targetPath
  }, [targetPath])

  const computeCardPos = useCallback(() => {
    if (!spanRef.current) return
    const rect = spanRef.current.getBoundingClientRect()
    const triggerCenter = rect.left + rect.width / 2
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxLeft = Math.max(
      ENTITY_MENTION_POPOVER_MARGIN,
      viewportWidth - ENTITY_MENTION_POPOVER_WIDTH - ENTITY_MENTION_POPOVER_MARGIN,
    )
    const left = clamp(
      triggerCenter - ENTITY_MENTION_POPOVER_WIDTH / 2,
      ENTITY_MENTION_POPOVER_MARGIN,
      maxLeft,
    )
    const availableTop = rect.top - ENTITY_MENTION_POPOVER_GAP - ENTITY_MENTION_POPOVER_MARGIN
    const availableBottom =
      viewportHeight - rect.bottom - ENTITY_MENTION_POPOVER_GAP - ENTITY_MENTION_POPOVER_MARGIN
    const placement =
      availableTop >= ENTITY_MENTION_POPOVER_HEIGHT || availableTop > availableBottom
        ? 'top'
        : 'bottom'
    const desiredTop =
      placement === 'top'
        ? rect.top - ENTITY_MENTION_POPOVER_HEIGHT - ENTITY_MENTION_POPOVER_GAP
        : rect.bottom + ENTITY_MENTION_POPOVER_GAP
    const maxTop = Math.max(
      ENTITY_MENTION_POPOVER_MARGIN,
      viewportHeight - ENTITY_MENTION_POPOVER_HEIGHT - ENTITY_MENTION_POPOVER_MARGIN,
    )
    setCardPos({
      left,
      top: clamp(desiredTop, ENTITY_MENTION_POPOVER_MARGIN, maxTop),
      placement,
      arrowLeft: clamp(triggerCenter - left, 24, ENTITY_MENTION_POPOVER_WIDTH - 24),
    })
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      computeCardPos()
      setShowCard(true)
    }, 250)
  }, [computeCardPos])

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setShowCard(false), 180)
  }, [])

  useEffect(() => {
    if (!showCard) return
    const updatePosition = () => computeCardPos()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [computeCardPos, showCard])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const copyTargetLink = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!targetPath) return
      const absoluteUrl = new URL(targetPath, window.location.origin).toString()
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = absoluteUrl
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1200)
    },
    [targetPath],
  )

  const channelName =
    mention.channelName ??
    mention.label?.replace(/^#/, '') ??
    mention.sourceToken?.replace(/^#/, '') ??
    mention.token
  const serverName =
    mention.serverName ??
    mention.label?.replace(/^@/, '') ??
    mention.sourceToken?.replace(/^@/, '') ??
    mention.token
  const displayLabel = isUnknownPrivateChannel
    ? prefixedEntityLabel('#', t('channel.privateChannel'))
    : mention.label || mention.sourceToken || mention.token
  const title = isUnknownPrivateChannel
    ? prefixedEntityLabel('#', t('channel.privateChannel'))
    : mention.kind === 'channel'
      ? prefixedEntityLabel('#', channelName)
      : prefixedEntityLabel('@', serverName)
  const subtitle =
    mention.kind === 'channel'
      ? (mention.serverName ?? '')
      : (mention.serverSlug ?? mention.serverId ?? '')
  const openLabel = mention.kind === 'channel' ? t('channel.openChannel') : t('server.openServer')
  const copyLabel =
    mention.kind === 'channel' ? t('channel.copyChannelLink') : t('server.copyServerLink')

  const icon =
    mention.kind === 'channel' ? (
      isUnknownPrivateChannel || mention.isPrivate ? (
        <Lock size={22} strokeWidth={2.4} />
      ) : (
        <Hash size={24} strokeWidth={2.6} />
      )
    ) : (
      <AtSign size={24} strokeWidth={2.6} />
    )

  return (
    <>
      <button
        ref={spanRef}
        type="button"
        className={cn(
          'relative inline-flex items-center align-baseline rounded-[6px] bg-primary/15 px-1 text-primary transition hover:bg-primary/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70',
          targetPath ? 'cursor-pointer' : 'cursor-help',
        )}
        onClick={navigate}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
      >
        {displayLabel}
      </button>
      {showCard &&
        cardPos &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{ left: cardPos.left, top: cardPos.top }}
            onMouseEnter={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
            }}
            onMouseLeave={handleMouseLeave}
          >
            <div
              role="dialog"
              className="relative w-[320px] rounded-lg border border-white/10 bg-[#111722]/95 p-3 text-left shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl"
            >
              <div
                className={cn(
                  'absolute h-3 w-3 rotate-45 border-white/10 bg-[#111722]/95',
                  cardPos.placement === 'top'
                    ? '-bottom-1.5 border-b border-r'
                    : '-top-1.5 border-l border-t',
                )}
                style={{ left: cardPos.arrowLeft - 6 }}
              />
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  {icon}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-text-primary">{title}</div>
                  {subtitle && <div className="truncate text-sm text-text-muted">{subtitle}</div>}
                </div>
              </div>
              {mention.kind === 'channel' && mention.isPrivate && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-text-muted">
                  <Lock size={12} />
                  <span>{t('channel.privateChannel')}</span>
                </div>
              )}
              {targetPath && (
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 flex-1 cursor-pointer rounded-md bg-white/10 text-text-primary hover:bg-white/15"
                    onClick={navigate}
                  >
                    <ExternalLink size={14} />
                    <span>{openLabel}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 flex-1 cursor-pointer rounded-md border border-white/10 text-text-secondary hover:bg-white/10 hover:text-text-primary"
                    onClick={copyTargetLink}
                  >
                    <Copy size={14} />
                    <span>{copied ? t('common.copied') : copyLabel}</span>
                  </Button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function MentionSpan({
  mention,
  label,
  structuredMention,
}: {
  mention: string
  label?: string
  structuredMention?: MessageMention
}) {
  const { t } = useTranslation()
  const [showCard, setShowCard] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spanRef = useRef<HTMLSpanElement>(null)
  const { activeServerId } = useChatStore()
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const username =
    structuredMention?.username ??
    (mention.startsWith('@') ? mention.slice(1) : structuredMention?.sourceToken?.slice(1))
  const userId = structuredMention?.userId ?? structuredMention?.targetId

  // Look up user from cached members query
  const members = queryClient.getQueryData<MemberEntry[]>(['members', activeServerId]) ?? []
  const member = members.find(
    (m) =>
      m.user?.id === userId || m.user?.username === username || m.user?.displayName === username,
  )
  const user =
    member?.user ??
    (userId
      ? {
          id: userId,
          username: structuredMention?.username ?? username ?? userId,
          displayName:
            structuredMention?.displayName ?? structuredMention?.username ?? username ?? userId,
          avatarUrl: structuredMention?.avatarUrl ?? null,
          status: 'offline',
          isBot: structuredMention?.isBot ?? structuredMention?.kind === 'buddy',
        }
      : undefined)

  // Buddy metadata
  const buddyAgentsList =
    queryClient.getQueryData<BuddyAgentEntry[]>(['members-buddy-agents', activeServerId]) ?? []
  const buddyAgent = user?.isBot
    ? buddyAgentsList.find((a: BuddyAgentEntry) => a.botUser?.id === user.id)
    : undefined

  // Current user's role for kick/remove ability
  const currentMember = members.find((m: MemberEntry) => m.userId === currentUser?.id)
  const canKick = currentMember?.role === 'owner' || currentMember?.role === 'admin'

  const computeCardPos = () => {
    if (!spanRef.current) return
    const rect = spanRef.current.getBoundingClientRect()
    setCardPos({
      left: rect.left,
      top: Math.max(8, rect.top - 280),
    })
  }

  const handleMouseEnter = () => {
    if (pinned) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      computeCardPos()
      setShowCard(true)
    }, 300)
  }

  const handleMouseLeave = () => {
    if (pinned) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setShowCard(false), 200)
  }

  const handleClick = () => {
    if (user) {
      setPinned(true)
      setShowCard(true)
      computeCardPos()
    }
  }

  const handleClose = () => {
    setPinned(false)
    setShowCard(false)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <span
        ref={spanRef}
        className="relative inline-block bg-primary/20 text-primary rounded px-1 cursor-pointer hover:bg-primary/30 transition"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {label ?? mention}
      </span>

      {/* Hover card (portal to body to avoid clipping) */}
      {showCard &&
        !pinned &&
        user &&
        cardPos &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{ left: cardPos.left, top: cardPos.top }}
            onMouseEnter={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
            }}
            onMouseLeave={handleMouseLeave}
          >
            <UserProfileCard
              user={user}
              role={(member?.role as 'owner' | 'admin' | 'member') ?? null}
              ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
              description={
                typeof buddyAgent?.config?.description === 'string'
                  ? buddyAgent.config.description
                  : undefined
              }
            />
          </div>,
          document.body,
        )}

      {/* Pinned profile card as a centered overlay */}
      {pinned &&
        showCard &&
        user &&
        createPortal(
          <div
            className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
            onClick={handleClose}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <UserProfileCard
                user={user}
                role={(member?.role as 'owner' | 'admin' | 'member') ?? null}
                ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
                description={
                  typeof buddyAgent?.config?.description === 'string'
                    ? buddyAgent.config.description
                    : undefined
                }
              />
            </div>
          </div>,
          document.body,
        )}

      {/* Right-click context menu */}
      {ctxMenu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setCtxMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu(null)
              }}
            />
            <div
              className="fixed z-[61] bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 px-1.5"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCtxMenu(null)
                  handleClick()
                }}
                className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                {t('member.viewProfile')}
              </Button>
              {canKick && user?.id !== currentUser?.id && member?.role !== 'owner' && (
                <>
                  <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1 shrink-0" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const name = user?.displayName ?? user?.username
                      const confirmKey = user?.isBot
                        ? 'member.removeBotConfirm'
                        : 'member.kickConfirm'
                      const titleKey = user?.isBot ? 'member.removeBot' : 'member.kickMember'
                      const ok = await useConfirmStore.getState().confirm({
                        title: t(titleKey),
                        message: t(confirmKey, { name }),
                      })
                      if (ok) {
                        fetchApi(`/api/servers/${activeServerId}/members/${user?.id}`, {
                          method: 'DELETE',
                        }).then(() => {
                          queryClient.invalidateQueries({
                            queryKey: ['members', activeServerId],
                          })
                        })
                      }
                      setCtxMenu(null)
                    }}
                    className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-danger hover:!bg-danger/10 hover:text-danger transition-colors group"
                  >
                    {user?.isBot ? t('member.removeBot') : t('member.kickMember')}
                  </Button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
