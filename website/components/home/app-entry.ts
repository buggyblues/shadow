import type { MouseEvent } from 'react'
import { hasKnownAuthSession } from '../../api/auth-status'
import type { Play } from './types'

export const WEBSITE_LOGIN_EVENT = 'shadow:website-login'

export const serverDesktopUrl = (play: Play, _isZh?: boolean) =>
  `/app/spaces/${encodeURIComponent(play.server || play.id)}`

function hasStoredAuthSession() {
  return hasKnownAuthSession()
}

function appRedirectFromHref(href: string) {
  const url = new URL(href, window.location.href)
  return `${url.pathname}${url.search}${url.hash}`
}

function requestWebsiteLogin(redirect: string) {
  window.dispatchEvent(
    new CustomEvent(WEBSITE_LOGIN_EVENT, {
      detail: { redirect },
    }),
  )
}

export const handleAppEntryClick = (event: MouseEvent<HTMLAnchorElement>) => {
  if (event.defaultPrevented) return
  event.preventDefault()
  const redirect = appRedirectFromHref(event.currentTarget.href)
  if (!hasStoredAuthSession()) {
    requestWebsiteLogin(redirect)
    return
  }
  window.location.assign(event.currentTarget.href)
}
