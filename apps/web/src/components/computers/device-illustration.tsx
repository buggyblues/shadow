import {
  CLOUD_COMPUTER_SHELL_PALETTE,
  type CloudComputerShellColor,
  type ShadowComputerDeviceClass,
} from '@shadowob/shared'
import { cn } from '@shadowob/ui'
import { useId } from 'react'

export function ComputerDeviceIllustration({
  deviceClass,
  shellColor = 'aqua',
  className,
}: {
  deviceClass: ShadowComputerDeviceClass
  shellColor?: CloudComputerShellColor
  className?: string
}) {
  const id = useId().replaceAll(':', '')
  const shell = `${id}-shell`
  const shellDark = `${id}-shell-dark`
  const glass = `${id}-glass`
  const aqua = `${id}-aqua`
  const glow = `${id}-glow`
  const shadow = `${id}-shadow`
  const isLaptop = deviceClass === 'macbook' || deviceClass === 'laptop'
  const isAllInOne = deviceClass === 'imac'
  const isCompact = deviceClass === 'mac-mini' || deviceClass === 'mac-studio'
  const isCloud = deviceClass === 'cloud'
  const palette = CLOUD_COMPUTER_SHELL_PALETTE[shellColor]

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 260 170"
      className={cn('h-32 w-full overflow-visible', className)}
      fill="none"
    >
      <defs>
        <linearGradient id={shell} x1="46" y1="24" x2="203" y2="142">
          <stop stopColor={palette.highlight} />
          <stop offset="0.28" stopColor={palette.glow} />
          <stop offset="0.66" stopColor={palette.shell} />
          <stop offset="1" stopColor={palette.deep} />
        </linearGradient>
        <linearGradient id={shellDark} x1="48" y1="34" x2="206" y2="145">
          <stop stopColor="#405A68" />
          <stop offset="0.55" stopColor="#172B37" />
          <stop offset="1" stopColor="#07131C" />
        </linearGradient>
        <radialGradient
          id={glass}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(91 48) rotate(38) scale(128 94)"
        >
          <stop stopColor="#B9FAFF" />
          <stop offset="0.26" stopColor="#38D9EB" />
          <stop offset="0.62" stopColor="#4855C8" />
          <stop offset="1" stopColor="#141A49" />
        </radialGradient>
        <linearGradient id={aqua} x1="42" y1="22" x2="212" y2="148">
          <stop stopColor={palette.highlight} stopOpacity="0.95" />
          <stop offset="0.33" stopColor={palette.glow} stopOpacity="0.78" />
          <stop offset="0.72" stopColor={palette.shell} stopOpacity="0.9" />
          <stop offset="1" stopColor={palette.deep} stopOpacity="0.98" />
        </linearGradient>
        <filter id={shadow} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#020817" floodOpacity="0.55" />
        </filter>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <ellipse
        cx="130"
        cy="151"
        rx="86"
        ry="10"
        fill="#03101A"
        opacity="0.48"
        filter={`url(#${glow})`}
      />

      {isLaptop ? (
        <g filter={`url(#${shadow})`}>
          <path
            d="M54 33c0-15 12-27 27-27h98c15 0 27 12 27 27v86H54V33Z"
            fill={`url(#${shell})`}
            stroke={palette.highlight}
            strokeOpacity="0.58"
            strokeWidth="2"
          />
          <path d="M63 31c0-9 7-16 16-16h102c9 0 16 7 16 16v78H63V31Z" fill="#07111D" />
          <path d="M69 29c0-4 3-7 7-7h108c4 0 7 3 7 7v73H69V29Z" fill={`url(#${glass})`} />
          <circle cx="93" cy="57" r="27" fill="#8CF7E8" opacity="0.34" />
          <circle cx="160" cy="77" r="44" fill="#D861E8" opacity="0.28" />
          <path d="M69 29c28-5 71-5 122 3v11C141 34 99 35 69 44V29Z" fill="white" opacity="0.2" />
          {deviceClass === 'macbook' ? (
            <path
              d="M108 8c4-5 11-8 22-8s18 3 22 8h-8c-3-2-8-3-14-3s-11 1-14 3h-8Z"
              fill={palette.deep}
              opacity="0.9"
            />
          ) : (
            <circle cx="130" cy="22" r="1.5" fill="#6C8793" />
          )}
          <path
            d="M40 116h180l18 18c4 4 1 11-5 12H27c-6-1-9-8-5-12l18-18Z"
            fill={`url(#${shell})`}
            stroke={palette.highlight}
            strokeOpacity="0.45"
          />
          <path d="M43 116h174l-12 10H55l-12-10Z" fill={palette.highlight} opacity="0.62" />
          <path d="M104 119h52l-7 8h-38l-7-8Z" fill={palette.deep} opacity="0.5" />
          <path
            d="M35 141h190"
            stroke={palette.glow}
            strokeOpacity="0.72"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M52 121c25 8 50 12 76 12 31 0 58-4 82-12"
            stroke="white"
            strokeOpacity="0.15"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      ) : isAllInOne ? (
        <g filter={`url(#${shadow})`}>
          <path
            d="M49 26c0-10 8-18 18-18h126c10 0 18 8 18 18v94c0 10-8 18-18 18H67c-10 0-18-8-18-18V26Z"
            fill={`url(#${aqua})`}
            stroke="#C4FFFF"
            strokeOpacity="0.62"
            strokeWidth="2"
          />
          <path
            d="M61 25c0-5 4-9 9-9h120c5 0 9 4 9 9v73c0 5-4 9-9 9H70c-5 0-9-4-9-9V25Z"
            fill="#07111D"
          />
          <rect x="67" y="22" width="126" height="79" rx="5" fill={`url(#${glass})`} />
          <circle cx="96" cy="50" r="30" fill="#72FFF0" opacity="0.32" />
          <path
            d="M55 20c17-9 38-10 61-8-26 16-42 49-45 91l-14 18c-7-31-7-78-2-101Z"
            fill="white"
            opacity="0.18"
          />
          <path d="M118 138h24l6 13h-36l6-13Z" fill={`url(#${shell})`} />
          <path d="M96 151h68l10 8H86l10-8Z" fill={`url(#${shell})`} />
          <circle cx="130" cy="121" r="3" fill="#BFFFF7" opacity="0.8" />
        </g>
      ) : isCompact ? (
        <g filter={`url(#${shadow})`}>
          {deviceClass === 'mac-studio' ? (
            <>
              <path d="M76 39 91 25h87l14 14v84l-14 14H91l-15-14V39Z" fill={`url(#${shell})`} />
              <path d="M82 42h104" stroke="white" strokeOpacity="0.6" strokeWidth="3" />
              <path d="M82 112h104" stroke="#1D3440" strokeOpacity="0.5" strokeWidth="2" />
              <circle cx="166" cy="118" r="3" fill="#49F4DD" />
              <rect x="95" y="54" width="78" height="47" rx="8" fill="#8DD9E1" opacity="0.12" />
            </>
          ) : (
            <>
              <path
                d="M55 68 74 50h118l18 18-10 54-15 13H75l-15-13-5-54Z"
                fill={`url(#${shell})`}
              />
              <path d="m74 50 14-9h94l10 9H74Z" fill="#F6FCFD" opacity="0.88" />
              <path d="M63 72h139" stroke="white" strokeOpacity="0.55" strokeWidth="2" />
              <circle cx="182" cy="111" r="3" fill="#49F4DD" />
              <path
                d="M88 116h60"
                stroke="#17303C"
                strokeWidth="4"
                strokeLinecap="round"
                opacity="0.45"
              />
            </>
          )}
        </g>
      ) : isCloud ? (
        <g filter={`url(#${shadow})`}>
          <path
            d="M57 121c-20 0-34-13-34-31 0-17 13-30 31-31C61 33 84 16 112 16c26 0 48 14 58 36 4-1 8-2 13-2 29 0 51 20 51 45 0 16-9 26-26 26H57Z"
            fill={`url(#${aqua})`}
            stroke="#B9FFFF"
            strokeOpacity="0.58"
            strokeWidth="2"
          />
          <path
            d="M35 75c13-32 39-50 78-52-26 16-42 44-44 89H54c-18 0-26-20-19-37Z"
            fill="white"
            opacity="0.13"
          />
          <g transform="translate(86 50)">
            <path
              d="M0 11 10 1h74l10 10v61L84 82H10L0 72V11Z"
              fill={`url(#${shellDark})`}
              stroke="#A4EEF1"
              strokeOpacity="0.45"
            />
            {[17, 35, 53].map((y) => (
              <g key={y}>
                <rect x="10" y={y} width="74" height="13" rx="4" fill="#A5F9F1" opacity="0.12" />
                <circle cx="73" cy={y + 6.5} r="2" fill="#4FF6DD" />
                <path
                  d={`M17 ${y + 6.5}h29`}
                  stroke="#9BE6E8"
                  strokeOpacity="0.48"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </g>
        </g>
      ) : (
        <g filter={`url(#${shadow})`}>
          <path d="M27 34 40 20h125l13 14v78l-13 14H40l-13-14V34Z" fill={`url(#${shell})`} />
          <rect x="38" y="29" width="129" height="83" rx="7" fill="#07111D" />
          <rect x="45" y="36" width="115" height="69" rx="3" fill={`url(#${glass})`} />
          <circle cx="82" cy="58" r="25" fill="#8CFFF0" opacity="0.26" />
          <path
            d="M93 126h28v17H93zM73 145h68"
            stroke="#B9CDD5"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="m190 34 10-9h25l9 9v101l-9 9h-25l-10-9V34Z"
            fill={`url(#${shellDark})`}
            stroke="#7894A1"
            strokeOpacity="0.6"
          />
          <path d="M200 44h24v53h-24z" fill="#B6F6F2" opacity="0.08" />
          <circle cx="212" cy="113" r="4" fill="#48F4DC" />
          <path d="M201 126h22" stroke="#7FA4AE" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
    </svg>
  )
}
