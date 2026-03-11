import { useParams } from '@tanstack/react-router'
import { ServerHome } from '../components/server/server-home'

export function ServerHomePage() {
  const { serverId } = useParams({ strict: false }) as { serverId: string }
  return (
    <div className="h-dvh w-screen flex bg-bg-primary">
      <ServerHome serverId={serverId} standalone />
    </div>
  )
}
