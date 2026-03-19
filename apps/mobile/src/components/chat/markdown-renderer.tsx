import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Check, Copy } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Markdown, { type RenderRules } from 'react-native-markdown-display'
import { useColors } from '../../theme'

interface MarkdownRendererProps {
  content: string
  /** Map of username → userId for @mention navigation */
  mentionMap?: Map<string, string>
}

function CodeBlockWithCopy({
  code,
  style,
  colors,
}: {
  code: string
  style: Record<string, unknown>
  colors: { textMuted: string; inputBackground: string }
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <View style={codeBlockStyles.wrapper}>
      <Text style={style} selectable>
        {code}
      </Text>
      <Pressable
        style={[codeBlockStyles.copyBtn, { backgroundColor: colors.inputBackground }]}
        onPress={handleCopy}
        hitSlop={8}
      >
        {copied ? (
          <Check size={14} color={colors.textMuted} />
        ) : (
          <Copy size={14} color={colors.textMuted} />
        )}
      </Pressable>
    </View>
  )
}

const codeBlockStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  copyBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    padding: 4,
    borderRadius: 4,
  },
})

export function MarkdownRenderer({ content, mentionMap }: MarkdownRendererProps) {
  const colors = useColors()
  const router = useRouter()

  // Pre-process @mentions into markdown links for the renderer
  const processedContent = useMemo(() => {
    if (!content || content === '\u200B') return ''
    return content.replace(/@(\w+)/g, (_match, username) => {
      const userId = mentionMap?.get(username)
      if (userId) {
        return `[@${username}](mention://${userId})`
      }
      return `**@${username}**`
    })
  }, [content, mentionMap])

  const markdownStyles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          color: colors.text,
          fontSize: 15,
          lineHeight: 22,
        },
        heading1: { color: colors.text, fontSize: 22, fontWeight: '700', marginVertical: 6 },
        heading2: { color: colors.text, fontSize: 20, fontWeight: '700', marginVertical: 5 },
        heading3: { color: colors.text, fontSize: 18, fontWeight: '700', marginVertical: 4 },
        heading4: { color: colors.text, fontSize: 16, fontWeight: '700', marginVertical: 3 },
        heading5: { color: colors.text, fontSize: 15, fontWeight: '700', marginVertical: 2 },
        heading6: { color: colors.text, fontSize: 14, fontWeight: '700', marginVertical: 2 },
        strong: { fontWeight: '700' },
        em: { fontStyle: 'italic' },
        s: { textDecorationLine: 'line-through', color: colors.textMuted },
        link: { color: colors.primary, textDecorationLine: 'underline' },
        blockquote: {
          backgroundColor: `${colors.primary}08`,
          borderLeftWidth: 3,
          borderLeftColor: colors.primary,
          paddingLeft: 10,
          paddingVertical: 4,
          marginVertical: 4,
        },
        code_inline: {
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          fontSize: 13,
          backgroundColor: colors.inputBackground,
          color: colors.text,
          paddingHorizontal: 5,
          paddingVertical: 2,
          borderRadius: 4,
        },
        code_block: {
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          fontSize: 13,
          backgroundColor: colors.inputBackground,
          color: colors.text,
          padding: 10,
          borderRadius: 8,
          marginVertical: 4,
          lineHeight: 18,
        },
        fence: {
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          fontSize: 13,
          backgroundColor: colors.inputBackground,
          color: colors.text,
          padding: 10,
          borderRadius: 8,
          marginVertical: 4,
          lineHeight: 18,
        },
        table: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 6,
          marginVertical: 4,
        },
        thead: { backgroundColor: colors.inputBackground },
        th: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: 6,
          fontWeight: '700',
          color: colors.text,
          fontSize: 13,
        },
        td: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: 6,
          color: colors.text,
          fontSize: 13,
        },
        tr: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        bullet_list: { marginVertical: 2 },
        ordered_list: { marginVertical: 2 },
        list_item: { marginVertical: 1 },
        bullet_list_icon: { color: colors.textMuted, fontSize: 14, marginRight: 6 },
        ordered_list_icon: { color: colors.textMuted, fontSize: 13, marginRight: 6 },
        hr: {
          backgroundColor: colors.border,
          height: 1,
          marginVertical: 8,
        },
        paragraph: {
          marginTop: 0,
          marginBottom: 2,
        },
        image: {
          borderRadius: 8,
        },
      }),
    [colors],
  )

  const rules: RenderRules = useMemo(
    () => ({
      image: (node) => {
        const src = node.attributes?.src
        if (!src) return null
        return (
          <Image
            key={node.key}
            source={{ uri: src }}
            style={{ width: '100%', maxWidth: 320, height: 200, borderRadius: 8 }}
            contentFit="cover"
          />
        )
      },
      fence: (node, _children, _parent, styles) => {
        const code = node.content || ''
        return <CodeBlockWithCopy key={node.key} code={code} style={styles.fence} colors={colors} />
      },
    }),
    [colors],
  )

  if (!processedContent) return null

  return (
    <Markdown
      style={markdownStyles}
      rules={rules}
      onLinkPress={(url: string) => {
        if (url.startsWith('mention://')) {
          const userId = url.replace('mention://', '')
          router.push(`/(main)/profile/${userId}` as never)
          return false
        }
        Linking.openURL(url)
        return false
      }}
    >
      {processedContent}
    </Markdown>
  )
}
