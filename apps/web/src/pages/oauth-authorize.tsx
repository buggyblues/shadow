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
    <div className="w-12 h-12 rounded-lg bg-[#5865F2] flex items-center justify-center text-white font-bold text-lg">
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
      setError(t('oauth.invalidRequest', 'Invalid authorization request'))
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
        setError(
          err instanceof Error ? err.message : t('oauth.loadFailed', 'Failed to load app info'),
        )
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
      setError(
        err instanceof Error ? err.message : t('oauth.approveFailed', 'Authorization failed'),
      )
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
    'user:read': t(
      'oauth.scopeUserRead',
      'Read your basic profile (username, display name, avatar)',
    ),
    'user:email': t('oauth.scopeUserEmail', 'Read your email address'),
    'servers:read': t('oauth.scopeServersRead', 'View your server list'),
    'servers:write': t('oauth.scopeServersWrite', 'Create servers and invite users'),
    'channels:read': t('oauth.scopeChannelsRead', 'View channel list'),
    'channels:write': t('oauth.scopeChannelsWrite', 'Create channels'),
    'messages:read': t('oauth.scopeMessagesRead', 'Read message history'),
    'messages:write': t('oauth.scopeMessagesWrite', 'Send messages'),
    'attachments:read': t('oauth.scopeAttachmentsRead', 'View attachments'),
    'attachments:write': t('oauth.scopeAttachmentsWrite', 'Upload attachments'),
    'workspaces:read': t('oauth.scopeWorkspacesRead', 'View workspace information'),
    'workspaces:write': t('oauth.scopeWorkspacesWrite', 'Modify workspace files'),
    'buddies:create': t('oauth.scopeBuddiesCreate', 'Create Buddy bots'),
    'buddies:manage': t('oauth.scopeBuddiesManage', 'Manage Buddy bots and send messages'),
  }

  const scopeGroups: { label: string; scopes: string[] }[] = [
    { label: t('oauth.groupUserInfo', 'User Info'), scopes: ['user:read', 'user:email'] },
    { label: t('oauth.groupServers', 'Servers'), scopes: ['servers:read', 'servers:write'] },
    {
      label: t('oauth.groupChannelsMessages', 'Channels & Messages'),
      scopes: ['channels:read', 'channels:write', 'messages:read', 'messages:write'],
    },
    {
      label: t('oauth.groupAttachments', 'Attachments'),
      scopes: ['attachments:read', 'attachments:write'],
    },
    {
      label: t('oauth.groupWorkspaces', 'Workspaces'),
      scopes: ['workspaces:read', 'workspaces:write'],
    },
    { label: t('oauth.groupBuddy', 'Buddy'), scopes: ['buddies:create', 'buddies:manage'] },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-tertiary">
        <div className="w-8 h-8 border-2 border-[#5865F2] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-tertiary p-4">
      <div className="w-full max-w-[480px] bg-bg-primary rounded-md p-8 shadow-[0_2px_10px_0_rgba(0,0,0,0.2)]">
        <div className="text-center mb-6">
          <img src="/Logo.svg" alt="Shadow" className="w-10 h-10 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-white mb-2">
            {t('oauth.authorizeTitle', 'Authorize Application')}
          </h1>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-[3px] p-3 text-[#fa777c] text-sm mb-4">
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
              <p className="text-text-secondary text-sm mb-3">
                {t(
                  'oauth.permissionsLabel',
                  'This application requests the following permissions:',
                )}
              </p>
              <div className="space-y-3">
                {(() => {
                  const requestedScopes = appInfo.scope.split(' ')
                  return scopeGroups
                    .filter((group) => group.scopes.some((s) => requestedScopes.includes(s)))
                    .map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
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
                                  className="w-4 h-4 text-green-400 shrink-0"
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
              <button
                type="button"
                onClick={handleDeny}
                className="flex-1 bg-bg-tertiary hover:bg-bg-secondary text-text-primary font-medium py-2.5 rounded-[3px] transition text-[15px]"
              >
                {t('oauth.deny', 'Deny')}
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={approving}
                className="flex-1 bg-[#5865F2] hover:bg-[#4752c4] text-white font-medium py-2.5 rounded-[3px] transition text-[15px] disabled:opacity-50"
              >
                {approving
                  ? t('oauth.authorizing', 'Authorizing...')
                  : t('oauth.authorize', 'Authorize')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
