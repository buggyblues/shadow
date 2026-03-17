import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg'

// Members: Abstract people group icon
export function AgentCatSvg({
  width = 100,
  height = 100,
  style,
}: {
  width?: number
  height?: number
  // biome-ignore lint/suspicious/noExplicitAny: Any prop
  style?: any
}) {
  return (
    <Svg viewBox="0 0 100 100" width={width} height={height} style={style}>
      {/* Center person */}
      <Circle cx="50" cy="32" r="12" fill="#FFFFFF" fillOpacity="0.95" />
      <Path d="M 30,72 Q 30,52 50,52 Q 70,52 70,72" fill="#FFFFFF" fillOpacity="0.95" />
      {/* Left person (behind) */}
      <Circle cx="26" cy="38" r="9" fill="#FFFFFF" fillOpacity="0.6" />
      <Path d="M 10,70 Q 10,55 26,55 Q 38,55 40,64" fill="#FFFFFF" fillOpacity="0.6" />
      {/* Right person (behind) */}
      <Circle cx="74" cy="38" r="9" fill="#FFFFFF" fillOpacity="0.6" />
      <Path d="M 60,64 Q 62,55 74,55 Q 90,55 90,70" fill="#FFFFFF" fillOpacity="0.6" />
      {/* Bottom line */}
      <Line
        x1="20"
        y1="80"
        x2="80"
        y2="80"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeOpacity="0.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

// Workspace: Abstract folder icon
export function WorkCatSvg({
  width = 100,
  height = 100,
  style,
}: {
  width?: number
  height?: number
  // biome-ignore lint/suspicious/noExplicitAny: Any prop
  style?: any
}) {
  return (
    <Svg viewBox="0 0 100 100" width={width} height={height} style={style}>
      {/* Folder back */}
      <Path
        d="M 12,32 L 12,82 Q 12,88 18,88 L 82,88 Q 88,88 88,82 L 88,38 Q 88,32 82,32 L 52,32 L 46,22 Q 44,20 42,20 L 18,20 Q 12,20 12,26 Z"
        fill="#FFFFFF"
        fillOpacity="0.3"
      />
      {/* Folder front */}
      <Rect x="12" y="40" width="76" height="48" rx="6" fill="#FFFFFF" fillOpacity="0.9" />
      {/* Folder crease */}
      <Line x1="16" y1="40" x2="84" y2="40" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.5" />
      {/* Document lines */}
      <Line
        x1="28"
        y1="54"
        x2="72"
        y2="54"
        stroke="#3B82F6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      <Line
        x1="28"
        y1="64"
        x2="60"
        y2="64"
        stroke="#3B82F6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity="0.4"
      />
      <Line
        x1="28"
        y1="74"
        x2="48"
        y2="74"
        stroke="#3B82F6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity="0.3"
      />
    </Svg>
  )
}

// Apps: Abstract grid icon
export function ChannelCatSvg({
  width = 100,
  height = 100,
  style,
}: {
  width?: number
  height?: number
  // biome-ignore lint/suspicious/noExplicitAny: Any prop
  style?: any
}) {
  return (
    <Svg viewBox="0 0 100 100" width={width} height={height} style={style}>
      {/* 2x2 rounded squares */}
      <Rect x="12" y="12" width="34" height="34" rx="10" fill="#FFFFFF" fillOpacity="0.9" />
      <Rect x="54" y="12" width="34" height="34" rx="10" fill="#FFFFFF" fillOpacity="0.6" />
      <Rect x="12" y="54" width="34" height="34" rx="10" fill="#FFFFFF" fillOpacity="0.6" />
      <Rect x="54" y="54" width="34" height="34" rx="10" fill="#FFFFFF" fillOpacity="0.9" />
      {/* Icons inside each cell */}
      <Path d="M 24,24 L 24,38 L 38,31 Z" fill="#10B981" fillOpacity="0.7" />
      <Circle
        cx="71"
        cy="29"
        r="8"
        fill="none"
        stroke="#10B981"
        strokeWidth="2.5"
        strokeOpacity="0.7"
      />
      <Rect
        x="23"
        y="64"
        width="14"
        height="14"
        rx="3"
        fill="none"
        stroke="#10B981"
        strokeWidth="2.5"
        strokeOpacity="0.7"
      />
      <Path
        d="M 64,75 L 71,64 L 78,75 Z"
        fill="none"
        stroke="#10B981"
        strokeWidth="2.5"
        strokeOpacity="0.7"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ── Tab Bar Icons (Catty SVG) ────────────────────────────────────────────

// Tab Home Icon: Cat face peeking over a chat bubble
export function TabHomeSvg({ size = 24, color = '#888' }: { size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      {/* Chat bubble */}
      <Path
        d="M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2h-4l-4 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Cat ears peeking from top of bubble */}
      <Path d="M8 4L6.5 1L10 3.5" fill={color} />
      <Path d="M16 4L17.5 1L14 3.5" fill={color} />
      {/* Cat face inside bubble */}
      <Circle cx="9" cy="10" r="1.2" fill={color} />
      <Circle cx="15" cy="10" r="1.2" fill={color} />
      <Ellipse cx="12" cy="12" rx="1" ry="0.7" fill={color} />
      <Path
        d="M10.5 13.5Q12 15 13.5 13.5"
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
      />
    </Svg>
  )
}

// Tab Buddies/Marketplace Icon: Store awning with cat peeking
export function TabBuddySvg({ size = 24, color = '#888' }: { size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      {/* Store body */}
      <Rect
        x="3"
        y="10"
        width="18"
        height="11"
        rx="2"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
      />
      {/* Awning */}
      <Path
        d="M2 10L4 5h16l2 5"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Awning scallops */}
      <Path
        d="M2 10Q5 13 8 10Q11 13 14 10Q17 13 20 10"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
      />
      <Path d="M20 10Q21.5 13 22 10" fill="none" stroke={color} strokeWidth="1.4" />
      {/* Door */}
      <Rect
        x="9.5"
        y="15"
        width="5"
        height="6"
        rx="1"
        fill="none"
        stroke={color}
        strokeWidth="1.2"
      />
      {/* Cat ears peeking from behind awning */}
      <Path d="M7 5L5.5 2L9 4.5" fill={color} fillOpacity="0.8" />
      <Path d="M17 5L18.5 2L15 4.5" fill={color} fillOpacity="0.8" />
      {/* Cat eyes behind door */}
      <Circle cx="11" cy="17.5" r="0.7" fill={color} />
      <Circle cx="13.5" cy="17.5" r="0.7" fill={color} />
    </Svg>
  )
}

// Tab Discover Icon: Compass
export function TabDiscoverSvg({ size = 24, color = '#888' }: { size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      {/* Outer circle */}
      <Circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="1.8" />
      {/* Cardinal ticks */}
      <Line
        x1="12"
        y1="2"
        x2="12"
        y2="4.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Line
        x1="12"
        y1="19.5"
        x2="12"
        y2="22"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Line
        x1="2"
        y1="12"
        x2="4.5"
        y2="12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Line
        x1="19.5"
        y1="12"
        x2="22"
        y2="12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Compass diamond needle */}
      <Path
        d="M 12,6 L 14.5,12 L 12,18 L 9.5,12 Z"
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* North half filled */}
      <Path d="M 12,6 L 14.5,12 L 9.5,12 Z" fill={color} fillOpacity="0.35" />
      {/* Center dot */}
      <Circle cx="12" cy="12" r="1.5" fill={color} />
    </Svg>
  )
}

// Tab Me/Settings Icon: Cat silhouette face
export function TabMeSvg({ size = 24, color = '#888' }: { size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      {/* Cat head outline */}
      <Path
        d="M5 10L3 3l5 4h8l5-4-2 7"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path d="M5 10a7 7 0 0014 0" fill="none" stroke={color} strokeWidth="1.8" />
      {/* Inner ears */}
      <Path d="M6 8L4.5 4.5 8 6.5" fill={color} fillOpacity="0.25" />
      <Path d="M18 8L19.5 4.5 16 6.5" fill={color} fillOpacity="0.25" />
      {/* Eyes */}
      <Circle cx="9" cy="11.5" r="1.3" fill={color} />
      <Circle cx="15" cy="11.5" r="1.3" fill={color} />
      {/* Nose */}
      <Ellipse cx="12" cy="13.5" rx="1" ry="0.7" fill={color} />
      {/* Smile */}
      <Path
        d="M10 15Q12 17 14 15"
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Collar */}
      <Path
        d="M5 19Q12 22 19 19"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  )
}

// Shop: Abstract store/bag icon
export function ShopCatSvg({
  width = 100,
  height = 100,
  style,
}: {
  width?: number
  height?: number
  // biome-ignore lint/suspicious/noExplicitAny: Any prop
  style?: any
}) {
  return (
    <Svg viewBox="0 0 100 100" width={width} height={height} style={style}>
      {/* Store body */}
      <Rect x="14" y="40" width="72" height="48" rx="10" fill="#FFFFFF" fillOpacity="0.9" />
      {/* Awning */}
      <Path d="M 10,40 L 16,20 L 84,20 L 90,40" fill="#FFFFFF" fillOpacity="0.4" />
      <Line x1="10" y1="40" x2="90" y2="40" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.6" />
      {/* Awning scallops */}
      <Path
        d="M 10,40 Q 20,50 30,40 Q 40,50 50,40 Q 60,50 70,40 Q 80,50 90,40"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeOpacity="0.7"
      />
      {/* Dollar/coin symbol */}
      <Circle
        cx="50"
        cy="62"
        r="12"
        fill="none"
        stroke="#F59E0B"
        strokeWidth="2.5"
        strokeOpacity="0.8"
      />
      <Path
        d="M 50,54 L 50,70 M 46,57 Q 50,53 54,57 Q 50,61 46,61 Q 50,65 54,63"
        fill="none"
        stroke="#F59E0B"
        strokeWidth="2"
        strokeOpacity="0.8"
        strokeLinecap="round"
      />
    </Svg>
  )
}
