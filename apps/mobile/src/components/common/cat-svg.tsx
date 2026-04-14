import type { LucideIcon } from 'lucide-react-native'
import {
  Bell,
  Bot,
  Briefcase,
  Hash,
  HelpCircle,
  Home,
  Rocket,
  ShoppingBag,
  User,
  Users,
} from 'lucide-react-native'
import { type StyleProp, Text, View, type ViewStyle } from 'react-native'

type CatSvgProps = {
  size?: number
  width?: number
  height?: number
  color?: string
  focused?: boolean
  style?: StyleProp<ViewStyle>
}

function resolveSize({ size, width, height }: CatSvgProps): number {
  return size ?? width ?? height ?? 24
}

function IconBadge({
  Icon,
  emoji,
  color = '#64748b',
  focused,
  ...rest
}: CatSvgProps & { Icon: LucideIcon; emoji?: string }) {
  const iconSize = resolveSize(rest)
  const tone = focused ? color : `${color}CC`

  return (
    <View
      style={[
        {
          width: iconSize,
          height: iconSize,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        },
        rest.style,
      ]}
    >
      <Icon size={iconSize} color={tone} />
      {emoji ? (
        <Text
          style={{
            position: 'absolute',
            right: -iconSize * 0.12,
            bottom: -iconSize * 0.08,
            fontSize: Math.max(10, iconSize * 0.3),
          }}
        >
          {emoji}
        </Text>
      ) : null}
    </View>
  )
}

export function TabHomeSvg(props: CatSvgProps) {
  return <IconBadge Icon={Home} emoji="🐾" {...props} />
}

export function TabBuddySvg(props: CatSvgProps) {
  return <IconBadge Icon={Users} emoji="😺" {...props} />
}

export function TabBellSvg(props: CatSvgProps) {
  return <IconBadge Icon={Bell} emoji="✨" {...props} />
}

export function TabMeSvg(props: CatSvgProps) {
  return <IconBadge Icon={User} emoji="🖤" {...props} />
}

export function BuddyCatSvg(props: CatSvgProps) {
  return <IconBadge Icon={Bot} emoji="😼" {...props} />
}

export function ChannelCatSvg(props: CatSvgProps) {
  return <IconBadge Icon={Hash} emoji="🐱" {...props} />
}

export function WorkCatSvg(props: CatSvgProps) {
  return <IconBadge Icon={Briefcase} emoji="💼" {...props} />
}

export function ShopCatSvg(props: CatSvgProps) {
  return <IconBadge Icon={ShoppingBag} emoji="🛍️" {...props} />
}

export function HelpBuddySvg(props: CatSvgProps) {
  return <IconBadge Icon={Bot} emoji="🤖" {...props} />
}

export function HelpProductSvg(props: CatSvgProps) {
  return <IconBadge Icon={HelpCircle} emoji="📦" {...props} />
}

export function HelpStartSvg(props: CatSvgProps) {
  return <IconBadge Icon={Rocket} emoji="🚀" {...props} />
}
