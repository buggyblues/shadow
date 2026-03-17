import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg'

// Members: One single happy cat with a welcoming sign
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
      {/* Background stars for community feel */}
      <Path
        d="M 15,20 L 17,25 L 22,25 L 18,28 L 20,33 L 15,30 L 10,33 L 12,28 L 8,25 L 13,25 Z"
        fill="#FBBF24"
      />
      <Path
        d="M 85,25 L 87,30 L 92,30 L 88,33 L 90,38 L 85,35 L 80,38 L 82,33 L 78,30 L 83,30 Z"
        fill="#FBBF24"
        transform="scale(0.8) translate(20, -5)"
      />
      {/* Main Cat Body (Fluffy Blue-Gray) */}
      <Path d="M 25,40 L 15,15 L 40,25" fill="#60A5FA" /> {/* Left Ear */}
      <Path d="M 30,30 L 22,22 L 35,28" fill="#FCA5A5" /> {/* Left Inner Ear */}
      <Path d="M 75,40 L 85,15 L 60,25" fill="#60A5FA" /> {/* Right Ear */}
      <Path d="M 70,30 L 78,22 L 65,28" fill="#FCA5A5" /> {/* Right Inner Ear */}
      <Ellipse cx="50" cy="55" rx="35" ry="30" fill="#60A5FA" />
      <Ellipse cx="50" cy="65" rx="25" ry="20" fill="#BFDBFE" /> {/* Belly/chest area */}
      {/* Eyes (Big, welcoming) */}
      <Circle cx="35" cy="48" r="6" fill="#FFFFFF" />
      <Circle cx="35" cy="48" r="3" fill="#1E3A8A" />
      <Circle cx="65" cy="48" r="6" fill="#FFFFFF" />
      <Circle cx="65" cy="48" r="3" fill="#1E3A8A" />
      {/* Cute nose and smile */}
      <Ellipse cx="50" cy="54" rx="3" ry="2" fill="#FCA5A5" />
      <Path
        d="M 45,58 Q 50,62 50,56 M 55,58 Q 50,62 50,56"
        fill="none"
        stroke="#1E3A8A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Holding a "Welcome" or community badge */}
      <Rect
        x="30"
        y="70"
        width="40"
        height="20"
        rx="4"
        fill="#FCD34D"
        stroke="#D97706"
        strokeWidth="2"
      />
      {/* Heart inside badge */}
      <Path d="M 50,76 Q 45,70 42,75 Q 38,80 50,86 Q 62,80 58,75 Q 55,70 50,76 Z" fill="#EF4444" />
      {/* Paws holding the badge */}
      <Ellipse cx="28" cy="78" rx="8" ry="12" fill="#60A5FA" transform="rotate(-30 28 78)" />
      <Ellipse cx="72" cy="78" rx="8" ry="12" fill="#60A5FA" transform="rotate(30 72 78)" />
    </Svg>
  )
}

