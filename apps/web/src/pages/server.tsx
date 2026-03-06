import { useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ChannelSidebar } from '../components/channel/channel-sidebar'
import { ChatArea } from '../components/chat/chat-area'
import { MemberList } from '../components/member/member-list'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'

export function ServerPage() {
  const { serverId } = useParams({ strict: false })
  const setActiveServer = useChatStore((s) => s.setActiveServer)
  const { mobileView, setMobileView } = useUIStore()

  useEffect(() => {
    if (serverId) {
      setActiveServer(serverId)
      setMobileView('channels')
    }
  }, [serverId, setActiveServer, setMobileView])

  if (!serverId) return null

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden h-full bg-bg-tertiary">
      {/* Channel sidebar: standard Discord width (240px/w-60). 
          On mobile it takes full width but transitions smoothly. */}
      <div
        className={`${
          mobileView === 'channels'
            ? 'flex absolute inset-0 z-20 md:relative'
            : 'hidden'
        } md:flex flex-col w-full md:w-60 flex-shrink-0 transition-transform duration-300 ease-in-out`}
      >
        <ChannelSidebar serverId={serverId} />
      </div>

      {/* Chat area: flexible width, with min-w-0 to prevent flex blowout */}
      <div
        className={`${
          mobileView === 'chat'
            ? 'flex absolute inset-0 z-10 md:relative md:z-auto'
            : 'hidden'
        } md:flex flex-1 min-w-0 flex-col transition-all duration-300 ease-in-out`}
      >
        <ChatArea />
      </div>

      {/* Member list: hidden by default, shown on lg+ within its component,
          or as an overlay on smaller screens if managed by a state */}
      <MemberList />
    </div>
  )
}
