import { create } from 'zustand'
import { getSocket } from '@/lib/socket'

export interface VoiceChannelMember {
  userId: string
  username: string
  displayName: string
  muted: boolean
  screenSharing: boolean
  joinedAt: string
  /** Real-time volume level 0-100 from Agora volume indicator */
  volume: number
}

interface VoiceChannelState {
  activeChannelId: string | null
  activeChannelName: string | null
  members: VoiceChannelMember[]
  isMuted: boolean
  isScreenSharing: boolean
  error: string | null
  agoraUid: number

  /** Map of uid → userId for volume indicator lookup */
  uidToUserId: Map<number, string>

  joinChannel: (channelId: string, channelName: string, agoraUid?: number) => void
  leaveChannel: () => void
  setMuted: (muted: boolean) => void
  setScreenSharing: (sharing: boolean) => void
  setError: (error: string | null) => void
  updateMembers: (members: VoiceChannelMember[]) => void
  updateVolume: (uid: number, volume: number) => void
  registerUidMapping: (uid: number, userId: string) => void
}

export const useVoiceStore = create<VoiceChannelState>((set, get) => ({
  activeChannelId: null,
  activeChannelName: null,
  members: [],
  isMuted: false,
  isScreenSharing: false,
  error: null,
  agoraUid: 0,
  uidToUserId: new Map(),

  joinChannel: (channelId: string, channelName: string, agoraUid = 0) => {
    const socket = getSocket()
    socket.emit(
      'voice:join',
      { channelId, agoraUid },
      (res: { ok: boolean; state?: { members: VoiceChannelMember[] }; error?: string }) => {
        if (res.ok && res.state) {
          set({
            activeChannelId: channelId,
            activeChannelName: channelName,
            members: res.state.members.map((m) => ({ ...m, volume: 0 })),
            agoraUid,
            error: null,
            uidToUserId: new Map([[agoraUid, 'local']]),
          })
        } else {
          set({ error: res.error ?? 'Failed to join voice channel' })
        }
      },
    )
  },

  leaveChannel: () => {
    const { activeChannelId } = get()
    if (activeChannelId) {
      const socket = getSocket()
      socket.emit('voice:leave', { channelId: activeChannelId })
    }
    set({
      activeChannelId: null,
      activeChannelName: null,
      members: [],
      isMuted: false,
      isScreenSharing: false,
      error: null,
      agoraUid: 0,
      uidToUserId: new Map(),
    })
  },

  setMuted: (muted: boolean) => {
    const { activeChannelId } = get()
    if (activeChannelId) {
      const socket = getSocket()
      socket.emit('voice:mute', { channelId: activeChannelId, muted })
    }
    set({ isMuted: muted })
  },

  setScreenSharing: (sharing: boolean) => {
    const { activeChannelId } = get()
    if (activeChannelId) {
      const socket = getSocket()
      socket.emit(sharing ? 'voice:screenshare:start' : 'voice:screenshare:stop', {
        channelId: activeChannelId,
      })
    }
    set({ isScreenSharing: sharing })
  },

  setError: (error: string | null) => set({ error }),

  updateMembers: (members: VoiceChannelMember[]) => set({ members }),

  updateVolume: (uid: number, volume: number) => {
    const { uidToUserId } = get()
    const userId = uidToUserId.get(uid)
    if (!userId) return

    set((state) => ({
      members: state.members.map((m) => (m.userId === userId ? { ...m, volume } : m)),
    }))
  },

  registerUidMapping: (uid: number, userId: string) => {
    set((state) => {
      const newMap = new Map(state.uidToUserId)
      newMap.set(uid, userId)
      return { uidToUserId: newMap }
    })
  },
}))
