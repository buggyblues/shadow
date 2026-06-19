import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import {
  type ComponentRef,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Animated,
  Easing,
  Keyboard,
  type KeyboardEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { border, fontSize, lineHeight, radius, size, spacing, useColors } from '../../theme'
import {
  getInteractiveSheetDragOffset,
  getInteractiveSheetPanelMaxHeight,
  getInteractiveSheetTopInset,
  shouldDismissInteractiveSheetDrag,
  shouldUseKeyboardSheet,
} from './interactive-sheet-layout'
import {
  createInteractiveSheetLifecycleState,
  markInteractiveSheetPresentRequested,
  resolveInteractiveSheetDismiss,
  syncInteractiveSheetVisibility,
} from './interactive-sheet-lifecycle'

type InteractiveSheetKeyboardPresentation = 'resize' | 'lift'

export function InteractiveSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  snapPoints = ['48%'],
  contentStyle,
  autoFocusRef,
  autoFocusDelayMs = 90,
  keyboardAware = true,
  keyboardBuffer = spacing.lg,
  keyboardPresentation = 'resize',
}: {
  visible: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  snapPoints?: Array<string | number>
  contentStyle?: StyleProp<ViewStyle>
  autoFocusRef?: RefObject<TextInput | null>
  autoFocusDelayMs?: number
  keyboardAware?: boolean
  keyboardBuffer?: number
  keyboardPresentation?: InteractiveSheetKeyboardPresentation
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const modalRef = useRef<ComponentRef<typeof BottomSheetModal>>(null)
  const lifecycleRef = useRef(createInteractiveSheetLifecycleState())
  const visibleRef = useRef(visible)
  const keyboardSheetProgress = useRef(new Animated.Value(0)).current
  const keyboardSheetDragY = useRef(new Animated.Value(0)).current
  const keyboardSheetClosingRef = useRef(false)
  const sheetTopInset = getInteractiveSheetTopInset(insets.top, spacing.md)
  const useKeyboardModal = shouldUseKeyboardSheet({
    keyboardAware,
    hasAutoFocus: Boolean(autoFocusRef),
  })
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const memoSnapPoints = useMemo(() => snapPoints, [snapPoints])
  const keyboardPanelMaxHeight = getInteractiveSheetPanelMaxHeight({
    windowHeight,
    topInset: sheetTopInset,
    bottomInset: insets.bottom,
    keyboardHeight,
    keyboardBuffer,
  })
  const shouldResizeAroundKeyboard = keyboardPresentation === 'resize'
  const keyboardSheetBottom = shouldResizeAroundKeyboard
    ? spacing.none
    : (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + keyboardBuffer
  const keyboardSheetHeight = shouldResizeAroundKeyboard
    ? getInteractiveSheetPanelMaxHeight({
        windowHeight,
        topInset: sheetTopInset,
        bottomInset: spacing.none,
        keyboardHeight: spacing.none,
        keyboardBuffer: spacing.none,
      })
    : undefined
  const keyboardSheetDismissHeight = keyboardSheetHeight ?? keyboardPanelMaxHeight
  const keyboardContentBottomInset =
    keyboardHeight > 0 ? keyboardHeight + keyboardBuffer : insets.bottom + spacing.lg
  const keyboardSheetEntranceY = keyboardSheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [36, 0],
  })
  const keyboardSheetTranslateY = Animated.add(keyboardSheetEntranceY, keyboardSheetDragY)

  useEffect(() => {
    if (useKeyboardModal) return
    visibleRef.current = visible
    const effect = syncInteractiveSheetVisibility(lifecycleRef.current, visible)
    if (effect === 'present') modalRef.current?.present()
    if (effect === 'dismiss') modalRef.current?.dismiss()
  }, [useKeyboardModal, visible])

  useEffect(() => {
    if (!visible || !useKeyboardModal) {
      setKeyboardHeight(0)
      return
    }

    const syncKeyboardHeight = (event: KeyboardEvent) => {
      if (Platform.OS === 'ios') {
        Keyboard.scheduleLayoutAnimation(event)
      }
      setKeyboardHeight(Math.max(0, windowHeight - event.endCoordinates.screenY))
    }
    const clearKeyboardHeight = (event: KeyboardEvent) => {
      if (Platform.OS === 'ios') {
        Keyboard.scheduleLayoutAnimation(event)
      }
      setKeyboardHeight(0)
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSubscription = Keyboard.addListener(showEvent, syncKeyboardHeight)
    const hideSubscription = Keyboard.addListener(hideEvent, clearKeyboardHeight)

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [useKeyboardModal, visible, windowHeight])

  useEffect(() => {
    if (!useKeyboardModal) return

    if (!visible) {
      keyboardSheetClosingRef.current = false
      keyboardSheetProgress.setValue(0)
      keyboardSheetDragY.setValue(0)
      return
    }

    keyboardSheetClosingRef.current = false
    keyboardSheetProgress.setValue(0)
    keyboardSheetDragY.setValue(0)
    Animated.spring(keyboardSheetProgress, {
      toValue: 1,
      damping: 24,
      stiffness: 260,
      mass: 0.9,
      restDisplacementThreshold: 0.5,
      restSpeedThreshold: 0.5,
      useNativeDriver: true,
    }).start()
  }, [keyboardSheetDragY, keyboardSheetProgress, useKeyboardModal, visible])

  useEffect(() => {
    if (!visible || !autoFocusRef || useKeyboardModal) return

    const timeout = setTimeout(() => {
      autoFocusRef.current?.focus()
    }, autoFocusDelayMs)
    return () => clearTimeout(timeout)
  }, [autoFocusDelayMs, autoFocusRef, useKeyboardModal, visible])

  const focusKeyboardModalInput = useCallback(() => {
    if (!autoFocusRef) return
    const focus = () => {
      autoFocusRef.current?.focus()
    }

    requestAnimationFrame(focus)
    setTimeout(focus, autoFocusDelayMs)
    setTimeout(focus, autoFocusDelayMs + 180)
  }, [autoFocusDelayMs, autoFocusRef])

  const closeKeyboardModal = useCallback(() => {
    if (keyboardSheetClosingRef.current) return

    keyboardSheetClosingRef.current = true
    Animated.parallel([
      Animated.timing(keyboardSheetProgress, {
        toValue: 0,
        duration: 170,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(keyboardSheetDragY, {
        toValue: 48,
        duration: 170,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      Keyboard.dismiss()
      setKeyboardHeight(0)
      keyboardSheetDragY.setValue(0)
      keyboardSheetClosingRef.current = false
      onClose()
    })
  }, [keyboardSheetDragY, keyboardSheetProgress, onClose])

  const resetKeyboardSheetDrag = useCallback(() => {
    Animated.spring(keyboardSheetDragY, {
      toValue: 0,
      damping: 22,
      stiffness: 280,
      mass: 0.85,
      restDisplacementThreshold: 0.5,
      restSpeedThreshold: 0.5,
      useNativeDriver: true,
    }).start()
  }, [keyboardSheetDragY])

  const keyboardSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => visible && useKeyboardModal,
        onStartShouldSetPanResponderCapture: () => visible && useKeyboardModal,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          visible &&
          useKeyboardModal &&
          Math.abs(gesture.dy) > 4 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          visible &&
          useKeyboardModal &&
          Math.abs(gesture.dy) > 4 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          keyboardSheetDragY.stopAnimation()
        },
        onPanResponderMove: (_event, gesture) => {
          keyboardSheetDragY.setValue(getInteractiveSheetDragOffset(gesture.dy))
        },
        onPanResponderRelease: (_event, gesture) => {
          if (
            shouldDismissInteractiveSheetDrag({
              dragY: gesture.dy,
              velocityY: gesture.vy,
              panelHeight: keyboardSheetDismissHeight,
            })
          ) {
            closeKeyboardModal()
            return
          }
          resetKeyboardSheetDrag()
        },
        onPanResponderTerminate: resetKeyboardSheetDrag,
      }),
    [
      closeKeyboardModal,
      keyboardSheetDismissHeight,
      keyboardSheetDragY,
      resetKeyboardSheetDrag,
      useKeyboardModal,
      visible,
    ],
  )

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

  const header = title ? (
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
  ) : null

  if (useKeyboardModal) {
    // Text-entry sheets share one drag path: long lists resize internally around
    // the keyboard, while short forms can lift as compact cards above it.
    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onShow={focusKeyboardModalInput}
        onRequestClose={closeKeyboardModal}
      >
        <View style={styles.keyboardModalScreen}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.overlay, opacity: keyboardSheetProgress },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            onPress={closeKeyboardModal}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            style={[
              styles.keyboardSheet,
              {
                backgroundColor: colors.frostedPanelStrong,
                borderColor: colors.frostedBorder,
                bottom: keyboardSheetBottom,
                opacity: keyboardSheetProgress,
                transform: [{ translateY: keyboardSheetTranslateY }],
              },
              shouldResizeAroundKeyboard
                ? { height: keyboardSheetHeight }
                : { maxHeight: keyboardPanelMaxHeight },
            ]}
          >
            <View {...keyboardSheetPanResponder.panHandlers} style={styles.keyboardDragRegion}>
              <View style={[styles.keyboardGrabber, { backgroundColor: colors.textMuted }]} />
              {header}
            </View>
            <View
              style={[
                styles.keyboardBody,
                shouldResizeAroundKeyboard ? styles.keyboardResizeBody : styles.keyboardLiftBody,
                !footer && shouldResizeAroundKeyboard
                  ? { paddingBottom: keyboardContentBottomInset }
                  : null,
                contentStyle,
              ]}
            >
              {children}
            </View>
            {footer ? (
              <View
                style={[
                  styles.keyboardFooter,
                  shouldResizeAroundKeyboard
                    ? { paddingBottom: keyboardContentBottomInset }
                    : styles.keyboardLiftFooter,
                ]}
              >
                {footer}
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Modal>
    )
  }

  return (
    <BottomSheetModal
      ref={modalRef}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: colors.frostedPanelStrong,
        borderColor: colors.frostedBorder,
        borderWidth: border.hairline,
        borderTopLeftRadius: radius['3xl'],
        borderTopRightRadius: radius['3xl'],
        overflow: 'hidden',
      }}
      style={styles.sheetContainer}
      handleComponent={null}
      index={0}
      enablePanDownToClose
      enableBlurKeyboardOnGesture
      topInset={sheetTopInset}
      bottomInset={insets.bottom}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onDismiss={() => {
        const result = resolveInteractiveSheetDismiss(lifecycleRef.current, visibleRef.current)
        if (result.shouldReopen) {
          requestAnimationFrame(() => {
            markInteractiveSheetPresentRequested(lifecycleRef.current)
            modalRef.current?.present()
          })
          return
        }
        if (result.shouldClose) {
          onClose()
        }
      }}
      snapPoints={memoSnapPoints}
    >
      <BottomSheetView
        style={[styles.content, { paddingBottom: insets.bottom + spacing.lg }, contentStyle]}
      >
        {header}
        <View style={styles.body}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </BottomSheetView>
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  keyboardModalScreen: {
    flex: 1,
  },
  keyboardSheet: {
    position: 'absolute',
    left: spacing.none,
    right: spacing.none,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderWidth: border.hairline,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  keyboardDragRegion: {
    flexShrink: 0,
  },
  keyboardGrabber: {
    alignSelf: 'center',
    width: size.iconTile,
    height: size.dotXs,
    borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  keyboardBody: {
    gap: spacing.md,
    minHeight: 0,
  },
  keyboardResizeBody: {
    flex: 1,
    paddingBottom: spacing.lg,
  },
  keyboardLiftBody: {
    flexShrink: 1,
  },
  keyboardFooter: {
    flexShrink: 0,
    paddingTop: spacing.sm,
  },
  keyboardLiftFooter: {
    paddingBottom: spacing.lg,
  },
  sheetContainer: {
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
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
