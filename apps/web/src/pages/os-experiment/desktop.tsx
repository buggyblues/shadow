import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
} from '@shadowob/ui'
import { useQueryClient } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  ImageIcon,
  Keyboard,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  RotateCw,
  StickyNote,
  Trash2,
  Upload,
  Video,
  X,
  Youtube,
} from 'lucide-react'
import { marked } from 'marked'
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { MessageInput } from '../../components/chat/message-input'
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
import { OsBuiltinAppIcon } from './builtin-icons'
import { AppIcon } from './components'
import { OsHtmlWallpaperFrame } from './html-wallpaper-frame'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsBuiltinAppKey,
  OsChatInputWidgetMode,
  OsDesktopChatInputWidget,
  OsDesktopItem,
  OsDesktopPhotoWidget,
  OsDesktopTypewriterWidget,
  OsDesktopVideoWidget,
  OsDesktopWebEmbedWidget,
  OsDesktopWidget,
  OsDesktopWorkspaceItem,
  OsPhotoWidgetSourceType,
  OsStickyNoteMentionContext,
  OsStickyNoteMentionTarget,
  OsTypewriterWidgetFontFamily,
  OsTypewriterWidgetTextShadow,
  OsVideoWidgetProvider,
  OsWebEmbedWidgetSourceType,
} from './types'
import { buddyDisplayName, OS_TOP_BAR_HEIGHT, OS_WORKSPACE_NODE_DRAG_TYPE } from './utils'

const DESKTOP_GRID_TOP = OS_TOP_BAR_HEIGHT + 16
const DESKTOP_GRID_LEFT = 24
const DESKTOP_GRID_RIGHT = 28
const DESKTOP_CELL_WIDTH = 52
const DESKTOP_CELL_HEIGHT = 56
const DESKTOP_ICON_CELL_SPAN = 2
const DESKTOP_ICON_SLOT_WIDTH = DESKTOP_CELL_WIDTH * DESKTOP_ICON_CELL_SPAN
const DESKTOP_ICON_SLOT_HEIGHT = DESKTOP_CELL_HEIGHT * DESKTOP_ICON_CELL_SPAN
const DESKTOP_ICON_WIDTH = 92
const DESKTOP_ICON_HEIGHT = 108
const DESKTOP_DRAG_START_DISTANCE = 6
const WIDGET_ROTATION_SNAP_DEGREES = 15

export function desktopRowsPerColumn() {
  const availableHeight =
    typeof window === 'undefined'
      ? 720
      : Math.max(DESKTOP_ICON_SLOT_HEIGHT, window.innerHeight - DESKTOP_GRID_TOP - 88)
  return Math.max(1, Math.floor(availableHeight / DESKTOP_ICON_SLOT_HEIGHT))
}

function desktopFineRowsPerColumn() {
  const availableHeight =
    typeof window === 'undefined'
      ? 720
      : Math.max(DESKTOP_CELL_HEIGHT, window.innerHeight - DESKTOP_GRID_TOP - 88)
  return Math.max(1, Math.floor(availableHeight / DESKTOP_CELL_HEIGHT))
}

function desktopMaxIconColumn() {
  if (typeof window === 'undefined') return 0
  const availableWidth = Math.max(
    DESKTOP_ICON_SLOT_WIDTH,
    window.innerWidth - DESKTOP_GRID_LEFT - DESKTOP_GRID_RIGHT,
  )
  return Math.max(0, Math.floor((availableWidth - DESKTOP_ICON_WIDTH) / DESKTOP_ICON_SLOT_WIDTH))
}

function desktopMaxColumn() {
  if (typeof window === 'undefined') return 0
  const availableWidth = Math.max(
    DESKTOP_CELL_WIDTH,
    window.innerWidth - DESKTOP_GRID_LEFT - DESKTOP_GRID_RIGHT,
  )
  return Math.max(0, Math.floor((availableWidth - DESKTOP_CELL_WIDTH) / DESKTOP_CELL_WIDTH))
}

function desktopPointForIconCell(col: number, row: number) {
  return {
    x: DESKTOP_GRID_LEFT + col * DESKTOP_ICON_SLOT_WIDTH,
    y: DESKTOP_GRID_TOP + row * DESKTOP_ICON_SLOT_HEIGHT,
  }
}

function desktopPointForCell(col: number, row: number) {
  return {
    x: DESKTOP_GRID_LEFT + col * DESKTOP_CELL_WIDTH,
    y: DESKTOP_GRID_TOP + row * DESKTOP_CELL_HEIGHT,
  }
}

function desktopIconCellForPoint(point: { x: number; y: number }) {
  const col = Math.min(
    desktopMaxIconColumn(),
    Math.max(0, Math.round((point.x - DESKTOP_GRID_LEFT) / DESKTOP_ICON_SLOT_WIDTH)),
  )
  const row = Math.min(
    desktopRowsPerColumn() - 1,
    Math.max(0, Math.round((point.y - DESKTOP_GRID_TOP) / DESKTOP_ICON_SLOT_HEIGHT)),
  )
  return { col, row }
}

function desktopCellForPoint(point: { x: number; y: number }) {
  const col = Math.min(
    desktopMaxColumn(),
    Math.max(0, Math.round((point.x - DESKTOP_GRID_LEFT) / DESKTOP_CELL_WIDTH)),
  )
  const row = Math.min(
    desktopFineRowsPerColumn() - 1,
    Math.max(0, Math.round((point.y - DESKTOP_GRID_TOP) / DESKTOP_CELL_HEIGHT)),
  )
  return { col, row }
}

function desktopIconCellKey(point: { x: number; y: number }) {
  const cell = desktopIconCellForPoint(point)
  return `${cell.col}:${cell.row}`
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
  return desktopPointForIconCell(Math.min(col, desktopMaxIconColumn()), row)
}

export function snapDesktopIconPoint(
  point: { x: number; y: number },
  options?: { occupied?: Array<{ x: number; y: number }> },
) {
  const start = desktopIconCellForPoint(point)
  const occupied = new Set((options?.occupied ?? []).map(desktopIconCellKey))
  const maxColumn = desktopMaxIconColumn()
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
        const next = desktopPointForIconCell(col, row)
        if (!occupied.has(desktopIconCellKey(next))) return next
      }
    }
  }

  return desktopPointForIconCell(start.col, start.row)
}

export function snapDesktopPoint(
  point: { x: number; y: number },
  options?: { occupied?: Array<{ x: number; y: number }> },
) {
  const start = desktopCellForPoint(point)
  const occupied = new Set((options?.occupied ?? []).map(desktopCellKey))
  const maxColumn = desktopMaxColumn()
  const rows = desktopFineRowsPerColumn()

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

  return (
    <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-[16px] border border-white/12 bg-white/14 shadow-[0_16px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <OsBuiltinAppIcon appKey={item.builtinKey} />
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
const STICKY_NOTE_MARKDOWN_STYLE = `
.os-sticky-note-markdown {
  color: #30260d;
  font-size: 15px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.os-sticky-note-markdown > :first-child {
  margin-top: 0;
}
.os-sticky-note-markdown > :last-child {
  margin-bottom: 0;
}
.os-sticky-note-markdown h1,
.os-sticky-note-markdown h2,
.os-sticky-note-markdown h3 {
  margin: 0 0 9px;
  color: #201703;
  font-weight: 900;
  line-height: 1.18;
}
.os-sticky-note-markdown h1 {
  font-size: 1.45em;
}
.os-sticky-note-markdown h2 {
  font-size: 1.22em;
}
.os-sticky-note-markdown h3 {
  font-size: 1.06em;
}
.os-sticky-note-markdown p,
.os-sticky-note-markdown ul,
.os-sticky-note-markdown ol,
.os-sticky-note-markdown blockquote,
.os-sticky-note-markdown pre,
.os-sticky-note-markdown table {
  margin: 0 0 10px;
}
.os-sticky-note-markdown ul,
.os-sticky-note-markdown ol {
  list-style-position: outside;
  padding-left: 1.2rem;
}
.os-sticky-note-markdown ul {
  list-style-type: disc;
}
.os-sticky-note-markdown ol {
  list-style-type: decimal;
}
.os-sticky-note-markdown li {
  display: list-item;
  margin: 3px 0;
}
.os-sticky-note-markdown li::marker {
  color: #7a5f09;
}
.os-sticky-note-markdown a {
  color: #523500;
  font-weight: 800;
  text-decoration: underline;
  text-decoration-color: rgba(82, 53, 0, 0.3);
  text-underline-offset: 2px;
}
.os-sticky-note-markdown blockquote {
  border-left: 3px solid rgba(71, 47, 0, 0.3);
  background: rgba(255, 255, 255, 0.22);
  padding: 7px 10px;
  color: #4b3a13;
}
.os-sticky-note-markdown code {
  border-radius: 5px;
  background: rgba(54, 38, 0, 0.1);
  padding: 1px 5px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.92em;
}
.os-sticky-note-markdown pre {
  overflow-x: auto;
  border: 1px solid rgba(71, 47, 0, 0.14);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.3);
  padding: 9px 10px;
}
.os-sticky-note-markdown pre code {
  background: transparent;
  padding: 0;
}
.os-sticky-note-markdown table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92em;
}
.os-sticky-note-markdown th,
.os-sticky-note-markdown td {
  border: 1px solid rgba(71, 47, 0, 0.18);
  padding: 5px 6px;
  vertical-align: top;
}
.os-sticky-note-markdown th {
  background: rgba(255, 255, 255, 0.28);
  font-weight: 900;
}
.os-sticky-note-markdown hr {
  margin: 12px 0;
  border: 0;
  border-top: 1px dashed rgba(71, 47, 0, 0.28);
}
.os-sticky-note-markdown img {
  max-width: 100%;
  border-radius: 6px;
}
.os-sticky-note-markdown [data-shadow-mention-key] {
  cursor: pointer;
}
`

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

type ChatInputWidgetFormValues = {
  defaultAgentId: string
  inboxViewMode: OsChatInputWidgetMode
  placeholder: string
  completionItems: string[]
}

function chatInputWidgetFormFromWidget(
  widget: OsDesktopChatInputWidget | null | undefined,
): ChatInputWidgetFormValues {
  return {
    defaultAgentId: widget?.defaultAgentId ?? '',
    inboxViewMode: widget?.inboxViewMode === 'tasks' ? 'tasks' : 'chat',
    placeholder: widget?.placeholder ?? '',
    completionItems: Array.isArray(widget?.completionItems)
      ? widget.completionItems
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 12)
      : [],
  }
}

function chatInputWidgetFromForm(
  form: ChatInputWidgetFormValues,
): Partial<
  Pick<
    OsDesktopChatInputWidget,
    'defaultAgentId' | 'inboxViewMode' | 'placeholder' | 'completionItems'
  >
> {
  const completionItems = form.completionItems
    .map((item) => item.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 12)
  return {
    defaultAgentId: form.defaultAgentId || null,
    inboxViewMode: form.inboxViewMode,
    placeholder: form.placeholder.trim() || undefined,
    completionItems: completionItems.length ? completionItems : undefined,
  }
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

type PhotoWidgetFormValues = {
  sourceType: OsPhotoWidgetSourceType
  source: string
  title: string
  workspaceFileName: string
  aspectRatio: number
  rotation: number
}

const DEFAULT_PHOTO_WIDGET_FORM: PhotoWidgetFormValues = {
  sourceType: 'url',
  source: '',
  title: '',
  workspaceFileName: '',
  aspectRatio: 1,
  rotation: 0,
}

const PHOTO_WIDGET_EXTENSIONS = ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']

function clampPhotoAspectRatio(value: number) {
  return Math.min(10, Math.max(0.1, Number.isFinite(value) ? value : 1))
}

function clampPhotoRotation(value: number) {
  return Math.min(45, Math.max(-45, Number.isFinite(value) ? value : 0))
}

function randomPhotoRotation() {
  return Math.round((Math.random() * 18 - 9) * 10) / 10
}

function workspaceNodeIsImage(node: WorkspaceNode) {
  const mime = (node.mime ?? '').toLowerCase()
  const ext = (node.ext ?? (node.name.includes('.') ? `.${node.name.split('.').pop()}` : ''))
    .toLowerCase()
    .trim()
  return (
    node.kind === 'file' && (mime.startsWith('image/') || PHOTO_WIDGET_EXTENSIONS.includes(ext))
  )
}

function loadImageAspectRatio(src: string) {
  return new Promise<number>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve(clampPhotoAspectRatio(image.naturalWidth / image.naturalHeight))
        return
      }
      reject(new Error('Invalid image dimensions'))
    }
    image.onerror = () => reject(new Error('Image failed to load'))
    image.src = src
  })
}

