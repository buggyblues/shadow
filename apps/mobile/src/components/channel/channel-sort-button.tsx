import {
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  Clock,
  MessageSquare,
} from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { ChannelSortBy } from '@shadow/shared'
import { useChannelSort } from '../../hooks/use-channel-sort'
import { fontSize, radius, spacing, useColors } from '../../theme'

interface SortOption {
  value: ChannelSortBy
  label: string
  icon: typeof Calendar
}

interface ChannelSortButtonProps {
  serverId: string
}

export function ChannelSortButton({ serverId }: ChannelSortButtonProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const [modalVisible, setModalVisible] = useState(false)
  const { sortBy, sortDirection, setSortBy, toggleSortDirection } = useChannelSort(serverId)

  const sortOptions: SortOption[] = [
    { value: 'position', label: t('sort.byPosition', { defaultValue: '默认顺序' }), icon: ArrowUpDown },
    { value: 'lastMessageAt', label: t('sort.byLastMessage', { defaultValue: '最新消息' }), icon: MessageSquare },
    { value: 'lastAccessedAt', label: t('sort.byLastAccessed', { defaultValue: '访问时间' }), icon: Clock },
    { value: 'createdAt', label: t('sort.byCreatedAt', { defaultValue: '创建时间' }), icon: Calendar },
    { value: 'updatedAt', label: t('sort.byUpdatedAt', { defaultValue: '更新时间' }), icon: Clock },
  ]

  const currentOption = sortOptions.find((opt) => opt.value === sortBy) || sortOptions[0]!
  const DirectionIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown

  const handleSelectSort = (value: ChannelSortBy) => {
    if (value === sortBy) {
      toggleSortDirection()
    } else {
      setSortBy(value)
    }
    setModalVisible(false)
  }

  return (
    <>
      <Pressable
        style={[styles.button, { backgroundColor: colors.surface }]}
        onPress={() => setModalVisible(true)}
      >
        <currentOption.icon size={16} color={colors.textSecondary} />
        <Text style={[styles.buttonText, { color: colors.textSecondary }]}>
          {currentOption.label}
        </Text>
        <DirectionIcon size={14} color={colors.textMuted} />
      </Pressable>

      <Modal
        animationType="fade"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t('sort.title', { defaultValue: '排序方式' })}
            </Text>
            {sortOptions.map((option) => {
              const Icon = option.icon
              const isSelected = sortBy === option.value
              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.option,
                    isSelected && { backgroundColor: `${colors.primary}15` },
                  ]}
                  onPress={() => handleSelectSort(option.value)}
                >
                  <Icon
                    size={18}
                    color={isSelected ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      { color: isSelected ? colors.primary : colors.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isSelected && (
                    <View style={styles.checkContainer}>
                      <DirectionIcon
                        size={14}
                        color={colors.primary}
                        style={styles.directionIcon}
                      />
                      <Check size={18} color={colors.primary} />
                    </View>
                  )}
                </Pressable>
              )
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  buttonText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionText: {
    flex: 1,
    fontSize: fontSize.md,
  },
  checkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  directionIcon: {
    marginRight: spacing.xs,
  },
})
