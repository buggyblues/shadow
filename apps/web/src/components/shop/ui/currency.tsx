import React from 'react'

export function ShrimpCoinIcon({ className = '', size = 16 }: { className?: string; size?: number }) {
  // A cute shrimp/crawfish SVG representation for Shrimp Coin
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2c-1.54 0-3.08.79-4.24 2.1-1.16 1.3-1.76 3.12-1.76 5v.4A4.8 4.8 0 0 0 5 12c-1.66 0-3 1.34-3 3s1.34 3 3 3h2.64A5.95 5.95 0 0 0 12 22c2.4 0 4.63-1.42 5.53-3.66l1.24-3.1A3 3 0 0 0 18 11.5V10c0-2.65-1.05-5.2-2.93-7.07A9.97 9.97 0 0 0 14 2Z" strokeWidth="2" />
      <path d="M14 2a9.97 9.97 0 0 1 1.07 7.07" strokeWidth="2" />
      <path d="M8 9.5V10c0 .94.42 1.83 1.15 2.44" strokeWidth="2" />
      <path d="M8 9.5a5 5 0 0 0-4-1" strokeWidth="2" />
      <path d="M13.5 13a2.5 2.5 0 0 0-2.5 2.5" strokeWidth="2" />
    </svg>
  )
}

interface PriceDisplayProps {
  amount: number
  className?: string
  size?: number // Acts as a base scaling factor
  showFree?: boolean
}

export function PriceDisplay({ amount, className = '', size = 16, showFree = false }: PriceDisplayProps) {
  if (amount === 0 && showFree) {
    return (
      <span className={`text-emerald-500 font-bold inline-flex items-center ${className}`} style={{ fontSize: size }}>
        免费
      </span>
    )
  }

  return (
    <span className={`inline-flex items-baseline gap-[2px] text-rose-500 dark:text-rose-400 font-black tracking-tight ${className}`}>
      <ShrimpCoinIcon size={size * 0.9} className="relative top-[2px]" />
      <span style={{ fontSize: size, lineHeight: 1 }}>
        {amount.toLocaleString()}
      </span>
    </span>
  )
}
