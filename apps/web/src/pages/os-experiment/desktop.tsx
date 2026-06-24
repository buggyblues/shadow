import {
  Button,
  cn,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
} from '@shadowob/ui'
import DOMPurify from 'dompurify'
import {
  AppWindow,
  Cloud,
  Compass,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  ImageIcon,
  Loader2,
  PawPrint,
  Play,
  Settings,
  ShoppingBag,
  StickyNote,
  Store,
  User,
  Video,
  Youtube,
} from 'lucide-react'
import { marked } from 'marked'
import {
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, type ContextMenuGroup } from '../../components/common/context-menu'
import { getFileTypeVisual } from '../../components/common/file-type-visual'
import {
  buildWorkspaceContextMenuGroups,
  workspaceContextMenuLabels,
} from '../../components/workspace/WorkspaceContextMenu'
import {
  type PickerResult,
  WorkspaceFilePicker,
} from '../../components/workspace/WorkspaceFilePicker'
import { fetchApi } from '../../lib/api'
import type { WorkspaceNode } from '../../stores/workspace.store'
import { AppIcon, osBuiltinIconToneClassName } from './components'
import { OsHtmlWallpaperFrame } from './html-wallpaper-frame'
import type {
  OsBuiltinAppKey,
  OsDesktopItem,
  OsDesktopVideoWidget,
  OsDesktopWebEmbedWidget,
  OsDesktopWidget,
  OsDesktopWorkspaceItem,
  OsStickyNoteMentionContext,
  OsStickyNoteMentionTarget,
  OsVideoWidgetProvider,
  OsWebEmbedWidgetSourceType,
} from './types'
import { OS_TOP_BAR_HEIGHT, OS_WORKSPACE_NODE_DRAG_TYPE } from './utils'

const DESKTOP_GRID_TOP = OS_TOP_BAR_HEIGHT + 16
const DESKTOP_GRID_LEFT = 24
const DESKTOP_GRID_RIGHT = 28
const DESKTOP_CELL_WIDTH = 104
const DESKTOP_CELL_HEIGHT = 112
const DESKTOP_ICON_WIDTH = 92
const DESKTOP_ICON_HEIGHT = 108
const DESKTOP_DRAG_START_DISTANCE = 6

export function desktopRowsPerColumn() {
  const availableHeight =
    typeof window === 'undefined'
      ? 720
      : Math.max(DESKTOP_CELL_HEIGHT, window.innerHeight - DESKTOP_GRID_TOP - 88)
  return Math.max(1, Math.floor(availableHeight / DESKTOP_CELL_HEIGHT))
}

function desktopMaxColumn() {
  if (typeof window === 'undefined') return 0
  const availableWidth = Math.max(
    DESKTOP_CELL_WIDTH,
    window.innerWidth - DESKTOP_GRID_LEFT - DESKTOP_GRID_RIGHT,
  )
  return Math.max(0, Math.floor((availableWidth - DESKTOP_ICON_WIDTH) / DESKTOP_CELL_WIDTH))
}

function desktopPointForCell(col: number, row: number) {
  return {
    x: DESKTOP_GRID_LEFT + col * DESKTOP_CELL_WIDTH,
    y: DESKTOP_GRID_TOP + row * DESKTOP_CELL_HEIGHT,
  }
}

function desktopCellForPoint(point: { x: number; y: number }) {
  const col = Math.min(
    desktopMaxColumn(),
    Math.max(0, Math.round((point.x - DESKTOP_GRID_LEFT) / DESKTOP_CELL_WIDTH)),
  )
  const row = Math.min(
    desktopRowsPerColumn() - 1,
    Math.max(0, Math.round((point.y - DESKTOP_GRID_TOP) / DESKTOP_CELL_HEIGHT)),
  )
  return { col, row }
}

function desktopCellKey(point: { x: number; y: number }) {
  const cell = desktopCellForPoint(point)
  return `${cell.col}:${cell.row}`
}

function parseWorkspaceDrag(event: DragEvent<HTMLElement>) {
  const raw = event.dataTransfer.getData(OS_WORKSPACE_NODE_DRAG_TYPE)
  if (!raw) return null
  try {
    const node = JSON.parse(raw) as WorkspaceNode
    return node.kind === 'file' || node.kind === 'dir' ? node : null
  } catch {
    return null
  }
}

export function defaultDesktopFilePosition(index: number) {
  const rowsPerColumn = desktopRowsPerColumn()
  const col = Math.floor(index / rowsPerColumn)
  const row = index % rowsPerColumn
  return desktopPointForCell(Math.min(col, desktopMaxColumn()), row)
}

export function snapDesktopPoint(
  point: { x: number; y: number },
  options?: { occupied?: Array<{ x: number; y: number }> },
) {
  const start = desktopCellForPoint(point)
  const occupied = new Set((options?.occupied ?? []).map(desktopCellKey))
  const maxColumn = desktopMaxColumn()
  const rows = desktopRowsPerColumn()

  for (let radius = 0; radius <= Math.max(maxColumn, rows) + 2; radius++) {
    for (
      let col = Math.max(0, start.col - radius);
      col <= Math.min(maxColumn, start.col + radius);
      col++
    ) {
      for (
        let row = Math.max(0, start.row - radius);
        row <= Math.min(rows - 1, start.row + radius);
        row++
      ) {
        if (Math.abs(col - start.col) !== radius && Math.abs(row - start.row) !== radius) continue
        const next = desktopPointForCell(col, row)
        if (!occupied.has(desktopCellKey(next))) return next
      }
    }
  }

  return desktopPointForCell(start.col, start.row)
}

function renderBuiltinIcon(key: OsBuiltinAppKey) {
  if (key === 'workspace') return <Folder size={24} strokeWidth={2.3} />
  if (key === 'discover') return <Compass size={24} strokeWidth={2.3} />
  if (key === 'app-store') return <Store size={24} strokeWidth={2.3} />
  if (key === 'shop') return <ShoppingBag size={24} strokeWidth={2.3} />
  if (key === 'settings' || key === 'server-settings')
    return <Settings size={24} strokeWidth={2.3} />
  if (key === 'shadow-cloud') return <Cloud size={24} strokeWidth={2.3} />
  if (key === 'my-buddies') return <PawPrint size={24} strokeWidth={2.3} />
  if (key === 'profile') return <User size={24} strokeWidth={2.3} />
  return <AppWindow size={24} strokeWidth={2.3} />
}

function DesktopItemIcon({ item }: { item: OsDesktopItem }) {
  if (item.kind === 'workspace-node') {
    const visual = getFileTypeVisual(item.node.mime, item.node.name)
    const Icon = item.node.kind === 'dir' ? Folder : (visual.icon ?? FileText)
    return (
      <span
        className={cn(
          'grid h-14 w-14 place-items-center rounded-[16px] border border-white/12 shadow-[0_16px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl',
          item.node.kind === 'dir' ? 'bg-cyan-400/18 text-cyan-200' : visual.bg,
        )}
      >
        <Icon size={24} className={item.node.kind === 'dir' ? undefined : visual.color} />
      </span>
    )
  }

  if (item.kind === 'server-app') {
    return (
      <span className="grid h-14 w-14 place-items-center rounded-[16px] border border-white/12 bg-white/14 shadow-[0_16px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <AppIcon iconUrl={item.iconUrl} className="h-10 w-10 rounded-[14px]" />
      </span>
    )
  }

  const toneClassName = osBuiltinIconToneClassName(item.builtinKey)
  return (
    <span
      className={cn(
        'grid h-14 w-14 place-items-center rounded-[16px] border border-white/12 bg-white/14 shadow-[0_16px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl',
        toneClassName,
      )}
    >
      {renderBuiltinIcon(item.builtinKey)}
    </span>
  )
}

function desktopItemLabel(item: OsDesktopItem) {
  return item.kind === 'workspace-node' ? item.node.name : item.title
}

