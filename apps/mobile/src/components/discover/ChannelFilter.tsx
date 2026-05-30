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
import {
  border,
  fontSize,
  iconSize,
  letterSpacing,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../theme'

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
            backgroundColor: hasActiveFilters || isOpen ? colors.surfaceHover : colors.surface,
            borderColor: hasActiveFilters || isOpen ? colors.primary : colors.border,
          },
        ]}
      >
        <Filter
          size={iconSize.sm}
          color={hasActiveFilters || isOpen ? colors.primary : colors.textMuted}
        />
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
          size={iconSize.sm}
          color={hasActiveFilters || isOpen ? colors.primary : colors.textMuted}
        />
        {hasActiveFilters && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={{ color: palette.white, fontSize: fontSize.micro, fontWeight: '700' }}>
              !
            </Text>
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
                <X size={iconSize.xl} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
              {/* Search */}
              <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
                <Search size={iconSize.sm} color={colors.textMuted} />
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
                    <X size={iconSize.sm} color={colors.textMuted} />
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
                          tempFilters.sortBy === key ? colors.surfaceHover : colors.surface,
                      },
                    ]}
                  >
                    <Icon
                      size={iconSize.sm}
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
                    {tempFilters.sortBy === key && (
                      <Check size={iconSize.sm} color={colors.primary} />
                    )}
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
                            : colors.surface,
                        },
                      ]}
                    >
                      {tempFilters.showArchived && (
                        <Check size={iconSize.micro} color={palette.white} />
                      )}
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
                <Text style={{ color: palette.white, fontSize: fontSize.sm, fontWeight: '600' }}>
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
    borderWidth: border.hairline,
  },
  badge: {
    width: size.badgeSm,
    height: size.badgeSm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: palette.black,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: spacing.none,
    left: spacing.none,
    right: spacing.none,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dragIndicator: {
    width: size.iconButtonLg,
    height: size.dotXs,
    borderRadius: radius.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: border.hairline,
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
    height: size.controlMd,
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
    letterSpacing: letterSpacing.none,
  },
  sortOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
    width: size.badgeLg,
    height: size.badgeLg,
    borderRadius: radius.sm,
    borderWidth: border.active,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: border.hairline,
  },
  footerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
})
