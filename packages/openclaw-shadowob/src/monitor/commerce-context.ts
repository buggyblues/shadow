import type { ShadowClient } from '@shadowob/sdk'
import type { ShadowAccountConfig, ShadowCommerceOfferContext } from '../types.js'

function isResolvedId(value: string | undefined | null): value is string {
  return Boolean(value && value.trim() && !value.includes('${env:'))
}

export function listResolvedCommerceOffers(
  account: ShadowAccountConfig,
): ShadowCommerceOfferContext[] {
  return (account.commerceOffers ?? []).filter((offer) => isResolvedId(offer.offerId))
}

export function buildCommerceContextForAgent(account: ShadowAccountConfig): string {
  const offers = listResolvedCommerceOffers(account)
  if (offers.length === 0) return ''

  return [
    'Shadow commerce offers available to this Buddy:',
    ...offers.map((offer) => {
      const label = offer.name ?? offer.seedId ?? offer.offerId
      const summary = offer.summary ? ` — ${offer.summary}` : ''
      const fileHint = offer.fileId ? ` paid file ${offer.fileId}` : ''
      return `- ${label}${summary}. CommerceOfferId: ${offer.offerId}.${fileHint}`
    }),
    'To sell an offer, use the Shadow message tool with action "send", the current target, a natural sales message, and commerceOfferId set to the CommerceOfferId above.',
  ].join('\n')
}

export async function buildCommerceViewerContextForAgent(params: {
  account: ShadowAccountConfig
  client: ShadowClient
  viewerUserId?: string
}): Promise<string> {
  if (!params.viewerUserId) return ''
  const offers = listResolvedCommerceOffers(params.account)
  if (offers.length === 0) return ''

  const lines: string[] = []
  const commerceClient = params.client as ShadowClient & {
    getCommerceOfferCheckoutPreview?: (
      offerId: string,
      params?: { viewerUserId?: string },
    ) => Promise<{ viewerState: string; nextAction: string }>
  }
  if (!commerceClient.getCommerceOfferCheckoutPreview) return ''
  for (const offer of offers) {
    try {
      const preview = await commerceClient.getCommerceOfferCheckoutPreview(offer.offerId, {
        viewerUserId: params.viewerUserId,
      })
      const label = offer.name ?? offer.seedId ?? offer.offerId
      lines.push(
        `- ${label}: viewerState=${preview.viewerState}; nextAction=${preview.nextAction}.`,
      )
    } catch {
      // Viewer state is advisory context. If the server refuses or the offer is unavailable,
      // leave the sales flow unchanged.
    }
  }
  if (lines.length === 0) return ''
  return [
    'Current viewer commerce state for the user you are speaking with:',
    ...lines,
    'If viewerState is active, do not ask them to buy again; help them open or use the unlocked content instead.',
  ].join('\n')
}

export function commerceContextFields(account: ShadowAccountConfig): Record<string, unknown> {
  const offers = listResolvedCommerceOffers(account)
  if (offers.length === 0) return {}
  return {
    CommerceOffers: offers,
    CommerceOfferIds: offers.map((offer) => offer.offerId).join(','),
  }
}
