import {
  defineShadowSpaceAppAuthorizeElement,
  type ShadowSpaceAppAuthorizeElementData,
} from '@shadowob/sdk/bridge'
import type { TFunction } from 'i18next'
import { createElement, useEffect, useRef } from 'react'
import type { BridgeOAuthAuthorizeInfo } from '../../lib/space-app-oauth-bridge'

export interface BridgeOAuthAuthorizationRequest {
  authorizeUrl: string
}

export interface BridgeOAuthAuthorizationState<
  TRequest extends BridgeOAuthAuthorizationRequest = BridgeOAuthAuthorizationRequest,
> {
  request: TRequest
  appInfo: BridgeOAuthAuthorizeInfo | null
  loading: boolean
  approving: boolean
  error: string | null
}

function bridgeOAuthScopeLabels(t: TFunction) {
  return {
    'user:read': t('oauth.scopeUserRead'),
    'user:email': t('oauth.scopeUserEmail'),
    'servers:read': t('oauth.scopeServersRead'),
    'servers:write': t('oauth.scopeServersWrite'),
    'channels:read': t('oauth.scopeChannelsRead'),
    'channels:write': t('oauth.scopeChannelsWrite'),
    'messages:read': t('oauth.scopeMessagesRead'),
    'messages:write': t('oauth.scopeMessagesWrite'),
    'attachments:read': t('oauth.scopeAttachmentsRead'),
    'attachments:write': t('oauth.scopeAttachmentsWrite'),
    'workspaces:read': t('oauth.scopeWorkspacesRead'),
    'workspaces:write': t('oauth.scopeWorkspacesWrite'),
    'buddies:create': t('oauth.scopeBuddiesCreate'),
    'buddies:manage': t('oauth.scopeBuddiesManage'),
    'commerce:read': t('oauth.scopeCommerceRead'),
    'commerce:write': t('oauth.scopeCommerceWrite'),
  }
}

export function BridgeOAuthAuthorizationOverlay({
  state,
  t,
  onApprove,
  onDeny,
}: {
  state: BridgeOAuthAuthorizationState
  t: TFunction
  onApprove: () => void
  onDeny: () => void
}) {
  const elementRef = useRef<(HTMLElement & { data?: ShadowSpaceAppAuthorizeElementData }) | null>(
    null,
  )
  const appInfo = state.appInfo

  useEffect(() => {
    defineShadowSpaceAppAuthorizeElement()
  }, [])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    element.data = {
      appName: appInfo?.appName ?? t('oauth.authorizeTitle'),
      appLogoUrl: appInfo?.appLogoUrl ?? null,
      appOrigin: appInfo?.homepageUrl ?? null,
      title: t('oauth.authorizeTitle'),
      subtitle: t('oauth.permissionsLabel'),
      permissionsLabel: t('oauth.permissionsLabel'),
      approveLabel: t('oauth.authorize'),
      denyLabel: t('oauth.deny'),
      approvingLabel: t('oauth.authorizing'),
      loading: state.loading,
      approving: state.approving,
      error: state.error,
      scopes: (appInfo?.scope ?? 'user:read')
        .split(/\s+/u)
        .map((scope) => scope.trim())
        .filter(Boolean),
      scopeLabels: bridgeOAuthScopeLabels(t),
    }
  }, [appInfo, state.approving, state.error, state.loading, t])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    element.addEventListener('shadow-authorize-approve', onApprove)
    element.addEventListener('shadow-authorize-deny', onDeny)
    return () => {
      element.removeEventListener('shadow-authorize-approve', onApprove)
      element.removeEventListener('shadow-authorize-deny', onDeny)
    }
  }, [onApprove, onDeny])

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm">
      {createElement('shadow-space-app-authorize', { ref: elementRef })}
    </div>
  )
}
