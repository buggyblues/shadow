import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { type ComponentRef, type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { border, fontSize, lineHeight, size, spacing, useColors } from '../../theme'

export function InteractiveSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  snapPoints = ['48%'],
  contentStyle,
}: {
  visible: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  snapPoints?: Array<string | number>
  contentStyle?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const modalRef = useRef<ComponentRef<typeof BottomSheetModal>>(null)
  const memoSnapPoints = useMemo(() => snapPoints, [snapPoints])

  useEffect(() => {
    if (visible) {
      modalRef.current?.present()
    } else {
      modalRef.current?.dismiss()
    }
  }, [visible])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  )

  return (
    <BottomSheetModal
      ref={modalRef}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: colors.frostedPanelStrong,
        borderColor: colors.frostedBorder,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      index={0}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      onDismiss={onClose}
      snapPoints={memoSnapPoints}
    >
      <BottomSheetView
        style={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.lg, borderColor: colors.frostedBorder },
          contentStyle,
        ]}
      >
        {title ? (
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.body}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </BottomSheetView>
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  content: {
    borderTopWidth: border.hairline,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  header: {
    minHeight: size.navBar,
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  title: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '600',
  },
  body: {
    gap: spacing.md,
  },
  footer: {
    paddingTop: spacing.md,
  },
})
