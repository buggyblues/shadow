import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { BackgroundSurface } from '../ui'

export function DottedBackground({
  children,
  style,
}: {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return <BackgroundSurface style={style}>{children}</BackgroundSurface>
}

export default DottedBackground
