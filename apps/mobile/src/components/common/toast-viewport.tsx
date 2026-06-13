import { AlertCircle, CheckCircle2, Info } from 'lucide-react-native'
import { AnimatePresence, MotiView } from 'moti'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { subscribeToast, type ToastPayload, type ToastType } from '../../lib/toast'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  motion,
  radius,
  size,
  spacing,
  useColors,
} from '../../theme'

const TOAST_VISIBLE_MS = 3200
const MAX_TOASTS = 3

const toastIcons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
} satisfies Record<ToastType, typeof Info>

export function ToastViewport() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const [toasts, setToasts] = useState<ToastPayload[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) clearTimeout(timer)
    timersRef.current.delete(id)
    setToasts((items) => items.filter((item) => item.id !== id))
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToast((toast) => {
      setToasts((items) =>
        [toast, ...items.filter((item) => item.id !== toast.id)].slice(0, MAX_TOASTS),
      )
      const timer = setTimeout(() => dismissToast(toast.id), TOAST_VISIBLE_MS)
      timersRef.current.set(toast.id, timer)
    })

    return () => {
      unsubscribe()
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [dismissToast])

  return (
    <View pointerEvents="box-none" style={[styles.viewport, { top: insets.top + spacing.md }]}>
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = toastIcons[toast.type]
          const toneColor =
            toast.type === 'error'
              ? colors.error
              : toast.type === 'success'
                ? colors.success
                : colors.primary

          return (
            <MotiView
              key={toast.id}
              from={{ opacity: 0, translateY: -spacing.lg, scale: motion.pressScale }}
              animate={{ opacity: 1, translateY: spacing.none, scale: 1 }}
              exit={{ opacity: 0, translateY: -spacing.md, scale: motion.pressScale }}
              transition={{ type: 'timing', duration: motion.presence }}
              style={styles.toastWrap}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => dismissToast(toast.id)}
                style={[
                  styles.toast,
                  { backgroundColor: colors.frostedPanelStrong, borderColor: colors.frostedBorder },
                ]}
              >
                <View style={[styles.iconBubble, { backgroundColor: colors.activePill }]}>
                  <Icon size={iconSize.lg} color={toneColor} strokeWidth={2.4} />
                </View>
                <Text style={[styles.message, { color: colors.text }]} numberOfLines={3}>
                  {toast.message}
                </Text>
              </Pressable>
            </MotiView>
          )
        })}
      </AnimatePresence>
    </View>
  )
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    right: spacing.md,
    left: spacing.md,
    zIndex: 1000,
    alignItems: 'center',
    gap: spacing.sm,
  },
  toastWrap: {
    width: '100%',
    maxWidth: size.dialogMaxWidth,
  },
  toast: {
    minHeight: size.controlLg,
    borderRadius: radius['2xl'],
    borderWidth: border.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBubble: {
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: '700',
  },
})
