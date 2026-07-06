import { useEffect, useRef, useState } from 'react'

export function TypingSlogan({ isZh }: { isZh: boolean }) {
  const zhLines: [string, string] = ['你的 AI 小王国，', '与你常在']
  const enLines: [string, string] = ['Your AI Kingdom,', 'Always Here']
  const lines = isZh ? zhLines : enLines
  const line1Len = lines[0].length
  const totalLen = line1Len + lines[1].length

  const [charIdx, setCharIdx] = useState(0)
  const [looping, setLooping] = useState(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    cancelRef.current = false
    setCharIdx(0)
    setLooping(false)
    const typingDelay = 82

    let idx = 0
    const type = () => {
      if (cancelRef.current) return
      idx++
      setCharIdx(idx)
      if (idx < totalLen) {
        setTimeout(type, typingDelay)
      } else {
        setLooping(true)
        setTimeout(() => {
          if (cancelRef.current) return
          setLooping(false)
          idx = 0
          setCharIdx(0)
          setTimeout(type, 300)
        }, 2200)
      }
    }
    setTimeout(type, 300)
    return () => {
      cancelRef.current = true
    }
  }, [isZh, totalLen])

  const line1 = lines[0].slice(0, Math.min(charIdx, line1Len))
  const line2 = charIdx > line1Len ? lines[1].slice(0, charIdx - line1Len) : ''
  const showCursorOnLine1 = charIdx <= line1Len && !looping
  const showCursorOnLine2 = charIdx > line1Len || looping
  const cursorClass = looping ? 'hero-cursor hero-cursor-blink' : 'hero-cursor'

  return (
    <h1 className="home-typing-slogan">
      <span style={{ display: 'block', height: '1.2em', lineHeight: 1.2, paddingLeft: '1em' }}>
        {line1}
        {showCursorOnLine1 && (
          <span className="hero-cursor" aria-hidden="true">
            _
          </span>
        )}
        {!showCursorOnLine1 && (
          <span className="hero-cursor" aria-hidden="true" style={{ visibility: 'hidden' }}>
            _
          </span>
        )}
      </span>
      <span style={{ display: 'block', height: '1.2em', lineHeight: 1.2 }}>
        {line2}
        {showCursorOnLine2 && (
          <span className={cursorClass} aria-hidden="true">
            _
          </span>
        )}
        {!showCursorOnLine2 && (
          <span className={cursorClass} aria-hidden="true" style={{ visibility: 'hidden' }}>
            _
          </span>
        )}
      </span>
    </h1>
  )
}
