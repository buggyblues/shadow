import React from 'react'

/* SVG Gradient Definitions — must be rendered once on pages using cat SVGs */
export function CatSvgDefs() {
  return (
    <svg width="0" height="0" className="hidden">
      <defs>
        <radialGradient id="catBody" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#5a5a5e" />
          <stop offset="50%" stopColor="#3d3d40" />
          <stop offset="100%" stopColor="#18181a" />
        </radialGradient>
        <radialGradient id="eyeYellow" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffcc" />
          <stop offset="35%" stopColor="#f8e71c" />
          <stop offset="100%" stopColor="#b3a100" />
        </radialGradient>
        <radialGradient id="eyeCyan" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ccffff" />
          <stop offset="35%" stopColor="#00f3ff" />
          <stop offset="100%" stopColor="#0099aa" />
        </radialGradient>
        <filter id="glowYellow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glowCyan" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  )
}

/* Agent Cat with headset */
export function AgentCatSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
      <path
        d="M 22,47 Q 15,24 28,24 Q 34,24 40,40"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 78,47 Q 85,24 72,24 Q 66,24 60,40"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse
        cx="50"
        cy="62"
        rx="38"
        ry="26"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <circle
        cx="32"
        cy="57"
        r="6.5"
        fill="url(#eyeYellow)"
        stroke="#1a1a1c"
        strokeWidth="1.5"
        className="cat-eye cat-eye-yellow"
      />
      <circle cx="30" cy="54.5" r="2.2" fill="#ffffff" />
      <circle
        cx="68"
        cy="57"
        r="6.5"
        fill="url(#eyeCyan)"
        stroke="#1a1a1c"
        strokeWidth="1.5"
        className="cat-eye cat-eye-cyan"
      />
      <circle cx="66" cy="54.5" r="2.2" fill="#ffffff" />
      <ellipse cx="50" cy="64" rx="4" ry="2.5" fill="#3a2a26" />
      <path
        d="M 40,69 Q 45,74.5 50,69"
        fill="none"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 50,69 Q 55,74.5 60,69"
        fill="none"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 12,50 A 42 42 0 0 1 88 50"
        fill="none"
        stroke="#00f3ff"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect
        x="6"
        y="45"
        width="12"
        height="28"
        rx="6"
        fill="#ff7da5"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <rect
        x="82"
        y="45"
        width="12"
        height="28"
        rx="6"
        fill="#00f3ff"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <path
        d="M 12,68 Q 20,80 30,75"
        fill="none"
        stroke="#1a1a1c"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="30" cy="75" r="3.5" fill="#f8e71c" stroke="#1a1a1c" strokeWidth="2" />
    </svg>
  )
}

/* Work Cat with laptop */
export function WorkCatSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
      <path
        d="M 28,40 Q 22,20 32,20 Q 38,20 42,32"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 72,40 Q 78,20 68,20 Q 62,20 58,32"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="35"
        ry="24"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <circle
        cx="34"
        cy="45"
        r="6"
        fill="url(#eyeYellow)"
        stroke="#1a1a1c"
        strokeWidth="1.5"
        className="cat-eye cat-eye-yellow"
      />
      <circle cx="32" cy="43" r="2" fill="#ffffff" />
      <circle
        cx="66"
        cy="45"
        r="6"
        fill="url(#eyeCyan)"
        stroke="#1a1a1c"
        strokeWidth="1.5"
        className="cat-eye cat-eye-cyan"
      />
      <circle cx="64" cy="43" r="2" fill="#ffffff" />
      <path
        d="M 32,60 Q 32,48 40,48 Q 45,48 45,55"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 68,60 Q 68,48 60,48 Q 55,48 55,55"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 15,55 L 85,55 L 90,85 L 10,85 Z"
        fill="#ff7da5"
        stroke="#1a1a1c"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M 12,85 L 88,85 L 88,88 Q 50,92 12,88 Z"
        fill="#e85b85"
        stroke="#1a1a1c"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M 50,62 L 52,66 L 57,66 L 53,69 L 55,73 L 50,70 L 45,73 L 47,69 L 43,66 L 48,66 Z"
        fill="#f8e71c"
        stroke="#1a1a1c"
        strokeWidth="1.5"
      />
    </svg>
  )
}

/* Channel Cat with blocks */
export function ChannelCatSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
      <path
        d="M 22,35 Q 15,12 28,12 Q 34,12 40,28"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 78,35 Q 85,12 72,12 Q 66,12 60,28"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="38"
        ry="26"
        fill="url(#catBody)"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <circle
        cx="34"
        cy="45"
        r="7"
        fill="url(#eyeYellow)"
        stroke="#1a1a1c"
        strokeWidth="1.5"
        className="cat-eye cat-eye-yellow"
      />
      <circle cx="32" cy="42.5" r="2.5" fill="#ffffff" />
      <circle
        cx="66"
        cy="45"
        r="7"
        fill="url(#eyeCyan)"
        stroke="#1a1a1c"
        strokeWidth="1.5"
        className="cat-eye cat-eye-cyan"
      />
      <circle cx="64" cy="42.5" r="2.5" fill="#ffffff" />
      <ellipse cx="50" cy="52" rx="3" ry="2" fill="#3a2a26" />
      <circle cx="50" cy="58" r="3" fill="#ff7da5" stroke="#1a1a1c" strokeWidth="2" />
      <rect
        x="15"
        y="65"
        width="25"
        height="25"
        rx="6"
        fill="#f8e71c"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        transform="rotate(-10 27 75)"
      />
      <text
        x="22"
        y="85"
        fontFamily="'Nunito', sans-serif"
        fontWeight="900"
        fontSize="18"
        fill="#1a1a1c"
        transform="rotate(-10 27 75)"
      >
        #
      </text>
      <rect
        x="40"
        y="60"
        width="25"
        height="25"
        rx="6"
        fill="#00f3ff"
        stroke="#1a1a1c"
        strokeWidth="2.5"
      />
      <text
        x="47"
        y="78"
        fontFamily="'Nunito', sans-serif"
        fontWeight="900"
        fontSize="18"
        fill="#1a1a1c"
      >
        @
      </text>
      <rect
        x="65"
        y="70"
        width="25"
        height="25"
        rx="6"
        fill="#ff7da5"
        stroke="#1a1a1c"
        strokeWidth="2.5"
        transform="rotate(15 77 82)"
      />
      <text
        x="73"
        y="88"
        fontFamily="'Nunito', sans-serif"
        fontWeight="900"
        fontSize="16"
        fill="#1a1a1c"
        transform="rotate(15 77 82)"
      >
        !!
      </text>
    </svg>
  )
}
