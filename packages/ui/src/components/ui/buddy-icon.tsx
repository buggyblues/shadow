import type { SVGProps } from 'react'

/**
 * Custom "Buddy" Icon - Stylized Cat Heart
 * Represents friendship and AI companionship in a cute, professional way.
 */
export function BuddyIcon({
  size = 24,
  className = '',
  ...props
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Buddy Icon"
      {...props}
    >
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill="currentColor"
        fillOpacity="0.15"
      />
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Cat ears inside the heart */}
      <path d="M8 7l-1.5-2.5L5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 7l1.5-2.5L19 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Simple happy face */}
      <circle cx="9" cy="11" r="1" fill="currentColor" />
      <circle cx="15" cy="11" r="1" fill="currentColor" />
      <path
        d="M10 14c.5.5 1.5.5 2 0s1.5-.5 2 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
