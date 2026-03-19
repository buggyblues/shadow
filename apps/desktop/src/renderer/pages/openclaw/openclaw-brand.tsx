import type { ReactNode } from 'react'

export function OpenClawIcon({
  size = 24,
  glow = false,
  className,
}: {
  size?: number
  glow?: boolean
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className || ''}
      style={{ filter: glow ? 'drop-shadow(0 4px 12px rgba(229,57,69,0.45))' : undefined }}
    >
      <defs>
        <radialGradient
          id="oc_body"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(50 48) rotate(90) scale(42)"
        >
          <stop stopColor="#FF5E69" />
          <stop offset="1" stopColor="#E53945" />
        </radialGradient>
        <linearGradient id="oc_claw" x1="10" y1="50" x2="30" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF5E69" />
          <stop offset="1" stopColor="#D93540" />
        </linearGradient>
      </defs>

      {/* Antennae */}
      <path d="M40 15C35 5 25 5 20 10" stroke="#E53945" strokeWidth="4" strokeLinecap="round" />
      <path d="M60 15C65 5 75 5 80 10" stroke="#E53945" strokeWidth="4" strokeLinecap="round" />

      {/* Legs */}
      <path
        d="M35 85C35 88 32 92 28 92C24 92 22 88 24 85"
        stroke="#B3242E"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M65 85C65 88 68 92 72 92C76 92 78 88 76 85"
        stroke="#B3242E"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* Claws */}
      <circle cx="15" cy="55" r="12" fill="url(#oc_claw)" />
      <circle cx="85" cy="55" r="12" fill="url(#oc_claw)" />

      {/* Body */}
      <circle cx="50" cy="50" r="40" fill="url(#oc_body)" />

      {/* Eyes */}
      <circle cx="35" cy="42" r="9" fill="white" />
      <circle cx="65" cy="42" r="9" fill="white" />
      <circle cx="37" cy="41" r="5" fill="#1a1a2e" />
      <circle cx="67" cy="41" r="5" fill="#1a1a2e" />
      <circle cx="38" cy="39" r="2" fill="white" />
      <circle cx="68" cy="39" r="2" fill="white" />

      {/* Cheeks */}
      <circle cx="24" cy="55" r="5" fill="#FFC1C7" opacity="0.5" />
      <circle cx="76" cy="55" r="5" fill="#FFC1C7" opacity="0.5" />

      {/* Smile */}
      <path
        d="M42 60C45 64 55 64 58 60"
        stroke="#8B1A24"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function OpenClawTopBar({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="desktop-drag-titlebar px-6 pt-5 pb-3 shrink-0 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-bold text-text-primary">{title}</h2>
        {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2" data-no-drag>
        {right}
      </div>
    </div>
  )
}
