import {
  Button,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { CheckCircle2, Clock3, ExternalLink, Loader2, ShieldCheck, ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface PurchaseConfirmationDetails {
  name: string
  summary?: string | null
  imageUrl?: string | null
  priceLabel: string
  billingModeLabel?: string | null
  entitlementLabel?: string | null
  durationLabel?: string | null
  targetLabel?: string | null
  deliveryLabel?: string | null
  shopLabel?: string | null
  paidFileLabel?: string | null
  accessStateLabel?: string | null
}

interface PurchaseConfirmationModalProps {
  open: boolean
  details: PurchaseConfirmationDetails
  isPending?: boolean
  isCompleted?: boolean
  error?: string | null
  provisioningStatus?: string | null
  viewEntitlementHref?: string
  onViewEntitlement?: () => void
  onClose: () => void
  onConfirm: () => void
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-secondary/55 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-bold text-text-primary">{value}</div>
    </div>
  )
}

export function PurchaseConfirmationModal({
  open,
  details,
  isPending = false,
  isCompleted = false,
  error,
  provisioningStatus,
  viewEntitlementHref = '/app/settings/wallet/entitlements',
  onViewEntitlement,
  onClose,
  onConfirm,
}: PurchaseConfirmationModalProps) {
  const { t } = useTranslation()

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent maxWidth="max-w-[560px]">
        <ModalHeader
          icon={<ShoppingBag size={20} />}
          title={t('commerce.purchaseConfirmTitle')}
          subtitle={t('commerce.purchaseConfirmSubtitle')}
          closeLabel={t('common.close')}
        />
        <ModalBody className="space-y-4">
          <div className="flex gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/45 p-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/15 text-primary">
              {details.imageUrl ? (
                <img src={details.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ShoppingBag size={26} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-base font-black text-text-primary">
                {details.name}
              </h3>
              {details.summary && (
                <p className="mt-1 line-clamp-3 text-sm leading-5 text-text-secondary">
                  {details.summary}
                </p>
              )}
              <div className="mt-2 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-black text-primary">
                {details.priceLabel}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <InfoRow label={t('commerce.billingMode')} value={details.billingModeLabel} />
            <InfoRow label={t('commerce.seller')} value={details.shopLabel} />
            <InfoRow label={t('commerce.entitlementInfo')} value={details.entitlementLabel} />
            <InfoRow label={t('commerce.durationLabel')} value={details.durationLabel} />
            <InfoRow label={t('commerce.entitlementTarget')} value={details.targetLabel} />
            <InfoRow label={t('commerce.deliveryMethod')} value={details.deliveryLabel} />
            <InfoRow label={t('commerce.paidFile')} value={details.paidFileLabel} />
            <InfoRow label={t('commerce.accessState')} value={details.accessStateLabel} />
          </div>

          {isCompleted && (
            <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
              <div className="flex items-center gap-2 font-black">
                <CheckCircle2 size={17} />
                {t('commerce.purchaseCompleted')}
              </div>
              {provisioningStatus && (
                <div className="mt-1 flex items-center gap-2 text-xs font-bold">
                  <Clock3 size={14} />
                  {t(`commerce.provisioning.${provisioningStatus}`, {
                    defaultValue: provisioningStatus,
                  })}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
              {error}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
            {isCompleted && onViewEntitlement ? (
              <Button
                type="button"
                onClick={onViewEntitlement}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-success px-4 text-sm font-bold text-white transition hover:bg-success/90"
              >
                <ShieldCheck size={16} />
                {t('commerce.viewEntitlement')}
              </Button>
            ) : isCompleted ? (
              <a
                href={viewEntitlementHref}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-success px-4 text-sm font-bold text-white transition hover:bg-success/90"
              >
                <ShieldCheck size={16} />
                {t('commerce.viewEntitlement')}
                <ExternalLink size={14} />
              </a>
            ) : (
              <Button onClick={onConfirm} disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t('commerce.purchasing')}
                  </>
                ) : (
                  t('commerce.confirmPurchaseAction')
                )}
              </Button>
            )}
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