const STICKY_NOTE_MENTION_PATTERN =
  /@\/\/[^\s<>()\[\]{}"'`]+|@\/[^\s<>()\[\]{}"'`]+|#[^\s#@<>()\[\]{}"'`]+|@[\p{L}\p{N}_\-.]+/gu
const TRAILING_MENTION_PUNCTUATION = /[.,，。;；:：!?！？)\]）】]+$/u
const ALLOWED_MARKDOWN_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
])
const ALLOWED_MARKDOWN_ATTRIBUTES = ['href', 'title', 'src', 'alt']
const SKIP_MENTION_TAGS = new Set(['a', 'button', 'code', 'pre', 'textarea'])

function normalizeLookupText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function normalizeWorkspaceMentionPath(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return (trimmed.startsWith('/') ? trimmed : `/${trimmed}`).replace(/\/{2,}/g, '/')
}

function workspaceNodeMentionPaths(node: WorkspaceNode) {
  const paths = new Set<string>()
  paths.add(normalizeWorkspaceMentionPath(node.path ?? node.name))
  paths.add(normalizeWorkspaceMentionPath(node.name))
  return paths
}

function memberMentionNames(member: OsStickyNoteMentionContext['members'][number]) {
  return [member.nickname, member.user?.displayName, member.user?.username, member.userId].flatMap(
    (value) => {
      const normalized = value?.trim()
      return normalized ? [normalizeLookupText(normalized)] : []
    },
  )
}

function memberDisplayName(member: OsStickyNoteMentionContext['members'][number]) {
  return (
    member.nickname?.trim() ||
    member.user?.displayName?.trim() ||
    member.user?.username ||
    member.userId
  )
}

function splitMentionTrailingPunctuation(token: string) {
  const match = token.match(TRAILING_MENTION_PUNCTUATION)
  if (!match?.[0]) return { core: token, trailing: '' }
  return {
    core: token.slice(0, -match[0].length),
    trailing: match[0],
  }
}

function resolveStickyNoteMention(
  token: string,
  context: OsStickyNoteMentionContext,
): OsStickyNoteMentionTarget | null {
  if (token.startsWith('@//')) {
    const query = normalizeLookupText(token.slice(3))
    if (!query) return null
    const app = context.apps.find(
      (candidate) =>
        normalizeLookupText(candidate.name) === query ||
        normalizeLookupText(candidate.appKey) === query,
    )
    return app
      ? {
          kind: 'server-app',
          id: app.appKey,
          label: `@//${app.name}`,
          app,
        }
      : null
  }

  if (token.startsWith('@/')) {
    const path = normalizeWorkspaceMentionPath(token.slice(1))
    const node = context.workspaceNodes.find((candidate) =>
      workspaceNodeMentionPaths(candidate).has(path),
    )
    return node
      ? {
          kind: 'workspace-node',
          id: node.id,
          label: `@${normalizeWorkspaceMentionPath(node.path ?? node.name)}`,
          node,
        }
      : null
  }

  if (token.startsWith('#')) {
    const query = normalizeLookupText(token.slice(1))
    if (!query) return null
    const channel = context.channels.find(
      (candidate) => normalizeLookupText(candidate.name) === query,
    )
    return channel
      ? {
          kind: 'channel',
          id: channel.id,
          label: `#${channel.name}`,
          channel,
        }
      : null
  }

  if (token.startsWith('@')) {
    const query = normalizeLookupText(token.slice(1))
    if (!query) return null
    const member = context.members.find((candidate) =>
      memberMentionNames(candidate).includes(query),
    )
    return member
      ? {
          kind: 'member',
          id: member.user?.id ?? member.userId,
          label: `@${memberDisplayName(member)}`,
          member,
        }
      : null
  }

  return null
}

function isSafeMarkdownUrl(value: string | null, kind: 'href' | 'src') {
  if (!value) return false
  if (kind === 'href' && value.startsWith('#')) return true
  if (value.startsWith('/')) return true
  try {
    const url = new URL(value)
    return kind === 'href'
      ? ['http:', 'https:', 'mailto:'].includes(url.protocol)
      : ['http:', 'https:', 'blob:'].includes(url.protocol)
  } catch {
    return false
  }
}

function tightenMarkdownElementUrls(element: Element) {
  const tag = element.tagName.toLowerCase()
  const href = element.getAttribute('href')
  const src = element.getAttribute('src')
  if (href && !isSafeMarkdownUrl(href, 'href')) {
    element.removeAttribute('href')
  }
  if (src && !isSafeMarkdownUrl(src, 'src')) {
    element.removeAttribute('src')
  }

  if (tag === 'a') {
    element.setAttribute('target', '_blank')
    element.setAttribute('rel', 'noopener noreferrer')
  }
}

function createMentionButton(target: OsStickyNoteMentionTarget, targetKey: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.shadowMentionKey = targetKey
  button.className =
    'mx-0.5 inline-flex max-w-full align-baseline items-center rounded-[5px] border border-yellow-950/18 bg-yellow-50/55 px-1.5 py-0.5 text-[0.92em] font-bold text-[#4d3a05] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] hover:bg-yellow-50/80'
  button.textContent = target.label
  return button
}

function renderStickyNoteMarkdown(
  source: string,
  context: OsStickyNoteMentionContext,
  fallback: string,
) {
  const targets = new Map<string, OsStickyNoteMentionTarget>()
  const markdown = source.trim() ? source : fallback
  const rawHtml = marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string
  const sanitizedHtml =
    typeof window === 'undefined'
      ? rawHtml
      : DOMPurify.sanitize(rawHtml, {
          ALLOWED_ATTR: ALLOWED_MARKDOWN_ATTRIBUTES,
          ALLOWED_TAGS: [...ALLOWED_MARKDOWN_TAGS],
          ALLOW_DATA_ATTR: false,
        })

  if (typeof window === 'undefined') return { html: sanitizedHtml, targets }

  const template = document.createElement('template')
  template.innerHTML = sanitizedHtml

  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    tightenMarkdownElementUrls(element)
  }

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const parentTag = node.parentElement?.tagName.toLowerCase()
    if (!parentTag || SKIP_MENTION_TAGS.has(parentTag)) continue
    textNodes.push(node)
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? ''
    STICKY_NOTE_MENTION_PATTERN.lastIndex = 0
    let lastIndex = 0
    let changed = false
    const fragment = document.createDocumentFragment()

    for (const match of text.matchAll(STICKY_NOTE_MENTION_PATTERN)) {
      const token = match[0]
      const index = match.index ?? 0
      const { core, trailing } = splitMentionTrailingPunctuation(token)
      const target = resolveStickyNoteMention(core, context)
      if (!target) continue

      changed = true
      if (index > lastIndex) fragment.append(text.slice(lastIndex, index))
      const targetKey = `${target.kind}:${target.id}`
      targets.set(targetKey, target)
      fragment.append(createMentionButton(target, targetKey))
      if (trailing) fragment.append(trailing)
      lastIndex = index + token.length
    }

    if (!changed) continue
    if (lastIndex < text.length) fragment.append(text.slice(lastIndex))
    textNode.replaceWith(fragment)
  }

  return { html: template.innerHTML, targets }
}

type VideoWidgetFormValues = {
  source: string
  title: string
  coverUrl: string
  autoplay: boolean
  muted: boolean
  danmaku: boolean
  showCover: boolean
}

const DEFAULT_VIDEO_WIDGET_FORM: VideoWidgetFormValues = {
  source: '',
  title: '',
  coverUrl: '',
  autoplay: false,
  muted: true,
  danmaku: true,
  showCover: true,
}

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const BILIBILI_BVID_PATTERN = /(BV[0-9A-Za-z]{10})/i

function parseUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function parseYoutubeVideoId(source: string) {
  const trimmed = source.trim()
  if (YOUTUBE_ID_PATTERN.test(trimmed)) return trimmed
  const url = parseUrl(trimmed)
  if (!url) return null

  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && YOUTUBE_ID_PATTERN.test(id) ? id : null
  }

  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
    return null
  }

  const queryId = url.searchParams.get('v')
  if (queryId && YOUTUBE_ID_PATTERN.test(queryId)) return queryId

  const parts = url.pathname.split('/').filter(Boolean)
  const markerIndex = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part))
  const id = markerIndex >= 0 ? parts[markerIndex + 1] : null
  return id && YOUTUBE_ID_PATTERN.test(id) ? id : null
}

