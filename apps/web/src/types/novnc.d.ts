declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    scaleViewport: boolean
    resizeSession: boolean
    clipViewport: boolean
    viewOnly: boolean
    constructor(
      target: HTMLElement,
      urlOrChannel: string | WebSocket | RTCDataChannel,
      options?: {
        credentials?: Record<string, string>
        shared?: boolean
        repeaterID?: string
        wsProtocols?: string[]
      },
    )
    disconnect(): void
    sendCredentials(credentials: Record<string, string>): void
    sendCtrlAltDel(): void
    focus(): void
  }
}
