import {
  Check,
  ChevronDown,
  Clock,
  Filter,
  MessageSquare,
  Search,
  X,
  Zap,
} from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { fontSize, radius, spacing, useColors } from '../../theme'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

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
  const translateY = useState(new Animated.Value(SCREEN_HEIGHT))[0]

  const hasActiveFilters =
    filters.search ||
    filters.sortBy !== 'default' ||
    filters.sortOrder !== 'desc' ||
    filters.showArchived

  const openModal = () => {
    setIsOpen(true)
    setTempFilters(filters)
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start()
  }

  const closeModal = () => {
    Animated.spring(translateY, {
      toValue: SCREEN_HEIGHT,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start(() => {
      setIsOpen(false)
    })
  }

  const handleApply = () => {
    onChange(tempFilters)
    closeModal()
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
    closeModal()
  }

  const toggleSortOrder = () => {
    setTempFilters((prev) => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
  }

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) =>
      gestureState.dy > 0 && Math.abs(gestureState.dy) > 10,
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy)
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 100) {
        closeModal()
      } else {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
        }).start()
      }
    },
  })

  return (
    <>
      {/* Trigger Button */}
      <TouchableOpacity
        onPress={openModal}
        style={[
          styles.trigger,
          {
            backgroundColor: hasActiveFilters || isOpen ? `${colors.primary}20` : colors.surface,
            borderColor: hasActiveFilters || isOpen ? colors.primary : 'transparent',
          },
        ]}
      >
        <Filter size={14} color={hasActiveFilters || isOpen ? colors.primary : colors.textMuted} />
        <Text
          style={{
            color: hasActiveFilters || isOpen ? colors.primary : colors.textSecondary,
            fontSize: fontSize.sm,
            fontWeight: '500',
          }}
        >
          {t('discover.filter.title')}
        </Text>
        <ChevronDown
          size={14}
          color={hasActiveFilters || isOpen ? colors.primary : colors.textMuted}
        />
        {hasActiveFilters && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>!</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Modal */}
      <Modal visible={isOpen} transparent animationType="none" onRequestClose={closeModal}>
        <View style={styles.overlay}>
          {/* Backdrop */}
          <Pressable style={styles.backdrop} onPress={closeModal} />

          {/* Bottom Sheet */}
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface },
              { transform: [{ translateY }] },
            ]}
            {...panResponder.panHandlers}
          >
            {/* Drag Handle */}
            <View style={styles.dragHandle}>
              <View style={[styles.dragIndicator, { backgroundColor: colors.textMuted }]} />
            </View>

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {t('discover.filter.title')}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
              {/* Search */}
              <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
                <Search size={14} color={colors.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  value={tempFilters.search}
                  onChangeText={(text) => setTempFilters((prev) => ({ ...prev, search: text }))}
                  placeholder={t('discover.filter.searchPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                />
                {tempFilters.search && (
                  <TouchableOpacity
                    onPress={() => setTempFilters((prev) => ({ ...prev, search: '' }))}
                  >
                    <X size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Sort Options */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                    {t('discover.filter.sortBy')}
                  </Text>
                  <TouchableOpacity onPress={toggleSortOrder} style={styles.sortOrderButton}>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                      {tempFilters.sortOrder === 'asc' ? '↑' : '↓'}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                      {tempFilters.sortOrder === 'asc'
                        ? t('discover.filter.ascending')
                        : t('discover.filter.descending')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {sortOptions.map(({ key, label, icon: Icon }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setTempFilters((prev) => ({ ...prev, sortBy: key }))}
                    style={[
                      styles.sortOption,
                      {
                        backgroundColor:
                          tempFilters.sortBy === key ? `${colors.primary}20` : 'transparent',
                      },
                    ]}
                  >
                    <Icon
                      size={14}
                      color={tempFilters.sortBy === key ? colors.primary : colors.textMuted}
                    />
                    <Text
                      style={{
                        flex: 1,
                        color: tempFilters.sortBy === key ? colors.primary : colors.text,
                        fontSize: fontSize.sm,
                      }}
                    >
                      {t(label)}
                    </Text>
                    {tempFilters.sortBy === key && <Check size={14} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Toggle Options */}
              <View style={styles.section}>
                <TouchableOpacity
                  onPress={() =>
                    setTempFilters((prev) => ({
                      ...prev,
                      showArchived: !prev.showArchived,
                    }))
                  }
                  style={styles.toggleOption}
                >
                  <View style={styles.toggleLeft}>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: tempFilters.showArchived ? colors.primary : colors.textMuted,
                          backgroundColor: tempFilters.showArchived
                            ? colors.primary
                            : 'transparent',
                        },
                      ]}
                    >
                      {tempFilters.showArchived && <Check size={10} color="#fff" />}
                    </View>
                    <Text style={{ color: colors.text, fontSize: fontSize.sm }}>
                      {t('discover.filter.showArchived')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={handleClear}
                style={[styles.footerButton, { backgroundColor: colors.background }]}
              >
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
                  {t('discover.filter.clear')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleApply}
                style={[styles.footerButton, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '600' }}>
                  {t('discover.filter.apply')}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  badge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sortOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  toggleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  footerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
})
