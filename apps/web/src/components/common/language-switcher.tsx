import { Button } from '@shadowob/ui'
import { Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type SupportedLanguage, supportedLanguages } from '../../lib/i18n'

interface LanguageSwitcherProps {
  /** Compact mode shows only the globe icon + flag (for nav bars) */
  compact?: boolean
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const currentLang =
    supportedLanguages.find((l) => l.code === i18n.language) ?? supportedLanguages[0]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleChange = (code: SupportedLanguage) => {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="glass"
        size={compact ? 'icon' : 'sm'}
        onClick={() => setOpen(!open)}
        aria-label="Switch language"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={compact ? '' : 'gap-1.5'}
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm">{currentLang.flag}</span>
        {!compact && <span className="text-sm font-medium">{currentLang.label}</span>}
      </Button>

      {open && (
        <div
          role="listbox"
          aria-label="Language"
          className="absolute right-0 top-full mt-2 bg-bg-primary/95 backdrop-blur-xl rounded-[24px] border border-border-subtle shadow-[0_16px_64px_rgba(0,0,0,0.4)] py-1.5 min-w-[160px] z-50"
        >
          {supportedLanguages.map((lang) => (
            <button
              type="button"
              key={lang.code}
              role="option"
              aria-selected={lang.code === i18n.language}
              onClick={() => handleChange(lang.code)}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-bg-tertiary/50 transition ${
                lang.code === i18n.language
                  ? 'text-primary font-bold bg-primary/10'
                  : 'text-text-secondary font-medium'
              }`}
            >
              <span className="text-base">{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
