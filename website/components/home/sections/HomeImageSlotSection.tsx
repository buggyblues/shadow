import type { CSSProperties } from 'react'

const DOCS_BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ||
  '/'
).replace(/\/$/, '')

export function HomeImageSlotSection() {
  return (
    <section
      className="home-image-slot-section"
      aria-hidden="true"
      style={
        {
          '--home-image-slot-background': `url("${DOCS_BASE}/home-sections/space-earth-horizon-2.webp")`,
        } as CSSProperties
      }
    >
      <img
        className="home-image-slot-family"
        src={`${DOCS_BASE}/home-assets/animal-family-footer.webp`}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </section>
  )
}
