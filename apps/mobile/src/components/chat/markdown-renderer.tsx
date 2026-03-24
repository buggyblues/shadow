import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { Check, Copy } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { EnrichedMarkdownText, type MarkdownStyle } from 'react-native-enriched-markdown'
import { showToast } from '../../lib/toast'
import type { ColorTokens } from '../../theme'
import { useColors } from '../../theme'

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
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code)
    setCopied(true)
    showToast('已复制', 'success')
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }, [code])

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
            <Check size={14} color={colors.success} />
          ) : (
            <Copy size={14} color={colors.textMuted} />
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
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: 4,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  language: {
    fontSize: 12,
    fontWeight: '500',
  },
  copyBtn: {
    padding: 4,
  },
  scrollView: {
    padding: 12,
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
})

// ----- Main renderer -----

interface MarkdownRendererProps {
  content: string
  mentionMap?: Map<string, string>
  selectable?: boolean
}

export function MarkdownRenderer({
  content,
  mentionMap,
  selectable = true,
}: MarkdownRendererProps) {
  const colors = useColors()
  const router = useRouter()

  // Pre-process @mentions into markdown links
  const processedContent = useMemo(() => {
    if (!content || content === '\u200B') return ''
    return content.replace(/@(\w+)/g, (_match, username) => {
      const userId = mentionMap?.get(username)
      if (userId) return `[@${username}](mention://${userId})`
      return `**@${username}**`
    })
  }, [content, mentionMap])

  // Parse into segments
  const segments = useMemo(() => parseSegments(processedContent), [processedContent])
  const hasCodeBlocks = segments.some((s) => s.type === 'code')

  const markdownStyle = useMemo<MarkdownStyle>(
    () => ({
      paragraph: {
        color: colors.text,
        fontSize: 15,
        lineHeight: 22,
        marginTop: 0,
        marginBottom: 2,
      },
      h1: {
        color: colors.text,
        fontSize: 22,
        fontWeight: '700',
        marginTop: 8,
        marginBottom: 4,
      },
      h2: {
        color: colors.text,
        fontSize: 20,
        fontWeight: '700',
        marginTop: 6,
        marginBottom: 4,
      },
      h3: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '600',
        marginTop: 5,
        marginBottom: 3,
      },
      h4: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '600',
        marginTop: 4,
        marginBottom: 2,
      },
      h5: {
        color: colors.text,
        fontSize: 15,
        fontWeight: '600',
        marginTop: 3,
        marginBottom: 2,
      },
      h6: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '600',
        marginTop: 2,
        marginBottom: 2,
      },
      strong: { fontWeight: 'bold' },
      em: { fontStyle: 'italic' },
      strikethrough: { color: colors.textMuted },
      link: { color: colors.primary, underline: true },
      blockquote: {
        color: colors.text,
        borderColor: colors.primary,
        borderWidth: 3,
        gapWidth: 10,
        backgroundColor: `${colors.primary}08`,
        marginTop: 4,
        marginBottom: 4,
      },
      code: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 13,
        backgroundColor: colors.surface,
        color: colors.primary,
        borderColor: colors.border,
      },
      codeBlock: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 13,
        backgroundColor: colors.surface,
        color: colors.text,
        padding: 12,
        borderRadius: 8,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        marginTop: 4,
        marginBottom: 4,
        lineHeight: 18,
      },
      list: {
        color: colors.text,
        fontSize: 15,
        lineHeight: 22,
        marginTop: 2,
        marginBottom: 2,
        bulletColor: colors.textMuted,
        markerColor: colors.textMuted,
      },
      taskList: {
        checkedColor: colors.primary,
        borderColor: colors.textMuted,
        checkmarkColor: '#FFFFFF',
        checkedStrikethrough: true,
        checkedTextColor: colors.textMuted,
      },
      table: {
        fontSize: 13,
        color: colors.text,
        borderColor: colors.border,
        borderRadius: 6,
        headerBackgroundColor: colors.surface,
        headerTextColor: colors.text,
        headerFontFamily: Platform.OS === 'ios' ? 'System-Bold' : 'sans-serif-medium',
        rowEvenBackgroundColor: 'transparent',
        rowOddBackgroundColor: `${colors.surface}80`,
        cellPaddingHorizontal: 8,
        cellPaddingVertical: 6,
        marginTop: 4,
        marginBottom: 4,
      },
      thematicBreak: {
        color: colors.border,
        height: 1,
        marginTop: 8,
        marginBottom: 8,
      },
      image: {
        borderRadius: 8,
        marginTop: 4,
        marginBottom: 4,
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
  return (
    <View>
      {segments.map((segment, i) => {
        if (segment.type === 'code') {
          return (
            <CodeBlock
              key={`code-${i}`}
              code={segment.content}
              language={segment.language}
              colors={colors}
            />
          )
        }
        return (
          <EnrichedMarkdownText
            key={`text-${i}`}
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
