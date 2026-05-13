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
import { type StyleProp, View, type ViewStyle } from 'react-native'

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
  color = '#64748b',
  focused,
  ...rest
}: CatSvgProps & { Icon: LucideIcon }) {
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
    </View>
  )
}

export function TabHomeSvg(props: CatSvgProps) {
  return <IconBadge Icon={Home} {...props} />
}

export function TabBuddySvg(props: CatSvgProps) {
  return <IconBadge Icon={Users} {...props} />
}

export function TabBellSvg(props: CatSvgProps) {
  return <IconBadge Icon={Bell} {...props} />
}

export function TabMeSvg(props: CatSvgProps) {
  return <IconBadge Icon={User} {...props} />
}

export function BuddyCatSvg(props: CatSvgProps) {
  return <IconBadge Icon={Bot} {...props} />
}

export function ChannelCatSvg(props: CatSvgProps) {
  return <IconBadge Icon={Hash} {...props} />
}

export function WorkCatSvg(props: CatSvgProps) {
  return <IconBadge Icon={Briefcase} {...props} />
}

export function ShopCatSvg(props: CatSvgProps) {
  return <IconBadge Icon={ShoppingBag} {...props} />
}

export function HelpBuddySvg(props: CatSvgProps) {
  return <IconBadge Icon={Bot} {...props} />
}

export function HelpProductSvg(props: CatSvgProps) {
  return <IconBadge Icon={HelpCircle} {...props} />
}

export function HelpStartSvg(props: CatSvgProps) {
  return <IconBadge Icon={Rocket} {...props} />
}
