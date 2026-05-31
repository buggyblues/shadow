import { ChevronLeft, FileQuestion, type LucideIcon } from 'lucide-react-native'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  type AccessibilityRole,
  ActivityIndicator,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { selectionHaptic } from '../../lib/haptics'
import {
  border,
  type ColorTokens,
  fontSize,
  iconSize,
  letterSpacing,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../theme'

export type Tone = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'danger'
  | 'glass'
  | 'ghost'
  | 'outline'

const ROW_PRESS_SCALE = 0.995
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon'
export type CardVariant =
  | 'default'
  | 'glass'
  | 'surface'
  | 'gradient'
  | 'danger'
  | 'glassPanel'
  | 'glassCard'
  | 'stat'
export type BadgeVariant =
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
export type TypographyVariant = 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'micro'
export type ButtonProps = {
  children?: ReactNode
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  icon?: LucideIcon
  iconRight?: LucideIcon
  iconColor?: string
  iconSize?: number
  style?: StyleProp<ViewStyle>
  containerStyle?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  hitSlop?: number
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
}

function toneColor(colors: ColorTokens, tone: Tone) {
  const isLight = colors.mode === 'light'
  if (tone === 'accent') return isLight ? colors.accentStrong : colors.accent
  if (tone === 'success') return colors.success
  if (tone === 'warning') return colors.warning
  if (tone === 'danger') return colors.error
  if (tone === 'muted') return colors.textMuted
  return isLight ? colors.primaryDark : colors.primary
}

function toneBackground(colors: ColorTokens, tone: Tone) {
  if (tone === 'accent') return colors.toneAccentSurface
  if (tone === 'success') return colors.toneSuccessSurface
  if (tone === 'warning') return colors.toneWarningSurface
  if (tone === 'danger') return colors.toneDangerSurface
  if (tone === 'muted') return colors.toneMutedSurface
  return colors.tonePrimarySurface
}

export function AppScreen({
  children,
  scroll = false,
  padded = false,
  style,
  contentContainerStyle,
}: {
  children: ReactNode
  scroll?: boolean
  padded?: boolean
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const baseStyle = [styles.screen, { backgroundColor: colors.background }, style]
  const contentStyle = [
    padded && styles.paddedContent,
    { paddingBottom: insets.bottom + (padded ? spacing.xl : 0) },
    contentContainerStyle,
  ]

  if (scroll) {
    return (
      <ScrollView
        style={baseStyle}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    )
  }

  return <View style={baseStyle}>{children}</View>
}

export function PageScroll({
  children,
  style,
  contentContainerStyle,
  compact = false,
  edgeToEdge = false,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
  compact?: boolean
  edgeToEdge?: boolean
}) {
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.pageScroll, style]}
      contentContainerStyle={[
        styles.pageContent,
        compact && styles.pageContentCompact,
        edgeToEdge && styles.pageContentEdge,
        { paddingBottom: insets.bottom + spacing['4xl'] },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  )
}

export function BackgroundSurface({
  children,
  style,
  contentStyle,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
}) {
  const colors = useColors()

  return (
    <View style={[styles.backgroundSurface, { backgroundColor: colors.background }, style]}>
      <View style={[styles.backgroundContent, contentStyle]}>{children}</View>
    </View>
  )
}

export function GlassCard({
  children,
  style,
  padded = true,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  padded?: boolean
}) {
  return (
    <Card variant="glassCard" padded={padded} style={style}>
      {children}
    </Card>
  )
}

export function GlassPanel({
  children,
  style,
  padded = true,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  padded?: boolean
}) {
  return (
    <Card variant="glassPanel" padded={padded} style={style}>
      {children}
    </Card>
  )
}

export function GlassSurface({
  children,
  style,
  padded = true,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  padded?: boolean
}) {
  return (
    <Card variant="glass" padded={padded} style={style}>
      {children}
    </Card>
  )
}

export function GlassHeader({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  return (
    <View
      style={[
        styles.glassHeader,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function MobileNavigationBar({
  title,
  left,
  right,
  style,
}: {
  title: ReactNode
  left?: ReactNode
  right?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        styles.mobileNavigationBar,
        {
          paddingTop: insets.top,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
        style,
      ]}
    >
      <View style={styles.mobileNavigationContent}>
        <View style={styles.mobileNavigationSide}>{left}</View>
        <AppText variant="title" numberOfLines={1} style={styles.mobileNavigationTitle}>
          {title}
        </AppText>
        <View style={[styles.mobileNavigationSide, styles.mobileNavigationSideRight]}>{right}</View>
      </View>
    </View>
  )
}

export function MobileBackButton({
  onPress,
  accessibilityLabel,
}: {
  onPress: () => void
  accessibilityLabel?: string
}) {
  const colors = useColors()
  return (
    <ToolbarButton
      icon={ChevronLeft}
      iconColor={colors.text}
      iconSize={iconSize['3xl']}
      onPress={() => {
        selectionHaptic()
        onPress()
      }}
      hitSlop={spacing.md}
      accessibilityLabel={accessibilityLabel}
      variant="ghost"
    />
  )
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  action,
  style,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const Icon = icon
  return (
    <View style={[styles.panelHeader, style]}>
      {Icon ? <IconBubble icon={Icon} /> : null}
      <View style={styles.panelHeaderBody}>
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" tone="secondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  )
}

export function GlassPressable({
  children,
  onPress,
  style,
  disabled,
}: {
  children: ReactNode
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  disabled?: boolean
}) {
  return (
    <CardPressable variant="glassCard" disabled={disabled} onPress={onPress} style={style}>
      {children}
    </CardPressable>
  )
}

export function GlassList({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Card variant="glassPanel" padded={false} style={[styles.glassList, style]}>
      {children}
    </Card>
  )
}

export function GlassListItem({
  children,
  onPress,
  disabled,
  last = false,
  style,
}: {
  children: ReactNode
  onPress?: () => void
  disabled?: boolean
  last?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.glassListItem,
        {
          backgroundColor: pressed ? colors.messageHover : colors.surface,
          borderBottomColor: colors.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          transform: [{ scale: pressed ? ROW_PRESS_SCALE : 1 }],
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  )
}

export function SurfaceList({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  return <View style={[styles.surfaceList, { borderColor: colors.border }, style]}>{children}</View>
}

export function SurfaceListItem({
  children,
  onPress,
  disabled,
  last = false,
  style,
}: {
  children: ReactNode
  onPress?: () => void
  disabled?: boolean
  last?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.surfaceListItem,
        {
          backgroundColor: pressed ? colors.messageHover : colors.surface,
          borderBottomColor: colors.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          transform: [{ scale: pressed ? ROW_PRESS_SCALE : 1 }],
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  )
}

export function Card({
  children,
  variant = 'default',
  style,
  padded = true,
  active = false,
}: {
  children: ReactNode
  variant?: CardVariant
  style?: StyleProp<ViewStyle>
  padded?: boolean
  active?: boolean
}) {
  const colors = useColors()
  return (
    <View
      style={[
        styles.cardBase,
        cardVariantStyle(colors, variant),
        active && styles.cardActive,
        active && {
          borderColor: colors.primary,
          backgroundColor: activeCardBackground(colors, variant),
        },
        padded && styles.cardPadded,
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function CardPressable({
  children,
  variant = 'default',
  style,
  disabled,
  onPress,
  onLongPress,
  active = false,
  padded = true,
  accessibilityRole,
  accessibilityLabel,
}: {
  children: ReactNode
  variant?: CardVariant
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  onPress?: () => void
  onLongPress?: () => void
  active?: boolean
  padded?: boolean
  accessibilityRole?: AccessibilityRole
  accessibilityLabel?: string
}) {
  const colors = useColors()
  const variantStyle = cardVariantStyle(colors, variant)
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.cardBase,
        variantStyle,
        active && styles.cardActive,
        active && { borderColor: colors.primary },
        padded && styles.cardPadded,
        {
          transform: [{ scale: pressed ? 0.98 : 1 }],
          backgroundColor: pressed
            ? pressedCardBackground(colors, variant)
            : active
              ? activeCardBackground(colors, variant)
              : variantStyle.backgroundColor,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  )
}

export function AppText({
  variant = 'body',
  tone,
  style,
  children,
  ...props
}: TextProps & {
  variant?: 'label' | 'body' | 'bodyStrong' | 'title' | 'headline'
  tone?: Tone | 'primaryText' | 'secondary'
}) {
  const colors = useColors()
  const color =
    tone === 'primaryText'
      ? colors.text
      : tone === 'secondary'
        ? colors.textSecondary
        : tone
          ? toneColor(colors, tone)
          : colors.text
  return (
    <Text style={[textStyles[variant], { color }, style]} {...props}>
      {children}
    </Text>
  )
}

export function Typography({
  variant = 'body',
  children,
  style,
  ...props
}: TextProps & {
  variant?: TypographyVariant
}) {
  const colors = useColors()
  const color =
    variant === 'body'
      ? colors.textSecondary
      : variant === 'small' || variant === 'micro'
        ? colors.textMuted
        : colors.text
  return (
    <Text style={[typographyStyles[variant], { color }, style]} {...props}>
      {children}
    </Text>
  )
}

export function IconBubble({
  icon: Icon,
  tone = 'primary',
  size = iconSize.lg,
  style,
}: {
  icon: LucideIcon
  tone?: Tone
  size?: number
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const color = toneColor(colors, tone)
  return (
    <View style={[styles.iconBubble, { backgroundColor: toneBackground(colors, tone) }, style]}>
      <Icon size={size} color={color} strokeWidth={2.4} />
    </View>
  )
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  icon: Icon,
  iconRight: IconRight,
  iconColor,
  iconSize,
  style,
  containerStyle,
  textStyle,
  hitSlop,
  accessibilityLabel,
  accessibilityRole,
}: ButtonProps) {
  const colors = useColors()
  const foreground =
    variant === 'danger'
      ? palette.white
      : variant === 'glass' || variant === 'ghost' || variant === 'outline'
        ? variant === 'outline'
          ? colors.primary
          : colors.text
        : palette.foundation
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      hitSlop={hitSlop}
      style={containerStyle}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole ?? 'button'}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.buttonBase,
            buttonSizeStyle(size),
            buttonVariantStyle(colors, variant, pressed),
            style,
            {
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={foreground} />
          ) : Icon ? (
            <Icon
              size={iconSize ?? buttonIconSize(size)}
              color={iconColor ?? foreground}
              strokeWidth={2.5}
            />
          ) : null}
          {size !== 'icon' && (
            <Text
              style={[
                styles.buttonText,
                buttonTextSizeStyle(size),
                { color: foreground },
                textStyle,
              ]}
            >
              {children}
            </Text>
          )}
          {IconRight && size !== 'icon' && (
            <IconRight size={buttonIconSize(size)} color={foreground} strokeWidth={2.5} />
          )}
        </View>
      )}
    </Pressable>
  )
}

export function JellyButton(
  props: Omit<ButtonProps, 'variant'> & { tone?: 'primary' | 'accent' | 'danger' },
) {
  const { tone = 'primary', ...rest } = props
  const variant = tone === 'accent' ? 'secondary' : tone === 'danger' ? 'danger' : 'primary'
  return <Button variant={variant} {...rest} />
}

export function IconButton({
  icon,
  badge,
  variant = 'glass',
  size = 'icon',
  hitSlop = spacing.tight,
  style,
  containerStyle,
  ...props
}: Omit<ButtonProps, 'children' | 'icon'> & {
  icon: LucideIcon
  badge?: ReactNode
}) {
  const colors = useColors()
  return (
    <View style={[styles.iconButtonShell, containerStyle]}>
      <Button
        icon={icon}
        variant={variant}
        size={size}
        hitSlop={hitSlop}
        style={style}
        {...props}
      />
      {badge ? (
        <View
          pointerEvents="none"
          style={[
            styles.iconButtonBadge,
            { backgroundColor: colors.error, borderColor: colors.background },
          ]}
        >
          {typeof badge === 'string' || typeof badge === 'number' ? (
            <Text style={styles.iconButtonBadgeText} numberOfLines={1}>
              {badge}
            </Text>
          ) : (
            badge
          )}
        </View>
      ) : null}
    </View>
  )
}

export function ToolbarButton({
  active,
  variant,
  ...props
}: Omit<Parameters<typeof IconButton>[0], 'variant'> & {
  active?: boolean
  variant?: ButtonVariant
}) {
  return <IconButton variant={active ? 'primary' : (variant ?? 'glass')} {...props} />
}

export function FloatingActionButton({
  variant = 'primary',
  style,
  ...props
}: Omit<Parameters<typeof IconButton>[0], 'variant'> & {
  variant?: Extract<ButtonVariant, 'primary' | 'secondary' | 'accent' | 'danger' | 'glass'>
}) {
  return <IconButton variant={variant} style={[styles.floatingActionButton, style]} {...props} />
}

export function ChipButton({
  label,
  active = false,
  tone = 'primary',
  icon,
  iconRight,
  onPress,
  disabled,
  loading,
  style,
  containerStyle,
}: {
  label: ReactNode
  active?: boolean
  tone?: 'primary' | 'accent' | 'danger'
  icon?: LucideIcon
  iconRight?: LucideIcon
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
  containerStyle?: StyleProp<ViewStyle>
}) {
  const activeVariant = tone === 'accent' ? 'secondary' : tone === 'danger' ? 'danger' : 'primary'
  return (
    <Button
      icon={icon}
      iconRight={iconRight}
      loading={loading}
      disabled={disabled}
      onPress={onPress}
      variant={active ? activeVariant : 'glass'}
      size="xs"
      style={style}
      containerStyle={containerStyle}
    >
      {label}
    </Button>
  )
}

export function ButtonGroup({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return <View style={[styles.buttonGroup, style]}>{children}</View>
}

export function ActionTile({
  icon,
  label,
  tone = 'primary',
  badge,
  onPress,
  style,
}: {
  icon: LucideIcon
  label: ReactNode
  tone?: Tone
  badge?: ReactNode
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}) {
  return (
    <CardPressable
      variant="glassCard"
      padded={false}
      onPress={onPress}
      style={[styles.actionTile, style]}
    >
      <IconBubble icon={icon} tone={tone} size={iconSize.lg} style={styles.actionTileIcon} />
      <AppText variant="label" tone="secondary" style={styles.actionTileLabel} numberOfLines={2}>
        {label}
      </AppText>
      {badge ? <View style={styles.actionTileBadge}>{badge}</View> : null}
    </CardPressable>
  )
}

export function AppSwitch({
  value,
  onValueChange,
  disabled = false,
  style,
}: {
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => {
        selectionHaptic()
        onValueChange(!value)
      }}
      style={({ pressed }) => [
        styles.appSwitchTrack,
        {
          backgroundColor: value ? colors.primary : colors.inputBackground,
          borderColor: value ? colors.primary : colors.border,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        style,
      ]}
    >
      <View style={[styles.appSwitchThumb, { transform: [{ translateX: value ? 20 : 0 }] }]} />
    </Pressable>
  )
}

export function TextField({
  label,
  error,
  icon: FieldIcon,
  style,
  containerStyle,
  inputStyle,
  left,
  right,
  ...props
}: Omit<TextInputProps, 'style'> & {
  label?: ReactNode
  error?: boolean
  icon?: LucideIcon
  containerStyle?: StyleProp<ViewStyle>
  style?: StyleProp<ViewStyle>
  inputStyle?: StyleProp<TextStyle>
  left?: ReactNode
  right?: ReactNode
}) {
  const colors = useColors()
  return (
    <View style={[styles.fieldGroup, containerStyle]}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <InputValley
        style={[
          styles.textField,
          {
            borderColor: error ? colors.error : colors.border,
          },
          style,
        ]}
        focusedBorderColor={error ? colors.error : colors.primary}
      >
        {FieldIcon ? (
          <FieldIcon size={iconSize.lg} color={colors.textMuted} strokeWidth={2.5} />
        ) : (
          left
        )}
        <TextInput
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={colors.mode === 'dark' ? 'dark' : 'light'}
          style={[styles.textFieldInput, { color: colors.text }, inputStyle]}
          {...props}
        />
        {right}
      </InputValley>
    </View>
  )
}

export function InputValley({
  children,
  style,
  focused = false,
  focusedBorderColor,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  focused?: boolean
  focusedBorderColor?: string
}) {
  const colors = useColors()
  return (
    <View
      style={[
        styles.inputValley,
        {
          backgroundColor: colors.inputBackground,
          borderColor: focused ? (focusedBorderColor ?? colors.primary) : colors.border,
        },
        focused && styles.inputValleyFocused,
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function FormField({
  label,
  children,
  hint,
  error,
  style,
}: {
  label?: ReactNode
  children: ReactNode
  hint?: ReactNode
  error?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.fieldGroup, style]}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      {children}
      {error ? (
        <AppText variant="label" tone="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="label" tone="secondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  )
}

export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  tone = 'primary',
}: {
  icon?: LucideIcon
  title: ReactNode
  subtitle?: ReactNode
  onPress?: () => void
  right?: ReactNode
  tone?: Tone
}) {
  const colors = useColors()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        {
          backgroundColor: pressed ? colors.messageHover : colors.surface,
          transform: [{ scale: pressed ? ROW_PRESS_SCALE : 1 }],
        },
      ]}
    >
      {icon && <IconBubble icon={icon} tone={tone} size={iconSize.md} />}
      <View style={styles.listRowBody}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" tone="secondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </Pressable>
  )
}

export function Badge({
  children,
  variant = 'primary',
  size = 'sm',
  style,
  textStyle,
}: {
  children: ReactNode
  variant?: BadgeVariant
  size?: 'xs' | 'sm' | 'md'
  style?: StyleProp<ViewStyle>
  textStyle?: TextStyle
}) {
  const colors = useColors()
  const tone = badgeTone(colors, variant)
  const surface = badgeSurface(colors, variant)
  return (
    <View
      style={[
        styles.badge,
        badgeSizeStyle(size),
        { backgroundColor: surface, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[styles.badgeText, { color: tone }, textStyle]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  )
}

export function Separator({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors()
  return <View style={[styles.separator, { backgroundColor: colors.border }, style]} />
}

export const Divider = Separator

export function Indicator({
  status = 'online',
  size = 'md',
  style,
}: {
  status?: 'online' | 'idle' | 'dnd' | 'offline' | 'running' | 'error' | string
  size?: 'sm' | 'md' | 'lg'
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const color =
    status === 'online' || status === 'running'
      ? colors.success
      : status === 'idle'
        ? colors.warning
        : status === 'dnd' || status === 'error'
          ? colors.error
          : colors.statusOffline
  const dimension = size === 'lg' ? 16 : size === 'sm' ? 10 : 12
  return (
    <View
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}

export function Spinner({ size = 'small', color }: { size?: 'small' | 'large'; color?: string }) {
  const colors = useColors()
  return <ActivityIndicator size={size} color={color ?? colors.primary} />
}

export function EmptyState({
  title,
  description,
  icon: Icon = FileQuestion,
  action,
  style,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  return (
    <View style={[styles.emptyState, style]}>
      <View
        style={[styles.emptyIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Icon size={iconSize['3xl']} color={colors.textMuted} strokeWidth={1.8} />
      </View>
      <AppText variant="title" style={styles.emptyTitle}>
        {title}
      </AppText>
      {description ? (
        <AppText tone="secondary" style={styles.emptyDescription}>
          {description}
        </AppText>
      ) : null}
      {action}
    </View>
  )
}

export function SectionHeader({
  title,
  subtitle,
  action,
  icon,
  style,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: LucideIcon
  style?: StyleProp<ViewStyle>
}) {
  const Icon = icon
  return (
    <View style={[styles.sectionHeader, style]}>
      {Icon ? <IconBubble icon={Icon} /> : null}
      <View style={styles.sectionHeaderBody}>
        <AppText variant="title">{title}</AppText>
        {subtitle ? (
          <AppText variant="label" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  )
}

export function Section({
  title,
  subtitle,
  action,
  icon,
  children,
  variant = 'glassCard',
  padded = false,
  compact = true,
  style,
  headerStyle,
  cardStyle,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: LucideIcon
  children: ReactNode
  variant?: CardVariant
  padded?: boolean
  compact?: boolean
  style?: StyleProp<ViewStyle>
  headerStyle?: StyleProp<ViewStyle>
  cardStyle?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.sectionBlock, style]}>
      {title ? (
        <View style={[styles.sectionCompactHeader, headerStyle]}>
          {icon ? (
            <IconBubble icon={icon} size={iconSize.md} style={styles.sectionCompactIcon} />
          ) : null}
          <View style={styles.sectionCompactBody}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="label" tone="secondary" numberOfLines={2}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}
      <Card
        variant={variant}
        padded={padded}
        style={[styles.sectionCard, compact && styles.sectionCardCompact, cardStyle]}
      >
        {children}
      </Card>
    </View>
  )
}

export function ListHeader({
  title,
  count,
  action,
  style,
}: {
  title: ReactNode
  count?: ReactNode
  action?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  return (
    <View style={[styles.listHeader, style]}>
      <AppText variant="label" tone="secondary" style={styles.listHeaderTitle}>
        {title}
      </AppText>
      <View style={[styles.listHeaderLine, { backgroundColor: colors.border }]} />
      {count !== undefined ? (
        <Badge variant="neutral" size="xs">
          {count}
        </Badge>
      ) : null}
      {action ? <View style={styles.listHeaderAction}>{action}</View> : null}
    </View>
  )
}

export function MobileTabBar<T extends string>({
  value,
  options,
  onChange,
  style,
  tone = 'primary',
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; count?: ReactNode; icon?: LucideIcon }>
  onChange: (value: T, index: number) => void
  style?: StyleProp<ViewStyle>
  tone?: Extract<Tone, 'primary' | 'accent'>
}) {
  const colors = useColors()
  const activeColor = toneColor(colors, tone)
  const scrollRef = useRef<ScrollView>(null)
  const tabLayouts = useRef<Partial<Record<T, { x: number; width: number }>>>({})
  const [viewportWidth, setViewportWidth] = useState(0)

  useEffect(() => {
    const layout = tabLayouts.current[value]
    if (!layout || viewportWidth <= 0) return
    const centeredOffset = Math.max(0, layout.x - (viewportWidth - layout.width) / 2)
    scrollRef.current?.scrollTo({ x: centeredOffset, animated: true })
  }, [value, viewportWidth])

  return (
    <View
      style={[styles.mobileTabBar, { borderBottomColor: colors.border }, style]}
      onLayout={({ nativeEvent }) => {
        const nextWidth = nativeEvent.layout.width
        setViewportWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth))
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mobileTabContent}
      >
        {options.map((option, index) => {
          const active = value === option.value
          const Icon = option.icon
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              hitSlop={spacing.xs}
              onLayout={({ nativeEvent }) => {
                const layout = nativeEvent.layout
                tabLayouts.current[option.value] = layout
                if (!active || viewportWidth <= 0) return
                const centeredOffset = Math.max(0, layout.x - (viewportWidth - layout.width) / 2)
                scrollRef.current?.scrollTo({ x: centeredOffset, animated: false })
              }}
              onPress={() => {
                if (!active) selectionHaptic()
                onChange(option.value, index)
              }}
              style={({ pressed }) => [
                styles.mobileTabPill,
                {
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  backgroundColor: active
                    ? colors.surface
                    : pressed
                      ? colors.surfaceHover
                      : colors.surface,
                  borderBottomColor: active ? activeColor : colors.surface,
                },
              ]}
            >
              {Icon ? (
                <Icon
                  size={iconSize.md}
                  color={active ? activeColor : colors.textMuted}
                  strokeWidth={2.5}
                />
              ) : null}
              <AppText
                variant="label"
                numberOfLines={1}
                style={[
                  styles.mobileTabText,
                  { color: active ? colors.text : colors.textSecondary },
                ]}
              >
                {option.label}
              </AppText>
              {option.count !== undefined ? (
                <Text
                  style={[
                    styles.mobileTabCount,
                    { color: active ? activeColor : colors.textMuted },
                  ]}
                >
                  {option.count}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

export function MobileSwipeTabs<T extends string>({
  value,
  options,
  onChange,
  renderPage,
  style,
  tabBarStyle,
  pageStyle,
  tone = 'primary',
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; count?: ReactNode; icon?: LucideIcon }>
  onChange: (value: T, index: number) => void
  renderPage: (
    option: { value: T; label: ReactNode; count?: ReactNode; icon?: LucideIcon },
    index: number,
  ) => ReactNode
  style?: StyleProp<ViewStyle>
  tabBarStyle?: StyleProp<ViewStyle>
  pageStyle?: StyleProp<ViewStyle>
  tone?: Extract<Tone, 'primary' | 'accent'>
}) {
  const scrollRef = useRef<ScrollView>(null)
  const previousViewportWidthRef = useRef(0)
  const [viewportWidth, setViewportWidth] = useState(0)
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  useEffect(() => {
    if (viewportWidth <= 0) return
    const animated = previousViewportWidthRef.current === viewportWidth
    previousViewportWidthRef.current = viewportWidth
    scrollRef.current?.scrollTo({ x: activeIndex * viewportWidth, animated })
  }, [activeIndex, viewportWidth])

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (viewportWidth <= 0 || options.length === 0) return
    const index = Math.max(
      0,
      Math.min(options.length - 1, Math.round(event.nativeEvent.contentOffset.x / viewportWidth)),
    )
    const next = options[index]
    if (!next || next.value === value) return
    selectionHaptic()
    onChange(next.value, index)
  }

  return (
    <View
      style={[styles.mobileSwipeTabs, style]}
      onLayout={({ nativeEvent }) => {
        const nextWidth = nativeEvent.layout.width
        setViewportWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth))
      }}
    >
      <MobileTabBar
        value={value}
        options={options}
        onChange={onChange}
        tone={tone}
        style={tabBarStyle}
      />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {options.map((option, index) => (
          <View
            key={option.value}
            style={[styles.mobileSwipePage, { width: viewportWidth }, pageStyle]}
          >
            {renderPage(option, index)}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

export function KeyValueRow({
  label,
  value,
  valueTone,
  valueStyle,
  mono = false,
  last = false,
}: {
  label: ReactNode
  value: ReactNode
  valueTone?: Tone | 'primaryText' | 'secondary'
  valueStyle?: StyleProp<TextStyle>
  mono?: boolean
  last?: boolean
}) {
  const colors = useColors()
  return (
    <View
      style={[
        styles.keyValueRow,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <AppText variant="label" tone="secondary" style={styles.keyValueLabel} numberOfLines={1}>
        {label}
      </AppText>
      {typeof value === 'string' || typeof value === 'number' ? (
        <AppText
          variant="label"
          tone={valueTone}
          style={[styles.keyValueValue, mono && styles.monoValue, valueStyle]}
          numberOfLines={2}
        >
          {value}
        </AppText>
      ) : (
        <View style={styles.keyValueCustom}>{value}</View>
      )}
    </View>
  )
}

export function StatusNotice({
  children,
  tone = 'primary',
  style,
}: {
  children: ReactNode
  tone?: Tone
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  return (
    <View
      style={[
        styles.statusNotice,
        { backgroundColor: toneBackground(colors, tone), borderColor: colors.border },
        style,
      ]}
    >
      <AppText variant="label" tone={tone}>
        {children}
      </AppText>
    </View>
  )
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  icon,
}: {
  title: ReactNode
  subtitle?: ReactNode
  value: boolean
  onValueChange: (value: boolean) => void
  icon?: LucideIcon
}) {
  return (
    <ListRow
      icon={icon}
      title={title}
      subtitle={subtitle}
      onPress={() => {
        selectionHaptic()
        onValueChange(!value)
      }}
      right={<AppSwitch value={value} onValueChange={onValueChange} />}
    />
  )
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string; icon?: LucideIcon }>
  onChange: (value: T) => void
}) {
  const colors = useColors()
  return (
    <View style={[styles.segmented, { backgroundColor: colors.inputBackground }]}>
      {options.map((option) => {
        const active = value === option.value
        const Icon = option.icon
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!active) selectionHaptic()
              onChange(option.value)
            }}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: active
                  ? colors.surface
                  : pressed
                    ? colors.surfaceHover
                    : colors.inputBackground,
                borderColor: active ? colors.primary : colors.inputBackground,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            {Icon && <Icon size={iconSize.sm} color={active ? colors.primary : colors.textMuted} />}
            <Text
              style={[
                styles.segmentText,
                { color: active ? colors.primary : colors.textSecondary },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  action,
  style,
}: {
  visible: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  action?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      >
        <Pressable
          onPress={() => null}
          style={[styles.sheetPanel, { paddingBottom: insets.bottom + spacing.lg }, style]}
        >
          <GlassPanel style={styles.sheetGlass}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            {title ? (
              <PanelHeader
                title={title}
                subtitle={subtitle}
                action={action}
                style={styles.sheetHeader}
              />
            ) : null}
            {children}
          </GlassPanel>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export function Dialog({
  visible,
  onClose,
  title,
  description,
  children,
  actions,
}: {
  visible: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  actions?: ReactNode
}) {
  const colors = useColors()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.dialogOverlay, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      >
        <Pressable onPress={() => null} style={styles.dialogPressable}>
          <GlassPanel style={styles.dialogPanel}>
            {title ? (
              <AppText variant="title" style={styles.dialogTitle}>
                {title}
              </AppText>
            ) : null}
            {description ? (
              <AppText tone="secondary" style={styles.dialogDescription}>
                {description}
              </AppText>
            ) : null}
            {children}
            {actions ? <View style={styles.dialogActions}>{actions}</View> : null}
          </GlassPanel>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export function MenuItem({
  icon,
  left,
  title,
  subtitle,
  right,
  tone = 'primary',
  onPress,
  onLongPress,
  disabled,
}: {
  icon?: LucideIcon
  left?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  tone?: Tone
  onPress?: () => void
  onLongPress?: () => void
  disabled?: boolean
}) {
  const colors = useColors()
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.menuItem,
        {
          backgroundColor: pressed ? colors.messageHover : colors.surface,
          transform: [{ scale: pressed ? ROW_PRESS_SCALE : 1 }],
        },
      ]}
    >
      {left ?? (icon ? <IconBubble icon={icon} tone={tone} size={iconSize.md} /> : null)}
      <View style={styles.menuItemBody}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" tone="secondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </Pressable>
  )
}

export function ActionButton({
  label,
  icon,
  tone = 'primary',
  onPress,
  disabled,
  loading,
  style,
}: {
  label: ReactNode
  icon?: LucideIcon
  tone?: 'primary' | 'accent' | 'danger' | 'glass'
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const variant =
    tone === 'accent'
      ? 'secondary'
      : tone === 'danger'
        ? 'danger'
        : tone === 'glass'
          ? 'glass'
          : 'primary'
  return (
    <Button
      icon={icon}
      loading={loading}
      disabled={disabled}
      onPress={onPress}
      variant={variant}
      size="sm"
      style={style}
    >
      {label}
    </Button>
  )
}

export function MetricCard({
  label,
  value,
  icon,
  tone = 'primary',
  description,
  style,
}: {
  label: ReactNode
  value: ReactNode
  icon?: LucideIcon
  tone?: Tone
  description?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Card variant="stat" style={[styles.metricCard, style]}>
      <View style={styles.metricTop}>
        {icon ? <IconBubble icon={icon} tone={tone} size={iconSize.md} /> : null}
        <AppText variant="label" tone="secondary" numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText variant="headline" numberOfLines={1}>
        {value}
      </AppText>
      {description ? (
        <AppText variant="label" tone="secondary" numberOfLines={2}>
          {description}
        </AppText>
      ) : null}
    </Card>
  )
}

export function ChannelRow({
  title,
  subtitle,
  icon,
  tone = 'primary',
  active = false,
  right,
  onPress,
  onLongPress,
  flat = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  active?: boolean
  right?: ReactNode
  onPress?: () => void
  onLongPress?: () => void
  flat?: boolean
}) {
  const colors = useColors()
  const content = (
    <>
      {icon ? <IconBubble icon={icon} tone={tone} size={iconSize.md} /> : null}
      <View style={styles.channelRowBody}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" tone="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </>
  )

  if (flat) {
    const flatBackground = colors.mode === 'dark' ? palette.black : palette.white
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [
          styles.channelRow,
          styles.channelRowFlat,
          {
            backgroundColor: pressed || active ? colors.messageHover : flatBackground,
            borderColor: active ? colors.primary : colors.border,
          },
        ]}
      >
        {content}
      </Pressable>
    )
  }

  return (
    <CardPressable
      variant="glassCard"
      active={active}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.channelRow}
    >
      {content}
    </CardPressable>
  )
}

export function ChatWorkIndicator({
  items,
  style,
}: {
  items: Array<{ id?: string; label: ReactNode; tone?: Tone }>
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()

  if (items.length === 0) return null

  return (
    <GlassSurface padded={false} style={[styles.chatWorkIndicator, style]}>
      <View style={styles.typingDots}>
        <View style={[styles.typingDot, { backgroundColor: colors.primary }]} />
        <View style={[styles.typingDot, { backgroundColor: colors.textMuted }]} />
        <View style={[styles.typingDot, { backgroundColor: colors.primary }]} />
      </View>
      <View style={styles.chatWorkBody}>
        {items.slice(0, 2).map((item, index) => (
          <AppText
            key={item.id ?? index}
            variant="label"
            tone={item.tone ?? 'secondary'}
            numberOfLines={1}
          >
            {item.label}
          </AppText>
        ))}
      </View>
    </GlassSurface>
  )
}

function cardVariantStyle(colors: ColorTokens, variant: CardVariant): ViewStyle {
  if (variant === 'surface')
    return {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    }
  if (variant === 'gradient')
    return {
      backgroundColor: colors.surface,
      borderColor: colors.primary,
    }
  if (variant === 'danger')
    return {
      backgroundColor: colors.surface,
      borderColor: colors.error,
    }
  if (variant === 'glassPanel') {
    return {
      backgroundColor: colors.card,
      borderColor: colors.cardBorder,
      borderRadius: radius['2xl'],
    }
  }
  if (variant === 'glassCard') {
    return {
      backgroundColor: colors.card,
      borderColor: colors.cardBorder,
      borderRadius: radius.xl,
    }
  }
  if (variant === 'glass') {
    return {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    }
  }
  if (variant === 'stat')
    return {
      backgroundColor: colors.inputBackground,
      borderColor: colors.border,
      borderRadius: radius.xl,
    }
  return {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
  }
}

function isGlassVariant(variant: CardVariant) {
  return (
    variant === 'glass' || variant === 'glassPanel' || variant === 'glassCard' || variant === 'stat'
  )
}

function pressedCardBackground(colors: ColorTokens, variant: CardVariant) {
  if (isGlassVariant(variant)) return colors.surfaceHover
  return colors.surfaceHover
}

function activeCardBackground(colors: ColorTokens, variant: CardVariant) {
  if (isGlassVariant(variant)) return colors.surfaceHover
  return colors.surfaceHover
}

function buttonVariantStyle(
  colors: ColorTokens,
  variant: ButtonVariant,
  pressed: boolean,
): ViewStyle {
  if (variant === 'outline') {
    return {
      backgroundColor: pressed ? colors.surfaceHover : colors.surface,
      borderColor: colors.primary,
    }
  }
  if (variant === 'ghost') {
    return {
      backgroundColor: pressed ? colors.messageHover : colors.background,
      borderColor: colors.background,
    }
  }
  if (variant === 'glass') {
    return {
      backgroundColor: pressed ? colors.surfaceHover : colors.surface,
      borderColor: colors.border,
    }
  }
  if (variant === 'primary') {
    return {
      backgroundColor: pressed ? colors.primaryDark : colors.primary,
      borderColor: pressed ? colors.primaryDark : colors.primary,
    }
  }
  if (variant === 'secondary') {
    return {
      backgroundColor: pressed ? colors.accentStrong : colors.accent,
      borderColor: pressed ? colors.accentStrong : colors.accent,
    }
  }
  if (variant === 'accent') {
    return {
      backgroundColor: pressed ? colors.primaryDark : colors.primaryLight,
      borderColor: pressed ? colors.primaryDark : colors.primaryLight,
    }
  }
  if (variant === 'danger') {
    return {
      backgroundColor: pressed ? palette.crimsonDark : colors.error,
      borderColor: pressed ? palette.crimsonDark : colors.error,
    }
  }
  return {
    backgroundColor: pressed ? colors.surfaceHover : colors.surface,
    borderColor: colors.border,
  }
}

function buttonSizeStyle(size: ButtonSize): ViewStyle {
  if (size === 'xs') return styles.buttonXs
  if (size === 'sm') return styles.buttonSm
  if (size === 'lg') return styles.buttonLg
  if (size === 'xl') return styles.buttonXl
  if (size === 'icon') return styles.buttonIcon
  return styles.buttonMd
}

function buttonTextSizeStyle(size: ButtonSize): TextStyle {
  if (size === 'xs') return styles.buttonTextXs
  if (size === 'sm') return styles.buttonTextSm
  if (size === 'lg') return styles.buttonTextLg
  if (size === 'xl') return styles.buttonTextXl
  return styles.buttonTextMd
}

function buttonIconSize(size: ButtonSize) {
  if (size === 'xs') return iconSize.sm
  if (size === 'sm') return iconSize.md
  if (size === 'xl') return iconSize.xl
  return iconSize.lg
}

function badgeTone(colors: ColorTokens, variant: BadgeVariant) {
  if (variant === 'accent') return colors.mode === 'light' ? colors.accentStrong : colors.accent
  if (variant === 'success') return colors.success
  if (variant === 'warning') return colors.warning
  if (variant === 'danger') return colors.error
  if (variant === 'info') return colors.info
  if (variant === 'neutral') return colors.textMuted
  return colors.primary
}

function badgeSurface(colors: ColorTokens, variant: BadgeVariant) {
  if (variant === 'accent') return colors.toneAccentSurface
  if (variant === 'success') return colors.toneSuccessSurface
  if (variant === 'warning') return colors.toneWarningSurface
  if (variant === 'danger') return colors.toneDangerSurface
  if (variant === 'info') return colors.toneMutedSurface
  if (variant === 'neutral') return colors.inputBackground
  return colors.tonePrimarySurface
}

function badgeSizeStyle(size: 'xs' | 'sm' | 'md'): ViewStyle {
  if (size === 'xs') return styles.badgeXs
  if (size === 'md') return styles.badgeMd
  return styles.badgeSm
}

const textStyles = StyleSheet.create({
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: lineHeight.xs,
    letterSpacing: letterSpacing.none,
  },
  body: {
    fontSize: fontSize.md,
    fontWeight: '500',
    lineHeight: lineHeight.md,
  },
  bodyStrong: {
    fontSize: fontSize.md,
    fontWeight: '800',
    lineHeight: lineHeight.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    lineHeight: lineHeight.lg,
  },
  headline: {
    fontSize: fontSize['2xl'],
    fontWeight: '900',
    lineHeight: lineHeight.xl,
  },
})

const typographyStyles = StyleSheet.create({
  h1: {
    fontSize: fontSize['4xl'],
    fontWeight: '900',
    lineHeight: lineHeight['3xl'],
  },
  h2: {
    fontSize: fontSize['3xl'],
    fontWeight: '900',
    lineHeight: lineHeight.xl,
  },
  h3: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    lineHeight: lineHeight.lg,
  },
  body: {
    fontSize: fontSize.md,
    fontWeight: '700',
    lineHeight: lineHeight.md,
  },
  small: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    lineHeight: lineHeight.sm,
  },
  micro: {
    fontSize: fontSize.micro,
    fontWeight: '900',
    lineHeight: lineHeight.micro,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
  },
})

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  backgroundSurface: {
    flex: 1,
    overflow: 'hidden',
  },
  backgroundContent: {
    flex: 1,
  },
  paddedContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  pageContentCompact: {
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  pageContentEdge: {
    paddingHorizontal: spacing.none,
    paddingTop: spacing.none,
  },
  cardBase: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius['2xl'],
  },
  cardPadded: {
    padding: spacing.lg,
  },
  cardActive: {},
  glassHeader: {
    minHeight: size.navBar,
    overflow: 'hidden',
    borderBottomWidth: border.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  mobileNavigationBar: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mobileNavigationContent: {
    minHeight: size.navBar,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  mobileNavigationSide: {
    width: size.navSide,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mobileNavigationSideRight: {
    justifyContent: 'flex-end',
  },
  mobileNavigationTitle: {
    flex: 1,
    textAlign: 'center',
  },
  glassList: {
    borderRadius: radius['2xl'],
  },
  glassListItem: {
    minHeight: size.listItemLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  surfaceList: {
    alignSelf: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  surfaceListItem: {
    minHeight: size.avatarXl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  panelHeader: {
    minHeight: size.tabBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  panelHeaderBody: {
    flex: 1,
    minWidth: 0,
  },
  iconBubble: {
    width: size.iconBubble,
    height: size.iconBubble,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBase: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    borderWidth: border.hairline,
    borderColor: palette.black,
  },
  buttonXs: {
    minHeight: size.controlXs,
    paddingHorizontal: spacing.md,
  },
  buttonSm: {
    minHeight: size.iconButtonMd,
    paddingHorizontal: spacing.lg,
  },
  buttonMd: {
    minHeight: size.controlMd,
    paddingHorizontal: spacing['2xl'],
  },
  buttonLg: {
    minHeight: size.navBar,
    paddingHorizontal: spacing['4xl'],
  },
  buttonXl: {
    minHeight: size.avatarXl,
    paddingHorizontal: spacing['5xl'],
  },
  buttonIcon: {
    width: size.controlMd,
    height: size.controlMd,
    paddingHorizontal: spacing.none,
  },
  buttonText: {
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
  },
  buttonTextXs: {
    fontSize: fontSize.micro,
    lineHeight: lineHeight.micro,
  },
  buttonTextSm: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  buttonTextMd: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.xs,
  },
  buttonTextLg: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.sm,
  },
  buttonTextXl: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
  },
  iconButtonShell: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  iconButtonBadge: {
    position: 'absolute',
    top: -spacing.xxs,
    right: -spacing.xxs,
    minWidth: size.badgeMd,
    height: size.badgeMd,
    borderRadius: radius.full,
    borderWidth: border.active,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  iconButtonBadgeText: {
    color: palette.white,
    fontSize: fontSize.micro,
    fontWeight: '900',
    lineHeight: lineHeight.micro,
  },
  floatingActionButton: {},
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionTile: {
    flex: 1,
    minHeight: size.actionTileMin,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
  },
  actionTileIcon: {
    width: size.iconTile,
    height: size.iconTile,
    borderRadius: radius.lg,
  },
  actionTileLabel: {
    textAlign: 'center',
  },
  actionTileBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  appSwitchTrack: {
    width: size.controlLg,
    height: size.controlXs,
    borderRadius: radius.full,
    borderWidth: border.active,
    padding: spacing.xxs,
    justifyContent: 'center',
  },
  appSwitchThumb: {
    width: size.badgeLg,
    height: size.badgeLg,
    borderRadius: radius.full,
    backgroundColor: palette.white,
  },
  textField: {
    minHeight: size.controlLg,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  inputValley: {
    borderRadius: radius.xl,
    borderWidth: border.hairline,
  },
  inputValleyFocused: {},
  textFieldInput: {
    flex: 1,
    minHeight: size.controlLg,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    paddingVertical: spacing.none,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  listRow: {
    minHeight: size.navBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  listRowBody: {
    flex: 1,
    minWidth: 0,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  keyValueRow: {
    minHeight: size.navBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  keyValueLabel: {
    width: size.keyValueLabel,
  },
  keyValueValue: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  keyValueCustom: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  monoValue: {
    fontFamily: 'monospace',
    fontSize: fontSize.micro,
  },
  statusNotice: {
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: border.hairline,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeXs: {
    paddingHorizontal: spacing.tight,
    paddingVertical: spacing.xxs,
  },
  badgeSm: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
  },
  badgeMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    fontSize: fontSize.micro,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  emptyIcon: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyDescription: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  sectionHeader: {
    minHeight: size.navBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionHeaderBody: {
    flex: 1,
    minWidth: 0,
  },
  sectionBlock: {
    gap: spacing.xs,
  },
  sectionCompactHeader: {
    minHeight: size.iconTile,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionCompactIcon: {
    width: size.sectionCompactIcon,
    height: size.sectionCompactIcon,
    borderRadius: radius.md,
  },
  sectionCompactBody: {
    flex: 1,
    minWidth: 0,
  },
  sectionCard: {
    overflow: 'hidden',
  },
  sectionCardCompact: {
    borderRadius: radius.xl,
  },
  listHeader: {
    minHeight: size.iconButtonMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  listHeaderTitle: {
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
  },
  listHeaderLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  listHeaderAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mobileTabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
  mobileTabContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minWidth: '100%',
    paddingHorizontal: spacing.none,
  },
  mobileTabPill: {
    flexGrow: 1,
    flexShrink: 0,
    minWidth: size.navSide,
    minHeight: size.controlLg,
    borderBottomWidth: border.active,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  mobileTabText: {
    flexShrink: 1,
  },
  mobileTabCount: {
    fontWeight: '900',
  },
  mobileSwipeTabs: {
    width: '100%',
  },
  mobileSwipePage: {
    paddingBottom: spacing.xl,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.full,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segment: {
    minHeight: size.iconButtonMd,
    flex: 1,
    borderRadius: radius.full,
    borderWidth: border.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  segmentText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sheetGlass: {
    borderBottomLeftRadius: radius.none,
    borderBottomRightRadius: radius.none,
    gap: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: size.sheetHandleWidth,
    height: size.sheetHandleHeight,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  sheetHeader: {
    minHeight: size.controlLg,
  },
  dialogOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialogPressable: {
    width: '100%',
    maxWidth: size.dialogMaxWidth,
  },
  dialogPanel: {
    gap: spacing.md,
  },
  dialogTitle: {
    textAlign: 'left',
  },
  dialogDescription: {
    lineHeight: lineHeight.md,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  menuItem: {
    minHeight: size.tabBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  menuItemBody: {
    flex: 1,
    minWidth: 0,
  },
  metricCard: {
    flex: 1,
    minWidth: size.metricMinWidth,
    gap: spacing.sm,
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  channelRow: {
    minHeight: size.avatarXl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  channelRowFlat: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  channelRowBody: {
    flex: 1,
    minWidth: 0,
  },
  chatWorkIndicator: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  chatWorkBody: {
    gap: spacing.px,
    maxWidth: size.chatWorkMaxWidth,
  },
  typingDots: {
    width: size.iconButtonSm,
    height: size.badgeMd,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  typingDot: {
    width: size.dotXs,
    height: size.dotXs,
    borderRadius: radius.full,
  },
})
