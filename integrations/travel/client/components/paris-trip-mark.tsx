import { cn } from '../utils/class-names.js'

interface ParisTripMarkProps {
  className?: string
}

export function ParisTripMark({ className }: ParisTripMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-[13px] bg-[#f1dfcd] text-[#173a35] shadow-[0_6px_18px_rgba(34,55,48,0.13)] ring-1 ring-white/70',
        className,
      )}
    >
      <svg className="size-[78%]" fill="none" viewBox="0 0 48 48">
        <circle cx="37" cy="10" fill="#e66f57" r="5" />
        <path
          d="M24 5.5 17.2 35M24 5.5 30.8 35M14.5 35h19M18.8 27h10.4M20.6 19h6.8M18 35l-3 6.5h18L30 35"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.25"
        />
        <path
          d="M19 35c1.2-2.5 2.8-3.8 5-3.8s3.8 1.3 5 3.8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  )
}
