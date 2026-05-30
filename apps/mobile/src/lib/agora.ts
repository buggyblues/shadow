import Constants from 'expo-constants'
import type { ComponentType } from 'react'
import { NativeModules, type StyleProp, type ViewStyle } from 'react-native'

export type RtcSurfaceViewProps = {
  style?: StyleProp<ViewStyle>
  canvas: { uid: number }
}

export type AgoraRuntime = {
  createAgoraRtcEngine: () => any
  ChannelProfileType?: Record<string, number>
  ClientRoleType?: Record<string, number>
  RemoteVideoState?: Record<string, number>
  RtcSurfaceView?: ComponentType<RtcSurfaceViewProps> | null
}

let cachedRuntime: AgoraRuntime | null | undefined
let cachedSurfaceView: ComponentType<RtcSurfaceViewProps> | null | undefined

function hasNativeAgoraModule() {
  if (NativeModules.AgoraRtcNg) return true
  try {
    const reactNative = require('react-native') as {
      TurboModuleRegistry?: { get?: (name: string) => unknown }
    }
    return Boolean(reactNative.TurboModuleRegistry?.get?.('AgoraRtcNg'))
  } catch {
    return false
  }
}

export function isNativeVoiceRuntimeUnavailable() {
  return Constants.appOwnership === 'expo' || !hasNativeAgoraModule()
}

export function isNativeVoiceModuleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message === 'VOICE_NATIVE_UNAVAILABLE' ||
    message.includes('react-native-agora') ||
    message.includes("doesn't seem to be linked") ||
    message.includes('createAgoraRtcEngine') ||
    message.includes('Expo Go')
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return {}
  return value as Record<string, unknown>
}

function asEngineFactory(value: unknown): (() => any) | null {
  return typeof value === 'function' ? (value as () => any) : null
}

function asEnumRecord(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') return undefined
  return value as Record<string, number>
}

function normalizeAgoraModule(moduleValue: unknown): AgoraRuntime | null {
  const root = asRecord(moduleValue)
  const fallback = asRecord(root.default)
  const createAgoraRtcEngine =
    asEngineFactory(root.createAgoraRtcEngine) ??
    asEngineFactory(fallback.createAgoraRtcEngine) ??
    asEngineFactory(root.default)

  if (!createAgoraRtcEngine) return null

  return {
    createAgoraRtcEngine,
    ChannelProfileType: asEnumRecord(root.ChannelProfileType ?? fallback.ChannelProfileType),
    ClientRoleType: asEnumRecord(root.ClientRoleType ?? fallback.ClientRoleType),
    RemoteVideoState: asEnumRecord(root.RemoteVideoState ?? fallback.RemoteVideoState),
    RtcSurfaceView:
      (root.RtcSurfaceView as ComponentType<RtcSurfaceViewProps> | undefined) ??
      (fallback.RtcSurfaceView as ComponentType<RtcSurfaceViewProps> | undefined) ??
      null,
  }
}

export async function loadAgoraRuntime() {
  if (cachedRuntime !== undefined) return cachedRuntime
  if (isNativeVoiceRuntimeUnavailable()) {
    cachedRuntime = null
    return cachedRuntime
  }
  try {
    const moduleValue = await import('react-native-agora')
    cachedRuntime = normalizeAgoraModule(moduleValue)
  } catch {
    cachedRuntime = null
  }
  return cachedRuntime
}

export function getAgoraRtcSurfaceView() {
  if (cachedSurfaceView !== undefined) return cachedSurfaceView
  if (isNativeVoiceRuntimeUnavailable()) {
    cachedSurfaceView = null
    return cachedSurfaceView
  }
  try {
    const moduleValue = require('react-native-agora')
    cachedSurfaceView = normalizeAgoraModule(moduleValue)?.RtcSurfaceView ?? null
  } catch {
    cachedSurfaceView = null
  }
  return cachedSurfaceView
}