// Workspace: Orange Cat organizing files
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
      {/* Background Files */}
      <Path d="M 15,60 L 45,50 L 55,80 L 15,80 Z" fill="#60A5FA" />
      <Path d="M 25,65 L 85,65 L 80,90 L 20,90 Z" fill="#3B82F6" />
      <Path d="M 60,55 L 90,65 L 80,90 L 50,80 Z" fill="#34D399" />
      <Path d="M 50,70 L 95,70 L 90,95 L 45,95 Z" fill="#10B981" />
      {/* Orange Cat Body */}
      <Path d="M 35,40 L 25,15 L 45,25" fill="#F59E0B" /> {/* Left Ear */}
      <Path d="M 65,40 L 75,15 L 55,25" fill="#F59E0B" /> {/* Right Ear */}
      <Ellipse cx="50" cy="45" rx="30" ry="25" fill="#F59E0B" />
      {/* Stripes */}
      <Path
        d="M 40,22 L 43,30 M 50,20 L 50,30 M 60,22 L 57,30"
        stroke="#D97706"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Big Glasses */}
      <Circle
        cx="38"
        cy="45"
        r="10"
        fill="#FFFFFF"
        fillOpacity="0.8"
        stroke="#1F2937"
        strokeWidth="3"
      />
      <Circle
        cx="62"
        cy="45"
        r="10"
        fill="#FFFFFF"
        fillOpacity="0.8"
        stroke="#1F2937"
        strokeWidth="3"
      />
      <Path d="M 48,45 L 52,45" stroke="#1F2937" strokeWidth="3" />
      {/* Eyes inside glasses */}
      <Circle cx="38" cy="45" r="3" fill="#1F2937" />
      <Circle cx="62" cy="45" r="3" fill="#1F2937" />
      {/* Face */}
      <Ellipse cx="50" cy="52" rx="3" ry="2" fill="#FCA5A5" />
      <Path
        d="M 45,57 Q 50,62 55,57"
        fill="none"
        stroke="#1F2937"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Paws holding a paper */}
      <Rect
        x="35"
        y="70"
        width="30"
        height="25"
        fill="#F9FAFB"
        rx="2"
        transform="rotate(-5 50 70)"
      />
      {/* Text lines on paper */}
      <Path
        d="M 40,75 L 60,75 M 40,80 L 55,80 M 40,85 L 60,85"
        stroke="#D1D5DB"
        strokeWidth="2"
        transform="rotate(-5 50 70)"
        strokeLinecap="round"
      />
      <Ellipse
        cx="40"
        cy="75"
        rx="8"
        ry="12"
        fill="#F59E0B"
        stroke="#D97706"
        strokeWidth="1"
        transform="rotate(-30 40 75)"
      />
      <Ellipse
        cx="60"
        cy="78"
        rx="8"
        ry="12"
        fill="#F59E0B"
        stroke="#D97706"
        strokeWidth="1"
        transform="rotate(30 60 78)"
      />
    </Svg>
  )
}

// Apps: Black Cat playing xbox controller
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
      {/* Headset Band */}
      <Path
        d="M 18,45 Q 50,5 82,45"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Black Cat Body */}
      <Path d="M 25,45 L 15,20 L 40,28" fill="#111827" /> {/* Left Ear */}
      <Path d="M 30,30 L 22,23 L 35,28" fill="#F472B6" /> {/* Left Inner Ear */}
      <Path d="M 75,45 L 85,20 L 60,28" fill="#111827" /> {/* Right Ear */}
      <Path d="M 70,30 L 78,23 L 65,28" fill="#F472B6" /> {/* Right Inner Ear */}
      <Ellipse cx="50" cy="50" rx="32" ry="28" fill="#111827" />
      {/* Headset Earcups */}
      <Rect x="12" y="38" width="12" height="24" rx="6" fill="#1E3A8A" />
      <Rect x="76" y="38" width="12" height="24" rx="6" fill="#1E3A8A" />
      {/* Mic */}
      <Path
        d="M 20,55 Q 25,68 35,65"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Circle cx="36" cy="64" r="4" fill="#60A5FA" />
      {/* Intense Green Eyes */}
      <Path d="M 30,45 Q 38,38 45,46 Q 38,48 30,45 Z" fill="#34D399" />
      <Circle cx="37" cy="44" r="2.5" fill="#064E3B" />
      <Path d="M 70,45 Q 62,38 55,46 Q 62,48 70,45 Z" fill="#34D399" />
      <Circle cx="63" cy="44" r="2.5" fill="#064E3B" />
      {/* Smirk */}
      <Path
        d="M 45,58 Q 50,62 55,55"
        fill="none"
        stroke="#F472B6"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Path
        d="M 55,55 L 57,53"
        fill="none"
        stroke="#F472B6"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Xbox Controller */}
      <Path
        d="M 25,82 Q 20,68 35,72 L 65,72 Q 80,68 75,82 Q 70,95 60,88 L 50,90 L 40,88 Q 30,95 25,82 Z"
        fill="#E5E7EB"
      />
      {/* D-Pad */}
      <Path
        d="M 35,76 L 38,76 L 38,73 L 42,73 L 42,76 L 45,76 L 45,80 L 42,80 L 42,83 L 38,83 L 38,80 L 35,80 Z"
        fill="#374151"
      />
      {/* Buttons */}
      <Circle cx="65" cy="74" r="3.5" fill="#FBBF24" /> {/* Y */}
      <Circle cx="59" cy="79" r="3.5" fill="#3B82F6" /> {/* X */}
      <Circle cx="71" cy="79" r="3.5" fill="#EF4444" /> {/* B */}
      <Circle cx="65" cy="84" r="3.5" fill="#10B981" /> {/* A */}
      {/* Controller Gripping Paws */}
      <Ellipse cx="22" cy="76" rx="8" ry="12" fill="#111827" transform="rotate(25 22 76)" />
      <Ellipse cx="78" cy="76" rx="8" ry="12" fill="#111827" transform="rotate(-25 78 76)" />
    </Svg>
  )
}