function buildYoutubeEmbedUrl(widget: OsDesktopVideoWidget, forceAutoplay = false) {
  const videoId = parseYoutubeVideoId(widget.source)
  if (!videoId) return null
  const url = new URL(`https://www.youtube.com/embed/${videoId}`)
  url.searchParams.set('rel', '0')
  url.searchParams.set('modestbranding', '1')
  url.searchParams.set('playsinline', '1')
  url.searchParams.set('autoplay', widget.autoplay || forceAutoplay ? '1' : '0')
  if (widget.muted) url.searchParams.set('mute', '1')
  return {
    src: url.toString(),
    coverUrl: widget.coverUrl?.trim() || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

function extractBilibiliPlayerParams(source: string) {
  const trimmed = source.trim()
  const params = new URLSearchParams()
  const url = parseUrl(trimmed)

  if (url) {
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'player.bilibili.com') {
      for (const key of ['bvid', 'aid', 'cid', 'page', 'p']) {
        const value = url.searchParams.get(key)
        if (value) params.set(key, value)
      }
    } else if (host === 'bilibili.com' || host === 'm.bilibili.com') {
      const bvid = url.pathname.match(BILIBILI_BVID_PATTERN)?.[1]
      const aid = url.pathname.match(/\/video\/av(\d+)/i)?.[1]
      if (bvid) params.set('bvid', bvid)
      if (aid) params.set('aid', aid)
      for (const key of ['cid', 'page', 'p']) {
        const value = url.searchParams.get(key)
        if (value) params.set(key, value)
      }
    }
  } else {
    const bvid = trimmed.match(BILIBILI_BVID_PATTERN)?.[1]
    const aid = trimmed.match(/^av?(\d+)$/i)?.[1]
    if (bvid) params.set('bvid', bvid)
    if (aid) params.set('aid', aid)
  }

  if (!params.has('bvid') && !params.has('aid')) return null
  if (!params.has('page') && !params.has('p')) params.set('page', '1')
  return params
}

function buildBilibiliEmbedUrl(widget: OsDesktopVideoWidget, forceAutoplay = false) {
  const params = extractBilibiliPlayerParams(widget.source)
  if (!params) return null
  params.set('isOutside', 'true')
  params.set('high_quality', '1')
  params.set('as_wide', '1')
  params.set('autoplay', widget.autoplay || forceAutoplay ? '1' : '0')
  params.set('danmaku', widget.danmaku === false ? '0' : '1')
  if (widget.muted) params.set('muted', '1')
  return {
    src: `https://player.bilibili.com/player.html?${params.toString()}`,
    coverUrl: widget.coverUrl?.trim() || null,
  }
}

function buildVideoEmbed(widget: OsDesktopVideoWidget, forceAutoplay = false) {
  return widget.provider === 'youtube'
    ? buildYoutubeEmbedUrl(widget, forceAutoplay)
    : buildBilibiliEmbedUrl(widget, forceAutoplay)
}

function videoProviderLabel(provider: OsVideoWidgetProvider) {
  return provider === 'youtube' ? 'YouTube' : 'Bilibili'
}

function videoWidgetFromForm(
  provider: OsVideoWidgetProvider,
  form: VideoWidgetFormValues,
): Omit<
  OsDesktopVideoWidget,
  'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
> {
  return {
    source: form.source.trim(),
    title: form.title.trim() || undefined,
    coverUrl: form.coverUrl.trim() || null,
    autoplay: form.autoplay,
    muted: form.muted,
    danmaku: provider === 'bilibili' ? form.danmaku : false,
    showCover: form.showCover,
  }
}

interface WebEmbedWidgetFormValues {
  sourceType: OsWebEmbedWidgetSourceType
  source: string
  title: string
  workspaceFileName: string
}

const DEFAULT_WEB_EMBED_WIDGET_FORM: WebEmbedWidgetFormValues = {
  sourceType: 'url',
  source: '',
  title: '',
  workspaceFileName: '',
}

function normalizeWebEmbedUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

function webEmbedWidgetFromForm(
  form: WebEmbedWidgetFormValues,
): Omit<
  OsDesktopWebEmbedWidget,
  'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
> | null {
  if (form.sourceType === 'url') {
    const url = normalizeWebEmbedUrl(form.source)
    if (!url) return null
    return {
      sourceType: 'url',
      source: url,
      title: form.title.trim() || undefined,
      workspaceFileName: null,
    }
  }

  const fileId = form.source.trim()
  if (!fileId) return null
  return {
    sourceType: 'workspace-file',
    source: fileId,
    title: form.title.trim() || form.workspaceFileName.trim() || undefined,
    workspaceFileName: form.workspaceFileName.trim() || null,
  }
}

function OsStickyNoteWidget({
  widget,
  editable,
  wallpaperInteractive,
  mentionContext,
  onMove,
  onResize,
  onUpdate,
  onDelete,
  onOpenMention,
}: {
  widget: Extract<OsDesktopWidget, { kind: 'sticky-note' }>
  editable: boolean
  wallpaperInteractive: boolean
  mentionContext: OsStickyNoteMentionContext
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onUpdate: (id: string, content: string) => void
  onDelete: (id: string) => void
  onOpenMention: (target: OsStickyNoteMentionTarget) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(widget.content)
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    lastX: number
    lastY: number
  } | null>(null)
  const resizeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startWidthCells: number
    startHeightCells: number
    lastWidthCells: number
    lastHeightCells: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    heightCells?: number
  } | null>(null)

  useEffect(() => {
    if (!editing) setDraft(widget.content)
  }, [editing, widget.content])

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const renderedMarkdown = useMemo(
    () => renderStickyNoteMarkdown(widget.content, mentionContext, t('os.stickyNotePlaceholder')),
    [mentionContext, t, widget.content],
  )

  const commitDraft = () => {
    setEditing(false)
    if (draft !== widget.content) onUpdate(widget.id, draft)
  }

  const handleRenderedMarkdownClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLButtonElement>('[data-shadow-mention-key]')
    const mentionKey = button?.dataset.shadowMentionKey
    const mention = mentionKey ? renderedMarkdown.targets.get(mentionKey) : null
    if (!mention) return
    event.preventDefault()
    event.stopPropagation()
    onOpenMention(mention)
  }

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - currentX,
      offsetY: event.clientY - currentY,
      lastX: currentX,
      lastY: currentY,
    }
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const next = {
      x: Math.max(0, event.clientX - drag.offsetX),
      y: Math.max(OS_TOP_BAR_HEIGHT, event.clientY - drag.offsetY),
    }
    drag.lastX = next.x
    drag.lastY = next.y
    setPreview((current) => ({ ...current, ...next }))
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editable) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidthCells: currentWidthCells,
      startHeightCells: currentHeightCells,
      lastWidthCells: currentWidthCells,
      lastHeightCells: currentHeightCells,
    }
  }

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const widthCells = Math.min(
      6,
      Math.max(
        1,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      6,
      Math.max(
        1,
        Math.round(resize.startHeightCells + (event.clientY - resize.startY) / DESKTOP_CELL_HEIGHT),
      ),
    )
    resize.lastWidthCells = widthCells
    resize.lastHeightCells = heightCells
    setPreview((current) => ({ ...current, widthCells, heightCells }))
  }

  const handleResizeEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    onResize(widget.id, {
      widthCells: resize.lastWidthCells,
      heightCells: resize.lastHeightCells,
    })
    resizeRef.current = null
    setPreview(null)
  }

  return (
    <section
      className={cn(
        'absolute z-10 flex flex-col overflow-auto bg-[#ffeb3b] px-5 py-[15px] text-[#333] shadow-[4px_6px_15px_rgba(0,0,0,0.15)]',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{ left: currentX, top: currentY, width, height, borderRadius: '2px 2px 20px 2px' }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        className={cn(
          'mb-[5px] flex shrink-0 select-none justify-end',
          editable && 'cursor-grab active:cursor-grabbing',
        )}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        {editable ? (
          <button
            type="button"
            className="border-0 bg-transparent p-0 text-base font-bold leading-none text-[#a09320] transition hover:text-red-600"
            title={t('common.delete')}
            aria-label={t('common.delete')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onDelete(widget.id)}
          >
            ✖
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            placeholder={t('os.stickyNotePlaceholder')}
            className="h-full min-h-[96px] w-full flex-1 resize-none border-0 bg-transparent font-['Courier_New',Courier,monospace] text-[14px] leading-[1.5] text-[#333] outline-none placeholder:text-[#8d821e]/70"
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(widget.content)
                setEditing(false)
              }
            }}
          />
        ) : (
          <div
            className="min-h-0 flex-1 cursor-pointer overflow-y-auto text-[15px] leading-[1.6] text-[#333] [&_a]:font-bold [&_a]:text-[#5b3d00] [&_blockquote]:m-0 [&_blockquote]:border-l-[3px] [&_blockquote]:border-black/20 [&_blockquote]:pl-2.5 [&_blockquote]:text-[#555] [&_code]:rounded [&_code]:bg-black/[0.08] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_h1]:mb-2.5 [&_h1]:mt-0 [&_h2]:mb-2.5 [&_h2]:mt-0 [&_h3]:mb-2.5 [&_h3]:mt-0 [&_li]:my-0.5 [&_ol]:mb-2.5 [&_ol]:mt-0 [&_ol]:pl-5 [&_p]:mb-2.5 [&_p]:mt-0 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/[0.08] [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-black/15 [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:border-black/15 [&_th]:px-1.5 [&_th]:py-1 [&_ul]:mb-2.5 [&_ul]:mt-0 [&_ul]:pl-5"
            onClick={handleRenderedMarkdownClick}
            onDoubleClick={() => {
              if (editable) setEditing(true)
            }}
            dangerouslySetInnerHTML={{ __html: renderedMarkdown.html }}
          />
        )}
      </div>
      {editable ? (
        <button
          type="button"
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize rounded-br-[20px] border-b-2 border-r-2 border-yellow-950/35 opacity-70"
          aria-label={t('os.resizeWidget')}
          title={t('os.resizeWidget')}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
        />
      ) : null}
    </section>
  )
}

