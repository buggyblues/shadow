// ══════════════════════════════════════════════════════════════
// StarRating — half-star interactive rating widget
// ══════════════════════════════════════════════════════════════

import { Star } from 'lucide-react'
import { useState } from 'react'

interface StarRatingProps {
  rating: number
  onChange?: (r: number) => void
  size?: 'sm' | 'md'
  readonly?: boolean
}

export function StarRating({ rating, onChange, size = 'sm', readonly = false }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0)
  const displayRating = hoverRating || rating
  const starSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'

  const handleClick = (starIndex: number, isHalf: boolean) => {
    if (readonly || !onChange) return
    const newRating = isHalf ? starIndex - 0.5 : starIndex
    onChange(newRating === rating ? 0 : newRating)
  }

  return (
    <div className="flex items-center gap-px" onMouseLeave={() => setHoverRating(0)}>
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const filled = displayRating >= starIndex
        const halfFilled = !filled && displayRating >= starIndex - 0.5
        return (
          <div key={starIndex} className="relative">
            {/* Left half (half-star) */}
            <div
              className="absolute inset-y-0 left-0 w-1/2 z-10"
              onMouseEnter={() => !readonly && setHoverRating(starIndex - 0.5)}
              onClick={() => handleClick(starIndex, true)}
              style={{ cursor: readonly ? 'default' : 'pointer' }}
            />
            {/* Right half (full-star) */}
            <div
              className="absolute inset-y-0 right-0 w-1/2 z-10"
              onMouseEnter={() => !readonly && setHoverRating(starIndex)}
              onClick={() => handleClick(starIndex, false)}
              style={{ cursor: readonly ? 'default' : 'pointer' }}
            />
            <Star
              className={`${starSize} transition-colors ${
                filled
                  ? 'fill-amber-400 text-amber-400'
                  : halfFilled
                    ? 'fill-amber-400/50 text-amber-400'
                    : 'text-zinc-700'
              }`}
            />
          </div>
        )
      })}
      {rating > 0 && <span className="ml-1 text-[10px] text-zinc-500">{rating}</span>}
    </div>
  )
}
