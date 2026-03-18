import { Bot, Code, FileText, Paintbrush, Search, Settings } from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { fontSize, radius, spacing, useColors } from '../../theme'

export interface BuddyPreset {
  id: string
  name: string
  description: string
  icon: typeof Bot
  color: string
  suggestedName: string
  suggestedUsername: string
  suggestedDesc: string
}

export const BUDDY_PRESETS: BuddyPreset[] = [
  {
    id: 'coding',
    name: '代码助手',
    description: '帮你写代码、做 Code Review、修 Bug',
    icon: Code,
    color: '#5865f2',
    suggestedName: '代码猫',
    suggestedUsername: 'coding-cat',
    suggestedDesc: '精通 TypeScript、Python、Go 等主流语言，帮你写代码、做 Code Review、修 Bug。',
  },
  {
    id: 'writing',
    name: '写作助手',
    description: '帮你写文章、总结、润色',
    icon: FileText,
    color: '#3ba55d',
    suggestedName: '文档喵',
    suggestedUsername: 'docu-meow',
    suggestedDesc: '自动生成 API 文档、会议纪要、技术方案。支持 Markdown 和多种模板。',
  },
  {
    id: 'design',
    name: '设计助手',
    description: '提供 UI/UX 设计建议',
    icon: Paintbrush,
    color: '#eb459f',
    suggestedName: '设计猫',
    suggestedUsername: 'design-cat',
    suggestedDesc: '从线框图到配色方案，帮你快速产出 UI/UX 设计建议和组件代码。',
  },
  {
    id: 'research',
    name: '研究助手',
    description: '搜索代码库、追踪 Bug 根因',
    icon: Search,
    color: '#f0b132',
    suggestedName: '侦探猫',
    suggestedUsername: 'detective-cat',
    suggestedDesc: '帮你搜索代码库、追踪 Bug 根因、分析日志，再也不用熬夜排查问题了。',
  },
  {
    id: 'custom',
    name: '自定义',
    description: '从零开始配置你的 Buddy',
    icon: Settings,
    color: '#747f8d',
    suggestedName: '',
    suggestedUsername: '',
    suggestedDesc: '',
  },
]

interface BuddyPresetSelectorProps {
  onSelect: (preset: BuddyPreset) => void
  selectedId?: string
}

export function BuddyPresetSelector({ onSelect, selectedId }: BuddyPresetSelectorProps) {
  const colors = useColors()

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>选择 Buddy 类型</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        选择一个预设模板，快速创建你的 AI 助手
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {BUDDY_PRESETS.map((preset) => {
          const Icon = preset.icon
          const isSelected = selectedId === preset.id
          const isCustom = preset.id === 'custom'

          return (
            <Pressable
              key={preset.id}
              style={[
                styles.presetCard,
                {
                  backgroundColor: isSelected ? `${preset.color}20` : colors.surface,
                  borderColor: isSelected ? preset.color : colors.border,
                },
                isCustom && styles.customCard,
              ]}
              onPress={() => onSelect(preset)}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${preset.color}15` },
                ]}
              >
                <Icon size={28} color={preset.color} />
              </View>

              <Text style={[styles.presetName, { color: colors.text }]}>{preset.name}</Text>

              {!isCustom && (
                <Text style={[styles.presetDesc, { color: colors.textMuted }]} numberOfLines={2}>
                  {preset.description}
                </Text>
              )}

              {isSelected && (
                <View style={[styles.selectedBadge, { backgroundColor: preset.color }]}>
                  <Text style={styles.selectedText}>已选择</Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  presetCard: {
    width: 140,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 2,
    alignItems: 'center',
  },
  customCard: {
    borderStyle: 'dashed',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  presetName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  presetDesc: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
  selectedBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  selectedText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
})
