import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { snapdom } from '@zumer/snapdom'
import {
  ArrowLeft,
  Download,
  Eye,
  MessageCircle,
  MessageSquarePlus,
  Monitor,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Share2,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react'
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { SpaceComment, SpaceCommentContext, SpaceCommentRegion } from '../../types.js'
import { addComment } from '../api.js'
import { EmptyState } from '../components/EmptyState.js'
import { useArtwork, useInvalidateSpace } from '../hooks.js'
import { compactNumber, currentVersion, previewUrl, versionDisplayTitle } from '../utils.js'

type FrameMode = 'web' | 'iphone' | 'ipad'
type SelectionRect = { x: number; y: number; width: number; height: number }
type SelectionRegion = SelectionRect & { id: number }
type ResizeDraft = { id: number; initial: SelectionRegion }
type SnapshotState = 'idle' | 'capturing' | 'ready' | 'failed'

export function PreviewPage() {
  const params = useParams({ strict: false }) as { artworkId?: string }
  const search = useSearch({ strict: false }) as { toolbar?: unknown }
  const navigate = useNavigate()
  const artworkQuery = useArtwork(params.artworkId)
  const invalidate = useInvalidateSpace()
  const artwork = artworkQuery.data?.artwork
  const current = currentVersion(artwork)
  const [comment, setComment] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [frameMode, setFrameMode] = useState<FrameMode>('web')
  const [reloadKey, setReloadKey] = useState(0)
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null)
  const [draftRect, setDraftRect] = useState<SelectionRect | null>(null)
  const [selections, setSelections] = useState<SelectionRegion[]>([])
  const [composerRegionId, setComposerRegionId] = useState<number | null>(null)
  const [resizeDraft, setResizeDraft] = useState<ResizeDraft | null>(null)
  const [snapshotState, setSnapshotState] = useState<SnapshotState>('idle')
  const frameRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const commentRefs = useRef(new Map<string, HTMLElement>())
  const toolbarVisible = search.toolbar === '1' || search.toolbar === 1 || search.toolbar === true

  const version =
    artwork?.versions.find((item) => item.id === selectedVersionId) ?? currentVersion(artwork)
  const selectedPreviewUrl = artwork && version ? previewUrl(artwork, version) : ''

  const sendComment = useMutation({
    mutationFn: async () => {
      if (!artwork || !version) throw new Error('作品未加载')
      let context: SpaceCommentContext | undefined
      if (selections.length && frameRef.current) {
        setSnapshotState('capturing')
        context = await createSelectionContext({
          artworkId: artwork.id,
          versionId: version.id,
          versionNumber: version.number,
          versionTitle: versionDisplayTitle(version),
          previewUrl: selectedPreviewUrl,
          frameMode,
          frameElement: frameRef.current,
          iframeElement: iframeRef.current,
          selections,
        })
        setSnapshotState(context.screenshot?.error ? 'failed' : 'ready')
      }
      return addComment({
        artworkId: artwork.id,
        body: comment,
        context,
      })
    },
    onSuccess: async (payload) => {
      setHighlightCommentId(payload.comment.id)
      setComment('')
      setCommentsOpen(true)
      setSelectionMode(false)
      setSelectionStart(null)
      setDraftRect(null)
      setSelections([])
      setComposerRegionId(null)
      setResizeDraft(null)
      setSnapshotState('idle')
      await invalidate()
    },
  })

  useEffect(() => {
    if (current && !selectedVersionId) setSelectedVersionId(current.id)
  }, [current, selectedVersionId])

  useEffect(() => {
    setSelectionMode(false)
    setSelectionStart(null)
    setDraftRect(null)
    setSelections([])
    setComposerRegionId(null)
    setResizeDraft(null)
    setSnapshotState('idle')
  }, [selectedVersionId, frameMode])

  useEffect(() => {
    if (toolbarVisible) return
    setSelectionMode(false)
    setSelectionStart(null)
    setDraftRect(null)
    setSelections([])
    setComposerRegionId(null)
    setResizeDraft(null)
    setSnapshotState('idle')
  }, [toolbarVisible])

  useEffect(() => {
    if (!resizeDraft || !frameRef.current) return

    const moveResize = (event: PointerEvent) => {
      const bounds = frameRef.current?.getBoundingClientRect()
      if (!bounds) return
      event.preventDefault()
      const x = clamp(event.clientX - bounds.left, 0, bounds.width)
      const y = clamp(event.clientY - bounds.top, 0, bounds.height)
      setSelections((items) =>
        items.map((item) =>
          item.id === resizeDraft.id
            ? {
                ...item,
                width: clamp(x - resizeDraft.initial.x, 28, bounds.width - resizeDraft.initial.x),
                height: clamp(y - resizeDraft.initial.y, 28, bounds.height - resizeDraft.initial.y),
              }
            : item,
        ),
      )
    }
    const finishResize = () => setResizeDraft(null)

    window.addEventListener('pointermove', moveResize)
    window.addEventListener('pointerup', finishResize)
    window.addEventListener('pointercancel', finishResize)
    return () => {
      window.removeEventListener('pointermove', moveResize)
      window.removeEventListener('pointerup', finishResize)
      window.removeEventListener('pointercancel', finishResize)
    }
  }, [resizeDraft])

  useEffect(() => {
    if (!commentsOpen || !highlightCommentId) return
    const node = commentRefs.current.get(highlightCommentId)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const timer = window.setTimeout(() => {
      setHighlightCommentId((currentId) => (currentId === highlightCommentId ? null : currentId))
    }, 2600)
    return () => window.clearTimeout(timer)
  }, [artwork?.comments.length, commentsOpen, highlightCommentId])

  if (!params.artworkId) {
    return <EmptyState title="没有找到作品" body="这个预览需要一个有效作品。" />
  }

  if (!artwork && artworkQuery.isLoading) {
    return <div className="previewLoading">正在打开作品</div>
  }

  if (!artwork || !version) {
    return <EmptyState title="没有找到作品" body="这个作品还没有可预览的版本。" />
  }

  const activeComposerRegion =
    selections.find((selection) => selection.id === composerRegionId) ??
    selections[selections.length - 1]

  const resetSelectionDraft = () => {
    setSelectionMode(false)
    setSelectionStart(null)
    setDraftRect(null)
    setSelections([])
    setComposerRegionId(null)
    setResizeDraft(null)
    setSnapshotState('idle')
  }

  const beginSelectionMode = () => {
    setSelectionMode(true)
    setCommentsOpen(false)
  }

  const startSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selectionMode || resizeDraft || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    setSelectionStart(point)
    setDraftRect({ ...point, width: 0, height: 0 })
  }

  const moveSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selectionMode || resizeDraft || !selectionStart) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = clamp(event.clientX - bounds.left, 0, bounds.width)
    const y = clamp(event.clientY - bounds.top, 0, bounds.height)
    setDraftRect({
      x: Math.min(selectionStart.x, x),
      y: Math.min(selectionStart.y, y),
      width: Math.abs(x - selectionStart.x),
      height: Math.abs(y - selectionStart.y),
    })
  }

  const finishSelection = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (draftRect && draftRect.width > 12 && draftRect.height > 12) {
      const nextRegion = {
        ...draftRect,
        id: nextSelectionId(artwork.comments, selections),
      }
      setSelections((items) => [...items, nextRegion])
      setComposerRegionId(nextRegion.id)
      setSnapshotState('idle')
    }
    setSelectionStart(null)
    setDraftRect(null)
  }

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, selection: SelectionRegion) => {
    event.preventDefault()
    event.stopPropagation()
    setComposerRegionId(selection.id)
    setResizeDraft({ id: selection.id, initial: selection })
  }

  const submitSelectedComment = () => {
    if (!comment.trim() || sendComment.isPending || snapshotState === 'capturing') return
    sendComment.mutate()
  }

  const submitPlainComment = () => {
    if (!comment.trim() || sendComment.isPending) return
    sendComment.mutate()
  }

  const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>, submit: () => void) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  const shareCurrentLink = async () => {
    const copied = await copyToClipboard(window.location.href)
    setShareState(copied ? 'copied' : 'failed')
    window.setTimeout(() => setShareState('idle'), 2200)
  }

  const ownerName = artwork.owner.displayName || '创作者'
  const ownerInitial = ownerName.slice(0, 1).toUpperCase()

  return (
    <section
      className={[
        'immersivePreview',
        toolbarVisible ? 'has-toolbar' : '',
        commentsOpen ? 'has-drawer' : '',
        selectionMode ? 'is-selecting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {toolbarVisible ? (
        <header className="previewToolbar" aria-label="作品预览工具">
          <div className="toolbarIdentity">
            <Link to="/profile" className="toolbarAuthor" title={ownerName}>
              <span>
                {artwork.owner.avatarUrl ? (
                  <img src={artwork.owner.avatarUrl} alt="" />
                ) : (
                  ownerInitial
                )}
              </span>
              <strong>{ownerName}</strong>
            </Link>
            <span className="toolbarStat" title="浏览量">
              <Eye />
              {compactNumber(artwork.viewCount)}
            </span>
          </div>
          <div className="toolbarActions">
            <button
              type="button"
              className="toolButton is-icon"
              aria-label="刷新"
              title="刷新"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw />
            </button>
            <button
              type="button"
              className={selectionMode ? 'toolButton is-icon is-active' : 'toolButton is-icon'}
              aria-label={selectionMode ? '取消框选评论' : '框选评论'}
              title={selectionMode ? '取消框选评论' : '框选评论'}
              onClick={() => {
                if (selectionMode || selections.length) {
                  resetSelectionDraft()
                  return
                }
                beginSelectionMode()
              }}
            >
              {selectionMode ? <X /> : <MessageSquarePlus />}
            </button>
            <button
              type="button"
              className={commentsOpen ? 'toolButton is-icon is-active' : 'toolButton is-icon'}
              aria-label={commentsOpen ? '收起评论' : '查看评论'}
              title={commentsOpen ? '收起评论' : '查看评论'}
              onClick={() => setCommentsOpen((value) => !value)}
            >
              {commentsOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </button>
            <button
              type="button"
              className="toolButton is-icon"
              aria-label={shareState === 'copied' ? '已复制' : '分享链接'}
              title={shareState === 'copied' ? '已复制' : '分享链接'}
              onClick={shareCurrentLink}
            >
              <Share2 />
            </button>
            {shareState !== 'idle' ? (
              <span className="toolbarToast" role="status">
                {shareState === 'copied' ? '链接已复制' : '复制失败'}
              </span>
            ) : null}
            <label className="toolSelectLabel">
              <span>版本</span>
              <select
                value={version.id}
                onChange={(event) => setSelectedVersionId(event.target.value)}
              >
                {artwork.versions
                  .slice()
                  .reverse()
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      v{item.number} · {versionDisplayTitle(item)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="frameGroup" aria-label="Frame">
              <button
                type="button"
                className={frameMode === 'iphone' ? 'is-active' : ''}
                onClick={() => setFrameMode('iphone')}
              >
                <Smartphone />
                iPhone
              </button>
              <button
                type="button"
                className={frameMode === 'ipad' ? 'is-active' : ''}
                onClick={() => setFrameMode('ipad')}
              >
                <Tablet />
                iPad
              </button>
              <button
                type="button"
                className={frameMode === 'web' ? 'is-active' : ''}
                onClick={() => setFrameMode('web')}
              >
                <Monitor />
                Web
              </button>
            </div>
            <a
              className="toolButton is-icon"
              href={selectedPreviewUrl}
              download
              aria-label="下载"
              title="下载"
            >
              <Download />
            </a>
            <button
              type="button"
              className="toolButton is-icon"
              aria-label="返回"
              title="返回"
              onClick={() => navigate({ to: '/', search: { q: '', tag: '', visibility: 'all' } })}
            >
              <ArrowLeft />
            </button>
          </div>
        </header>
      ) : null}

      <div className="previewStage">
        <div className={`frameViewport is-${frameMode}`} ref={frameRef}>
          <iframe
            ref={iframeRef}
            className="previewFrame"
            key={`${version.id}-${reloadKey}`}
            title={artwork.title}
            src={selectedPreviewUrl}
          />
          {selectionMode || selections.length ? (
            <div
              className="commentSelectionLayer"
              onPointerDown={startSelection}
              onPointerMove={moveSelection}
              onPointerUp={finishSelection}
              onPointerCancel={finishSelection}
            >
              {selections.map((selection) => (
                <button
                  type="button"
                  className={
                    selection.id === activeComposerRegion?.id
                      ? 'selectionRect is-active'
                      : 'selectionRect'
                  }
                  key={selection.id}
                  style={{
                    left: selection.x,
                    top: selection.y,
                    width: selection.width,
                    height: selection.height,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setComposerRegionId(selection.id)}
                >
                  <span>#{selection.id}</span>
                  <span
                    className="selectionHandle"
                    aria-hidden
                    onPointerDown={(event) => startResize(event, selection)}
                  />
                </button>
              ))}
              {draftRect ? (
                <span
                  className="selectionRect is-draft"
                  style={{
                    left: draftRect.x,
                    top: draftRect.y,
                    width: draftRect.width,
                    height: draftRect.height,
                  }}
                />
              ) : null}
              {activeComposerRegion ? (
                <form
                  className="selectionComposer"
                  style={composerPosition(activeComposerRegion, frameRef.current)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitSelectedComment()
                  }}
                >
                  <div className="selectionComposerHeader">
                    <strong>#{activeComposerRegion.id}</strong>
                    <button type="button" onClick={resetSelectionDraft}>
                      取消
                    </button>
                  </div>
                  <textarea
                    autoFocus
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    onKeyDown={(event) => submitOnEnter(event, submitSelectedComment)}
                    placeholder="写下批注，可用 #1、#2 指向选区"
                  />
                  <div className="selectionComposerFooter">
                    <small>{snapshotHint(snapshotState, selections.length)}</small>
                    <button
                      type="submit"
                      disabled={
                        !comment.trim() ||
                        !selections.length ||
                        sendComment.isPending ||
                        snapshotState === 'capturing'
                      }
                    >
                      提交
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="previewDrawer" aria-hidden={!commentsOpen}>
        <div className="drawerHeader">
          <div>
            <span>评论</span>
            <h2>批注记录</h2>
          </div>
          <button type="button" className="iconAction" onClick={() => setCommentsOpen(false)}>
            <PanelRightClose />
          </button>
        </div>
        <div className="drawerComments">
          {artwork.comments.length ? (
            artwork.comments.map((item) => (
              <article
                className={
                  item.id === highlightCommentId ? 'commentItem is-highlighted' : 'commentItem'
                }
                key={item.id}
                ref={(node) => {
                  if (node) commentRefs.current.set(item.id, node)
                  else commentRefs.current.delete(item.id)
                }}
              >
                <div className="miniAvatar">{item.author.displayName.slice(0, 1)}</div>
                <div>
                  <strong>{item.author.displayName}</strong>
                  <p>{renderCommentBody(item.body)}</p>
                  {item.context?.kind === 'selection' ? (
                    <SelectionSnapshot context={item.context} />
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <CommentEmptyState onStartSelection={beginSelectionMode} />
          )}
        </div>
        <form
          className="drawerComposer"
          onSubmit={(event) => {
            event.preventDefault()
            submitPlainComment()
          }}
        >
          <label>
            <MessageCircle />
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              onKeyDown={(event) => submitOnEnter(event, submitPlainComment)}
              placeholder="继续写下评论..."
            />
          </label>
          <button type="submit" disabled={!comment.trim() || sendComment.isPending}>
            发送
          </button>
        </form>
      </aside>
    </section>
  )
}

function CommentEmptyState({ onStartSelection }: { onStartSelection: () => void }) {
  return (
    <div className="drawerEmptyState">
      <svg viewBox="0 0 220 150" aria-hidden>
        <rect x="28" y="22" width="164" height="98" rx="18" />
        <path d="M58 52h72M58 73h104M58 94h54" />
        <rect x="112" y="62" width="62" height="38" rx="10" />
        <path d="M131 81h24" />
        <circle cx="181" cy="118" r="18" />
        <path d="M174 118h14M181 111v14" />
      </svg>
      <strong>还没有批注</strong>
      <p>点击工具栏里的框选按钮，在作品上拖出一处选区，再写下第一条评论。</p>
      <button type="button" onClick={onStartSelection}>
        开始框选
      </button>
    </div>
  )
}

function SelectionSnapshot({ context }: { context: SpaceCommentContext }) {
  const regions = commentRegions(context)
  return (
    <div className="commentSnapshot">
      <div className="snapshotImage">
        {context.screenshot?.dataUrl ? (
          <img src={context.screenshot.dataUrl} alt="" />
        ) : (
          <span>截图不可用</span>
        )}
        {regions.map((region) => (
          <span
            className="snapshotBox"
            key={region.id}
            style={{
              left: `${region.normalized.x * 100}%`,
              top: `${region.normalized.y * 100}%`,
              width: `${region.normalized.width * 100}%`,
              height: `${region.normalized.height * 100}%`,
            }}
          >
            #{region.id}
          </span>
        ))}
      </div>
      <small>
        v{context.pageState.versionNumber} · {context.pageState.frameMode} ·{' '}
        {Math.round(context.pageState.frameSize.width)}x
        {Math.round(context.pageState.frameSize.height)}
      </small>
    </div>
  )
}

function renderCommentBody(body: string) {
  return body.split(/(#\d+)/g).map((part, index) =>
    /^#\d+$/.test(part) ? (
      <span className="commentMention" key={`${part}-${index}`}>
        {part}
      </span>
    ) : (
      part
    ),
  )
}

function commentRegions(context: SpaceCommentContext): SpaceCommentRegion[] {
  if (context.selections?.length) return context.selections
  return context.selection ? [{ ...context.selection, id: context.selection.id ?? 1 }] : []
}

async function createSelectionContext(input: {
  artworkId: string
  versionId: string
  versionNumber: number
  versionTitle: string
  previewUrl: string
  frameMode: FrameMode
  frameElement: HTMLDivElement
  iframeElement: HTMLIFrameElement | null
  selections: SelectionRegion[]
}): Promise<SpaceCommentContext> {
  const frameBounds = input.frameElement.getBoundingClientRect()
  const selections = input.selections.map((selection) => {
    const normalized = {
      x: selection.x / frameBounds.width,
      y: selection.y / frameBounds.height,
      width: selection.width / frameBounds.width,
      height: selection.height / frameBounds.height,
    }

    return {
      ...selection,
      unit: 'px' as const,
      normalized,
    }
  })
  const iframeWindow = input.iframeElement?.contentWindow
  const screenshot = await captureIframeScreenshot(input.iframeElement, frameBounds)

  return {
    kind: 'selection',
    selection: selections[0],
    selections,
    pageState: {
      artworkId: input.artworkId,
      versionId: input.versionId,
      versionNumber: input.versionNumber,
      versionTitle: input.versionTitle,
      previewUrl: input.previewUrl,
      frameMode: input.frameMode,
      frameSize: { width: frameBounds.width, height: frameBounds.height },
      viewportSize: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: iframeWindow?.scrollX ?? 0, y: iframeWindow?.scrollY ?? 0 },
      devicePixelRatio: window.devicePixelRatio || 1,
      capturedAt: new Date().toISOString(),
    },
    screenshot,
  }
}

async function captureIframeScreenshot(
  iframe: HTMLIFrameElement | null,
  frameBounds: DOMRect,
): Promise<SpaceCommentContext['screenshot']> {
  let target: HTMLElement | null = null
  try {
    const doc = iframe?.contentDocument
    const iframeWindow = iframe?.contentWindow
    if (!doc?.body || !iframeWindow) {
      return { error: 'preview_document_unavailable', provider: 'snapdom' }
    }

    await doc.fonts?.ready.catch(() => undefined)

    const width = Math.max(1, Math.round(frameBounds.width))
    const height = Math.max(1, Math.round(frameBounds.height))
    target = createViewportSnapshotTarget(doc, iframeWindow, width, height)
    const blob = await snapdom.toBlob(target, {
      type: 'png',
      width,
      height,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      backgroundColor: 'oklch(0.985 0.006 95)',
      cache: 'soft',
      fast: true,
      placeholders: true,
    })

    return {
      dataUrl: await blobToDataUrl(blob),
      provider: 'snapdom',
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'screenshot_failed',
      provider: 'snapdom',
    }
  } finally {
    target?.remove()
  }
}

function createViewportSnapshotTarget(
  doc: Document,
  iframeWindow: Window,
  width: number,
  height: number,
) {
  const scrollX = iframeWindow.scrollX
  const scrollY = iframeWindow.scrollY
  const docWidth = Math.max(width, doc.documentElement.scrollWidth, doc.body.scrollWidth)
  const docHeight = Math.max(height, doc.documentElement.scrollHeight, doc.body.scrollHeight)
  const bodyClone = doc.body.cloneNode(true) as HTMLElement
  bodyClone.querySelectorAll('script').forEach((node) => node.remove())
  bodyClone.style.width = `${docWidth}px`
  bodyClone.style.minHeight = `${docHeight}px`
  bodyClone.style.margin = '0'
  bodyClone.style.transform = `translate(${-scrollX}px, ${-scrollY}px)`
  bodyClone.style.transformOrigin = '0 0'

  const target = doc.createElement('div')
  target.dataset.spaceSnapshotTarget = 'true'
  target.style.position = 'fixed'
  target.style.left = '-100000px'
  target.style.top = '0'
  target.style.width = `${width}px`
  target.style.height = `${height}px`
  target.style.overflow = 'hidden'
  target.style.background = 'oklch(0.985 0.006 95)'
  target.style.pointerEvents = 'none'
  target.append(bodyClone)
  doc.body.append(target)
  return target
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('screenshot_read_failed'))
    reader.readAsDataURL(blob)
  })
}

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall back to the synchronous copy path below.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.append(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

function composerPosition(region: SelectionRegion, frame: HTMLDivElement | null) {
  const frameBounds = frame?.getBoundingClientRect()
  const composerWidth = 320
  const composerHeight = 178
  const maxLeft = Math.max(12, (frameBounds?.width ?? window.innerWidth) - composerWidth - 12)
  const maxTop = Math.max(12, (frameBounds?.height ?? window.innerHeight) - composerHeight - 12)
  return {
    left: Math.min(maxLeft, Math.max(12, region.x + region.width + 12)),
    top: Math.min(maxTop, Math.max(12, region.y + region.height + 12)),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function nextSelectionId(comments: SpaceComment[], selections: SelectionRegion[]) {
  const savedMax = comments
    .flatMap((comment) => (comment.context ? commentRegions(comment.context) : []))
    .reduce((max, region) => Math.max(max, region.id), 0)
  const draftMax = selections.reduce((max, selection) => Math.max(max, selection.id), 0)
  return Math.max(savedMax, draftMax) + 1
}

function snapshotHint(snapshotState: SnapshotState, selectionCount: number) {
  if (snapshotState === 'capturing') return '正在记录截图和页面状态'
  if (snapshotState === 'failed') return '截图失败，仍会保留选区和页面状态'
  return `${selectionCount} 个选区会随评论保存`
}
