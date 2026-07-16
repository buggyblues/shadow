export type CloudBrowserCdpEvent = {
  method: string
  params: Record<string, unknown>
}

type PendingCommand = {
  resolve: (value: Record<string, unknown>) => void
  reject: (error: Error) => void
}

export class CloudBrowserCdpClient {
  private nextId = 1
  private readonly pending = new Map<number, PendingCommand>()
  private readonly listeners = new Set<(event: CloudBrowserCdpEvent) => void>()

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => void this.handleMessage(event))
    socket.addEventListener('error', () =>
      this.rejectPending(new Error('Browser connection failed')),
    )
    socket.addEventListener('close', () => {
      this.rejectPending(new Error('Browser disconnected'))
      this.emit({ method: 'Shadow.connectionClosed', params: {} })
    })
  }

  static async connect(url: string) {
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close()
        reject(new Error('Browser connection timed out'))
      }, 10_000)
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timer)
          reject(new Error('Browser connection failed'))
        },
        { once: true },
      )
    })
    return new CloudBrowserCdpClient(socket)
  }

  onEvent(listener: (event: CloudBrowserCdpEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  command(method: string, params: Record<string, unknown> = {}) {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Browser is not connected'))
    }
    const id = this.nextId++
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.rejectPending(new Error('Browser disconnected'))
    this.socket.close()
  }

  private async handleMessage(event: MessageEvent) {
    const text =
      typeof event.data === 'string'
        ? event.data
        : event.data instanceof Blob
          ? await event.data.text()
          : new TextDecoder().decode(event.data as ArrayBuffer)
    const payload = JSON.parse(text) as {
      id?: number
      method?: string
      params?: Record<string, unknown>
      result?: Record<string, unknown>
      error?: { message?: string }
    }
    if (payload.id) {
      const pending = this.pending.get(payload.id)
      if (!pending) return
      this.pending.delete(payload.id)
      if (payload.error)
        pending.reject(new Error(payload.error.message ?? 'Browser command failed'))
      else pending.resolve(payload.result ?? {})
      return
    }
    if (!payload.method) return
    this.emit({ method: payload.method, params: payload.params ?? {} })
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  private emit(event: CloudBrowserCdpEvent) {
    for (const listener of this.listeners) listener(event)
  }
}
