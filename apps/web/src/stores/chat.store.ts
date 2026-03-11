import { create } from 'zustand'

interface ChatState {
  activeServerId: string | null
  activeChannelId: string | null
  activeThreadId: string | null
  setActiveServer: (serverId: string | null) => void
  setActiveChannel: (channelId: string | null) => void
  setActiveThread: (threadId: string | null) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeServerId: null,
  activeChannelId: null,
  activeThreadId: null,

  setActiveServer: (serverId) => {
    const current = get()
    if (current.activeServerId === serverId) return
    // Don't reset activeChannelId here — route components manage it via useLayoutEffect
    set({ activeServerId: serverId, activeThreadId: null })
  },

  setActiveChannel: (channelId) => set({ activeChannelId: channelId, activeThreadId: null }),

  setActiveThread: (threadId) => set({ activeThreadId: threadId }),
}))