async function fetchWorkspaceFileMediaUrl(serverId: string, fileId: string) {
  const result = await fetchApi<{ url: string }>(
    `/api/servers/${serverId}/workspace/files/${fileId}/media-url?disposition=inline`,
  )
  return result.url
}

function photoWidgetFromForm(
  form: PhotoWidgetFormValues,
): Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'> | null {
  const source = form.source.trim()
  if (!source) return null
  return {
    sourceType: form.sourceType,
    source,
    title: form.title.trim() || undefined,
    workspaceFileName: form.workspaceFileName.trim() || null,
    aspectRatio: clampPhotoAspectRatio(form.aspectRatio),
    rotation: clampPhotoRotation(form.rotation),
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

type TypewriterWidgetFormValues = {
  content: string
  speedMs: number
  pauseMs: number
  loop: boolean
  cursor: boolean
  fontFamily: OsTypewriterWidgetFontFamily
  fontSize: number
  color: string
  textShadow: OsTypewriterWidgetTextShadow
  textStrokeWidth: number
  textStrokeColor: string
}

const TYPEWRITER_FONT_FAMILIES: OsTypewriterWidgetFontFamily[] = [
  'system',
  'serif',
  'mono',
  'handwriting',
]
const TYPEWRITER_TEXT_SHADOWS: OsTypewriterWidgetTextShadow[] = ['none', 'soft', 'glow', 'strong']

function clampTypewriterSpeedMs(value: number) {
  return Math.min(240, Math.max(15, Number.isFinite(value) ? Math.round(value) : 160))
}

function clampTypewriterPauseMs(value: number) {
  return Math.min(8000, Math.max(500, Number.isFinite(value) ? Math.round(value) : 1800))
}

function clampTypewriterFontSize(value: number) {
  return Math.min(96, Math.max(12, Number.isFinite(value) ? Math.round(value) : 32))
}

function clampTypewriterStrokeWidth(value: number) {
  return Math.min(8, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0))
}

function normalizeTypewriterColor(value: string, fallback: string) {
  return /^#[\da-f]{6}$/i.test(value) ? value : fallback
}

