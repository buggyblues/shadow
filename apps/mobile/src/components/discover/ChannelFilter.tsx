import { Check, ChevronDown, Clock, Filter, MessageSquare, Zap } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { iconSize, spacing, useColors } from '../../theme'
import {
  ActionButton,
  ActionSheet,
  AppText,
  ChipButton,
  MenuItem,
  MenuList,
  SearchField,
  SwitchRow,
} from '../ui'

export interface ChannelFilterState {
  search: string
  sortBy: 'default' | 'lastMessage' | 'activity' | 'created' | 'updated'
  sortOrder: 'asc' | 'desc'
  showArchived: boolean
}

interface ChannelFilterProps {
  filters: ChannelFilterState
  onChange: (filters: ChannelFilterState) => void
  onClear: () => void
}

const sortOptions = [
  { key: 'default', label: 'discover.filter.sort.default', icon: Zap },
  { key: 'lastMessage', label: 'discover.filter.sort.lastMessage', icon: MessageSquare },
  { key: 'activity', label: 'discover.filter.sort.activity', icon: Clock },
  { key: 'created', label: 'discover.filter.sort.created', icon: Clock },
  { key: 'updated', label: 'discover.filter.sort.updated', icon: Clock },
] as const

export function ChannelFilter({ filters, onChange, onClear }: ChannelFilterProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const [isOpen, setIsOpen] = useState(false)
  const [tempFilters, setTempFilters] = useState(filters)

  const hasActiveFilters =
    filters.search ||
    filters.sortBy !== 'default' ||
    filters.sortOrder !== 'desc' ||
    filters.showArchived

  const openSheet = () => {
    setTempFilters(filters)
    setIsOpen(true)
  }

  const closeSheet = () => setIsOpen(false)

  const handleApply = () => {
    onChange(tempFilters)
    closeSheet()
  }

  const handleClear = () => {
    const cleared = {
      search: '',
      sortBy: 'default' as const,
      sortOrder: 'desc' as const,
      showArchived: false,
    }
    setTempFilters(cleared)
    onClear()
    closeSheet()
  }

  const toggleSortOrder = () => {
    setTempFilters((prev) => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <>
      <ActionButton
        label={t('discover.filter.title')}
        icon={Filter}
        iconRight={ChevronDown}
        tone={hasActiveFilters || isOpen ? 'primary' : 'glass'}
        onPress={openSheet}
      />

      <ActionSheet
        visible={isOpen}
        onClose={closeSheet}
        title={t('discover.filter.title')}
        snapPoints={['64%', '86%']}
        footer={
          <View style={styles.footer}>
            <ActionButton
              label={t('discover.filter.clear')}
              tone="glass"
              fullWidth
              onPress={handleClear}
            />
            <ActionButton
              label={t('discover.filter.apply')}
              tone="primary"
              fullWidth
              onPress={handleApply}
            />
          </View>
        }
      >
        <SearchField
          value={tempFilters.search}
          onChangeText={(text) => setTempFilters((prev) => ({ ...prev, search: text }))}
          placeholder={t('discover.filter.searchPlaceholder')}
          clearAccessibilityLabel={t('common.clear')}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="label" tone="secondary">
              {t('discover.filter.sortBy')}
            </AppText>
            <ChipButton
              label={
                tempFilters.sortOrder === 'asc'
                  ? t('discover.filter.ascending')
                  : t('discover.filter.descending')
              }
              active
              iconRight={ChevronDown}
              onPress={toggleSortOrder}
            />
          </View>
          <MenuList>
            {sortOptions.map(({ key, label, icon: Icon }) => (
              <MenuItem
                key={key}
                icon={Icon}
                title={t(label)}
                tone={tempFilters.sortBy === key ? 'primary' : 'muted'}
                right={
                  tempFilters.sortBy === key ? (
                    <Check size={iconSize.md} color={colors.primary} />
                  ) : null
                }
                onPress={() => setTempFilters((prev) => ({ ...prev, sortBy: key }))}
              />
            ))}
          </MenuList>
        </View>

        <SwitchRow
          title={t('discover.filter.showArchived')}
          value={tempFilters.showArchived}
          onValueChange={(showArchived) => setTempFilters((prev) => ({ ...prev, showArchived }))}
        />
      </ActionSheet>
    </>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    minHeight: iconSize['5xl'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
})
