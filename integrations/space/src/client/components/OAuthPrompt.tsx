import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useOAuthSession } from '../hooks.js'

const OAUTH_PROMPT_DISMISSED_KEY = 'space.oauth.prompt.dismissed'

export function OAuthPrompt() {
  const queryClient = useQueryClient()
  const oauthSessionQuery = useOAuthSession()
  const oauthSession = oauthSessionQuery.data
  const popupPollRef = useRef<number | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(OAUTH_PROMPT_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const [popupOpen, setPopupOpen] = useState(false)
  const visible = oauthSession?.configured === true && !oauthSession.authenticated && !dismissed

  const refreshOAuthSession = useCallback(() => {
    setPopupOpen(false)
    if (popupPollRef.current !== null) {
      window.clearInterval(popupPollRef.current)
      popupPollRef.current = null
    }
    void queryClient.invalidateQueries({ queryKey: ['space', 'oauth-session'] })
  }, [queryClient])

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(OAUTH_PROMPT_DISMISSED_KEY, '1')
    } catch {
      // Session storage is optional.
    }
  }

  const startOAuth = () => {
    const authorizeUrl = oauthSession?.authorizeUrl
    if (!authorizeUrl) return
    setPopupOpen(true)
    const popup = window.open(
      authorizeUrl,
      'space-oauth',
      'popup,width=520,height=760,menubar=no,toolbar=no,location=yes,status=no',
    )
    if (!popup) {
      setPopupOpen(false)
      window.top?.location.assign(authorizeUrl)
      return
    }
    if (popupPollRef.current !== null) window.clearInterval(popupPollRef.current)
    popupPollRef.current = window.setInterval(() => {
      if (popup.closed) refreshOAuthSession()
    }, 800)
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null
      if (!data || typeof data !== 'object' || data.type !== 'space.oauth.completed') return
      refreshOAuthSession()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [refreshOAuthSession])

  useEffect(
    () => () => {
      if (popupPollRef.current !== null) window.clearInterval(popupPollRef.current)
    },
    [],
  )

  if (!visible) return null

  return (
    <div className="oauthPrompt" role="dialog" aria-modal="true" aria-labelledby="oauthTitle">
      <div className="oauthCard">
        <button type="button" className="oauthClose" aria-label="稍后再说" onClick={dismiss}>
          <X />
        </button>
        <span>Space</span>
        <h2 id="oauthTitle">连接你的身份</h2>
        <p>授权后，作品、头像和评论都会归到你的账号，而不是临时访客。</p>
        <div>
          <button type="button" onClick={startOAuth} disabled={popupOpen}>
            {popupOpen ? '等待授权' : '授权登录'}
          </button>
          <button type="button" onClick={dismiss}>
            稍后再说
          </button>
        </div>
      </div>
    </div>
  )
}
