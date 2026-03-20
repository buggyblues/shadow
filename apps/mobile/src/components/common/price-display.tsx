import { Text, type TextStyle, View } from 'react-native'
import { fontSize, useColors } from '../../theme'
import { ShrimpCoinIcon } from './shrimp-coin'

interface PriceDisplayProps {
  amount: number
  size?: 'sm' | 'md' | 'lg'
  showUnit?: boolean
  unit?: string
  style?: TextStyle
}

export function PriceDisplay({
  amount,
  size = 'md',
  showUnit = false,
  unit = '',
  style,
}: PriceDisplayProps) {
  const colors = useColors()

  const sizeMap = {
    sm: { icon: 12, font: fontSize.sm, lineHeight: fontSize.sm * 1.2 },
    md: { icon: 16, font: fontSize.md, lineHeight: fontSize.md * 1.2 },
    lg: { icon: 20, font: fontSize.lg, lineHeight: fontSize.lg * 1.2 },
  }

  const { icon, font, lineHeight } = sizeMap[size]

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <ShrimpCoinIcon size={icon} />
      <Text
        style={[
          {
            fontSize: font,
            lineHeight,
            fontWeight: '900',
            color: colors.shrimpCoin || '#F43F5E',
            letterSpacing: -0.5,
          },
          style,
        ]}
      >
        {amount.toLocaleString()}
      </Text>
      {showUnit && unit && (
        <Text
          style={{
            fontSize: font * 0.85,
            lineHeight,
            color: colors.textMuted,
            marginLeft: 2,
          }}
        >
          {unit}
        </Text>
      )}
    </View>
  )
}

// 简化版，只显示图标+数字，用于紧凑空间
export function PriceCompact({ amount, size = 14 }: { amount: number; size?: number }) {
  const colors = useColors()

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <ShrimpCoinIcon size={size} />
      <Text
        style={{
          fontSize: size,
          fontWeight: '700',
          color: colors.shrimpCoin || '#F43F5E',
        }}
      >
        {amount.toLocaleString()}
      </Text>
    </View>
  )
}
