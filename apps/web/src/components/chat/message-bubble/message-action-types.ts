import type { CSSProperties } from 'react'

export type BooleanSetter = (value: boolean) => void

export type FloatingStyleResolver = (
  offsetTop: number,
  estimatedWidth: number,
) => CSSProperties | null
