import type { MessageMention } from '@shadowob/shared'
import { buildMentionMarkdownLinks } from '@shadowob/shared'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { Check, Copy } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { EnrichedMarkdownText, type MarkdownStyle } from 'react-native-enriched-markdown'
import { serverChannelHref } from '../../lib/routes'
import { showToast } from '../../lib/toast'
import { useChatStore } from '../../stores/chat.store'
import type { ColorTokens } from '../../theme'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../theme'

// ----- Code block parsing -----

interface TextSegment {
  type: 'text'
  content: string
}
interface CodeSegment {
  type: 'code'
  content: string
  language?: string
}
type Segment = TextSegment | CodeSegment

const CODE_FENCE_RE = /^```(\w*)\n([\s\S]*?)\n```$/gm

function parseSegments(markdown: string): Segment[] {
  const segments: Segment[] = []
  let lastIndex = 0
  for (const match of markdown.matchAll(CODE_FENCE_RE)) {
    const idx = match.index!
    if (idx > lastIndex) {
      const text = markdown.slice(lastIndex, idx)
      if (text.trim()) segments.push({ type: 'text', content: text })
    }
    segments.push({ type: 'code', content: match[2]!, language: match[1] || undefined })
    lastIndex = idx + match[0].length
  }
  if (lastIndex < markdown.length) {
    const text = markdown.slice(lastIndex)
    if (text.trim()) segments.push({ type: 'text', content: text })
  }
  return segments
}

// ----- Code block with copy button -----

function CodeBlock({
  code,
  language,
  colors,
}: {
  code: string
  language?: string
  colors: ColorTokens
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code)
    setCopied(true)
    showToast(t('chat.copied'), 'success')
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }, [code, t])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return (
    <View
      style={[
        codeStyles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[codeStyles.header, { borderBottomColor: colors.border }]}>
        <Text style={[codeStyles.language, { color: colors.textMuted }]}>{language || 'code'}</Text>
        <Pressable onPress={handleCopy} hitSlop={8} style={codeStyles.copyBtn}>
          {copied ? (
            <Check size={iconSize.sm} color={colors.success} />
          ) : (
            <Copy size={iconSize.sm} color={colors.textMuted} />
          )}
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={codeStyles.scrollView}>
        <Text style={[codeStyles.code, { color: colors.text }]} selectable>
          {code}
        </Text>
      </ScrollView>
    </View>
  )
}

const codeStyles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.tight,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  language: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  copyBtn: {
    padding: spacing.xs,
  },
  scrollView: {
    padding: spacing.md,
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: fontSize.sm,
    lineHeight: lineHeight.xs,
  },
})

// ----- Main renderer -----

interface MarkdownRendererProps {
  content: string
  mentionMap?: Map<string, string>
  mentions?: MessageMention[]
  selectable?: boolean
}

