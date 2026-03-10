import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { ShopPage } from '../components/shop/shop-page'

export function ShopPageRoute() {
  const { serverId } = useParams({ strict: false }) as { serverId: string }
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const { data: server } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => fetchApi<{ id: string; ownerId: string }>(`/api/servers/${serverId}`),
    enabled: !!serverId,
  })

  const isAdmin = !!server && !!user && server.ownerId === user.id

  return (
    <ShopPage
      serverId={serverId}
      isAdmin={isAdmin}
      onClose={() =>
        navigate({ to: '/app/servers/$serverId', params: { serverId } })
      }
    />
  )
}
