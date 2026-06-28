import { Spinner } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ShopPage } from '../components/shop/shop-page'
import { fetchApi } from '../lib/api'
import { leaveChannel } from '../lib/socket'
import { useAuthStore } from '../stores/auth.store'
import { useChatStore } from '../stores/chat.store'

export function ShopPageRoute() {
  const { t } = useTranslation()
  const { serverSlug } = useParams({ strict: false }) as { serverSlug: string }
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  // Clear channel state when entering shop
  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev) {
      leaveChannel(prev)
      useChatStore.getState().setActiveChannel(null)
    }
  }, [])

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<{ id: string; ownerId: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const isAdmin = !!server && !!user && server.ownerId === user.id
  const isServerLoading = !server

  return isServerLoading ? (
    <div className="flex-1 flex items-center justify-center text-text-muted bg-bg-primary">
      <div className="inline-flex items-center gap-2 text-sm">
        <Spinner size="sm" />
        <span>{t('shop.loadingShop')}</span>
      </div>
    </div>
  ) : (
    <ShopPage
      serverId={serverSlug}
      isAdmin={isAdmin}
      onClose={() => navigate({ to: '/servers/$serverSlug', params: { serverSlug } })}
    />
  )
}
