import type { ChannelSortBy } from '@shadowob/shared'
import { ArrowUpDown, Check, MessageSquare } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { useChannelSort } from '../../hooks/use-channel-sort'
import { spacing, useColors } from '../../theme'
import { Button, MenuItem, Sheet } from '../ui'

interface SortOption {
  value: ChannelSortBy
  label: string
  icon: typeof ArrowUpDown
}

interface ChannelSortButtonProps {
  serverId: string
}

export function ChannelSortButton({ serverId }: ChannelSortButtonProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const [modalVisible, setModalVisible] = useState(false)
  const { sortBy, setSortBy } = useChannelSort(serverId)
  const normalizedSortBy = sortBy === 'position' ? 'position' : 'lastMessageAt'

  const sortOptions: SortOption[] = [
    {
      value: 'position',
      label: t('sort.byPosition'),
      icon: ArrowUpDown,
    },
    {
      value: 'lastMessageAt',
      label: t('sort.byLastMessage'),
      icon: MessageSquare,
    },
  ]

  const currentOption = sortOptions.find((opt) => opt.value === normalizedSortBy) || sortOptions[0]!
  const CurrentIcon = currentOption.icon

  const handleSelectSort = (value: ChannelSortBy) => {
    setSortBy(value)
    setModalVisible(false)
  }

  return (
    <>
      <Button
        variant="glass"
        size="xs"
        icon={CurrentIcon}
        iconColor={colors.textSecondary}
        style={styles.button}
        onPress={() => setModalVisible(true)}
      >
        {currentOption.label}
      </Button>

      <Sheet visible={modalVisible} onClose={() => setModalVisible(false)} title={t('sort.title')}>
        {sortOptions.map((option) => {
          const Icon = option.icon
          const isSelected = normalizedSortBy === option.value
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
})