function OsVideoWidget({
  widget,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onDelete,
  onEdit,
}: {
  widget: OsDesktopVideoWidget
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onDelete: (id: string) => void
  onEdit: (widget: OsDesktopVideoWidget) => void
}) {
  const { t } = useTranslation()
  const [coverDismissed, setCoverDismissed] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    lastX: number
    lastY: number
  } | null>(null)
  const resizeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startWidthCells: number
    startHeightCells: number
    lastWidthCells: number
    lastHeightCells: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    heightCells?: number
  } | null>(null)

  useEffect(() => {
    setCoverDismissed(false)
  }, [widget.autoplay, widget.coverUrl, widget.showCover, widget.source])

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const embed = buildVideoEmbed(widget, coverDismissed)
  const chromeHeight = 38
  const contentWidth = Math.max(140, width - 16)
  const contentHeight = Math.max(100, height - chromeHeight - 16)
  const frameWidth = Math.max(140, Math.min(contentWidth, contentHeight * (16 / 9)))
  const frameHeight = frameWidth * (9 / 16)
  const showCover = Boolean(
    widget.showCover && !widget.autoplay && !coverDismissed && embed?.coverUrl,
  )

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - currentX,
      offsetY: event.clientY - currentY,
      lastX: currentX,
      lastY: currentY,
    }
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const next = {
      x: Math.max(0, event.clientX - drag.offsetX),
      y: Math.max(OS_TOP_BAR_HEIGHT, event.clientY - drag.offsetY),
    }
    drag.lastX = next.x
    drag.lastY = next.y
    setPreview((current) => ({ ...current, ...next }))
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editable) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidthCells: currentWidthCells,
      startHeightCells: currentHeightCells,
      lastWidthCells: currentWidthCells,
      lastHeightCells: currentHeightCells,
    }
  }

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const widthCells = Math.min(
      8,
      Math.max(
        2,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      6,
      Math.max(
        2,
        Math.round(resize.startHeightCells + (event.clientY - resize.startY) / DESKTOP_CELL_HEIGHT),
      ),
    )
    resize.lastWidthCells = widthCells
    resize.lastHeightCells = heightCells
    setPreview((current) => ({ ...current, widthCells, heightCells }))
  }

  const handleResizeEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    onResize(widget.id, {
      widthCells: resize.lastWidthCells,
      heightCells: resize.lastHeightCells,
    })
    resizeRef.current = null
    setPreview(null)
  }

  return (
    <section
      className={cn(
        'absolute z-10 flex select-none flex-col overflow-hidden rounded-xl border border-white/12 bg-black/66 text-white shadow-[0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-xl',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{ left: currentX, top: currentY, width, height }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        className={cn(
          'flex h-9 shrink-0 select-none items-center gap-2 border-b border-white/10 px-3',
          editable && 'cursor-grab active:cursor-grabbing',
        )}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span className="grid h-5 w-5 place-items-center rounded-md bg-white/10 text-white/75">
          {widget.provider === 'youtube' ? <Youtube size={13} /> : <Video size={13} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-black">
          {widget.title?.trim() || videoProviderLabel(widget.provider)}
        </span>
        {editable ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded-md text-white/65 transition hover:bg-white/10 hover:text-white"
              title={t('common.edit')}
              aria-label={t('common.edit')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onEdit(widget)}
            >
              <Settings size={13} />
            </button>
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded-md text-white/65 transition hover:bg-red-500/15 hover:text-red-200"
              title={t('common.delete')}
              aria-label={t('common.delete')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onDelete(widget.id)}
            >
              ✖
            </button>
          </div>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-black px-2 py-2">
        {embed ? (
          <div
            className="relative overflow-hidden rounded-lg bg-black"
            style={{ width: frameWidth, height: frameHeight }}
          >
            <iframe
              title={widget.title?.trim() || videoProviderLabel(widget.provider)}
              src={embed.src}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
            {showCover ? (
              <button
                type="button"
                className="absolute inset-0 grid place-items-center overflow-hidden bg-black"
                aria-label={t('os.playVideoWidget')}
                onClick={() => setCoverDismissed(true)}
              >
                <img
                  src={embed.coverUrl ?? ''}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="relative grid h-14 w-14 place-items-center rounded-full bg-black/58 text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur">
                  <Play size={24} fill="currentColor" className="ml-0.5" />
                </span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="px-4 text-center text-xs font-bold leading-5 text-white/58">
            {t('os.videoWidgetInvalidSource')}
          </div>
        )}
      </div>
      {editable ? (
        <button
          type="button"
          className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-[3px] border-b-2 border-r-2 border-white/35 opacity-70"
          aria-label={t('os.resizeWidget')}
          title={t('os.resizeWidget')}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
        />
      ) : null}
    </section>
  )
}

function OsWebEmbedWidgetContent({
  widget,
  serverId,
}: {
  widget: OsDesktopWebEmbedWidget
  serverId: string
}) {
  const { t } = useTranslation()
  const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null)
  const [workspaceError, setWorkspaceError] = useState(false)

  useEffect(() => {
    if (widget.sourceType !== 'workspace-file') return
    let cancelled = false
    setWorkspaceUrl(null)
    setWorkspaceError(false)

    fetchApi<{ url: string }>(
      `/api/servers/${serverId}/workspace/files/${widget.source}/media-url?disposition=inline`,
    )
      .then((result) => {
        if (!cancelled) setWorkspaceUrl(result.url)
      })
      .catch(() => {
        if (!cancelled) setWorkspaceError(true)
      })

    return () => {
      cancelled = true
    }
  }, [serverId, widget.source, widget.sourceType])

  if (widget.sourceType === 'url') {
    const src = normalizeWebEmbedUrl(widget.source)
    if (!src) {
      return (
        <div className="grid h-full place-items-center px-4 text-center text-xs font-bold leading-5 text-white/58">
          {t('os.webEmbedInvalidSource')}
        </div>
      )
    }
    return (
      <iframe
        title={widget.title?.trim() || t('os.webEmbedWidget')}
        src={src}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
        className="h-full w-full border-0 bg-white"
      />
    )
  }

  if (workspaceError) {
    return (
      <div className="grid h-full place-items-center px-4 text-center text-xs font-bold leading-5 text-white/58">
        {t('os.webEmbedMissingWorkspaceFile')}
      </div>
    )
  }

  if (!workspaceUrl) {
    return (
      <div className="grid h-full place-items-center text-white/58">
        <Loader2 size={18} className="animate-spin" />
      </div>
    )
  }

  return (
    <OsHtmlWallpaperFrame
      title={widget.title?.trim() || widget.workspaceFileName || t('os.webEmbedWidget')}
      src={workspaceUrl}
      className="h-full w-full border-0 bg-black"
    />
  )
}

function OsWebEmbedWidget({
  widget,
  serverId,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onDelete,
  onEdit,
}: {
  widget: OsDesktopWebEmbedWidget
  serverId: string
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onDelete: (id: string) => void
  onEdit: (widget: OsDesktopWebEmbedWidget) => void
}) {
  const { t } = useTranslation()
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    lastX: number
    lastY: number
  } | null>(null)
  const resizeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startWidthCells: number
    startHeightCells: number
    lastWidthCells: number
    lastHeightCells: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    heightCells?: number
  } | null>(null)

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const title =
    widget.title?.trim() ||
    (widget.sourceType === 'workspace-file' ? widget.workspaceFileName : null) ||
    t('os.webEmbedWidget')

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - currentX,
      offsetY: event.clientY - currentY,
      lastX: currentX,
      lastY: currentY,
    }
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const next = {
      x: Math.max(0, event.clientX - drag.offsetX),
      y: Math.max(OS_TOP_BAR_HEIGHT, event.clientY - drag.offsetY),
    }
    drag.lastX = next.x
    drag.lastY = next.y
    setPreview((current) => ({ ...current, ...next }))
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editable) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidthCells: currentWidthCells,
      startHeightCells: currentHeightCells,
      lastWidthCells: currentWidthCells,
      lastHeightCells: currentHeightCells,
    }
  }

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const widthCells = Math.min(
      8,
      Math.max(
        2,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      6,
      Math.max(
        2,
        Math.round(resize.startHeightCells + (event.clientY - resize.startY) / DESKTOP_CELL_HEIGHT),
      ),
    )
    resize.lastWidthCells = widthCells
    resize.lastHeightCells = heightCells
    setPreview((current) => ({ ...current, widthCells, heightCells }))
  }

  const handleResizeEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    onResize(widget.id, {
      widthCells: resize.lastWidthCells,
      heightCells: resize.lastHeightCells,
    })
    resizeRef.current = null
    setPreview(null)
  }

  return (
    <section
      className={cn(
        'absolute z-10 flex select-none flex-col overflow-hidden rounded-xl border border-white/12 bg-black/66 text-white shadow-[0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-xl',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{ left: currentX, top: currentY, width, height }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        className={cn(
          'flex h-9 shrink-0 select-none items-center gap-2 border-b border-white/10 px-3',
          editable && 'cursor-grab active:cursor-grabbing',
        )}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span className="grid h-5 w-5 place-items-center rounded-md bg-white/10 text-white/75">
          {widget.sourceType === 'workspace-file' ? <FileText size={13} /> : <Globe size={13} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-black">{title}</span>
        {editable ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded-md text-white/65 transition hover:bg-white/10 hover:text-white"
              title={t('common.edit')}
              aria-label={t('common.edit')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onEdit(widget)}
            >
              <Settings size={13} />
            </button>
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded-md text-white/65 transition hover:bg-red-500/15 hover:text-red-200"
              title={t('common.delete')}
              aria-label={t('common.delete')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onDelete(widget.id)}
            >
              ✖
            </button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-black">
        <OsWebEmbedWidgetContent widget={widget} serverId={serverId} />
      </div>
      {editable ? (
        <button
          type="button"
          className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-[3px] border-b-2 border-r-2 border-white/35 opacity-70"
          aria-label={t('os.resizeWidget')}
          title={t('os.resizeWidget')}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
        />
      ) : null}
    </section>
  )
}

function OsVideoWidgetEditorModal({
  provider,
  initialValue,
  open,
  onClose,
  onSubmit,
}: {
  provider: OsVideoWidgetProvider
  initialValue?: OsDesktopVideoWidget | null
  open: boolean
  onClose: () => void
  onSubmit: (values: VideoWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<VideoWidgetFormValues>(DEFAULT_VIDEO_WIDGET_FORM)
  const [sourceTouched, setSourceTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(
      initialValue
        ? {
            source: initialValue.source,
            title: initialValue.title ?? '',
            coverUrl: initialValue.coverUrl ?? '',
            autoplay: initialValue.autoplay === true,
            muted: initialValue.muted !== false,
            danmaku: initialValue.danmaku !== false,
            showCover: initialValue.showCover === true,
          }
        : {
            ...DEFAULT_VIDEO_WIDGET_FORM,
            danmaku: provider === 'bilibili',
          },
    )
    setSourceTouched(false)
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open, provider])

  const candidateWidget: OsDesktopVideoWidget = {
    id: initialValue?.id ?? 'preview',
    kind: 'video-player',
    provider,
    x: 0,
    y: 0,
    widthCells: 4,
    heightCells: 3,
    ...videoWidgetFromForm(provider, draft),
  }
  const isValidSource = Boolean(draft.source.trim() && buildVideoEmbed(candidateWidget))
  const showSourceError = sourceTouched && draft.source.trim().length > 0 && !isValidSource

  const submit = () => {
    setSourceTouched(true)
    if (!isValidSource) return
    onSubmit(draft)
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent className="z-[900] w-[min(92vw,520px)]">
        <ModalHeader
          icon={provider === 'youtube' ? <Youtube size={18} /> : <Video size={18} />}
          title={
            initialValue
              ? t('os.editVideoWidgetTitle', { provider: videoProviderLabel(provider) })
              : t('os.addVideoWidgetTitle', { provider: videoProviderLabel(provider) })
          }
          closeLabel={t('common.close')}
        />
        <ModalBody className="space-y-4 py-5">
          <Input
            ref={inputRef}
            label={t('os.videoWidgetSource')}
            value={draft.source}
            placeholder={
              provider === 'youtube'
                ? t('os.youtubeVideoWidgetPlaceholder')
                : t('os.bilibiliVideoWidgetPlaceholder')
            }
            onBlur={() => setSourceTouched(true)}
            onChange={(event) =>
              setDraft((current) => ({ ...current, source: event.target.value }))
            }
          />
          {showSourceError ? (
            <p className="-mt-2 text-xs font-bold text-danger">
              {t('os.videoWidgetInvalidSource')}
            </p>
          ) : null}
          <Input
            label={t('os.videoWidgetTitle')}
            value={draft.title}
            placeholder={videoProviderLabel(provider)}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
          <Input
            label={t('os.videoWidgetCoverUrl')}
            value={draft.coverUrl}
            placeholder={t('os.videoWidgetCoverUrlPlaceholder')}
            onChange={(event) =>
              setDraft((current) => ({ ...current, coverUrl: event.target.value }))
            }
          />
          <div className="grid gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            {[
              {
                key: 'autoplay' as const,
                label: t('os.videoWidgetAutoplay'),
              },
              {
                key: 'muted' as const,
                label: t('os.videoWidgetMuted'),
              },
              {
                key: 'showCover' as const,
                label: t('os.videoWidgetShowCover'),
              },
              ...(provider === 'bilibili'
                ? [
                    {
                      key: 'danmaku' as const,
                      label: t('os.videoWidgetDanmaku'),
                    },
                  ]
                : []),
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-4 text-sm font-bold text-text-primary"
              >
                <span>{item.label}</span>
                <Switch
                  checked={draft[item.key]}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, [item.key]: checked }))
                  }
                />
              </label>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={submit}>
              {initialValue ? t('common.save') : t('common.add')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function OsWebEmbedWidgetEditorModal({
  serverId,
  initialValue,
  open,
  onClose,
  onSubmit,
}: {
  serverId: string
  initialValue?: OsDesktopWebEmbedWidget | null
  open: boolean
  onClose: () => void
  onSubmit: (values: WebEmbedWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<WebEmbedWidgetFormValues>(DEFAULT_WEB_EMBED_WIDGET_FORM)
  const [sourceTouched, setSourceTouched] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(
      initialValue
        ? {
            sourceType: initialValue.sourceType,
            source: initialValue.source,
            title: initialValue.title ?? '',
            workspaceFileName: initialValue.workspaceFileName ?? '',
          }
        : DEFAULT_WEB_EMBED_WIDGET_FORM,
    )
    setSourceTouched(false)
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open])

  const isValidSource =
    draft.sourceType === 'url'
      ? Boolean(normalizeWebEmbedUrl(draft.source))
      : draft.source.trim().length > 0
  const showSourceError = sourceTouched && !isValidSource

  const submit = () => {
    setSourceTouched(true)
    if (!isValidSource) return
    onSubmit(draft)
  }

  const handlePickerConfirm = (result: PickerResult) => {
    setShowPicker(false)
    setSourceTouched(false)
    setDraft((current) => ({
      ...current,
      sourceType: 'workspace-file',
      source: result.node.id,
      title: current.title.trim() || result.node.name,
      workspaceFileName: result.node.name,
    }))
  }

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <ModalContent className="z-[900] w-[min(92vw,520px)]">
          <ModalHeader
            icon={<Globe size={18} />}
            title={initialValue ? t('os.editWebEmbedWidgetTitle') : t('os.addWebEmbedWidgetTitle')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-4 py-5">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-1.5">
              {[
                { type: 'url' as const, label: t('os.webEmbedSourceUrl'), icon: Globe },
                {
                  type: 'workspace-file' as const,
                  label: t('os.webEmbedSourceWorkspace'),
                  icon: FileText,
                },
              ].map((item) => {
                const Icon = item.icon
                const active = draft.sourceType === item.type
                return (
                  <button
                    key={item.type}
                    type="button"
                    className={cn(
                      'flex h-9 items-center justify-center gap-2 rounded-xl text-sm font-black transition',
                      active
                        ? 'bg-bg-primary text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-bg-primary/55 hover:text-text-primary',
                    )}
                    onClick={() => {
                      setSourceTouched(false)
                      setDraft((current) => ({
                        ...current,
                        sourceType: item.type,
                        source: item.type === current.sourceType ? current.source : '',
                        workspaceFileName:
                          item.type === current.sourceType ? current.workspaceFileName : '',
                      }))
                      if (item.type === 'url') {
                        window.requestAnimationFrame(() =>
                          inputRef.current?.focus({ preventScroll: true }),
                        )
                      }
                    }}
                  >
                    <Icon size={15} />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {draft.sourceType === 'url' ? (
              <Input
                ref={inputRef}
                label={t('os.webEmbedUrl')}
                value={draft.source}
                placeholder={t('os.webEmbedUrlPlaceholder')}
                onBlur={() => setSourceTouched(true)}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, source: event.target.value }))
                }
              />
            ) : (
              <div className="grid gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
                  {t('os.webEmbedWorkspaceFile')}
                </p>
                <button
                  type="button"
                  className="flex h-11 items-center gap-3 rounded-xl border border-border-subtle bg-bg-tertiary px-3 text-left text-sm font-bold text-text-primary transition hover:border-primary/40 hover:text-primary"
                  onClick={() => setShowPicker(true)}
                >
                  <FolderOpen size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {draft.workspaceFileName || t('os.webEmbedChooseWorkspaceFile')}
                  </span>
                </button>
              </div>
            )}

            {showSourceError ? (
              <p className="-mt-2 text-xs font-bold text-danger">{t('os.webEmbedInvalidSource')}</p>
            ) : null}

            <Input
              label={t('os.webEmbedTitle')}
              value={draft.title}
              placeholder={t('os.webEmbedWidget')}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="button" variant="primary" onClick={submit}>
                {initialValue ? t('common.save') : t('common.add')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {showPicker ? (
        <WorkspaceFilePicker
          serverId={serverId}
          mode="select-file"
          title={t('os.webEmbedWorkspacePickerTitle')}
          accept={['.html', '.htm']}
          overlayClassName="z-[940]"
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
    </>
  )
}

export function OsDesktop({
  items,
  widgets,
  canEditLayout,
  serverId,
  hasClipboard,
  renamingNodeId,
  mentionContext,
  onOpenWorkspaceNode,
  onOpenBuiltinApp,
  onOpenServerApp,
  onOpenMention,
  onPinWorkspaceNode,
  onMoveItem,
  onHideItem,
  onUploadFiles,
  onStartRename,
  onRenameWorkspaceNode,
  onCopyWorkspaceNode,
  onCutWorkspaceNode,
  onPasteWorkspaceNodes,
  onCloneWorkspaceFile,
  onDeleteWorkspaceNode,
  onSetWorkspaceWallpaper,
  onCreateStickyNote,
  onCreateVideoWidget,
  onCreateWebEmbedWidget,
  onMoveWidget,
  onResizeWidget,
  onUpdateStickyNote,
  onUpdateVideoWidget,
  onUpdateWebEmbedWidget,
  onDeleteWidget,
  onOpenWallpaperSettings,
  wallpaperInteractive = false,
}: {
  items: OsDesktopItem[]
  widgets: OsDesktopWidget[]
  canEditLayout: boolean
  serverId: string
  hasClipboard: boolean
  renamingNodeId: string | null
  mentionContext: OsStickyNoteMentionContext
  onOpenWorkspaceNode: (node: WorkspaceNode) => void
  onOpenBuiltinApp: (key: OsBuiltinAppKey) => void
  onOpenServerApp: (appKey: string) => void
  onOpenMention: (target: OsStickyNoteMentionTarget) => void
  onPinWorkspaceNode: (node: WorkspaceNode, point?: { x: number; y: number }) => void
  onMoveItem: (
    id: string,
    point: { x: number; y: number },
    options?: { swapWith?: { id: string; point: { x: number; y: number } } },
  ) => void
  onHideItem: (item: OsDesktopItem) => void
  onUploadFiles: (files: globalThis.File[], point: { x: number; y: number }) => void
  onStartRename: (nodeId: string | null) => void
  onRenameWorkspaceNode: (node: WorkspaceNode, name: string) => void
  onCopyWorkspaceNode: (nodeId: string) => void
  onCutWorkspaceNode: (nodeId: string) => void
  onPasteWorkspaceNodes: (targetParentId: string | null) => void
  onCloneWorkspaceFile: (fileId: string) => void
  onDeleteWorkspaceNode: (node: WorkspaceNode) => void
  onSetWorkspaceWallpaper: (node: WorkspaceNode) => void
  onCreateStickyNote: (point: { x: number; y: number }) => void
  onCreateVideoWidget: (
    provider: OsVideoWidgetProvider,
    point: { x: number; y: number },
    input: Omit<
      OsDesktopVideoWidget,
      'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onCreateWebEmbedWidget: (
    point: { x: number; y: number },
    input: Omit<
      OsDesktopWebEmbedWidget,
      'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onMoveWidget: (id: string, point: { x: number; y: number }) => void
  onResizeWidget: (id: string, size: { widthCells: number; heightCells: number }) => void
  onUpdateStickyNote: (id: string, content: string) => void
  onUpdateVideoWidget: (
    id: string,
    input: Omit<
      OsDesktopVideoWidget,
      'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onUpdateWebEmbedWidget: (
    id: string,
    input: Omit<
      OsDesktopWebEmbedWidget,
      'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onDeleteWidget: (id: string) => void
  onOpenWallpaperSettings: () => void
  wallpaperInteractive?: boolean
}) {
  const { t } = useTranslation()
  const [contextMenu, setContextMenu] = useState<{
    item: OsDesktopItem
    x: number
    y: number
  } | null>(null)
  const [desktopContextMenu, setDesktopContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)
  const [videoWidgetEditor, setVideoWidgetEditor] = useState<{
    provider: OsVideoWidgetProvider
    point?: { x: number; y: number }
    widget?: OsDesktopVideoWidget
  } | null>(null)
  const [webEmbedWidgetEditor, setWebEmbedWidgetEditor] = useState<{
    point?: { x: number; y: number }
    widget?: OsDesktopWebEmbedWidget
  } | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const dragRef = useRef<{
    id: string
    lastX: number
    lastY: number
    startX: number
    startY: number
    startClientX: number
    startClientY: number
    offsetX: number
    offsetY: number
    pointerId: number
    isDragging: boolean
  } | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    const renamingItem = items.find(
      (item): item is OsDesktopWorkspaceItem =>
        item.kind === 'workspace-node' && item.node.id === renamingNodeId,
    )
    if (renamingItem) setRenameDraft(renamingItem.node.name)
  }, [items, renamingNodeId])

  const openItem = (item: OsDesktopItem) => {
    if (item.kind === 'workspace-node') {
      onOpenWorkspaceNode(item.node)
      return
    }
    if (item.kind === 'builtin-app') {
      onOpenBuiltinApp(item.builtinKey)
      return
    }
    onOpenServerApp(item.appKey)
  }

  const submitRename = (item: OsDesktopWorkspaceItem) => {
    const next = renameDraft.trim()
    if (next && next !== item.node.name) {
      onStartRename(null)
      onRenameWorkspaceNode(item.node, next)
      return
    }
    onStartRename(null)
  }

  const handleDesktopDragOver = (event: DragEvent<HTMLElement>) => {
    if (!canEditLayout) return
    const acceptsWorkspace = event.dataTransfer.types.includes(OS_WORKSPACE_NODE_DRAG_TYPE)
    const acceptsFiles = event.dataTransfer.types.includes('Files')
    if (!acceptsWorkspace && !acceptsFiles) return
    event.preventDefault()
    event.dataTransfer.dropEffect = acceptsFiles ? 'copy' : 'move'
  }

  const handleDesktopDrop = (event: DragEvent<HTMLElement>) => {
    if (!canEditLayout) return
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) {
      event.preventDefault()
      onUploadFiles(
        files,
        snapDesktopPoint({
          x: event.clientX - DESKTOP_ICON_WIDTH / 2,
          y: event.clientY - DESKTOP_ICON_HEIGHT / 2,
        }),
      )
      return
    }

    const node = parseWorkspaceDrag(event)
    if (!node) return
    event.preventDefault()
    onPinWorkspaceNode(
      node,
      snapDesktopPoint({
        x: event.clientX - DESKTOP_ICON_WIDTH / 2,
        y: event.clientY - DESKTOP_ICON_HEIGHT / 2,
      }),
    )
  }

  const handlePointerDown = (item: OsDesktopItem) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canEditLayout) return
    if (event.button !== 0) return
    if (item.kind === 'workspace-node' && item.node.id === renamingNodeId) return
    const target = event.currentTarget
    target.focus({ preventScroll: true })
    target.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: item.id,
      lastX: item.x,
      lastY: item.y,
      startX: item.x,
      startY: item.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: event.clientX - item.x,
      offsetY: event.clientY - item.y,
      pointerId: event.pointerId,
      isDragging: false,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const movedDistance = Math.hypot(
      event.clientX - drag.startClientX,
      event.clientY - drag.startClientY,
    )
    if (!drag.isDragging && movedDistance < DESKTOP_DRAG_START_DISTANCE) return
    drag.isDragging = true
    const next = {
      x: Math.max(0, event.clientX - drag.offsetX),
      y: Math.max(OS_TOP_BAR_HEIGHT, event.clientY - drag.offsetY),
    }
    drag.lastX = next.x
    drag.lastY = next.y
    setDragPreview({ id: drag.id, ...next })
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.isDragging) {
      setDragPreview(null)
      dragRef.current = null
      return
    }
    const targetPoint = snapDesktopPoint({ x: drag.lastX, y: drag.lastY })
    const targetCell = desktopCellKey(targetPoint)
    const startCell = desktopCellKey({ x: drag.startX, y: drag.startY })
    const swapItem = items.find(
      (item) => item.id !== drag.id && desktopCellKey({ x: item.x, y: item.y }) === targetCell,
    )

    setDragPreview(null)
    if (targetCell === startCell) {
      dragRef.current = null
      return
    }
    onMoveItem(
      drag.id,
      targetPoint,
      swapItem
        ? {
            swapWith: {
              id: swapItem.id,
              point: snapDesktopPoint({ x: drag.startX, y: drag.startY }),
            },
          }
        : undefined,
    )
    dragRef.current = null
  }

  const contextMenuGroups = useMemo<ContextMenuGroup[]>(() => {
    if (!contextMenu) return []
    const target = contextMenu.item
    if (target.kind === 'workspace-node') {
      return [
        ...buildWorkspaceContextMenuGroups({
          node: target.node,
          serverId,
          hasClipboard,
          onNewFolder: () => undefined,
          onNewFile: () => undefined,
          onUploadTo: () => undefined,
          onRename: onStartRename,
          onCopy: onCopyWorkspaceNode,
          onCut: onCutWorkspaceNode,
          onPaste: onPasteWorkspaceNodes,
          onClone: onCloneWorkspaceFile,
          onDelete: onDeleteWorkspaceNode,
          onOpen: () => onOpenWorkspaceNode(target.node),
          onRefresh: () => undefined,
          onSetWallpaper: canEditLayout ? onSetWorkspaceWallpaper : undefined,
          labels: workspaceContextMenuLabels(t),
          copySuccessMessage: t('common.copied'),
          copyErrorMessage: t('chat.copyFailed'),
          hiddenItems: [
            'copyPath',
            'newFolder',
            'newSubfolder',
            'newFile',
            'uploadHere',
            'downloadZip',
            'refresh',
          ],
        }),
        ...(canEditLayout
          ? [
              {
                items: [
                  {
                    icon: EyeOff,
                    label: t('os.hideFromDesktop'),
                    onClick: () => onHideItem(target),
                  },
                ],
              },
            ]
          : []),
      ]
    }

    return [
      {
        items: [
          {
            icon: Eye,
            label: t('common.open'),
            onClick: () => openItem(target),
          },
          ...(canEditLayout
            ? [
                {
                  icon: EyeOff,
                  label: t('os.hideFromDesktop'),
                  onClick: () => onHideItem(target),
                },
              ]
            : []),
        ],
      },
    ]
  }, [
    canEditLayout,
    contextMenu,
    hasClipboard,
    onCloneWorkspaceFile,
    onCopyWorkspaceNode,
    onCutWorkspaceNode,
    onDeleteWorkspaceNode,
    onHideItem,
    onOpenWorkspaceNode,
    onPasteWorkspaceNodes,
    onSetWorkspaceWallpaper,
    onStartRename,
    serverId,
    t,
  ])

  const desktopContextMenuGroups = useMemo<ContextMenuGroup[]>(() => {
    if (!desktopContextMenu) return []
    return [
      ...buildWorkspaceContextMenuGroups({
        node: null,
        serverId,
        hasClipboard,
        onNewFolder: () => undefined,
        onNewFile: () => undefined,
        onUploadTo: () => undefined,
        onRename: onStartRename,
        onCopy: onCopyWorkspaceNode,
        onCut: onCutWorkspaceNode,
        onPaste: onPasteWorkspaceNodes,
        onClone: onCloneWorkspaceFile,
        onDelete: onDeleteWorkspaceNode,
        onOpen: () => undefined,
        onRefresh: () => undefined,
        labels: workspaceContextMenuLabels(t),
        copySuccessMessage: t('common.copied'),
        copyErrorMessage: t('chat.copyFailed'),
        hiddenItems: ['newFolder', 'newFile', 'downloadZip', 'refresh', 'copyPath'],
      }),
      ...(canEditLayout
        ? [
            {
              items: [
                {
                  icon: StickyNote,
                  label: t('os.addWidget'),
                  submenu: [
                    {
                      icon: StickyNote,
                      label: t('os.stickyNoteWidget'),
                      onClick: () =>
                        onCreateStickyNote(
                          snapDesktopPoint({
                            x: desktopContextMenu.x - DESKTOP_ICON_WIDTH / 2,
                            y: desktopContextMenu.y - DESKTOP_ICON_HEIGHT / 2,
                          }),
                        ),
                    },
                    {
                      icon: Video,
                      label: t('os.bilibiliVideoWidget'),
                      onClick: () =>
                        setVideoWidgetEditor({
                          provider: 'bilibili',
                          point: snapDesktopPoint({
                            x: desktopContextMenu.x - DESKTOP_ICON_WIDTH / 2,
                            y: desktopContextMenu.y - DESKTOP_ICON_HEIGHT / 2,
                          }),
                        }),
                    },
                    {
                      icon: Youtube,
                      label: t('os.youtubeVideoWidget'),
                      onClick: () =>
                        setVideoWidgetEditor({
                          provider: 'youtube',
                          point: snapDesktopPoint({
                            x: desktopContextMenu.x - DESKTOP_ICON_WIDTH / 2,
                            y: desktopContextMenu.y - DESKTOP_ICON_HEIGHT / 2,
                          }),
                        }),
                    },
                    {
                      icon: Globe,
                      label: t('os.webEmbedWidget'),
                      onClick: () =>
                        setWebEmbedWidgetEditor({
                          point: snapDesktopPoint({
                            x: desktopContextMenu.x - DESKTOP_ICON_WIDTH / 2,
                            y: desktopContextMenu.y - DESKTOP_ICON_HEIGHT / 2,
                          }),
                        }),
                    },
                  ],
                },
                {
                  icon: ImageIcon,
                  label: t('os.setWallpaper'),
                  onClick: onOpenWallpaperSettings,
                },
              ],
            },
          ]
        : []),
    ]
  }, [
    canEditLayout,
    desktopContextMenu,
    hasClipboard,
    onCloneWorkspaceFile,
    onCopyWorkspaceNode,
    onCutWorkspaceNode,
    onDeleteWorkspaceNode,
    onCreateStickyNote,
    onOpenWallpaperSettings,
    onPasteWorkspaceNodes,
    onStartRename,
    setWebEmbedWidgetEditor,
    serverId,
    t,
  ])

  useEffect(() => {
    if (!wallpaperInteractive) return

    const handleWallpaperContextMenu = (event: MessageEvent) => {
      const data = event.data as
        | { type?: unknown; clientX?: unknown; clientY?: unknown }
        | null
        | undefined
      if (
        !data ||
        data.type !== 'shadow:wallpaper-contextmenu' ||
        typeof data.clientX !== 'number' ||
        typeof data.clientY !== 'number'
      ) {
        return
      }

      setContextMenu(null)
      setDesktopContextMenu({ x: data.clientX, y: data.clientY })
    }

    window.addEventListener('message', handleWallpaperContextMenu)
    return () => window.removeEventListener('message', handleWallpaperContextMenu)
  }, [wallpaperInteractive])

  const handleIconContextMenu =
    (item: OsDesktopItem) => (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({ item, x: event.clientX, y: event.clientY })
      setDesktopContextMenu(null)
    }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setDragPreview(null)
    dragRef.current = null
  }

  const handleItemKeyDown =
    (item: OsDesktopItem) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter') {
        openItem(item)
        return
      }
      if (event.key === 'F2' && item.kind === 'workspace-node') {
        event.preventDefault()
        onStartRename(item.node.id)
      }
    }

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-[68px] top-10 z-[6] select-none',
        wallpaperInteractive && 'pointer-events-none',
      )}
      onDragOver={handleDesktopDragOver}
      onDrop={handleDesktopDrop}
      onContextMenu={(event) => {
        event.preventDefault()
        setContextMenu(null)
        setDesktopContextMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      {widgets.map((widget) =>
        widget.kind === 'sticky-note' ? (
          <OsStickyNoteWidget
            key={widget.id}
            widget={widget}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            mentionContext={mentionContext}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onUpdate={onUpdateStickyNote}
            onDelete={onDeleteWidget}
            onOpenMention={onOpenMention}
          />
        ) : widget.kind === 'video-player' ? (
          <OsVideoWidget
            key={widget.id}
            widget={widget}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onDelete={onDeleteWidget}
            onEdit={(target) => setVideoWidgetEditor({ provider: target.provider, widget: target })}
          />
        ) : widget.kind === 'web-embed' ? (
          <OsWebEmbedWidget
            key={widget.id}
            widget={widget}
            serverId={serverId}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onDelete={onDeleteWidget}
            onEdit={(target) => setWebEmbedWidgetEditor({ widget: target })}
          />
        ) : null,
      )}
      {items.map((item) => {
        const isRenaming = item.kind === 'workspace-node' && item.node.id === renamingNodeId
        const itemPreview = dragPreview?.id === item.id ? dragPreview : null
        return (
          <div
            role="button"
            tabIndex={0}
            key={item.id}
            className={cn(
              'group absolute flex h-[104px] w-[88px] select-none flex-col items-center gap-1.5 rounded-[14px] p-1.5 text-center text-white/86 transition',
              'hover:bg-white/10 focus-visible:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
              itemPreview && 'z-20 cursor-grabbing transition-none',
              wallpaperInteractive && 'pointer-events-auto',
            )}
            style={{ left: itemPreview?.x ?? item.x, top: itemPreview?.y ?? item.y }}
            title={desktopItemLabel(item)}
            aria-label={desktopItemLabel(item)}
            onDoubleClick={() => openItem(item)}
            onKeyDown={handleItemKeyDown(item)}
            onPointerDown={handlePointerDown(item)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerCancel}
            onContextMenu={handleIconContextMenu(item)}
          >
            <DesktopItemIcon item={item} />
            {isRenaming && item.kind === 'workspace-node' ? (
              <form
                className="w-full"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitRename(item)
                }}
              >
                <input
                  autoFocus
                  value={renameDraft}
                  className="h-6 w-full rounded-md border border-primary/50 bg-black/65 px-1 text-center text-xs font-black text-white outline-none"
                  onChange={(event) => setRenameDraft(event.currentTarget.value)}
                  onBlur={() => submitRename(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      onStartRename(null)
                    }
                  }}
                />
              </form>
            ) : (
              <span className="line-clamp-2 w-full text-xs font-black leading-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)]">
                {desktopItemLabel(item)}
              </span>
            )}
          </div>
        )
      })}
      {contextMenu ? (
        <div className="pointer-events-auto">
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            groups={contextMenuGroups}
            onClose={() => setContextMenu(null)}
            minWidth={190}
          />
        </div>
      ) : null}
      {desktopContextMenu ? (
        <div className="pointer-events-auto">
          <ContextMenu
            x={desktopContextMenu.x}
            y={desktopContextMenu.y}
            groups={desktopContextMenuGroups}
            onClose={() => setDesktopContextMenu(null)}
            minWidth={180}
          />
        </div>
      ) : null}
      {videoWidgetEditor ? (
        <OsVideoWidgetEditorModal
          provider={videoWidgetEditor.provider}
          initialValue={videoWidgetEditor.widget}
          open
          onClose={() => setVideoWidgetEditor(null)}
          onSubmit={(values) => {
            const input = videoWidgetFromForm(videoWidgetEditor.provider, values)
            if (videoWidgetEditor.widget) {
              onUpdateVideoWidget(videoWidgetEditor.widget.id, input)
            } else if (videoWidgetEditor.point) {
              onCreateVideoWidget(videoWidgetEditor.provider, videoWidgetEditor.point, input)
            }
            setVideoWidgetEditor(null)
          }}
        />
      ) : null}
      {webEmbedWidgetEditor ? (
        <OsWebEmbedWidgetEditorModal
          serverId={serverId}
          initialValue={webEmbedWidgetEditor.widget}
          open
          onClose={() => setWebEmbedWidgetEditor(null)}
          onSubmit={(values) => {
            const input = webEmbedWidgetFromForm(values)
            if (!input) return
            if (webEmbedWidgetEditor.widget) {
              onUpdateWebEmbedWidget(webEmbedWidgetEditor.widget.id, input)
            } else if (webEmbedWidgetEditor.point) {
              onCreateWebEmbedWidget(webEmbedWidgetEditor.point, input)
            }
            setWebEmbedWidgetEditor(null)
          }}
        />
      ) : null}
    </div>
  )
}
