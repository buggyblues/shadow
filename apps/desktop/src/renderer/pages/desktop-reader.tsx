import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  File,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  RotateCw,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

type ReaderTab = {
  id: string
  title: string
  sourceUrl: string
  displayAddress: string
  contentType: string
  fileName: string
  assetUrl: string
  createdAt: number
}

type ReaderState = {
  activeId: string | null
  tabs: ReaderTab[]
}

type ReaderAPI = {
  platform?: string
  reader?: {
    getState: () => Promise<ReaderState>
    activate: (id: string) => Promise<ReaderState>
    close: (id: string) => Promise<ReaderState>
    openDefault: (id: string) => Promise<boolean>
    onState: (callback: (state: ReaderState) => void) => () => void
  }
}

function getAPI(): ReaderAPI | null {
  if (!('desktopAPI' in window)) return null
  return (window as unknown as { desktopAPI?: ReaderAPI }).desktopAPI ?? null
}

function isTextTab(tab: ReaderTab): boolean {
  const type = tab.contentType.toLowerCase()
  const path = tab.fileName.toLowerCase()
  return (
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('xml') ||
    path.endsWith('.md') ||
    path.endsWith('.markdown') ||
    path.endsWith('.txt')
  )
}

function getTabKind(tab: ReaderTab): 'image' | 'pdf' | 'html' | 'text' | 'file' {
  const type = tab.contentType.toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.includes('pdf')) return 'pdf'
  if (type.includes('html')) return 'html'
  if (isTextTab(tab)) return 'text'
  return 'file'
}

function TabIcon({ tab }: { tab: ReaderTab }) {
  const kind = getTabKind(tab)
  if (kind === 'image') return <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
  if (kind === 'text' || kind === 'html')
    return <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
  return <File className="h-3.5 w-3.5" strokeWidth={1.8} />
}

function useReaderState(api: ReaderAPI | null) {
  const [state, setState] = useState<ReaderState>({ activeId: null, tabs: [] })

  useEffect(() => {
    let disposed = false
    api?.reader
      ?.getState()
      .then((next) => {
        if (!disposed) setState(next)
      })
      .catch(() => null)
    const unsubscribe = api?.reader?.onState((next) => {
      if (!disposed) setState(next)
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [api])

  return [state, setState] as const
}

function TextPreview({ tab }: { tab: ReaderTab }) {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let disposed = false
    setStatus('loading')
    setContent('')
    fetch(tab.assetUrl)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.text()
      })
      .then((text) => {
        if (disposed) return
        setContent(text)
        setStatus('ready')
      })
      .catch(() => {
        if (!disposed) setStatus('error')
      })
    return () => {
      disposed = true
    }
  }, [tab.assetUrl])

  if (status === 'loading') {
    return (
      <div className="grid h-full place-items-center bg-zinc-950 text-sm font-medium text-zinc-500">
        {t('desktopReader.loading')}
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="grid h-full place-items-center bg-zinc-950 text-sm font-medium text-zinc-500">
        {t('desktopReader.loadFailed')}
      </div>
    )
  }
  return (
    <div className="h-full overflow-auto bg-[#f8fafc] px-8 py-7 text-[#111827]">
      <article className="mx-auto min-h-full max-w-5xl rounded-2xl bg-white px-8 py-7 shadow-[0_20px_80px_rgba(0,0,0,0.18)] ring-1 ring-black/5">
        <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[13px] leading-7 text-zinc-900">
          {content}
        </pre>
      </article>
    </div>
  )
}

function ImagePreview({ tab }: { tab: ReaderTab }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    setStatus('loading')
  }, [tab.assetUrl])

  if (status === 'error') {
    return (
      <div className="grid h-full place-items-center bg-[#050505] text-sm font-medium text-zinc-500">
        {t('desktopReader.loadFailed')}
      </div>
    )
  }

  return (
    <div className="grid h-full place-items-center overflow-auto bg-[#050505] p-8">
      {status === 'loading' ? (
        <div className="text-sm font-medium text-zinc-500">{t('desktopReader.loading')}</div>
      ) : null}
      <img
        key={tab.assetUrl}
        src={tab.assetUrl}
        alt=""
        className={[
          'max-h-full max-w-full rounded-sm object-contain shadow-[0_24px_120px_rgba(0,0,0,0.65)]',
          status === 'ready' ? 'block' : 'hidden',
        ].join(' ')}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
      />
    </div>
  )
}

