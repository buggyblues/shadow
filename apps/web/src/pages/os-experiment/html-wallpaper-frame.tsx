import { Loader2 } from 'lucide-react'
import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from 'react'

const WALLPAPER_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com",
  "style-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com",
  'img-src data: blob: https:',
  'media-src data: blob: https:',
  'font-src data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const WALLPAPER_FULLSCREEN_STYLE = `
html,
body {
  width: 100%;
  height: 100%;
  min-width: 100%;
  min-height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
}
body {
  position: relative;
}
body > * {
  box-sizing: border-box;
}
canvas,
svg,
video {
  max-width: 100vw;
  max-height: 100vh;
  max-height: 100dvh;
}
img:only-child,
body > img:only-child,
body > video:only-child,
body > canvas:only-child,
body > svg:only-child {
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  object-fit: cover;
  display: block;
}
`

function contextMenuBridgeScript(enabled: boolean) {
  if (!enabled) return ''
  return `
<script>
(() => {
  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.parent.postMessage({
      type: 'shadow:wallpaper-contextmenu',
      clientX: event.clientX,
      clientY: event.clientY
    }, '*');
  });
})();
</script>`
}

function pointerBridgeScript(enabled: boolean) {
  if (!enabled) return ''
  return `
<script>
(() => {
  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'shadow:wallpaper-pointer') return;
    const clientX = Number(data.clientX) || 0;
    const clientY = Number(data.clientY) || 0;
    const target =
      document.elementFromPoint(clientX, clientY) ||
      document.body ||
      document.documentElement ||
      window;
    const mouseEvent = new MouseEvent(data.eventType || 'mousemove', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      screenX: Number(data.screenX) || clientX,
      screenY: Number(data.screenY) || clientY,
      movementX: Number(data.movementX) || 0,
      movementY: Number(data.movementY) || 0,
      button: Number(data.button) || 0,
      buttons: Number(data.buttons) || 0,
      ctrlKey: Boolean(data.ctrlKey),
      altKey: Boolean(data.altKey),
      shiftKey: Boolean(data.shiftKey),
      metaKey: Boolean(data.metaKey)
    });
    target.dispatchEvent(mouseEvent);
  });
})();
</script>`
}

function injectWallpaperShell(
  html: string,
  options?: { contextMenuBridge?: boolean; pointerBridge?: boolean },
) {
  const injection = [
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<meta http-equiv="Content-Security-Policy" content="${WALLPAPER_CSP.replaceAll('"', '&quot;')}">`,
    `<style id="shadow-wallpaper-fullscreen">${WALLPAPER_FULLSCREEN_STYLE}</style>`,
    contextMenuBridgeScript(Boolean(options?.contextMenuBridge)),
    pointerBridgeScript(Boolean(options?.pointerBridge)),
  ].join('')

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${injection}`)
  }

  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${injection}</head>`)
  }

  return `<!doctype html><html><head>${injection}</head><body>${html}</body></html>`
}

export function OsHtmlWallpaperFrame({
  src,
  title,
  className,
  contextMenuBridge,
  pointerBridge,
}: {
  src: string
  title: string
  className?: string
  contextMenuBridge?: boolean
  pointerBridge?: boolean
}) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [iframeReady, setIframeReady] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const loadTimerRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | null = null
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12_000)
    if (loadTimerRef.current !== null) {
      window.clearTimeout(loadTimerRef.current)
      loadTimerRef.current = null
    }
    setSrcDoc(null)
    setLoading(true)
    setFailed(false)
    setIframeReady(false)

    fetch(src, { credentials: 'same-origin', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load wallpaper')
        return response.text()
      })
      .then((html) => {
        if (!cancelled) {
          setSrcDoc(injectWallpaperShell(html, { contextMenuBridge, pointerBridge }))
          setLoading(false)
          loadTimerRef.current = window.setTimeout(() => {
            if (!cancelled) setAttempt((current) => current + 1)
          }, 10_000)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
          setLoading(false)
          retryTimer = window.setTimeout(() => setAttempt((current) => current + 1), 3000)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
      if (loadTimerRef.current !== null) {
        window.clearTimeout(loadTimerRef.current)
        loadTimerRef.current = null
      }
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [attempt, contextMenuBridge, pointerBridge, src])

  const sendPointerEvent = useCallback(
    (eventType: string, event: ReactMouseEvent<HTMLDivElement>) => {
      if (!pointerBridge) return
      const iframe = iframeRef.current
      const contentWindow = iframe?.contentWindow
      if (!iframe || !contentWindow) return
      const rect = iframe.getBoundingClientRect()
      contentWindow.postMessage(
        {
          type: 'shadow:wallpaper-pointer',
          eventType,
          clientX: event.clientX - rect.left,
          clientY: event.clientY - rect.top,
          screenX: event.screenX,
          screenY: event.screenY,
          movementX: event.movementX,
          movementY: event.movementY,
          button: event.button,
          buttons: event.buttons,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
        },
        '*',
      )
    },
    [pointerBridge],
  )

  const iframe = (
    <iframe
      aria-hidden="true"
      title={title}
      src="about:blank"
      srcDoc={srcDoc ?? undefined}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className={
        pointerBridge
          ? 'pointer-events-none absolute inset-0 h-full w-full border-0 bg-black'
          : 'absolute inset-0 h-full w-full border-0 bg-black'
      }
      ref={iframeRef}
      onLoad={() => {
        if (!srcDoc) return
        if (loadTimerRef.current !== null) {
          window.clearTimeout(loadTimerRef.current)
          loadTimerRef.current = null
        }
        setIframeReady(true)
      }}
    />
  )

  const placeholder = (
    <div
      aria-hidden="true"
      className={`absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#07111b_0%,#19303a_44%,#10221d_100%)] text-white/50 transition-opacity ${
        loading || failed || !iframeReady ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <Loader2 size={22} className="animate-spin" />
    </div>
  )

  const wrapperClassName = `relative overflow-hidden ${className ?? ''}`

  if (!pointerBridge) {
    return (
      <div aria-hidden="true" className={wrapperClassName}>
        {iframe}
        {placeholder}
      </div>
    )
  }

  return (
    <div
      aria-hidden="true"
      className={wrapperClassName}
      onMouseMove={(event) => sendPointerEvent('mousemove', event)}
      onMouseDown={(event) => {
        if (event.button === 0) sendPointerEvent('mousedown', event)
      }}
      onMouseUp={(event) => {
        if (event.button === 0) sendPointerEvent('mouseup', event)
      }}
      onClick={(event) => sendPointerEvent('click', event)}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        window.postMessage(
          {
            type: 'shadow:wallpaper-contextmenu',
            clientX: event.clientX,
            clientY: event.clientY,
          },
          window.location.origin,
        )
      }}
    >
      {iframe}
      {placeholder}
    </div>
  )
}
