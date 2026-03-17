import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg'

export function CatSvgDefs() {
  return (
    <Defs>
      <RadialGradient id="catBody" cx="50%" cy="35%" r="70%">
        <Stop offset="0%" stopColor="#5a5a5e" />
        <Stop offset="50%" stopColor="#3d3d40" />
        <Stop offset="100%" stopColor="#18181a" />
      </RadialGradient>
      <RadialGradient id="eyeYellow" cx="35%" cy="35%" r="65%">
        <Stop offset="0%" stopColor="#ffffcc" />
        <Stop offset="35%" stopColor="#f8e71c" />
        <Stop offset="100%" stopColor="#b3a100" />
      </RadialGradient>
      <RadialGradient id="eyeCyan" cx="35%" cy="35%" r="65%">
        <Stop offset="0%" stopColor="#ccffff" />
        <Stop offset="35%" stopColor="#00f3ff" />
        <Stop offset="100%" stopColor="#0099aa" />
      </RadialGradient>
    </Defs>
  )
}

export function AgentCatSvg({
  width = 100,
  height = 100,
  style,
}: {
  width?: number
  height?: number
  style?: any
}) {
  return (
    <Svg viewBox="0 0 100 100" width={width} height={height} style={style}>
      <CatSvgDefs />
      <Path
        d="M 22,47 Q 15,24 28,24 Q 34,24 40,40"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M 78,47 Q 85,24 72,24 Q 66,24 60,40"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Ellipse
        cx="50"
        cy="62"
        rx="38"
        ry="26"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <Circle cx="32" cy="57" r="6.5" fill="url(#eyeYellow)" stroke="#1a1a1c" strokeWidth="1.5" />
      <Circle cx="30" cy="54.5" r="2.2" fill="#ffffff" />
      <Circle cx="68" cy="57" r="6.5" fill="url(#eyeCyan)" stroke="#1a1a1c" strokeWidth="1.5" />
      <Circle cx="66" cy="54.5" r="2.2" fill="#ffffff" />
      <Ellipse cx="50" cy="64" rx="4" ry="2.5" fill="#3a2a26" />
      <Path
        d="M 40,69 Q 45,74.5 50,69"
        fill="none"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Path
        d="M 50,69 Q 55,74.5 60,69"
        fill="none"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Path
        d="M 12,50 A 42 42 0 0 1 88 50"
        fill="none"
        stroke="#00f3ff"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Rect
        x="6"
        y="45"
        width="12"
        height="28"
        rx="6"
        fill="#ff7da5"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <Rect
        x="82"
        y="45"
        width="12"
        height="28"
        rx="6"
        fill="#00f3ff"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <Path
        d="M 12,68 Q 20,80 30,75"
        fill="none"
        stroke="#1a1a1c"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Circle cx="30" cy="75" r="3.5" fill="#f8e71c" stroke="#1a1a1c" strokeWidth="2" />
    </Svg>
  )
}

export function WorkCatSvg({
  width = 100,
  height = 100,
  style,
}: {
  width?: number
  height?: number
  style?: any
}) {
  return (
    <Svg viewBox="0 0 100 100" width={width} height={height} style={style}>
      <CatSvgDefs />
      <Path
        d="M 28,40 Q 22,20 32,20 Q 38,20 42,32"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M 72,40 Q 78,20 68,20 Q 62,20 58,32"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Ellipse
        cx="50"
        cy="50"
        rx="35"
        ry="24"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <Circle cx="34" cy="45" r="6" fill="url(#eyeYellow)" stroke="#1a1a1c" strokeWidth="1.5" />
      <Circle cx="32" cy="43" r="2" fill="#ffffff" />
      <Circle cx="66" cy="45" r="6" fill="url(#eyeCyan)" stroke="#1a1a1c" strokeWidth="1.5" />
      <Circle cx="64" cy="43" r="2" fill="#ffffff" />
      <Path
        d="M 32,60 Q 32,48 40,48 Q 45,48 45,55"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Path
        d="M 68,60 Q 68,48 60,48 Q 55,48 55,55"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Path
        d="M 15,55 L 85,55 L 90,85 L 10,85 Z"
        fill="#ff7da5"
        stroke="#1a1a1c"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <Path
        d="M 12,85 L 88,85 L 88,88 Q 50,92 12,88 Z"
        fill="#e85b85"
        stroke="#1a1a1c"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <Path
        d="M 50,62 L 52,66 L 57,66 L 53,69 L 55,73 L 50,70 L 45,73 L 47,69 L 43,66 L 48,66 Z"
        fill="#f8e71c"
        stroke="#1a1a1c"
        strokeWidth="1.5"
      />
    </Svg>
  )
}

export function ChannelCatSvg({
  width = 100,
  height = 100,
  style,
}: {
  width?: number
  height?: number
  style?: any
}) {
  return (
    <Svg viewBox="0 0 100 100" width={width} height={height} style={style}>
      <CatSvgDefs />
      <Path
        d="M 22,35 Q 15,12 28,12 Q 34,12 40,28"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Path
        d="M 78,35 Q 85,12 72,12 Q 66,12 60,28"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Ellipse
        cx="50"
        cy="50"
        rx="38"
        ry="26"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <Circle cx="34" cy="45" r="7" fill="url(#eyeYellow)" stroke="#1a1a1c" strokeWidth="1.5" />
      <Circle cx="32" cy="42.5" r="2.5" fill="#ffffff" />
      <Circle cx="66" cy="45" r="7" fill="url(#eyeCyan)" stroke="#1a1a1c" strokeWidth="1.5" />
      <Circle cx="64" cy="42.5" r="2.5" fill="#ffffff" />
      <Ellipse cx="50" cy="52" rx="3" ry="2" fill="#3a2a26" />
      <Circle cx="50" cy="58" r="3" fill="#ff7da5" stroke="#1a1a1c" strokeWidth="2" />

      <G transform="rotate(-10 27 75)">
        <Rect
          x="15"
          y="65"
          width="25"
          height="25"
          rx="6"
          fill="#f8e71c"
          stroke="#1a1a1c"
          strokeWidth="2.5"
        />
        <SvgText x="27" y="83" fontWeight="900" fontSize="18" fill="#1a1a1c" textAnchor="middle">
          #
        </SvgText>
      </G>

      <Rect
        x="40"
        y="60"
        width="25"
        height="25"
        rx="6"
        fill="#00f3ff"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <SvgText x="52" y="78" fontWeight="900" fontSize="18" fill="#1a1a1c" textAnchor="middle">
        @
      </SvgText>

      <G transform="rotate(15 77 82)">
        <Rect
          x="65"
          y="70"
          width="25"
          height="25"
          rx="6"
          fill="#ff7da5"
          stroke="#1a1a1c"
          strokeWidth="2.5"
        />
        <SvgText x="77" y="88" fontWeight="900" fontSize="16" fill="#1a1a1c" textAnchor="middle">
          !!
        </SvgText>
      </G>
    </Svg>
  )
}
