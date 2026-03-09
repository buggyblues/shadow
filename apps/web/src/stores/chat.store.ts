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
    // Only reset channel/thread if actually switching to a different server
    if (current.activeServerId === serverId) return
    set({ activeServerId: serverId, activeChannelId: null, activeThreadId: null })
  },

  setActiveChannel: (channelId) => set({ activeChannelId: channelId, activeThreadId: null }),

  setActiveThread: (threadId) => set({ activeThreadId: threadId }),
}))
