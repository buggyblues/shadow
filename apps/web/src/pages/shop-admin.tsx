import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { ShopAdmin } from '../components/shop/shop-admin'

export function ShopAdminPageRoute() {
  const { serverId } = useParams({ strict: false }) as { serverId: string }
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const { data: server } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => fetchApi<{ id: string; ownerId: string }>(`/api/servers/${serverId}`),
    enabled: !!serverId,
  })

  const isAdmin = !!server && !!user && server.ownerId === user.id

  // Non-admins get redirected back to shop
  if (server && !isAdmin) {
    navigate({ to: '/app/servers/$serverId/shop', params: { serverId } })
    return null
  }

  return (
    <ShopAdmin
      serverId={serverId}
      onBack={() =>
        navigate({ to: '/app/servers/$serverId/shop', params: { serverId } })
      }
    />
  )
}
