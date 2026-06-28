import { Button, Card, Spinner } from '@shadowob/ui'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'

interface AuthorizeInfo {
  appId: string
  appName: string
  appLogoUrl: string | null
  homepageUrl: string | null
  scope: string
  redirectUri: string
  state?: string
}

function AuthAppLogo({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false)

  if (url && !failed) {
    return (
      <img src={url} alt={name} className="w-12 h-12 rounded-lg" onError={() => setFailed(true)} />
    )
  }

  return (
    <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-lg">
      {name[0]?.toUpperCase()}
    </div>
  )
}

/**
 * OAuth authorize page — shown when a third-party app requests user authorization
 * URL: /oauth/authorize?response_type=code&client_id=xxx&redirect_uri=xxx&scope=xxx&state=xxx
 */
export function OAuthAuthorizePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const searchParams = useSearch({ strict: false }) as {
    response_type?: string
    client_id?: string
    redirect_uri?: string
    scope?: string
    state?: string
  }

  const [appInfo, setAppInfo] = useState<AuthorizeInfo | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    const { client_id, redirect_uri, scope, state } = searchParams
    if (!client_id || !redirect_uri) {
      setError(t('oauth.invalidRequest'))
      setLoading(false)
      return
    }

    fetchApi<AuthorizeInfo>(
      `/api/oauth/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${encodeURIComponent(scope ?? 'user:read')}${state ? `&state=${encodeURIComponent(state)}` : ''}`,
    )
      .then((info) => {
        setAppInfo({ ...info, state })
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('oauth.loadFailed'))
        setLoading(false)
      })
  }, [searchParams, t])

  const handleApprove = async () => {
    if (!appInfo) return
    setApproving(true)
    try {
      const result = await fetchApi<{ redirectUrl: string }>('/api/oauth/authorize', {
        method: 'POST',
        body: JSON.stringify({
          clientId: searchParams.client_id,
          redirectUri: searchParams.redirect_uri,
          scope: appInfo.scope,
          state: appInfo.state,
        }),
      })
      // Redirect to third-party app with auth code
      window.location.href = result.redirectUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : t('oauth.approveFailed'))
      setApproving(false)
    }
  }

  const handleDeny = () => {
    if (searchParams.redirect_uri) {
      const url = new URL(searchParams.redirect_uri)
      url.searchParams.set('error', 'access_denied')
      if (searchParams.state) {
        url.searchParams.set('state', searchParams.state)
      }
      window.location.href = url.toString()
    } else {
      navigate({ to: '/' })
    }
  }

  const scopeDescriptions: Record<string, string> = {
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

  const scopeGroups: { label: string; scopes: string[] }[] = [
    { label: t('oauth.groupUserInfo'), scopes: ['user:read', 'user:email'] },
    { label: t('oauth.groupServers'), scopes: ['servers:read', 'servers:write'] },
    {
      label: t('oauth.groupChannelsMessages'),
      scopes: ['channels:read', 'channels:write', 'messages:read', 'messages:write'],
    },
    {
      label: t('oauth.groupAttachments'),
      scopes: ['attachments:read', 'attachments:write'],
    },
    {
      label: t('oauth.groupWorkspaces'),
      scopes: ['workspaces:read', 'workspaces:write'],
    },
    { label: t('oauth.groupBuddy'), scopes: ['buddies:create', 'buddies:manage'] },
    { label: t('oauth.groupCommerce'), scopes: ['commerce:read', 'commerce:write'] },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-tertiary">
        <Spinner size="md" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-tertiary p-4">
      <Card variant="glass" className="w-full max-w-[480px] p-8">
        <div className="text-center mb-6">
          <img src="/Logo.svg" alt="Shadow" className="w-10 h-10 mx-auto mb-3" />
          <h1 className="text-xl font-black text-white mb-2">{t('oauth.authorizeTitle')}</h1>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/20 rounded-[24px] p-3 text-danger text-sm mb-4">
            {error}
          </div>
        )}

        {appInfo && (
          <>
            <div className="flex items-center gap-3 mb-6 p-4 bg-bg-secondary rounded-md">
              <AuthAppLogo url={appInfo.appLogoUrl} name={appInfo.appName} />
              <div>
                <p className="text-white font-medium">{appInfo.appName}</p>
                {appInfo.homepageUrl && (
                  <p className="text-text-muted text-xs">{appInfo.homepageUrl}</p>
                )}
              </div>
            </div>

            <div className="mb-6">
              <p className="text-text-secondary text-sm mb-3">{t('oauth.permissionsLabel')}</p>
              <div className="space-y-3">
                {(() => {
                  const requestedScopes = appInfo.scope.split(' ')
                  return scopeGroups
                    .filter((group) => group.scopes.some((s) => requestedScopes.includes(s)))
                    .map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-black text-text-muted uppercase tracking-wide mb-1">
                          {group.label}
                        </p>
                        <ul className="space-y-1">
                          {group.scopes
                            .filter((s) => requestedScopes.includes(s))
                            .map((s) => (
                              <li
                                key={s}
                                className="flex items-center gap-2 text-sm text-text-primary"
                              >
                                <svg
                                  className="w-4 h-4 text-success shrink-0"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  role="img"
                                  aria-label="check"
                                >
                                  <title>check</title>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                {scopeDescriptions[s] ?? s}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))
                })()}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="glass" className="flex-1" onClick={handleDeny}>
                {t('oauth.deny')}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleApprove}
                disabled={approving}
                loading={approving}
              >
                {approving ? t('oauth.authorizing') : t('oauth.authorize')}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
