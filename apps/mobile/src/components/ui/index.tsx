import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { FileQuestion, type LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import {
  type AccessibilityRole,
  ActivityIndicator,
  ImageBackground,
  Modal,
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
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { getBackgroundSource } from '../../lib/backgrounds'
import { useUIStore } from '../../stores/ui.store'
import { type ColorTokens, fontSize, radius, spacing, useColors } from '../../theme'

export type Tone = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'danger'
  | 'glass'
  | 'ghost'
  | 'outline'
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
export type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
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
}

function toneColor(colors: ColorTokens, tone: Tone) {
  if (tone === 'accent') return colors.accent
  if (tone === 'success') return colors.success
  if (tone === 'warning') return colors.warning
  if (tone === 'danger') return colors.error
  if (tone === 'muted') return colors.textMuted
  return colors.primary
}

function GlassChrome({ variant }: { variant: CardVariant }) {
  const colors = useColors()
  if (!isGlassVariant(variant)) return null

  const strong = colors.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.72)'
  const soft = colors.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.32)'

  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', soft, strong, soft, 'transparent']}
        locations={[0, 0.18, 0.5, 0.82, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardRimTop}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', soft, 'transparent']}
        locations={[0, 0.35, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardRimLeft}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', soft, 'transparent']}
        locations={[0, 0.35, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardRimRight}
      />
    </>
  )
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
      <ScrollView style={baseStyle} contentContainerStyle={contentStyle}>
        {children}
      </ScrollView>
    )
  }

  return <View style={baseStyle}>{children}</View>
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
  const backgroundImage = useUIStore((s) => s.backgroundImage)
  const enableBackgroundMovement = useUIStore((s) => s.enableBackgroundMovement)
  const backgroundSource = getBackgroundSource(backgroundImage)
  const suffix = colors.mode
  const cyanId = `nf-cyan-${suffix}`
  const dangerId = `nf-danger-${suffix}`
  const yellowId = `nf-yellow-${suffix}`
  const glowOpacity = colors.mode === 'dark' ? 0.86 : 0.32

  return (
    <View style={[styles.backgroundSurface, { backgroundColor: colors.background }, style]}>
      {backgroundSource ? (
        <ImageBackground
          source={backgroundSource}
          resizeMode="cover"
          style={styles.wallpaperLayer}
          imageStyle={[
            styles.wallpaperImage,
            enableBackgroundMovement && styles.wallpaperImageLift,
          ]}
        >
          <View
            style={[
              styles.wallpaperOverlay,
              {
                backgroundColor:
                  colors.mode === 'dark' ? 'rgba(2, 6, 23, 0.58)' : 'rgba(248, 250, 252, 0.5)',
              },
            ]}
          />
          <LinearGradient
            pointerEvents="none"
            colors={
              colors.mode === 'dark'
                ? ['rgba(15, 23, 42, 0.24)', 'rgba(2, 6, 23, 0.38)', 'rgba(0, 0, 0, 0.42)']
                : [
                    'rgba(255, 255, 255, 0.58)',
                    'rgba(241, 245, 249, 0.38)',
                    'rgba(255, 255, 255, 0.5)',
                  ]
            }
            locations={[0, 0.48, 1]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </ImageBackground>
      ) : null}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id={cyanId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.primary} stopOpacity={glowOpacity} />
              <Stop offset="54%" stopColor={colors.primary} stopOpacity={0.18} />
              <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={dangerId} cx="50%" cy="50%" r="50%">
              <Stop
                offset="0%"
                stopColor={colors.error}
                stopOpacity={colors.mode === 'dark' ? 0.45 : 0.3}
              />
              <Stop offset="62%" stopColor={colors.error} stopOpacity={0.08} />
              <Stop offset="100%" stopColor={colors.error} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={yellowId} cx="50%" cy="50%" r="50%">
              <Stop
                offset="0%"
                stopColor={colors.accent}
                stopOpacity={colors.mode === 'dark' ? 0.34 : 0.24}
              />
              <Stop offset="58%" stopColor={colors.accent} stopOpacity={0.07} />
              <Stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle
            cx="12%"
            cy="0%"
            r="220"
            fill={`url(#${cyanId})`}
            opacity={colors.mode === 'dark' ? 0.2 : 0.12}
          />
          <Circle
            cx="104%"
            cy="34%"
            r="260"
            fill={`url(#${dangerId})`}
            opacity={colors.mode === 'dark' ? 0.18 : 0.08}
          />
          <Circle
            cx="28%"
            cy="104%"
            r="240"
            fill={`url(#${yellowId})`}
            opacity={colors.mode === 'dark' ? 0.13 : 0.08}
          />
        </Svg>
      </View>
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
        { backgroundColor: colors.glassStrong, borderBottomColor: colors.glassLine },
        style,
      ]}
    >
      {children}
    </View>
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
  const isGlass = isGlassVariant(variant)
  return (
    <View
      style={[
        styles.cardBase,
        cardVariantStyle(colors, variant),
        active && styles.cardActive,
        active && {
          borderColor: `${colors.primary}99`,
          backgroundColor: activeCardBackground(colors, variant),
        },
        padded && styles.cardPadded,
        style,
      ]}
    >
      {isGlass ? (
        <BlurView
          pointerEvents="none"
          tint={colors.mode === 'dark' ? 'dark' : 'light'}
          intensity={glassBlurIntensity(variant)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {isGlass ? <GlassChrome variant={variant} /> : null}
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
  const isGlass = isGlassVariant(variant)
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
        active && { borderColor: `${colors.primary}99` },
        padded && styles.cardPadded,
        {
          opacity: disabled ? 0.5 : 1,
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
      {isGlass ? (
        <BlurView
          pointerEvents="none"
          tint={colors.mode === 'dark' ? 'dark' : 'light'}
          intensity={glassBlurIntensity(variant)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {isGlass ? <GlassChrome variant={variant} /> : null}
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
  size = 18,
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
    <View style={[styles.iconBubble, { backgroundColor: `${color}18` }, style]}>
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
}: ButtonProps) {
  const colors = useColors()
  const gradient = buttonGradient(colors, variant)
  const isGradient = !!gradient
  const chrome = buttonChromeStyle(colors, variant)
  const shadow = buttonShadowStyle(colors, variant)
  const foreground =
    variant === 'danger'
      ? '#FFFFFF'
      : variant === 'glass' || variant === 'ghost' || variant === 'outline'
        ? variant === 'outline'
          ? colors.primary
          : colors.text
        : '#050508'
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      hitSlop={hitSlop}
      style={containerStyle}
    >
      {({ pressed }) =>
        isGradient ? (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.buttonBase,
              buttonSizeStyle(size),
              shadow,
              style,
              {
                opacity: disabled || loading ? 0.5 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[styles.buttonInnerRim, { borderColor: chrome.rim }]}
            />
            <View
              pointerEvents="none"
              style={[styles.buttonHighlight, { backgroundColor: chrome.highlight }]}
            />
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
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.buttonBase,
              buttonSizeStyle(size),
              buttonVariantStyle(colors, variant, pressed),
              shadow,
              style,
              {
                opacity: disabled || loading ? 0.5 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            {variant === 'glass' || variant === 'outline' ? (
              <BlurView
                pointerEvents="none"
                tint={colors.mode === 'dark' ? 'dark' : 'light'}
                intensity={24}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <View
              pointerEvents="none"
              style={[styles.buttonInnerRim, { borderColor: chrome.rim }]}
            />
            <View
              pointerEvents="none"
              style={[styles.buttonHighlight, { backgroundColor: chrome.highlight }]}
            />
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
        )
      }
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
  hitSlop = 6,
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
      <IconBubble icon={icon} tone={tone} size={17} style={styles.actionTileIcon} />
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
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.appSwitchTrack,
        {
          backgroundColor: value ? colors.primary : colors.inputBackground,
          borderColor: value ? colors.primary : colors.border,
          opacity: disabled ? 0.45 : 1,
          shadowColor: value ? colors.primary : '#000000',
          shadowOpacity: value ? (colors.mode === 'dark' ? 0.35 : 0.22) : 0.14,
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
        {FieldIcon ? <FieldIcon size={18} color={colors.textMuted} strokeWidth={2.5} /> : left}
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
          shadowColor: colors.mode === 'dark' ? '#000' : '#64748B',
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
        { backgroundColor: pressed ? colors.messageHover : 'transparent' },
      ]}
    >
      {icon && <IconBubble icon={icon} tone={tone} size={16} />}
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
  return (
    <View
      style={[
        styles.badge,
        badgeSizeStyle(size),
        { backgroundColor: `${tone}18`, borderColor: `${tone}35` },
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
        styles.indicator,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: color,
          shadowColor: color,
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
        <Icon size={24} color={colors.textMuted} strokeWidth={1.8} />
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

export function ListHeader({
  title,
  count,
  style,
}: {
  title: ReactNode
  count?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.listHeader, style]}>
      <AppText variant="label" tone="secondary" style={styles.listHeaderTitle}>
        {title}
      </AppText>
      {count !== undefined ? (
        <Badge variant="neutral" size="xs">
          {count}
        </Badge>
      ) : null}
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
      onPress={() => onValueChange(!value)}
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
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              {
                backgroundColor: active ? colors.surface : 'transparent',
                borderColor: active ? colors.primary : 'transparent',
              },
            ]}
          >
            {Icon && <Icon size={14} color={active ? colors.primary : colors.textMuted} />}
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
            <View style={[styles.sheetHandle, { backgroundColor: colors.glassLineStrong }]} />
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
  title,
  subtitle,
  right,
  tone = 'primary',
  onPress,
  onLongPress,
  disabled,
}: {
  icon?: LucideIcon
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
          backgroundColor: pressed ? colors.messageHover : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {icon ? <IconBubble icon={icon} tone={tone} size={16} /> : null}
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
        {icon ? <IconBubble icon={icon} tone={tone} size={16} /> : null}
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
      {icon ? <IconBubble icon={icon} tone={tone} size={16} /> : null}
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
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [
          styles.channelRow,
          styles.channelRowFlat,
          {
            backgroundColor: pressed || active ? colors.messageHover : colors.glassSoft,
            borderColor: active ? `${colors.primary}80` : colors.glassLineSoft,
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
        <View
          style={[styles.typingDot, styles.typingDotSoft, { backgroundColor: colors.primary }]}
        />
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
      shadowColor: colors.shadowSoft,
    }
  if (variant === 'gradient')
    return {
      backgroundColor: `${colors.primary}12`,
      borderColor: `${colors.primary}35`,
      shadowColor: colors.primary,
    }
  if (variant === 'danger')
    return {
      backgroundColor: `${colors.error}10`,
      borderColor: `${colors.error}35`,
      shadowColor: colors.error,
    }
  if (variant === 'glassPanel') {
    return {
      backgroundColor: colors.glass,
      borderColor: colors.glassLineSoft,
      borderRadius: radius['3xl'],
      shadowColor: colors.shadowStrong,
      shadowOpacity: colors.mode === 'dark' ? 0.42 : 0.12,
      shadowRadius: 40,
    }
  }
  if (variant === 'glassCard') {
    return {
      backgroundColor: colors.glass,
      borderColor: colors.glassLineSoft,
      borderRadius: radius['3xl'],
      shadowColor: colors.shadowSoft,
      shadowOpacity: colors.mode === 'dark' ? 0.32 : 0.1,
      shadowRadius: 32,
    }
  }
  if (variant === 'glass') {
    return {
      backgroundColor: colors.glass,
      borderColor: colors.glassLineSoft,
      shadowColor: colors.shadowSoft,
      shadowOpacity: colors.mode === 'dark' ? 0.24 : 0.08,
    }
  }
  if (variant === 'stat')
    return {
      backgroundColor: colors.glassSoft,
      borderColor: colors.glassLineSoft,
      shadowColor: colors.shadowSoft,
      borderRadius: radius.xl,
    }
  return {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    shadowColor: colors.shadowSoft,
  }
}

function isGlassVariant(variant: CardVariant) {
  return (
    variant === 'glass' || variant === 'glassPanel' || variant === 'glassCard' || variant === 'stat'
  )
}

function glassBlurIntensity(variant: CardVariant) {
  if (variant === 'glassPanel' || variant === 'glassCard') return 48
  return 32
}

function pressedCardBackground(colors: ColorTokens, variant: CardVariant) {
  if (isGlassVariant(variant)) return colors.glassStrong
  return colors.surfaceHover
}

function activeCardBackground(colors: ColorTokens, variant: CardVariant) {
  if (isGlassVariant(variant)) return `${colors.primary}20`
  return colors.surfaceHover
}

function buttonGradient(colors: ColorTokens, variant: ButtonVariant): [string, string] | null {
  if (variant === 'secondary') return ['#F8E71C', '#FFB300']
  if (variant === 'accent') return ['#00F3FF', '#00A3B0']
  if (variant === 'danger') return ['#FF2A55', '#E11D48']
  if (variant === 'primary') return ['#00F3FF', colors.mode === 'dark' ? '#00A3B0' : '#00C6D1']
  return null
}

function buttonChromeStyle(colors: ColorTokens, variant: ButtonVariant) {
  if (variant === 'ghost') {
    return { rim: 'transparent', highlight: 'transparent' }
  }
  if (variant === 'glass' || variant === 'outline') {
    return {
      rim: colors.glassLineSoft,
      highlight: colors.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.42)',
    }
  }
  return {
    rim: colors.mode === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.72)',
    highlight: colors.mode === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.68)',
  }
}

function buttonShadowStyle(colors: ColorTokens, variant: ButtonVariant): ViewStyle {
  if (variant === 'ghost') return { shadowOpacity: 0, elevation: 0 }

  if (variant === 'glass' || variant === 'outline') {
    return {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: colors.mode === 'dark' ? 0.28 : 0.1,
      shadowRadius: 32,
      elevation: 3,
    }
  }

  if (variant === 'secondary') {
    return {
      shadowColor: '#F8E71C',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: colors.mode === 'dark' ? 0.3 : 0.24,
      shadowRadius: 25,
      elevation: 6,
    }
  }

  if (variant === 'danger') {
    return {
      shadowColor: '#FF2A55',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: colors.mode === 'dark' ? 0.4 : 0.3,
      shadowRadius: 25,
      elevation: 6,
    }
  }

  return {
    shadowColor: '#00F3FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: colors.mode === 'dark' ? 0.4 : 0.35,
    shadowRadius: 25,
    elevation: 6,
  }
}

function buttonVariantStyle(
  colors: ColorTokens,
  variant: ButtonVariant,
  pressed: boolean,
): ViewStyle {
  if (variant === 'outline') {
    return {
      backgroundColor: pressed ? `${colors.primary}12` : 'transparent',
      borderColor: `${colors.primary}55`,
    }
  }
  if (variant === 'ghost') {
    return {
      backgroundColor: pressed ? colors.messageHover : 'transparent',
      borderColor: 'transparent',
    }
  }
  if (variant === 'glass') {
    return {
      backgroundColor: pressed
        ? colors.glassStrong
        : colors.mode === 'dark'
          ? 'rgba(255, 255, 255, 0.05)'
          : colors.glassStrong,
      borderColor: colors.glassLine,
    }
  }
  return {
    backgroundColor: pressed ? colors.surfaceHover : colors.glassSoft,
    borderColor: colors.glassLineStrong,
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
  if (size === 'xs') return 14
  if (size === 'sm') return 16
  if (size === 'xl') return 20
  return 18
}

function badgeTone(colors: ColorTokens, variant: BadgeVariant) {
  if (variant === 'success') return colors.success
  if (variant === 'warning') return colors.warning
  if (variant === 'danger') return colors.error
  if (variant === 'info') return colors.info
  if (variant === 'neutral') return colors.textMuted
  return colors.primary
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
    lineHeight: 17,
    letterSpacing: 0.2,
  },
  body: {
    fontSize: fontSize.md,
    fontWeight: '500',
    lineHeight: 25,
  },
  bodyStrong: {
    fontSize: fontSize.md,
    fontWeight: '800',
    lineHeight: 25,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    lineHeight: 28,
  },
  headline: {
    fontSize: fontSize['2xl'],
    fontWeight: '900',
    lineHeight: 32,
  },
})

const typographyStyles = StyleSheet.create({
  h1: {
    fontSize: fontSize['4xl'],
    fontWeight: '900',
    lineHeight: 42,
  },
  h2: {
    fontSize: fontSize['3xl'],
    fontWeight: '900',
    lineHeight: 34,
  },
  h3: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    lineHeight: 30,
  },
  body: {
    fontSize: fontSize.md,
    fontWeight: '700',
    lineHeight: 25,
  },
  small: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    lineHeight: 19,
  },
  micro: {
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
  wallpaperLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  wallpaperImage: {
    opacity: 0.95,
  },
  wallpaperImageLift: {
    transform: [{ scale: 1.035 }],
  },
  wallpaperOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundContent: {
    flex: 1,
  },
  paddedContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  cardBase: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius['2xl'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 4,
  },
  cardPadded: {
    padding: spacing.lg,
  },
  cardRimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.9,
  },
  cardRimLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 1,
    opacity: 0.56,
  },
  cardRimRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 1,
    opacity: 0.36,
  },
  cardActive: {
    shadowOpacity: 0.22,
    shadowRadius: 32,
    elevation: 8,
  },
  glassHeader: {
    minHeight: 56,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  panelHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  panelHeaderBody: {
    flex: 1,
    minWidth: 0,
  },
  iconBubble: {
    width: 34,
    height: 34,
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
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#00F3FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 4,
  },
  buttonInnerRim: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  buttonHighlight: {
    position: 'absolute',
    top: 2,
    left: 16,
    right: 16,
    height: '34%',
    borderRadius: radius.full,
    opacity: 0.64,
  },
  buttonXs: {
    minHeight: 28,
    paddingHorizontal: spacing.md,
  },
  buttonSm: {
    minHeight: 36,
    paddingHorizontal: spacing.lg,
  },
  buttonMd: {
    minHeight: 44,
    paddingHorizontal: spacing['2xl'],
  },
  buttonLg: {
    minHeight: 56,
    paddingHorizontal: spacing['4xl'],
  },
  buttonXl: {
    minHeight: 64,
    paddingHorizontal: spacing['5xl'],
  },
  buttonIcon: {
    width: 44,
    height: 44,
    paddingHorizontal: 0,
  },
  buttonText: {
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  buttonTextXs: {
    fontSize: 10,
    lineHeight: 14,
  },
  buttonTextSm: {
    fontSize: 12,
    lineHeight: 16,
  },
  buttonTextMd: {
    fontSize: 13,
    lineHeight: 18,
  },
  buttonTextLg: {
    fontSize: 15,
    lineHeight: 20,
  },
  buttonTextXl: {
    fontSize: 16,
    lineHeight: 22,
  },
  iconButtonShell: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  iconButtonBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  iconButtonBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  floatingActionButton: {
    shadowOpacity: 0.32,
    shadowRadius: 24,
    elevation: 8,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionTile: {
    flex: 1,
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius['2xl'],
  },
  actionTileIcon: {
    width: 38,
    height: 38,
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
    width: 48,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 2,
    padding: 2,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },
  appSwitchThumb: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  textField: {
    minHeight: 48,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  inputValley: {
    borderRadius: radius.xl,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  inputValleyFocused: {
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 3,
  },
  textFieldInput: {
    flex: 1,
    minHeight: 46,
    fontSize: fontSize.md,
    paddingVertical: 0,
  },
  listRow: {
    minHeight: 56,
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
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeXs: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeSm: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeMd: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  indicator: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
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
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionHeaderBody: {
    flex: 1,
    minWidth: 0,
  },
  listHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  listHeaderTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.full,
    padding: 4,
    gap: 4,
  },
  segment: {
    minHeight: 36,
    flex: 1,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
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
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  sheetHeader: {
    minHeight: 48,
  },
  dialogOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialogPressable: {
    width: '100%',
    maxWidth: 360,
  },
  dialogPanel: {
    gap: spacing.md,
  },
  dialogTitle: {
    textAlign: 'left',
  },
  dialogDescription: {
    lineHeight: 24,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  menuItem: {
    minHeight: 58,
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
    minWidth: 130,
    gap: spacing.sm,
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  channelRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  channelRowFlat: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius['2xl'],
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
    gap: 1,
    maxWidth: 220,
  },
  typingDots: {
    width: 32,
    height: 18,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: radius.full,
  },
  typingDotSoft: {
    opacity: 0.45,
  },
})
