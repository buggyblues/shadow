import { useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useUIStore } from '../../stores/ui.store'

const MOVEMENT_RANGE = 24
const MOVEMENT_EASING = 0.08
const BACKGROUND_SCALE = 1.03

export function DynamicBackground() {
  const { backgroundImage, enableBackgroundMovement } = useUIStore()
  const prefersReducedMotion = useReducedMotion()
  const layerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const currentRef = useRef({ x: 0, y: 0 })
  const targetRef = useRef({ x: 0, y: 0 })

  // Disable movement if setting is off OR user prefers reduced motion
  const shouldMove = enableBackgroundMovement && !prefersReducedMotion

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const applyTransform = (x: number, y: number) => {
      layer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${BACKGROUND_SCALE})`
    }

    const cancelAnimation = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }

    const resetPosition = () => {
      cancelAnimation()
      currentRef.current = { x: 0, y: 0 }
      targetRef.current = { x: 0, y: 0 }
      applyTransform(0, 0)
    }

    if (!shouldMove) {
      resetPosition()
      return
    }

    const tick = () => {
      const current = currentRef.current
      const target = targetRef.current
      const nextX = current.x + (target.x - current.x) * MOVEMENT_EASING
      const nextY = current.y + (target.y - current.y) * MOVEMENT_EASING

      currentRef.current = { x: nextX, y: nextY }
      applyTransform(nextX, nextY)

      const distanceX = Math.abs(target.x - nextX)
      const distanceY = Math.abs(target.y - nextY)

      if (distanceX < 0.1 && distanceY < 0.1) {
        frameRef.current = null
        return
      }

      frameRef.current = requestAnimationFrame(tick)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * -MOVEMENT_RANGE * 2
      const y = (e.clientY / window.innerHeight - 0.5) * -MOVEMENT_RANGE * 2

      targetRef.current = { x, y }

      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      resetPosition()
    }
  }, [shouldMove])

  if (!backgroundImage) return null

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none -z-20 select-none"
      aria-hidden
    >
      <div
        ref={layerRef}
        className="absolute inset-[-24px] bg-cover bg-center bg-no-repeat will-change-transform"
        style={{
          backgroundImage: `url("${backgroundImage}")`,
          transform: `translate3d(0, 0, 0) scale(${BACKGROUND_SCALE})`,
          backfaceVisibility: 'hidden',
        }}
      />
      <div className="dynamic-background-overlay absolute inset-0" />
      <div className="dynamic-background-vignette absolute inset-0" />
    </div>
  )
}
