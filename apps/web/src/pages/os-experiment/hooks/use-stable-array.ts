import { useRef } from 'react'

function arrayShallowEqual<T>(
  left: readonly T[],
  right: readonly T[],
  isEqual: (leftValue: T, rightValue: T) => boolean = Object.is,
) {
  if (left.length !== right.length) return false
  return left.every((leftValue, index) => isEqual(leftValue, right[index] as T))
}

export function useStableArray<T>(
  value: T[],
  isEqual: (leftValue: T, rightValue: T) => boolean = Object.is,
) {
  const ref = useRef(value)
  if (!arrayShallowEqual(ref.current, value, isEqual)) {
    ref.current = value
  }
  return ref.current
}
