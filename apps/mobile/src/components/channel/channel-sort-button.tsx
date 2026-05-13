import type { ChannelSortBy } from '@shadowob/shared'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Check,
  Clock,
  MessageSquare,
} from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { useChannelSort } from '../../hooks/use-channel-sort'
import { spacing, useColors } from '../../theme'
import { Button, MenuItem, Sheet } from '../ui'

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
    {
      value: 'position',
      label: t('sort.byPosition', { defaultValue: '默认顺序' }),
      icon: ArrowUpDown,
    },
    {
      value: 'lastMessageAt',
      label: t('sort.byLastMessage', { defaultValue: '最新消息' }),
      icon: MessageSquare,
    },
    {
      value: 'lastAccessedAt',
      label: t('sort.byLastAccessed', { defaultValue: '访问时间' }),
      icon: Clock,
    },
    {
      value: 'createdAt',
      label: t('sort.byCreatedAt', { defaultValue: '创建时间' }),
      icon: Calendar,
    },
    { value: 'updatedAt', label: t('sort.byUpdatedAt', { defaultValue: '更新时间' }), icon: Clock },
  ]

  const currentOption = sortOptions.find((opt) => opt.value === sortBy) || sortOptions[0]!
  const CurrentIcon = currentOption.icon
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
      <Button
        variant="glass"
        size="xs"
        icon={CurrentIcon}
        iconRight={DirectionIcon}
        iconColor={colors.textSecondary}
        style={styles.button}
        onPress={() => setModalVisible(true)}
      >
        {currentOption.label}
      </Button>

      <Sheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('sort.title', { defaultValue: '排序方式' })}
      >
        {sortOptions.map((option) => {
          const Icon = option.icon
          const isSelected = sortBy === option.value
          return (
            <MenuItem
              key={option.value}
              icon={Icon}
              title={option.label}
              tone={isSelected ? 'primary' : 'muted'}
              onPress={() => handleSelectSort(option.value)}
              right={
                isSelected ? (
                  <View style={styles.checkContainer}>
                    <DirectionIcon size={14} color={colors.primary} style={styles.directionIcon} />
                    <Check size={18} color={colors.primary} />
                  </View>
                ) : null
              }
            />
          )
        })}
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
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