export function MarkdownRenderer({
  content,
  mentionMap,
  mentions = [],
  selectable = true,
}: MarkdownRendererProps) {
  const colors = useColors()
  const router = useRouter()
  const setActiveServer = useChatStore((s) => s.setActiveServer)

  // Pre-process @mentions into markdown links
  const processedContent = useMemo(() => {
    if (!content || content === '\u200B') return ''
    const structured = buildMentionMarkdownLinks(content, mentions, (mention) => {
      if (mention.kind === 'channel' && mention.channelId && mention.serverId) {
        return `shadow-channel://${mention.serverSlug || mention.serverId}/${mention.channelId}`
      }
      if (mention.kind === 'server' && mention.serverId) {
        return `shadow-server://${mention.serverSlug || mention.serverId}`
      }
      if ((mention.kind === 'user' || mention.kind === 'buddy') && mention.userId) {
        return `mention://${mention.userId}`
      }
      return null
    }).markdown

    return structured.replace(/(^|[^\[])@(\w+)/g, (_match, prefix, username) => {
      const userId = mentionMap?.get(username)
      if (userId) return `${prefix}[@${username}](mention://${userId})`
      return `${prefix}**@${username}**`
    })
  }, [content, mentionMap, mentions])

  // Parse into segments
  const segments = useMemo(() => parseSegments(processedContent), [processedContent])
  const hasCodeBlocks = segments.some((s) => s.type === 'code')

  const markdownStyle = useMemo<MarkdownStyle>(
    () => ({
      paragraph: {
        color: colors.text,
        fontSize: fontSize.md,
        lineHeight: lineHeight.md,
        marginTop: spacing.none,
        marginBottom: spacing.xxs,
      },
      h1: {
        color: colors.text,
        fontSize: fontSize.xl,
        fontWeight: '700',
        marginTop: spacing.sm,
        marginBottom: spacing.xs,
      },
      h2: {
        color: colors.text,
        fontSize: fontSize.xl,
        fontWeight: '700',
        marginTop: spacing.tight,
        marginBottom: spacing.xs,
      },
      h3: {
        color: colors.text,
        fontSize: fontSize.lg,
        fontWeight: '600',
        marginTop: spacing.xs,
        marginBottom: spacing.xxs,
      },
      h4: {
        color: colors.text,
        fontSize: fontSize.md,
        fontWeight: '600',
        marginTop: spacing.xs,
        marginBottom: spacing.xxs,
      },
      h5: {
        color: colors.text,
        fontSize: fontSize.md,
        fontWeight: '600',
        marginTop: spacing.xxs,
        marginBottom: spacing.xxs,
      },
      h6: {
        color: colors.text,
        fontSize: fontSize.sm,
        fontWeight: '600',
        marginTop: spacing.xxs,
        marginBottom: spacing.xxs,
      },
      strong: { fontWeight: 'bold' },
      em: { fontStyle: 'italic' },
      strikethrough: { color: colors.textMuted },
      link: { color: colors.primary, underline: true },
      blockquote: {
        color: colors.text,
        borderColor: colors.primary,
        borderWidth: border.active,
        gapWidth: spacing.md,
        backgroundColor: colors.inputBackground,
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
      },
      code: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: fontSize.sm,
        backgroundColor: colors.surface,
        color: colors.primary,
        borderColor: colors.border,
      },
      codeBlock: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: fontSize.sm,
        backgroundColor: colors.surface,
        color: colors.text,
        padding: spacing.md,
        borderRadius: radius.md,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
        lineHeight: lineHeight.xs,
      },
      list: {
        color: colors.text,
        fontSize: fontSize.md,
        lineHeight: lineHeight.md,
        marginTop: spacing.xxs,
        marginBottom: spacing.xxs,
        bulletColor: colors.textMuted,
        markerColor: colors.textMuted,
      },
      taskList: {
        checkedColor: colors.primary,
        borderColor: colors.textMuted,
        checkmarkColor: palette.white,
        checkedStrikethrough: true,
        checkedTextColor: colors.textMuted,
      },
      table: {
        fontSize: fontSize.sm,
        color: colors.text,
        borderColor: colors.border,
        borderRadius: radius.sm,
        headerBackgroundColor: colors.surface,
        headerTextColor: colors.text,
        headerFontFamily: Platform.OS === 'ios' ? 'System-Bold' : 'sans-serif-medium',
        rowEvenBackgroundColor: colors.background,
        rowOddBackgroundColor: colors.inputBackground,
        cellPaddingHorizontal: 8,
        cellPaddingVertical: 6,
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
      },
      thematicBreak: {
        color: colors.border,
        height: border.hairline,
        marginTop: spacing.sm,
        marginBottom: spacing.sm,
      },
      image: {
        borderRadius: radius.md,
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
      },
    }),
    [colors],
  )

  const handleLinkPress = useCallback(
    ({ url }: { url: string }) => {
      if (url.startsWith('mention://')) {
        const userId = url.replace('mention://', '')
        router.push(`/(main)/profile/${userId}` as never)
        return
      }
      if (url.startsWith('shadow-channel://')) {
        const path = url.replace('shadow-channel://', '')
        const [serverIdOrSlug, channelId] = path.split('/')
        if (serverIdOrSlug && channelId) {
          router.push(serverChannelHref(serverIdOrSlug, channelId) as never)
        }
        return
      }
      if (url.startsWith('shadow-server://')) {
        const serverIdOrSlug = url.replace('shadow-server://', '')
        if (serverIdOrSlug) {
          setActiveServer(serverIdOrSlug)
          router.push('/(main)' as never)
        }
        return
      }
      // Open external URLs in webview previewer
      if (url.startsWith('http://') || url.startsWith('https://')) {
        router.push({
          pathname: '/(main)/webview-preview',
          params: {
            url: encodeURIComponent(url),
          },
        })
        return
      }
      // Handle other schemes (tel:, mailto:, etc.) with system
      Linking.openURL(url)
    },
    [router],
  )

  if (!processedContent) return null

  // No code blocks — render directly (more efficient, single native view)
  if (!hasCodeBlocks) {
    return (
      <EnrichedMarkdownText
        markdown={processedContent}
        markdownStyle={markdownStyle}
        selectable={selectable}
        flavor="github"
        onLinkPress={handleLinkPress}
      />
    )
  }

  // Hybrid rendering: code blocks get custom copy-button component
  const seenKeys = new Map<string, number>()

  return (
    <View>
      {segments.map((segment) => {
        const baseKey =
          segment.type === 'code'
            ? `code-${segment.language || 'plain'}-${segment.content.length}-${segment.content.slice(0, 32)}`
            : `text-${segment.content.length}-${segment.content.slice(0, 32)}`
        const duplicateIndex = seenKeys.get(baseKey) ?? 0
        seenKeys.set(baseKey, duplicateIndex + 1)
        const key = `${baseKey}-${duplicateIndex}`

        if (segment.type === 'code') {
          return (
            <CodeBlock
              key={key}
              code={segment.content}
              language={segment.language}
              colors={colors}
            />
          )
        }
        return (
          <EnrichedMarkdownText
            key={key}
            markdown={segment.content}
            markdownStyle={markdownStyle}
            selectable={selectable}
            flavor="github"
            onLinkPress={handleLinkPress}
          />
        )
      })}
    </View>
  )
}