function hexToRgba(value: string, alpha: number) {
  const color = normalizeTypewriterColor(value, '#ffffff').slice(1)
  const red = Number.parseInt(color.slice(0, 2), 16)
  const green = Number.parseInt(color.slice(2, 4), 16)
  const blue = Number.parseInt(color.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function typewriterFontFamilyCss(fontFamily: OsTypewriterWidgetFontFamily) {
  if (fontFamily === 'serif') return 'Georgia, "Times New Roman", serif'
  if (fontFamily === 'mono') return '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
  if (fontFamily === 'handwriting')
    return '"Apple Chancery", "Snell Roundhand", "Bradley Hand", "Segoe Script", cursive'
  return 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}

function typewriterTextShadowCss(shadow: OsTypewriterWidgetTextShadow, color: string) {
  if (shadow === 'none') return 'none'
  if (shadow === 'glow') {
    return `0 0 8px ${hexToRgba(color, 0.72)}, 0 0 22px ${hexToRgba(color, 0.45)}`
  }
  if (shadow === 'strong') {
    return '0 3px 0 rgba(0,0,0,0.45), 0 10px 22px rgba(0,0,0,0.42)'
  }
  return '0 2px 8px rgba(0,0,0,0.36)'
}

function typewriterWidgetFromForm(
  form: TypewriterWidgetFormValues,
): Omit<
  OsDesktopTypewriterWidget,
  'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
> {
  const color = normalizeTypewriterColor(form.color, '#ffffff')
  const textStrokeColor = normalizeTypewriterColor(form.textStrokeColor, '#000000')
  return {
    content: form.content,
    speedMs: clampTypewriterSpeedMs(form.speedMs),
    pauseMs: clampTypewriterPauseMs(form.pauseMs),
    loop: form.loop,
    cursor: form.cursor,
    fontFamily: form.fontFamily,
    fontSize: clampTypewriterFontSize(form.fontSize),
    color,
    textShadow: form.textShadow,
    textStrokeWidth: clampTypewriterStrokeWidth(form.textStrokeWidth),
    textStrokeColor,
  }
}

type OsWidgetToolbarAction = {
  label: string
  onClick: () => void
  danger?: boolean
}

type OsWidgetTransformSnapshot = {
  x: number
  y: number
  widthCells: number
  heightCells: number
  rotation: number
}

type OsWidgetMenuSide = 'top' | 'left'

function widgetRotation(widget: { rotation?: number }) {
  return clampPhotoRotation(typeof widget.rotation === 'number' ? widget.rotation : 0)
}

function widgetHeightCells(widget: OsDesktopWidget | { heightCells?: number }) {
  return 'heightCells' in widget && typeof widget.heightCells === 'number' ? widget.heightCells : 1
}

function rotateFromPointerDelta(
  startRotation: number,
  startX: number,
  startY: number,
  event: { clientX: number; clientY: number; shiftKey?: boolean },
) {
  const rotation = clampPhotoRotation(
    startRotation + (event.clientX - startX + startY - event.clientY) * 0.35,
  )
  if (!event.shiftKey) return rotation
  return clampPhotoRotation(
    Math.round(rotation / WIDGET_ROTATION_SNAP_DEGREES) * WIDGET_ROTATION_SNAP_DEGREES,
  )
}

function resolveWidgetMenuSide(trigger: HTMLButtonElement | null): OsWidgetMenuSide {
  if (typeof window === 'undefined' || !trigger) return 'top'
  const widgetElement = trigger.closest('section')
  const rect = widgetElement?.getBoundingClientRect() ?? trigger.getBoundingClientRect()
  const menuWidth = 208
  const menuHeight = 186
  const gap = 10
  const topLimit = OS_TOP_BAR_HEIGHT + gap

  if (rect.top - menuHeight - gap >= topLimit) return 'top'
  if (rect.left - menuWidth - gap >= 0) return 'left'
  return 'top'
}

function useWidgetTransformEditor({
  widget,
  editable,
  onMove,
  onResize,
  onRotate,
}: {
  widget: OsDesktopWidget
  editable: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
}) {
  const [active, setActive] = useState(false)
  const snapshotRef = useRef<OsWidgetTransformSnapshot | null>(null)

  useEffect(() => {
    if (!editable) {
      setActive(false)
      snapshotRef.current = null
    }
  }, [editable])

  const begin = () => {
    if (!editable) return
    snapshotRef.current = {
      x: widget.x,
      y: widget.y,
      widthCells: widget.widthCells,
      heightCells: widgetHeightCells(widget),
      rotation: widgetRotation(widget),
    }
    setActive(true)
  }

  const apply = () => {
    snapshotRef.current = null
    setActive(false)
  }

  const cancel = () => {
    const snapshot = snapshotRef.current
    snapshotRef.current = null
    setActive(false)
    if (!snapshot) return
    onMove(widget.id, { x: snapshot.x, y: snapshot.y })
    onResize(widget.id, {
      widthCells: snapshot.widthCells,
      heightCells: snapshot.heightCells,
    })
    onRotate(widget.id, snapshot.rotation)
  }

  return {
    transformEditing: editable && active,
    beginTransformEdit: begin,
    applyTransformEdit: apply,
    cancelTransformEdit: cancel,
  }
}

function OsWidgetToolbar({
  title,
  editable,
  transformEditing = false,
  onBeginTransformEdit,
  onApplyTransformEdit,
  onCancelTransformEdit,
  actions,
}: {
  title: string
  editable: boolean
  transformEditing?: boolean
  onBeginTransformEdit?: () => void
  onApplyTransformEdit?: () => void
  onCancelTransformEdit?: () => void
  actions: OsWidgetToolbarAction[]
}) {
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [menuSide, setMenuSide] = useState<OsWidgetMenuSide>('top')

  if (!editable) return null

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) setMenuSide(resolveWidgetMenuSide(triggerRef.current))
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={cn(
              'group/widget-menu-trigger pointer-events-auto absolute left-[-38px] top-0 z-50 grid h-7 w-7 place-items-center rounded-full border border-white/22 bg-black/58 text-white/78 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur transition duration-200 ease-out hover:scale-110 hover:bg-black/78 hover:text-white active:scale-95 data-[state=open]:scale-105 data-[state=open]:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100',
              transformEditing && 'opacity-100 ring-2 ring-primary/40',
            )}
            aria-label={title}
            title={title}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="transition-transform duration-200 ease-out group-data-[state=open]/widget-menu-trigger:rotate-180"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          avoidCollisions={false}
          side={menuSide}
          sideOffset={10}
          className="z-[2147482000] w-24 !min-w-[6rem] select-none border-white/12 bg-bg-secondary/96 p-1.5 text-text-primary shadow-[0_20px_64px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
        >
          {onBeginTransformEdit ? (
            <DropdownMenuItem
              className="normal-case tracking-normal"
              disabled={transformEditing}
              onSelect={onBeginTransformEdit}
            >
              <span className="min-w-0 flex-1 truncate">{t('os.editWidgetLayout')}</span>
            </DropdownMenuItem>
          ) : null}
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              className={cn(
                'normal-case tracking-normal',
                action.danger && 'text-danger focus:text-danger',
              )}
              onSelect={action.onClick}
            >
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {transformEditing ? (
        <div className="pointer-events-auto absolute left-[-38px] top-9 z-50 flex flex-col gap-1">
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-full border border-emerald-200/45 bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] transition duration-200 ease-out hover:scale-110 active:scale-95"
            aria-label={t('common.confirm')}
            title={t('common.confirm')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onApplyTransformEdit}
          >
            <Check size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-full border border-rose-200/45 bg-rose-500 text-white shadow-[0_8px_20px_rgba(244,63,94,0.35)] transition duration-200 ease-out hover:scale-110 active:scale-95"
            aria-label={t('common.cancel')}
            title={t('common.cancel')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onCancelTransformEdit}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  )
}

function OsWidgetResizeHandle({
  editable,
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  editable: boolean
  label: string
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  if (!editable) return null

  return (
    <button
      type="button"
      className={cn(
        'absolute z-40 grid h-7 w-7 cursor-nwse-resize place-items-center rounded-full border border-white/35 bg-black/52 text-white/80 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.3)] backdrop-blur transition duration-200 ease-out hover:scale-110 hover:bg-black/72 hover:text-white active:scale-95 group-hover:opacity-100 group-focus-within:opacity-100',
        'bottom-[-28px] right-[-28px]',
      )}
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span aria-hidden="true" className="h-2.5 w-2.5 border-b-2 border-r-2 border-current" />
    </button>
  )
}

function OsWidgetRotateHandle({
  editable,
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  editable: boolean
  label: string
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  if (!editable) return null

  return (
    <button
      type="button"
      className="absolute left-1/2 top-[-34px] z-40 grid h-7 w-7 -translate-x-1/2 cursor-move place-items-center rounded-full border border-white/35 bg-black/58 text-white/86 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.3)] backdrop-blur transition duration-200 ease-out hover:scale-110 hover:bg-black/78 hover:text-white active:scale-95 group-hover:opacity-100 group-focus-within:opacity-100"
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <RotateCw size={13} />
    </button>
  )
}

function OsStickyNoteWidget({
  widget,
  editable,
  wallpaperInteractive,
  mentionContext,
  onMove,
  onResize,
  onRotate,
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
  onRotate: (id: string, rotation: number) => void
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
  const rotateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startRotation: number
    lastRotation: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    heightCells?: number
    rotation?: number
  } | null>(null)
  const { transformEditing, beginTransformEdit, applyTransformEdit, cancelTransformEdit } =
    useWidgetTransformEditor({
      widget,
      editable,
      onMove,
      onResize,
      onRotate,
    })

  useEffect(() => {
    if (!editing) setDraft(widget.content)
  }, [editing, widget.content])

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const currentRotation = preview?.rotation ?? widgetRotation(widget)
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

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!transformEditing) return
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

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
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

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
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
      12,
      Math.max(
        2,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      12,
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

  const handleRotateStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    rotateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: currentRotation,
      lastRotation: currentRotation,
    }
  }

  const handleRotateMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    const rotation = rotateFromPointerDelta(
      rotate.startRotation,
      rotate.startX,
      rotate.startY,
      event,
    )
    rotate.lastRotation = rotation
    setPreview((current) => ({ ...current, rotation }))
  }

  const handleRotateEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    onRotate(widget.id, rotate.lastRotation)
    rotateRef.current = null
    setPreview(null)
  }

  return (
    <section
      className={cn(
        'group absolute z-10 select-none overflow-visible',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{
        left: currentX,
        top: currentY,
        width,
        height,
        transform: `rotate(${currentRotation}deg)`,
        transformOrigin: 'center center',
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <OsWidgetToolbar
        title={t('os.stickyNoteWidget')}
        editable={editable}
        transformEditing={transformEditing}
        onBeginTransformEdit={beginTransformEdit}
        onApplyTransformEdit={applyTransformEdit}
        onCancelTransformEdit={cancelTransformEdit}
        actions={[
          {
            label: t('common.delete'),
            onClick: () => onDelete(widget.id),
            danger: true,
          },
        ]}
      />
      <style>{STICKY_NOTE_MARKDOWN_STYLE}</style>
      <div
        className={cn(
          'flex h-full flex-col overflow-hidden bg-[#ffeb3b] px-5 py-4 text-[#333] shadow-[4px_6px_15px_rgba(0,0,0,0.16)]',
          transformEditing && 'cursor-grab active:cursor-grabbing',
        )}
        style={{ borderRadius: '2px 2px 20px 2px' }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            placeholder={t('os.stickyNotePlaceholder')}
            className="h-full min-h-[96px] w-full flex-1 resize-none border-0 bg-transparent font-['Courier_New',Courier,monospace] text-[14px] leading-[1.55] text-[#333] outline-none placeholder:text-[#8d821e]/70"
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
            className="os-sticky-note-markdown min-h-0 flex-1 cursor-pointer overflow-y-auto"
            onClick={handleRenderedMarkdownClick}
            onDoubleClick={() => {
              if (editable && !transformEditing) setEditing(true)
            }}
            dangerouslySetInnerHTML={{ __html: renderedMarkdown.html }}
          />
        )}
      </div>
      <OsWidgetResizeHandle
        editable={transformEditing}
        label={t('os.resizeWidget')}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
      <OsWidgetRotateHandle
        editable={transformEditing}
        label={t('os.rotateWidget')}
        onPointerDown={handleRotateStart}
        onPointerMove={handleRotateMove}
        onPointerUp={handleRotateEnd}
        onPointerCancel={handleRotateEnd}
      />
    </section>
  )
}

function OsChatInputWidget({
  widget,
  serverId,
  inboxes,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onRotate,
  onDelete,
  onEdit,
}: {
  widget: OsDesktopChatInputWidget
  serverId: string
  inboxes: BuddyInboxEntry[]
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onDelete: (id: string) => void
  onEdit: (widget: OsDesktopChatInputWidget) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [resolvedChannel, setResolvedChannel] = useState<ChannelMeta | null>(null)
  const [ensuringAgentId, setEnsuringAgentId] = useState<string | null>(null)
  const [ensureError, setEnsureError] = useState(false)
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
  const rotateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startRotation: number
    lastRotation: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    heightCells?: number
    rotation?: number
  } | null>(null)
  const { transformEditing, beginTransformEdit, applyTransformEdit, cancelTransformEdit } =
    useWidgetTransformEditor({
      widget,
      editable,
      onMove,
      onResize,
      onRotate,
    })

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const currentRotation = preview?.rotation ?? widgetRotation(widget)
  const compactComposer = currentHeightCells <= 2
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const activeAgentId =
    (widget.defaultAgentId && inboxes.some((entry) => entry.agent.id === widget.defaultAgentId)
      ? widget.defaultAgentId
      : null) ??
    inboxes[0]?.agent.id ??
    null
  const inboxViewMode = widget.inboxViewMode === 'tasks' ? 'tasks' : 'chat'
  const selectedEntry = inboxes.find((entry) => entry.agent.id === activeAgentId) ?? null
  const selectedBuddyName = selectedEntry
    ? buddyDisplayName(selectedEntry)
    : t('os.chatInputNoBuddy')
  const messagePlaceholder =
    widget.placeholder?.trim() || t('os.chatInputPlaceholder', { buddy: selectedBuddyName })
  const composerTextareaHeight = compactComposer
    ? Math.max(24, Math.min(42, height - 58))
    : Math.max(52, Math.min(360, height - 84))

  useEffect(() => {
    if (!selectedEntry) {
      setResolvedChannel(null)
      setEnsuringAgentId(null)
      setEnsureError(false)
      return
    }
    if (selectedEntry.channel) {
      setResolvedChannel(selectedEntry.channel)
      setEnsuringAgentId(null)
      setEnsureError(false)
      return
    }

    let cancelled = false
    setResolvedChannel(null)
    setEnsuringAgentId(selectedEntry.agent.id)
    setEnsureError(false)
    fetchApi<{ channel: ChannelMeta }>(
      `/api/servers/${serverId}/inboxes/${selectedEntry.agent.id}`,
      { method: 'POST' },
    )
      .then(async (result) => {
        if (cancelled) return
        setResolvedChannel(result.channel)
        setEnsuringAgentId(null)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', serverId] }),
          queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', serverId] }),
          queryClient.invalidateQueries({ queryKey: ['channels', serverId] }),
        ])
      })
      .catch(() => {
        if (cancelled) return
        setEnsuringAgentId(null)
        setEnsureError(true)
      })

    return () => {
      cancelled = true
    }
  }, [queryClient, selectedEntry, serverId])

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!transformEditing) return
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

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
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

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
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
      16,
      Math.max(
        6,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      8,
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

  const handleRotateStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    rotateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: currentRotation,
      lastRotation: currentRotation,
    }
  }

  const handleRotateMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    const rotation = rotateFromPointerDelta(
      rotate.startRotation,
      rotate.startX,
      rotate.startY,
      event,
    )
    rotate.lastRotation = rotation
    setPreview((current) => ({ ...current, rotation }))
  }

  const handleRotateEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    onRotate(widget.id, rotate.lastRotation)
    rotateRef.current = null
    setPreview(null)
  }

  return (
    <section
      className={cn(
        'group absolute z-10 select-none overflow-visible rounded-2xl bg-transparent text-text-primary',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{
        left: currentX,
        top: currentY,
        width,
        height,
        transform: `rotate(${currentRotation}deg)`,
        transformOrigin: 'center center',
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <OsWidgetToolbar
        title={t('os.chatInputWidget')}
        editable={editable}
        transformEditing={transformEditing}
        onBeginTransformEdit={beginTransformEdit}
        onApplyTransformEdit={applyTransformEdit}
        onCancelTransformEdit={cancelTransformEdit}
        actions={[
          {
            label: t('os.customizeWidget'),
            onClick: () => onEdit(widget),
          },
          {
            label: t('common.delete'),
            onClick: () => onDelete(widget.id),
            danger: true,
          },
        ]}
      />
      {transformEditing ? (
        <div
          className="pointer-events-auto absolute inset-0 z-30 cursor-grab rounded-2xl bg-transparent active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        />
      ) : null}
      <div className="flex h-full min-h-0 flex-col overflow-visible rounded-2xl">
        <div className="min-h-0 flex-1 overflow-visible [&>section]:h-full">
          {!selectedEntry ? (
            <div className="grid h-full place-items-center px-4 text-center text-sm font-bold text-text-muted">
              {t('os.chatInputNoBuddy')}
            </div>
          ) : ensuringAgentId === selectedEntry.agent.id ? (
            <div className="grid h-full place-items-center text-text-muted">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : ensureError || !resolvedChannel ? (
            <div className="grid h-full place-items-center px-4 text-center text-sm font-bold text-danger">
              {t('os.chatInputChannelUnavailable')}
            </div>
          ) : (
            <MessageInput
              channelId={resolvedChannel.id}
              channelName={selectedBuddyName}
              placeholder={messagePlaceholder}
              enableTaskCards
              inboxViewMode={inboxViewMode}
              onMessageSent={() => {
                queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', serverId] })
                queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', serverId] })
              }}
              compactComposer={compactComposer}
              edgeToEdgeComposer
              composerTextareaHeight={composerTextareaHeight}
              completionItems={widget.completionItems}
              highContrastSurface
            />
          )}
        </div>
      </div>
      <OsWidgetResizeHandle
        editable={transformEditing}
        label={t('os.resizeWidget')}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
      <OsWidgetRotateHandle
        editable={transformEditing}
        label={t('os.rotateWidget')}
        onPointerDown={handleRotateStart}
        onPointerMove={handleRotateMove}
        onPointerUp={handleRotateEnd}
        onPointerCancel={handleRotateEnd}
      />
    </section>
  )
}

function OsPhotoWidget({
  widget,
  serverId,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onRotate,
  onDelete,
  onEdit,
}: {
  widget: OsDesktopPhotoWidget
  serverId: string
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onDelete: (id: string) => void
  onEdit: (widget: OsDesktopPhotoWidget) => void
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
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
    startWidthCells: number
    lastWidthCells: number
  } | null>(null)
  const rotateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startRotation: number
    lastRotation: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    rotation?: number
  } | null>(null)
  const { transformEditing, beginTransformEdit, applyTransformEdit, cancelTransformEdit } =
    useWidgetTransformEditor({
      widget,
      editable,
      onMove,
      onResize,
      onRotate,
    })

  useEffect(() => {
    let cancelled = false
    setImageLoaded(false)
    setImageError(false)

    if (widget.sourceType === 'url') {
      setImageUrl(widget.source)
      return () => {
        cancelled = true
      }
    }

    setImageUrl(null)
    fetchWorkspaceFileMediaUrl(serverId, widget.source)
      .then((url) => {
        if (!cancelled) setImageUrl(url)
      })
      .catch(() => {
        if (!cancelled) setImageError(true)
      })

    return () => {
      cancelled = true
    }
  }, [serverId, widget.source, widget.sourceType])

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentRotation = preview?.rotation ?? widgetRotation(widget)
  const photoWidth = Math.min(320, currentWidthCells * DESKTOP_CELL_WIDTH - 12)
  const aspectRatio = clampPhotoAspectRatio(widget.aspectRatio)
  const photoTitle = widget.title?.trim() || widget.workspaceFileName || t('os.photoWidget')
  const frameStyle = {
    width: '100%',
    maxWidth: 320,
    display: 'block',
    backgroundColor: '#fff',
    padding: '10px 10px 20px',
    boxShadow: hovered ? '10px 25px 40px rgba(0, 0, 0, 0.8)' : '5px 15px 25px rgba(0, 0, 0, 0.5)',
    transform: `translate(0, 0) scale(${hovered ? 1.14 : 1})`,
    transformOrigin: 'center center',
    transition: 'transform 0.3s ease-out, box-shadow 0.3s ease-out',
    cursor: transformEditing ? 'grab' : 'pointer',
  } satisfies CSSProperties
  const imageAreaStyle = {
    aspectRatio,
    backgroundColor: '#eee',
  } satisfies CSSProperties

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!transformEditing) return
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

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
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

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidthCells: currentWidthCells,
      lastWidthCells: currentWidthCells,
    }
  }

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const widthCells = Math.min(
      8,
      Math.max(
        4,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    resize.lastWidthCells = widthCells
    setPreview((current) => ({ ...current, widthCells }))
  }

  const handleResizeEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    onResize(widget.id, { widthCells: resize.lastWidthCells, heightCells: 2 })
    resizeRef.current = null
    setPreview(null)
  }

  const handleRotateStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    rotateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: currentRotation,
      lastRotation: currentRotation,
    }
  }

  const handleRotateMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    const rotation = rotateFromPointerDelta(
      rotate.startRotation,
      rotate.startX,
      rotate.startY,
      event,
    )
    rotate.lastRotation = rotation
    setPreview((current) => ({ ...current, rotation }))
  }

  const handleRotateEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    onRotate(widget.id, rotate.lastRotation)
    rotateRef.current = null
    setPreview(null)
  }

  const showLoading = Boolean(imageUrl && !imageLoaded && !imageError)

  return (
    <section
      className={cn(
        'group absolute select-none overflow-visible',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{
        left: currentX,
        top: currentY,
        width: photoWidth,
        zIndex: hovered ? 30 : 10,
        transform: `rotate(${currentRotation}deg)`,
        transformOrigin: 'center center',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <OsWidgetToolbar
        title={photoTitle}
        editable={editable}
        transformEditing={transformEditing}
        onBeginTransformEdit={beginTransformEdit}
        onApplyTransformEdit={applyTransformEdit}
        onCancelTransformEdit={cancelTransformEdit}
        actions={[
          {
            label: t('os.customizeWidget'),
            onClick: () => onEdit(widget),
          },
          {
            label: t('common.delete'),
            onClick: () => onDelete(widget.id),
            danger: true,
          },
        ]}
      />

      <div
        className={cn('relative overflow-hidden', transformEditing && 'active:cursor-grabbing')}
        style={frameStyle}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="relative overflow-hidden" style={imageAreaStyle}>
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={photoTitle}
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-contain"
              style={{ opacity: imageLoaded ? 1 : 0.16 }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-slate-400">
              <ImageIcon size={28} />
            </div>
          )}
          {showLoading ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-slate-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : null}
        </div>
      </div>

      <OsWidgetResizeHandle
        editable={transformEditing}
        label={t('os.resizeWidget')}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
      <OsWidgetRotateHandle
        editable={transformEditing}
        label={t('os.rotateWidget')}
        onPointerDown={handleRotateStart}
        onPointerMove={handleRotateMove}
        onPointerUp={handleRotateEnd}
        onPointerCancel={handleRotateEnd}
      />
    </section>
  )
}

function OsVideoWidget({
  widget,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onRotate,
  onDelete,
  onEdit,
}: {
  widget: OsDesktopVideoWidget
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
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
  const rotateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startRotation: number
    lastRotation: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    heightCells?: number
    rotation?: number
  } | null>(null)
  const { transformEditing, beginTransformEdit, applyTransformEdit, cancelTransformEdit } =
    useWidgetTransformEditor({
      widget,
      editable,
      onMove,
      onResize,
      onRotate,
    })

  useEffect(() => {
    setCoverDismissed(false)
  }, [widget.autoplay, widget.coverUrl, widget.showCover, widget.source])

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const currentRotation = preview?.rotation ?? widgetRotation(widget)
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const embed = buildVideoEmbed(widget, coverDismissed)
  const showCover = Boolean(
    widget.showCover && !widget.autoplay && !coverDismissed && embed?.coverUrl,
  )
  const title = widget.title?.trim() || videoProviderLabel(widget.provider)

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!transformEditing) return
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

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
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

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
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
      16,
      Math.max(
        4,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      12,
      Math.max(
        4,
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

  const handleRotateStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    rotateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: currentRotation,
      lastRotation: currentRotation,
    }
  }

  const handleRotateMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    const rotation = rotateFromPointerDelta(
      rotate.startRotation,
      rotate.startX,
      rotate.startY,
      event,
    )
    rotate.lastRotation = rotation
    setPreview((current) => ({ ...current, rotation }))
  }

  const handleRotateEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    onRotate(widget.id, rotate.lastRotation)
    rotateRef.current = null
    setPreview(null)
  }

  return (
    <section
      className={cn(
        'group absolute z-10 select-none overflow-visible rounded-xl bg-black text-white shadow-[0_18px_48px_rgba(0,0,0,0.38)]',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{
        left: currentX,
        top: currentY,
        width,
        height,
        transform: `rotate(${currentRotation}deg)`,
        transformOrigin: 'center center',
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <OsWidgetToolbar
        title={title}
        editable={editable}
        transformEditing={transformEditing}
        onBeginTransformEdit={beginTransformEdit}
        onApplyTransformEdit={applyTransformEdit}
        onCancelTransformEdit={cancelTransformEdit}
        actions={[
          {
            label: t('os.customizeWidget'),
            onClick: () => onEdit(widget),
          },
          {
            label: t('common.delete'),
            onClick: () => onDelete(widget.id),
            danger: true,
          },
        ]}
      />
      {transformEditing ? (
        <div
          className="absolute inset-0 z-20 cursor-grab rounded-xl bg-transparent active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        />
      ) : null}
      <div className="grid h-full w-full place-items-center overflow-hidden rounded-xl bg-black">
        {embed ? (
          <div className="relative h-full w-full overflow-hidden rounded-xl bg-black">
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
      <OsWidgetResizeHandle
        editable={transformEditing}
        label={t('os.resizeWidget')}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
      <OsWidgetRotateHandle
        editable={transformEditing}
        label={t('os.rotateWidget')}
        onPointerDown={handleRotateStart}
        onPointerMove={handleRotateMove}
        onPointerUp={handleRotateEnd}
        onPointerCancel={handleRotateEnd}
      />
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
  onRotate,
  onDelete,
  onEdit,
}: {
  widget: OsDesktopWebEmbedWidget
  serverId: string
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
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
  const rotateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startRotation: number
    lastRotation: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    heightCells?: number
    rotation?: number
  } | null>(null)
  const { transformEditing, beginTransformEdit, applyTransformEdit, cancelTransformEdit } =
    useWidgetTransformEditor({
      widget,
      editable,
      onMove,
      onResize,
      onRotate,
    })

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const currentRotation = preview?.rotation ?? widgetRotation(widget)
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const title =
    widget.title?.trim() ||
    (widget.sourceType === 'workspace-file' ? widget.workspaceFileName : null) ||
    t('os.webEmbedWidget')

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!transformEditing) return
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

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
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

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
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
      16,
      Math.max(
        4,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      12,
      Math.max(
        4,
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

  const handleRotateStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    rotateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: currentRotation,
      lastRotation: currentRotation,
    }
  }

  const handleRotateMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    const rotation = rotateFromPointerDelta(
      rotate.startRotation,
      rotate.startX,
      rotate.startY,
      event,
    )
    rotate.lastRotation = rotation
    setPreview((current) => ({ ...current, rotation }))
  }

  const handleRotateEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    onRotate(widget.id, rotate.lastRotation)
    rotateRef.current = null
    setPreview(null)
  }

  return (
    <section
      className={cn(
        'group absolute z-10 select-none overflow-visible rounded-xl bg-black text-white shadow-[0_18px_48px_rgba(0,0,0,0.38)]',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{
        left: currentX,
        top: currentY,
        width,
        height,
        transform: `rotate(${currentRotation}deg)`,
        transformOrigin: 'center center',
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <OsWidgetToolbar
        title={title}
        editable={editable}
        transformEditing={transformEditing}
        onBeginTransformEdit={beginTransformEdit}
        onApplyTransformEdit={applyTransformEdit}
        onCancelTransformEdit={cancelTransformEdit}
        actions={[
          {
            label: t('os.customizeWidget'),
            onClick: () => onEdit(widget),
          },
          {
            label: t('common.delete'),
            onClick: () => onDelete(widget.id),
            danger: true,
          },
        ]}
      />
      {transformEditing ? (
        <div
          className="absolute inset-0 z-20 cursor-grab rounded-xl bg-transparent active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        />
      ) : null}
      <div className="h-full w-full overflow-hidden rounded-xl bg-black">
        <OsWebEmbedWidgetContent widget={widget} serverId={serverId} />
      </div>
      <OsWidgetResizeHandle
        editable={transformEditing}
        label={t('os.resizeWidget')}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
      <OsWidgetRotateHandle
        editable={transformEditing}
        label={t('os.rotateWidget')}
        onPointerDown={handleRotateStart}
        onPointerMove={handleRotateMove}
        onPointerUp={handleRotateEnd}
        onPointerCancel={handleRotateEnd}
      />
    </section>
  )
}

function OsTypewriterWidget({
  widget,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onRotate,
  onDelete,
  onEdit,
}: {
  widget: OsDesktopTypewriterWidget
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onDelete: (id: string) => void
  onEdit: (widget: OsDesktopTypewriterWidget) => void
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
  const rotateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startRotation: number
    lastRotation: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    heightCells?: number
    rotation?: number
  } | null>(null)
  const [visibleLength, setVisibleLength] = useState(0)
  const { transformEditing, beginTransformEdit, applyTransformEdit, cancelTransformEdit } =
    useWidgetTransformEditor({
      widget,
      editable,
      onMove,
      onResize,
      onRotate,
    })

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const currentRotation = preview?.rotation ?? widgetRotation(widget)
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const content = widget.content || t('os.typewriterWidgetDefaultContent')
  const speedMs = clampTypewriterSpeedMs(widget.speedMs)
  const pauseMs = clampTypewriterPauseMs(widget.pauseMs)
  const color = normalizeTypewriterColor(widget.color, '#ffffff')
  const textStrokeColor = normalizeTypewriterColor(widget.textStrokeColor, '#000000')
  const textStrokeWidth = clampTypewriterStrokeWidth(widget.textStrokeWidth)
  const textStyle = {
    color,
    fontFamily: typewriterFontFamilyCss(widget.fontFamily),
    fontSize: clampTypewriterFontSize(widget.fontSize),
    lineHeight: 1.24,
    textShadow: typewriterTextShadowCss(widget.textShadow, color),
    WebkitTextStrokeWidth: textStrokeWidth ? `${textStrokeWidth}px` : undefined,
    WebkitTextStrokeColor: textStrokeWidth ? textStrokeColor : undefined,
  } satisfies CSSProperties

  useEffect(() => {
    setVisibleLength(0)
  }, [content, pauseMs, speedMs, widget.loop])

  useEffect(() => {
    let timeoutId: number | null = null
    if (visibleLength < content.length) {
      timeoutId = window.setTimeout(() => {
        setVisibleLength((current) => Math.min(content.length, current + 1))
      }, speedMs)
    } else if (widget.loop) {
      timeoutId = window.setTimeout(() => {
        setVisibleLength(0)
      }, pauseMs)
    }

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [content.length, pauseMs, speedMs, visibleLength, widget.loop])

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!transformEditing) return
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

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
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

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
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
      16,
      Math.max(
        4,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      12,
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

  const handleRotateStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    rotateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: currentRotation,
      lastRotation: currentRotation,
    }
  }

  const handleRotateMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    const rotation = rotateFromPointerDelta(
      rotate.startRotation,
      rotate.startX,
      rotate.startY,
      event,
    )
    rotate.lastRotation = rotation
    setPreview((current) => ({ ...current, rotation }))
  }

  const handleRotateEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    onRotate(widget.id, rotate.lastRotation)
    rotateRef.current = null
    setPreview(null)
  }

  return (
    <section
      className={cn(
        'group absolute z-10 select-none overflow-visible',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{
        left: currentX,
        top: currentY,
        width,
        height,
        transform: `rotate(${currentRotation}deg)`,
        transformOrigin: 'center center',
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <OsWidgetToolbar
        title={t('os.typewriterWidget')}
        editable={editable}
        transformEditing={transformEditing}
        onBeginTransformEdit={beginTransformEdit}
        onApplyTransformEdit={applyTransformEdit}
        onCancelTransformEdit={cancelTransformEdit}
        actions={[
          {
            label: t('os.customizeWidget'),
            onClick: () => onEdit(widget),
          },
          {
            label: t('common.delete'),
            onClick: () => onDelete(widget.id),
            danger: true,
          },
        ]}
      />
      <div
        className={cn(
          'h-full w-full overflow-hidden whitespace-pre-wrap break-words',
          transformEditing && 'cursor-grab active:cursor-grabbing',
        )}
        style={textStyle}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span>{content.slice(0, visibleLength)}</span>
        {widget.cursor ? (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-[1.05em] translate-y-[0.14em] border-r-2 border-current animate-pulse"
          />
        ) : null}
      </div>
      <OsWidgetResizeHandle
        editable={transformEditing}
        label={t('os.resizeWidget')}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
      <OsWidgetRotateHandle
        editable={transformEditing}
        label={t('os.rotateWidget')}
        onPointerDown={handleRotateStart}
        onPointerMove={handleRotateMove}
        onPointerUp={handleRotateEnd}
        onPointerCancel={handleRotateEnd}
      />
    </section>
  )
}

function OsChatInputWidgetEditorModal({
  initialValue,
  inboxes,
  open,
  onClose,
  onSubmit,
}: {
  initialValue: OsDesktopChatInputWidget
  inboxes: BuddyInboxEntry[]
  open: boolean
  onClose: () => void
  onSubmit: (values: ChatInputWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<ChatInputWidgetFormValues>(() =>
    chatInputWidgetFormFromWidget(initialValue),
  )

  useEffect(() => {
    if (!open) return
    setDraft(chatInputWidgetFormFromWidget(initialValue))
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open])

  const modeOptions: Array<{ value: OsChatInputWidgetMode; label: string }> = [
    { value: 'chat', label: t('os.chatInputModeChat') },
    { value: 'tasks', label: t('os.chatInputModeTasks') },
  ]
  const updateCompletionItem = (index: number, value: string) => {
    setDraft((current) => ({
      ...current,
      completionItems: current.completionItems.map((item, itemIndex) =>
        itemIndex === index ? value.slice(0, 200) : item,
      ),
    }))
  }
  const moveCompletionItem = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.completionItems.length) return current
      const completionItems = [...current.completionItems]
      const [item] = completionItems.splice(index, 1)
      if (!item) return current
      completionItems.splice(nextIndex, 0, item)
      return { ...current, completionItems }
    })
  }
  const removeCompletionItem = (index: number) => {
    setDraft((current) => ({
      ...current,
      completionItems: current.completionItems.filter((_, itemIndex) => itemIndex !== index),
    }))
  }
  const addCompletionItem = () => {
    setDraft((current) => {
      if (current.completionItems.length >= 12) return current
      return { ...current, completionItems: [...current.completionItems, ''] }
    })
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent className="z-[900] w-[min(92vw,520px)]">
        <ModalHeader
          icon={<MessageSquare size={18} />}
          title={t('os.editChatInputWidgetTitle')}
          closeLabel={t('common.close')}
        />
        <ModalBody className="space-y-4 py-5">
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-text-muted/70">
              {t('os.chatInputDefaultBuddyLabel')}
            </span>
            <select
              value={draft.defaultAgentId}
              className="h-11 w-full rounded-xl border border-border-subtle bg-bg-tertiary px-3 text-sm font-bold text-text-primary outline-none transition hover:border-primary/35 focus:border-primary/70"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  defaultAgentId: event.currentTarget.value,
                }))
              }
            >
              <option value="">{t('os.chatInputDefaultBuddyAuto')}</option>
              {inboxes.map((entry) => (
                <option key={entry.agent.id} value={entry.agent.id} className="bg-bg-primary">
                  {buddyDisplayName(entry)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-2">
            <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
              {t('os.chatInputDefaultModeLabel')}
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-1.5">
              {modeOptions.map((option) => {
                const active = draft.inboxViewMode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'flex h-9 items-center justify-center rounded-xl text-sm font-black transition',
                      active
                        ? 'bg-bg-primary text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-bg-primary/55 hover:text-text-primary',
                    )}
                    onClick={() =>
                      setDraft((current) => ({ ...current, inboxViewMode: option.value }))
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <Input
            ref={inputRef}
            label={t('os.chatInputPlaceholderLabel')}
            value={draft.placeholder}
            placeholder={t('os.chatInputPlaceholderSettingPlaceholder')}
            maxLength={240}
            onChange={(event) => {
              const placeholder = event.target.value.slice(0, 240)
              setDraft((current) => ({ ...current, placeholder }))
            }}
          />

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
                  {t('os.chatInputCompletionsLabel')}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-text-muted">
                  {t('os.chatInputCompletionsHelp')}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 gap-2"
                disabled={draft.completionItems.length >= 12}
                onClick={addCompletionItem}
              >
                <Plus size={15} />
                {t('os.chatInputAddCompletion')}
              </Button>
            </div>
            <div className="grid max-h-64 gap-2 overflow-y-auto rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-2">
              {draft.completionItems.length > 0 ? (
                draft.completionItems.map((item, index) => (
                  <div key={index} className="flex min-w-0 items-center gap-2">
                    <input
                      value={item}
                      maxLength={200}
                      placeholder={t('os.chatInputCompletionPlaceholder', {
                        index: index + 1,
                      })}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-border-subtle bg-bg-primary/78 px-3 text-sm font-semibold text-text-primary outline-none transition placeholder:text-text-muted/50 focus:border-primary/55 focus:ring-2 focus:ring-primary/10"
                      onChange={(event) => updateCompletionItem(index, event.currentTarget.value)}
                    />
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-bg-primary/70 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={index === 0}
                      title={t('os.chatInputMoveCompletionUp')}
                      aria-label={t('os.chatInputMoveCompletionUp')}
                      onClick={() => moveCompletionItem(index, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-bg-primary/70 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={index === draft.completionItems.length - 1}
                      title={t('os.chatInputMoveCompletionDown')}
                      aria-label={t('os.chatInputMoveCompletionDown')}
                      onClick={() => moveCompletionItem(index, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-danger/12 hover:text-danger"
                      title={t('os.chatInputRemoveCompletion')}
                      aria-label={t('os.chatInputRemoveCompletion')}
                      onClick={() => removeCompletionItem(index)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-3 py-5 text-center text-sm font-semibold text-text-muted">
                  {t('os.chatInputCompletionsEmpty')}
                </p>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={() => onSubmit(draft)}>
              {t('common.save')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function OsPhotoWidgetEditorModal({
  serverId,
  initialValue,
  open,
  onClose,
  onSubmit,
}: {
  serverId: string
  initialValue?: OsDesktopPhotoWidget | null
  open: boolean
  onClose: () => void
  onSubmit: (values: PhotoWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<PhotoWidgetFormValues>(DEFAULT_PHOTO_WIDGET_FORM)
  const [sourceTouched, setSourceTouched] = useState(false)
  const [sourceError, setSourceError] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(
      initialValue
        ? {
            sourceType: initialValue.sourceType,
            source: initialValue.source,
            title: initialValue.title ?? '',
            workspaceFileName: initialValue.workspaceFileName ?? '',
            aspectRatio: clampPhotoAspectRatio(initialValue.aspectRatio),
            rotation: clampPhotoRotation(initialValue.rotation),
          }
        : {
            ...DEFAULT_PHOTO_WIDGET_FORM,
            rotation: randomPhotoRotation(),
          },
    )
    setSourceTouched(false)
    setSourceError(false)
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open])

  useEffect(() => {
    if (!open) return
    const source = draft.source.trim()
    if (!source) {
      setPreviewImageUrl(null)
      return
    }

    if (draft.sourceType === 'url') {
      setPreviewImageUrl(source)
      return
    }

    let cancelled = false
    setPreviewImageUrl(null)
    fetchWorkspaceFileMediaUrl(serverId, source)
      .then((url) => {
        if (!cancelled) setPreviewImageUrl(url)
      })
      .catch(() => {
        if (!cancelled) setPreviewImageUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [draft.source, draft.sourceType, open, serverId])

  const updateSourceType = (sourceType: OsPhotoWidgetSourceType) => {
    setSourceTouched(false)
    setSourceError(false)
    setDraft((current) => ({
      ...current,
      sourceType,
      source: sourceType === current.sourceType ? current.source : '',
      workspaceFileName: sourceType === current.sourceType ? current.workspaceFileName : '',
    }))
    if (sourceType === 'url') {
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    }
  }

  const handlePickerConfirm = async (result: PickerResult) => {
    if (!workspaceNodeIsImage(result.node)) {
      setSourceTouched(true)
      setSourceError(true)
      return
    }

    setIsResolving(true)
    try {
      const mediaUrl = await fetchWorkspaceFileMediaUrl(serverId, result.node.id)
      const aspectRatio = await loadImageAspectRatio(mediaUrl)
      setShowPicker(false)
      setSourceTouched(false)
      setSourceError(false)
      setDraft((current) => ({
        ...current,
        sourceType: 'workspace-file',
        source: result.node.id,
        title: current.title.trim() || result.node.name,
        workspaceFileName: result.node.name,
        aspectRatio,
      }))
    } catch {
      setSourceTouched(true)
      setSourceError(true)
    } finally {
      setIsResolving(false)
    }
  }

  const handleUpload = async (file: File) => {
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}`.toLowerCase() : ''
    if (!file.type.startsWith('image/') && !PHOTO_WIDGET_EXTENSIONS.includes(ext)) {
      setSourceTouched(true)
      setSourceError(true)
      return
    }

    setIsResolving(true)
    setSourceError(false)
    const localUrl = URL.createObjectURL(file)
    try {
      const aspectRatio = await loadImageAspectRatio(localUrl)
      const form = new FormData()
      form.set('file', file)
      const node = await fetchApi<WorkspaceNode>(`/api/servers/${serverId}/workspace/upload`, {
        method: 'POST',
        body: form,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-tree', serverId] }),
        queryClient.invalidateQueries({ queryKey: ['os-workspace-root', serverId] }),
      ])
      setSourceTouched(false)
      setDraft((current) => ({
        ...current,
        sourceType: 'workspace-file',
        source: node.id,
        title: current.title.trim() || node.name,
        workspaceFileName: node.name,
        aspectRatio,
      }))
    } catch {
      setSourceTouched(true)
      setSourceError(true)
    } finally {
      URL.revokeObjectURL(localUrl)
      setIsResolving(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const submit = async () => {
    setSourceTouched(true)
    setSourceError(false)
    const source = draft.source.trim()
    if (!source) {
      setSourceError(true)
      return
    }

    setIsResolving(true)
    try {
      const aspectRatio =
        draft.sourceType === 'url'
          ? await loadImageAspectRatio(source)
          : clampPhotoAspectRatio(draft.aspectRatio)
      onSubmit({ ...draft, source, aspectRatio, rotation: clampPhotoRotation(draft.rotation) })
    } catch {
      setSourceError(true)
    } finally {
      setIsResolving(false)
    }
  }

  const showSourceError = sourceTouched && sourceError

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <ModalContent className="z-[900] w-[min(92vw,520px)]">
          <ModalHeader
            icon={<ImageIcon size={18} />}
            title={initialValue ? t('os.editPhotoWidgetTitle') : t('os.addPhotoWidgetTitle')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-4 py-5">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-1.5">
              {[
                { type: 'url' as const, label: t('os.photoWidgetSourceUrl'), icon: Globe },
                {
                  type: 'workspace-file' as const,
                  label: t('os.photoWidgetSourceWorkspace'),
                  icon: ImageIcon,
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
                    onClick={() => updateSourceType(item.type)}
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
                label={t('os.photoWidgetImageUrl')}
                value={draft.source}
                placeholder={t('os.photoWidgetImageUrlPlaceholder')}
                onBlur={() => setSourceTouched(true)}
                onChange={(event) => {
                  const source = event.target.value
                  setSourceError(false)
                  setDraft((current) => ({ ...current, source }))
                }}
              />
            ) : (
              <div className="grid gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
                  {t('os.photoWidgetWorkspaceFile')}
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <button
                    type="button"
                    className="flex h-11 min-w-0 items-center gap-3 rounded-xl border border-border-subtle bg-bg-tertiary px-3 text-left text-sm font-bold text-text-primary transition hover:border-primary/40 hover:text-primary"
                    onClick={() => setShowPicker(true)}
                  >
                    <FolderOpen size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {draft.workspaceFileName || t('os.photoWidgetChooseWorkspaceFile')}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isResolving}
                    onClick={() => fileInputRef.current?.click()}
                    className="justify-center gap-2 font-bold"
                  >
                    <Upload size={16} />
                    {t('os.photoWidgetUpload')}
                  </Button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) void handleUpload(file)
              }}
            />

            {showSourceError ? (
              <p className="-mt-2 text-xs font-bold text-danger">
                {t('os.photoWidgetInvalidSource')}
              </p>
            ) : null}

            <Input
              label={t('os.photoWidgetTitle')}
              value={draft.title}
              placeholder={t('os.photoWidget')}
              onChange={(event) => {
                const title = event.target.value
                setDraft((current) => ({ ...current, title }))
              }}
            />

            <div className="grid min-h-[190px] place-items-center overflow-hidden rounded-2xl border border-border-subtle bg-bg-tertiary/70 px-4 py-5">
              <div
                className="w-[min(220px,78vw)] bg-white p-[10px] pb-5 shadow-[5px_15px_25px_rgba(0,0,0,0.34)] transition-transform duration-200"
                style={{
                  transform: `rotate(${clampPhotoRotation(draft.rotation)}deg)`,
                }}
              >
                <div
                  className="relative overflow-hidden bg-[#eee]"
                  style={{ aspectRatio: clampPhotoAspectRatio(draft.aspectRatio) }}
                >
                  {previewImageUrl ? (
                    <img
                      src={previewImageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-slate-400">
                      <ImageIcon size={26} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <label className="grid gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.photoWidgetRotation')}</span>
                <span className="font-mono text-xs text-text-muted">
                  {Math.round(draft.rotation)}°
                </span>
              </span>
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={draft.rotation}
                onChange={(event) => {
                  const rotation = clampPhotoRotation(Number(event.currentTarget.value))
                  setDraft((current) => ({
                    ...current,
                    rotation,
                  }))
                }}
              />
            </label>
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button type="button" variant="ghost" onClick={onClose} disabled={isResolving}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void submit()}
                loading={isResolving}
              >
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
          title={t('os.photoWidgetWorkspacePickerTitle')}
          accept={PHOTO_WIDGET_EXTENSIONS}
          overlayClassName="z-[940]"
          onConfirm={(result) => void handlePickerConfirm(result)}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
    </>
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
    widthCells: 8,
    heightCells: 6,
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
            onChange={(event) => {
              const source = event.target.value
              setDraft((current) => ({ ...current, source }))
            }}
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
            onChange={(event) => {
              const title = event.target.value
              setDraft((current) => ({ ...current, title }))
            }}
          />
          <Input
            label={t('os.videoWidgetCoverUrl')}
            value={draft.coverUrl}
            placeholder={t('os.videoWidgetCoverUrlPlaceholder')}
            onChange={(event) => {
              const coverUrl = event.target.value
              setDraft((current) => ({ ...current, coverUrl }))
            }}
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
                onChange={(event) => {
                  const source = event.target.value
                  setDraft((current) => ({ ...current, source }))
                }}
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
              onChange={(event) => {
                const title = event.target.value
                setDraft((current) => ({ ...current, title }))
              }}
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

function OsTypewriterWidgetEditorModal({
  initialValue,
  open,
  onClose,
  onSubmit,
}: {
  initialValue?: OsDesktopTypewriterWidget | null
  open: boolean
  onClose: () => void
  onSubmit: (values: TypewriterWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState<TypewriterWidgetFormValues>({
    content: '',
    speedMs: 160,
    pauseMs: 1800,
    loop: true,
    cursor: true,
    fontFamily: 'handwriting',
    fontSize: 64,
    color: '#ffffff',
    textShadow: 'soft',
    textStrokeWidth: 0,
    textStrokeColor: '#000000',
  })

  useEffect(() => {
    if (!open) return
    setDraft(
      initialValue
        ? {
            content: initialValue.content,
            speedMs: clampTypewriterSpeedMs(initialValue.speedMs),
            pauseMs: clampTypewriterPauseMs(initialValue.pauseMs),
            loop: initialValue.loop !== false,
            cursor: initialValue.cursor !== false,
            fontFamily: initialValue.fontFamily,
            fontSize: clampTypewriterFontSize(initialValue.fontSize),
            color: normalizeTypewriterColor(initialValue.color, '#ffffff'),
            textShadow: initialValue.textShadow,
            textStrokeWidth: clampTypewriterStrokeWidth(initialValue.textStrokeWidth),
            textStrokeColor: normalizeTypewriterColor(initialValue.textStrokeColor, '#000000'),
          }
        : {
            content: t('os.typewriterWidgetDefaultContent'),
            speedMs: 160,
            pauseMs: 1800,
            loop: true,
            cursor: true,
            fontFamily: 'handwriting',
            fontSize: 64,
            color: '#ffffff',
            textShadow: 'soft',
            textStrokeWidth: 0,
            textStrokeColor: '#000000',
          },
    )
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open, t])

  const submit = () => {
    onSubmit({
      ...draft,
      speedMs: clampTypewriterSpeedMs(draft.speedMs),
      pauseMs: clampTypewriterPauseMs(draft.pauseMs),
    })
  }

  const updateNumber = (
    key: 'speedMs' | 'pauseMs' | 'fontSize' | 'textStrokeWidth',
    value: number,
  ) => {
    setDraft((current) => ({
      ...current,
      [key]:
        key === 'speedMs'
          ? clampTypewriterSpeedMs(value)
          : key === 'pauseMs'
            ? clampTypewriterPauseMs(value)
            : key === 'fontSize'
              ? clampTypewriterFontSize(value)
              : clampTypewriterStrokeWidth(value),
    }))
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent className="z-[900] w-[min(92vw,560px)]">
        <ModalHeader
          icon={<Keyboard size={18} />}
          title={
            initialValue ? t('os.editTypewriterWidgetTitle') : t('os.addTypewriterWidgetTitle')
          }
          closeLabel={t('common.close')}
        />
        <ModalBody className="space-y-4 py-5">
          <label className="grid gap-2 text-sm font-bold text-text-primary">
            <span>{t('os.typewriterWidgetContent')}</span>
            <textarea
              ref={textareaRef}
              value={draft.content}
              placeholder={t('os.typewriterWidgetContentPlaceholder')}
              maxLength={4000}
              className="min-h-[150px] resize-y rounded-xl border border-border-subtle bg-bg-tertiary px-3 py-2 font-mono text-sm leading-6 text-text-primary outline-none transition placeholder:text-text-muted/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              onChange={(event) => {
                const content = event.currentTarget.value
                setDraft((current) => ({ ...current, content }))
              }}
            />
          </label>

          <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
              {t('os.typewriterWidgetTypography')}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TYPEWRITER_FONT_FAMILIES.map((fontFamily) => {
                const active = draft.fontFamily === fontFamily
                return (
                  <button
                    key={fontFamily}
                    type="button"
                    className={cn(
                      'h-9 rounded-xl px-2 text-sm font-black transition',
                      active
                        ? 'bg-bg-primary text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-bg-primary/55 hover:text-text-primary',
                    )}
                    onClick={() => setDraft((current) => ({ ...current, fontFamily }))}
                  >
                    {t(
                      `os.typewriterWidgetFont${fontFamily.charAt(0).toUpperCase()}${fontFamily.slice(1)}`,
                    )}
                  </button>
                )
              })}
            </div>
            <label className="grid gap-2 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.typewriterWidgetFontSize')}</span>
                <span className="font-mono text-xs text-text-muted">{draft.fontSize}px</span>
              </span>
              <input
                type="range"
                min={12}
                max={96}
                step={1}
                value={draft.fontSize}
                onChange={(event) => updateNumber('fontSize', Number(event.currentTarget.value))}
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
              {t('os.typewriterWidgetStyle')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-text-primary">
                <span>{t('os.typewriterWidgetColor')}</span>
                <input
                  type="color"
                  value={draft.color}
                  className="h-10 w-full cursor-pointer rounded-xl border border-border-subtle bg-bg-primary p-1"
                  onChange={(event) => {
                    const color = event.currentTarget.value
                    setDraft((current) => ({ ...current, color }))
                  }}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-text-primary">
                <span>{t('os.typewriterWidgetStrokeColor')}</span>
                <input
                  type="color"
                  value={draft.textStrokeColor}
                  className="h-10 w-full cursor-pointer rounded-xl border border-border-subtle bg-bg-primary p-1"
                  onChange={(event) => {
                    const textStrokeColor = event.currentTarget.value
                    setDraft((current) => ({
                      ...current,
                      textStrokeColor,
                    }))
                  }}
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.typewriterWidgetStrokeWidth')}</span>
                <span className="font-mono text-xs text-text-muted">{draft.textStrokeWidth}px</span>
              </span>
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={draft.textStrokeWidth}
                onChange={(event) =>
                  updateNumber('textStrokeWidth', Number(event.currentTarget.value))
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TYPEWRITER_TEXT_SHADOWS.map((textShadow) => {
                const active = draft.textShadow === textShadow
                return (
                  <button
                    key={textShadow}
                    type="button"
                    className={cn(
                      'h-9 rounded-xl px-2 text-sm font-black transition',
                      active
                        ? 'bg-bg-primary text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-bg-primary/55 hover:text-text-primary',
                    )}
                    onClick={() => setDraft((current) => ({ ...current, textShadow }))}
                  >
                    {t(
                      `os.typewriterWidgetShadow${textShadow.charAt(0).toUpperCase()}${textShadow.slice(1)}`,
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            <label className="grid gap-2 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.typewriterWidgetSpeed')}</span>
                <span className="font-mono text-xs text-text-muted">{draft.speedMs}ms</span>
              </span>
              <input
                type="range"
                min={15}
                max={240}
                step={5}
                value={draft.speedMs}
                onChange={(event) => updateNumber('speedMs', Number(event.currentTarget.value))}
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.typewriterWidgetPause')}</span>
                <span className="font-mono text-xs text-text-muted">{draft.pauseMs}ms</span>
              </span>
              <input
                type="range"
                min={500}
                max={8000}
                step={100}
                value={draft.pauseMs}
                onChange={(event) => updateNumber('pauseMs', Number(event.currentTarget.value))}
              />
            </label>
          </div>

          <div className="grid gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            {[
              {
                key: 'loop' as const,
                label: t('os.typewriterWidgetLoop'),
              },
              {
                key: 'cursor' as const,
                label: t('os.typewriterWidgetCursor'),
              },
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

export function OsDesktop({
  items,
  widgets,
  inboxes,
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
  onCreateChatInputWidget,
  onCreateTypewriterWidget,
  onCreatePhotoWidget,
  onCreateVideoWidget,
  onCreateWebEmbedWidget,
  onMoveWidget,
  onResizeWidget,
  onRotateWidget,
  onUpdateStickyNote,
  onUpdateChatInputWidget,
  onUpdateTypewriterWidget,
  onUpdatePhotoWidget,
  onUpdateVideoWidget,
  onUpdateWebEmbedWidget,
  onDeleteWidget,
  onOpenWallpaperSettings,
  wallpaperInteractive = false,
}: {
  items: OsDesktopItem[]
  widgets: OsDesktopWidget[]
  inboxes: BuddyInboxEntry[]
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
  onCreateChatInputWidget: (point: { x: number; y: number }) => void
  onCreateTypewriterWidget: (
    point: { x: number; y: number },
    input: Omit<
      OsDesktopTypewriterWidget,
      'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onCreatePhotoWidget: (
    point: { x: number; y: number },
    input: Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'>,
  ) => void
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
  onRotateWidget: (id: string, rotation: number) => void
  onUpdateStickyNote: (id: string, content: string) => void
  onUpdateChatInputWidget: (
    id: string,
    input: Partial<
      Pick<
        OsDesktopChatInputWidget,
        'defaultAgentId' | 'inboxViewMode' | 'placeholder' | 'completionItems'
      >
    >,
  ) => void
  onUpdateTypewriterWidget: (
    id: string,
    input: Omit<
      OsDesktopTypewriterWidget,
      'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onUpdatePhotoWidget: (
    id: string,
    input: Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'>,
  ) => void
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
  const [chatInputWidgetEditor, setChatInputWidgetEditor] = useState<{
    widget: OsDesktopChatInputWidget
  } | null>(null)
  const [photoWidgetEditor, setPhotoWidgetEditor] = useState<{
    point?: { x: number; y: number }
    widget?: OsDesktopPhotoWidget
  } | null>(null)
  const [typewriterWidgetEditor, setTypewriterWidgetEditor] = useState<{
    point?: { x: number; y: number }
    widget?: OsDesktopTypewriterWidget
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
        snapDesktopIconPoint({
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
      snapDesktopIconPoint({
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
    const targetPoint = snapDesktopIconPoint({ x: drag.lastX, y: drag.lastY })
    const targetCell = desktopIconCellKey(targetPoint)
    const startCell = desktopIconCellKey({ x: drag.startX, y: drag.startY })
    const swapItem = items.find(
      (item) => item.id !== drag.id && desktopIconCellKey({ x: item.x, y: item.y }) === targetCell,
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
              point: snapDesktopIconPoint({ x: drag.startX, y: drag.startY }),
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
                      icon: ImageIcon,
                      label: t('os.photoWidget'),
                      onClick: () =>
                        setPhotoWidgetEditor({
                          point: snapDesktopPoint({
                            x: desktopContextMenu.x - DESKTOP_ICON_WIDTH / 2,
                            y: desktopContextMenu.y - DESKTOP_ICON_HEIGHT / 2,
                          }),
                        }),
                    },
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
                      icon: MessageSquare,
                      label: t('os.chatInputWidget'),
                      onClick: () =>
                        onCreateChatInputWidget(
                          snapDesktopPoint({
                            x: desktopContextMenu.x - DESKTOP_ICON_WIDTH / 2,
                            y: desktopContextMenu.y - DESKTOP_ICON_HEIGHT / 2,
                          }),
                        ),
                    },
                    {
                      icon: Keyboard,
                      label: t('os.typewriterWidget'),
                      onClick: () =>
                        setTypewriterWidgetEditor({
                          point: snapDesktopPoint({
                            x: desktopContextMenu.x - DESKTOP_ICON_WIDTH / 2,
                            y: desktopContextMenu.y - DESKTOP_ICON_HEIGHT / 2,
                          }),
                        }),
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
    onCreateChatInputWidget,
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
            onRotate={onRotateWidget}
            onUpdate={onUpdateStickyNote}
            onDelete={onDeleteWidget}
            onOpenMention={onOpenMention}
          />
        ) : widget.kind === 'photo' ? (
          <OsPhotoWidget
            key={widget.id}
            widget={widget}
            serverId={serverId}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onDelete={onDeleteWidget}
            onEdit={(target) => setPhotoWidgetEditor({ widget: target })}
          />
        ) : widget.kind === 'chat-input' ? (
          <OsChatInputWidget
            key={widget.id}
            widget={widget}
            serverId={serverId}
            inboxes={inboxes}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onDelete={onDeleteWidget}
            onEdit={(target) => setChatInputWidgetEditor({ widget: target })}
          />
        ) : widget.kind === 'typewriter' ? (
          <OsTypewriterWidget
            key={widget.id}
            widget={widget}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onDelete={onDeleteWidget}
            onEdit={(target) => setTypewriterWidgetEditor({ widget: target })}
          />
        ) : widget.kind === 'video-player' ? (
          <OsVideoWidget
            key={widget.id}
            widget={widget}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
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
            onRotate={onRotateWidget}
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
      {chatInputWidgetEditor ? (
        <OsChatInputWidgetEditorModal
          initialValue={chatInputWidgetEditor.widget}
          inboxes={inboxes}
          open
          onClose={() => setChatInputWidgetEditor(null)}
          onSubmit={(values) => {
            onUpdateChatInputWidget(
              chatInputWidgetEditor.widget.id,
              chatInputWidgetFromForm(values),
            )
            setChatInputWidgetEditor(null)
          }}
        />
      ) : null}
      {photoWidgetEditor ? (
        <OsPhotoWidgetEditorModal
          serverId={serverId}
          initialValue={photoWidgetEditor.widget}
          open
          onClose={() => setPhotoWidgetEditor(null)}
          onSubmit={(values) => {
            const input = photoWidgetFromForm(values)
            if (!input) return
            if (photoWidgetEditor.widget) {
              onUpdatePhotoWidget(photoWidgetEditor.widget.id, input)
            } else if (photoWidgetEditor.point) {
              onCreatePhotoWidget(photoWidgetEditor.point, input)
            }
            setPhotoWidgetEditor(null)
          }}
        />
      ) : null}
      {typewriterWidgetEditor ? (
        <OsTypewriterWidgetEditorModal
          initialValue={typewriterWidgetEditor.widget}
          open
          onClose={() => setTypewriterWidgetEditor(null)}
          onSubmit={(values) => {
            const input = typewriterWidgetFromForm(values)
            if (typewriterWidgetEditor.widget) {
              onUpdateTypewriterWidget(typewriterWidgetEditor.widget.id, input)
            } else if (typewriterWidgetEditor.point) {
              onCreateTypewriterWidget(typewriterWidgetEditor.point, input)
            }
            setTypewriterWidgetEditor(null)
          }}
        />
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
