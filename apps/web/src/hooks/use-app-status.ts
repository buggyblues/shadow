import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_TITLE } from '../lib/brand'

interface UseAppStatusProps {
  title?: string
  unreadCount?: number
  hasNotification?: boolean
  variant?: 'default' | 'auth' | 'docs' | 'market' | 'pricing' | 'workspace'
}

const faviconByVariant: Record<NonNullable<UseAppStatusProps['variant']>, string> = {
  default: '/favicon.svg',
  auth: '/favicon-auth.svg',
  docs: '/favicon-docs.svg',
  market: '/favicon-market.svg',
  pricing: '/favicon-pricing.svg',
  workspace: '/favicon-workspace.svg',
}

export function useAppStatus({
  title,
  unreadCount = 0,
  hasNotification = false,
  variant = 'default',
}: UseAppStatusProps) {
  const { t } = useTranslation()

  useEffect(() => {
    const brandTitle = t('common.brandTitle', { defaultValue: BRAND_TITLE })
    const pageTitle = (title ?? '').trim()
    let newTitle = pageTitle ? `${pageTitle} · ${brandTitle}` : brandTitle

    if (unreadCount > 0) {
      newTitle = `(${unreadCount}) ${newTitle}`
    } else if (hasNotification) {
      newTitle = `(*) ${newTitle}`
    }

    document.title = newTitle

    const head = document.head
    if (!head) return

    let iconHref = faviconByVariant[variant]
    if (unreadCount > 0 || hasNotification) {
      iconHref = '/favicon-alert.svg'
    }

    const upsertIcon = (rel: 'icon' | 'shortcut icon') => {
      const selector = `link[rel='${rel}']`
      let link = document.querySelector(selector) as HTMLLinkElement | null
      if (!link) {
        link = document.createElement('link')
        link.rel = rel
        link.type = 'image/svg+xml'
        head.appendChild(link)
      }
      link.href = iconHref
    }

    upsertIcon('icon')
    upsertIcon('shortcut icon')
  }, [title, unreadCount, hasNotification, variant, t])
}
