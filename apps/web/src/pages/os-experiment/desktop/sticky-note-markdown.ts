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
  Maximize2,
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
  memo,
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
import { MessageInput } from '../../../components/chat/message-input'
import { ContextMenu, type ContextMenuGroup } from '../../../components/common/context-menu'
import { getFileTypeVisual } from '../../../components/common/file-type-visual'
import {
  buildWorkspaceContextMenuGroups,
  workspaceContextMenuLabels,
} from '../../../components/workspace/WorkspaceContextMenu'
import {
  type PickerResult,
  WorkspaceFilePicker,
} from '../../../components/workspace/WorkspaceFilePicker'
import { fetchApi } from '../../../lib/api'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { OsBuiltinAppIcon } from '../builtin-icons'
import { AppIcon } from '../components'
import { OsHtmlWallpaperFrame } from '../html-wallpaper-frame'
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
} from '../types'
import { buddyDisplayName, OS_TOP_BAR_HEIGHT, OS_WORKSPACE_NODE_DRAG_TYPE } from '../utils'

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
export const STICKY_NOTE_MARKDOWN_STYLE = `
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
          kind: 'space-app',
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

export function renderStickyNoteMarkdown(
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