function ReaderContent({ tab }: { tab: ReaderTab }) {
  const { t } = useTranslation()
  const kind = getTabKind(tab)

  if (kind === 'image') {
    return <ImagePreview tab={tab} />
  }

  if (kind === 'pdf') {
    return (
      <iframe
        title={tab.title}
        src={tab.assetUrl}
        className="block h-full w-full border-0 bg-white"
      />
    )
  }

  if (kind === 'html') {
    return (
      <iframe
        sandbox=""
        title={tab.title}
        src={tab.assetUrl}
        className="block h-full w-full border-0 bg-white"
      />
    )
  }

  if (kind === 'text') return <TextPreview tab={tab} />

  return (
    <div className="grid h-full place-items-center bg-zinc-950 p-10 text-center">
      <div className="max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
        <File className="mx-auto mb-4 h-10 w-10 text-zinc-500" strokeWidth={1.6} />
        <h2 className="text-base font-semibold text-zinc-100">{t('desktopReader.noPreview')}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{tab.fileName}</p>
      </div>
    </div>
  )
}

export function DesktopReaderPage() {
  const { t } = useTranslation()
  const api = useMemo(() => getAPI(), [])
  const [state, setState] = useReaderState(api)
  const activeTab = state.tabs.find((tab) => tab.id === state.activeId) ?? state.tabs.at(-1) ?? null
  const isDarwin = api?.platform === 'darwin'

  async function activateTab(id: string) {
    const next = await api?.reader?.activate(id)
    if (next) setState(next)
  }

  async function closeTab(id: string) {
    const next = await api?.reader?.close(id)
    if (next) setState(next)
  }

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#0b0b0c] text-zinc-100">
      <section className="desktop-drag-titlebar flex h-11 shrink-0 items-end border-zinc-800/80 border-b bg-[#202124]">
        <div
          className={[
            'desktop-drag-region flex min-w-0 flex-1 items-end gap-1 px-2',
            isDarwin ? 'pl-[90px]' : 'pl-2',
          ].join(' ')}
        >
          {state.tabs.length === 0 ? (
            <div className="mb-1 flex h-9 w-64 items-center rounded-t-xl bg-[#2b2d31] px-4 text-sm font-medium text-zinc-400">
              {t('desktopReader.emptyTab')}
            </div>
          ) : (
            state.tabs.map((tab) => {
              const active = tab.id === activeTab?.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-no-drag
                  onClick={() => void activateTab(tab.id)}
                  className={[
                    'desktop-no-drag',
                    'group mb-0 flex h-9 max-w-[240px] min-w-[132px] items-center gap-2 rounded-t-xl px-3 text-left text-sm transition',
                    active
                      ? 'bg-[#111214] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                      : 'bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
                  ].join(' ')}
                  title={tab.title}
                >
                  <span className={active ? 'text-cyan-300' : 'text-zinc-500'}>
                    <TabIcon tab={tab} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{tab.title}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t('desktopReader.closeTab')}
                    onClick={(event) => {
                      event.stopPropagation()
                      void closeTab(tab.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      event.stopPropagation()
                      void closeTab(tab.id)
                    }}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-zinc-500 opacity-80 transition hover:bg-white/10 hover:text-zinc-100 group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </span>
                </button>
              )
            })
          )}
          <div className="mb-1 h-9 flex-1" />
        </div>
      </section>

      <section className="desktop-drag-titlebar flex h-[52px] shrink-0 items-center gap-2 border-zinc-800/80 border-b bg-[#111214] px-3">
        <div className="desktop-no-drag flex items-center gap-1" data-no-drag>
          <button
            type="button"
            disabled
            className="grid h-8 w-8 place-items-center rounded-full text-zinc-600"
            aria-label={t('desktopReader.back')}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            disabled
            className="grid h-8 w-8 place-items-center rounded-full text-zinc-600"
            aria-label={t('desktopReader.forward')}
          >
            <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full text-zinc-300 transition hover:bg-white/10 hover:text-white"
            aria-label={t('desktopReader.reload')}
            onClick={() => {
              if (activeTab && isTextTab(activeTab)) void activateTab(activeTab.id)
            }}
          >
            <RotateCw className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="desktop-drag-region flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-[#202124] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <LockKeyhole className="h-4 w-4 shrink-0 text-emerald-300" strokeWidth={1.8} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
            {activeTab?.displayAddress ?? t('desktopReader.emptyAddress')}
          </span>
          {activeTab && (
            <span className="hidden shrink-0 rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-200 sm:inline-flex">
              {t('desktopReader.secure')}
            </span>
          )}
        </div>

        <button
          type="button"
          data-no-drag
          disabled={!activeTab}
          onClick={() => {
            if (activeTab) void api?.reader?.openDefault(activeTab.id)
          }}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
          <span className="hidden lg:inline">{t('desktopReader.openDefault')}</span>
        </button>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden">
        {activeTab ? (
          <ReaderContent tab={activeTab} />
        ) : (
          <div className="grid h-full place-items-center bg-zinc-950 p-10 text-center">
            <div className="max-w-sm">
              <FileText className="mx-auto mb-4 h-11 w-11 text-zinc-600" strokeWidth={1.6} />
              <h1 className="text-lg font-semibold text-zinc-200">
                {t('desktopReader.emptyTitle')}
              </h1>
              <p className="mt-2 text-sm leading-6 text-zinc-500">{t('desktopReader.emptyDesc')}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
