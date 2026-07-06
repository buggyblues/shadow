import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

export function FaqAccordion({ faqs }: { faqs: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '32px 0' }}>
      {faqs.map((f, i) => {
        const isOpen = openIndex === i
        return (
          <div
            key={i}
            style={{
              border: `1px solid ${isOpen ? 'color-mix(in srgb, var(--shadow-accent) 30%, transparent)' : 'color-mix(in srgb, var(--rp-c-text-1) 10%, transparent)'}`,
              borderRadius: '16px',
              overflow: 'hidden',
              background: isOpen
                ? 'color-mix(in srgb, var(--shadow-accent) 5%, var(--shadow-card-bg))'
                : 'color-mix(in srgb, var(--rp-c-text-1) 3%, transparent)',
              boxShadow: isOpen
                ? '0 4px 16px color-mix(in srgb, var(--shadow-accent) 10%, transparent)'
                : 'none',
              transition: 'all 0.3s ease',
            }}
          >
            <button
              type="button"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: isOpen ? 'var(--shadow-accent)' : 'var(--rp-c-text-1)',
              }}
              onClick={() => setOpenIndex(isOpen ? null : i)}
            >
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '16px',
                  paddingRight: '16px',
                  transition: 'color 0.2s ease',
                }}
              >
                {f.q}
              </span>
              <ChevronDown
                size={20}
                style={{
                  flexShrink: 0,
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.3s ease',
                  color: isOpen ? 'var(--shadow-accent)' : 'var(--rp-c-text-3)',
                }}
              />
            </button>
            <div
              style={{
                display: 'grid',
                gridTemplateRows: isOpen ? '1fr' : '0fr',
                opacity: isOpen ? 1 : 0,
                transition: 'all 0.3s ease-in-out',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                <div
                  style={{
                    padding: '0 20px 20px',
                    color: 'var(--rp-c-text-2)',
                    lineHeight: 1.6,
                    fontSize: '15px',
                  }}
                >
                  {f.a}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
