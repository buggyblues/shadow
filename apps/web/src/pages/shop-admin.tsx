import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ShopAdmin } from '../components/shop/shop-admin'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'

export function ShopAdminPageRoute() {
  const { serverSlug } = useParams({ strict: false }) as { serverSlug: string }
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<{ id: string; ownerId: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const isAdmin = !!server && !!user && server.ownerId === user.id

  // Non-admins get redirected back to shop
  if (server && !isAdmin) {
    navigate({ to: '/app/servers/$serverSlug/shop', params: { serverSlug } })
    return null
  }

  return (
    <ShopAdmin
      serverId={serverSlug}
      onBack={() => navigate({ to: '/app/servers/$serverSlug/shop', params: { serverSlug } })}
    />
  )
}