// Shop: Fortune Cat (Maneki-neko)
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
      {/* Raised Paw (Right side of screen) */}
      <Path d="M 65,55 L 85,20 Q 90,10 75,15 L 60,35" fill="#FFFFFF" />
      <Path
        d="M 75,15 Q 70,20 78,25"
        stroke="#FCA5A5"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Body & Ears */}
      <Path d="M 30,40 L 20,15 L 45,25" fill="#1F2937" /> {/* Left Ear (Black) */}
      <Path d="M 70,40 L 80,15 L 55,25" fill="#F59E0B" /> {/* Right Ear (Orange) */}
      <Ellipse cx="50" cy="55" rx="35" ry="32" fill="#FFFFFF" />
      {/* Calico Spots on Body */}
      <Path d="M 20,45 Q 35,40 40,55 Q 30,70 15,60 Z" fill="#1F2937" />
      <Path d="M 80,45 Q 65,40 60,55 Q 70,70 85,60 Z" fill="#F59E0B" />
      {/* Eyes (Happy Arcs) */}
      <Path
        d="M 35,45 Q 40,38 45,45"
        fill="none"
        stroke="#1F2937"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path
        d="M 55,45 Q 60,38 65,45"
        fill="none"
        stroke="#1F2937"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Nose & Mouth */}
      <Ellipse cx="50" cy="50" rx="3" ry="2" fill="#FCA5A5" />
      <Path
        d="M 50,52 L 50,55 M 45,58 Q 50,62 50,55 M 55,58 Q 50,62 50,55"
        fill="none"
        stroke="#1F2937"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Red Collar & Bell */}
      <Path
        d="M 18,65 Q 50,85 82,65"
        fill="none"
        stroke="#EF4444"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <Circle cx="50" cy="72" r="9" fill="#FBBF24" />
      <Path d="M 45,76 L 55,76 M 50,72 L 50,81" stroke="#B45309" strokeWidth="2" />
      <Circle cx="50" cy="74" r="2" fill="#B45309" />
      {/* Gold Coin (Left side of screen) */}
      <Ellipse cx="30" cy="75" rx="14" ry="20" fill="#FBBF24" stroke="#D97706" strokeWidth="2" />
      {/* Coin details */}
      <Rect
        x="25"
        y="62"
        width="10"
        height="26"
        rx="3"
        fill="none"
        stroke="#D97706"
        strokeWidth="2"
      />
      <Path
        d="M 28,67 L 32,67 M 28,75 L 32,75 M 28,83 L 32,83"
        stroke="#D97706"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Paw holding coin */}
      <Ellipse cx="25" cy="65" rx="10" ry="12" fill="#FFFFFF" transform="rotate(-30 25 65)" />
    </Svg>
  )
}
