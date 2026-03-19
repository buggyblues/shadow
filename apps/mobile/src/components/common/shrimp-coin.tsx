import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useColors } from '../../theme'

interface ShrimpCoinIconProps {
  size?: number
  color?: string
}

export function ShrimpCoinIcon({ size = 16, color }: ShrimpCoinIconProps) {
  const colors = useColors()
  const iconColor = color || colors.shrimpCoin || '#F43F5E' // rose-500

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={iconColor}>
        {/* Left pincer */}
        <Path d="M7 2C5.5 2 4 3.5 4 5.5C4 7 4.8 8.2 6 8.8L5 14C4.8 15 5.5 16 6.5 16H8L8.5 12L10 8.5C10 8.5 9 8 8.5 6.5C8 5 8.5 3 7 2Z" />
        {/* Right pincer */}
        <Path d="M17 2C18.5 2 20 3.5 20 5.5C20 7 19.2 8.2 18 8.8L19 14C19.2 15 18.5 16 17.5 16H16L15.5 12L14 8.5C14 8.5 15 8 15.5 6.5C16 5 15.5 3 17 2Z" />
        {/* Body / joint */}
        <Path d="M12 8C10.3 8 9 9 9 10.5V13C9 13 9.5 16 10 18C10.3 19.2 11 20 12 20C13 20 13.7 19.2 14 18C14.5 16 15 13 15 13V10.5C15 9 13.7 8 12 8Z" />
        {/* Bottom legs */}
        <Path
          d="M10 18L8.5 21M14 18L15.5 21M12 20V22.5"
          stroke={iconColor}
          strokeWidth={1.2}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  )
}
