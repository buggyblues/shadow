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
  /** Whether local user has mic access and can speak (false = listen-only mode) */
  canSpeak: boolean

  /** Map of agoraUid → userId for volume indicator lookup */
  uidToUserId: Map<number, string>

  joinChannel: (channelId: string, channelName: string, agoraUid?: number) => Promise<void>
  leaveChannel: () => void
  setMuted: (muted: boolean) => void
  setScreenSharing: (sharing: boolean) => void
  setError: (error: string | null) => void
  setCanSpeak: (canSpeak: boolean) => void
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
  canSpeak: true,
  uidToUserId: new Map(),

  joinChannel: async (channelId: string, channelName: string, agoraUid = 0) => {
    const socket = getSocket()
    return new Promise<void>((resolve, reject) => {
      socket.emit(
        'voice:join',
        { channelId, agoraUid },
        (res: {
          ok: boolean
          state?: { members: VoiceChannelMember[] & { agoraUid?: number }[] }
          error?: string
        }) => {
          if (res.ok && res.state) {
            const membersWithVolume = res.state.members.map((m) => ({
              userId: m.userId,
              username: m.username,
              displayName: m.displayName,
              muted: m.muted,
              screenSharing: m.screenSharing,
              joinedAt: m.joinedAt,
              volume: 0,
            }))
            // Build uid→userId map from existing members' agoraUid
            const uidMap = new Map<number, string>()
            uidMap.set(agoraUid, 'local')
            for (const m of res.state.members) {
              if (m.agoraUid && m.agoraUid !== 0) {
                uidMap.set(m.agoraUid, m.userId)
              }
            }
            set({
              activeChannelId: channelId,
              activeChannelName: channelName,
              members: membersWithVolume,
              agoraUid,
              error: null,
              canSpeak: true,
              uidToUserId: uidMap,
            })
            resolve()
          } else {
            set({ error: res.error ?? 'Failed to join voice channel' })
            reject(new Error(res.error ?? 'Failed to join voice channel'))
          }
        },
      )
    })
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
      canSpeak: true,
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

  setCanSpeak: (canSpeak: boolean) => set({ canSpeak }),

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
