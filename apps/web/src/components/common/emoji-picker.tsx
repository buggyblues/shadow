import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  position?: 'top' | 'bottom'
}

const i18nMapping: Record<string, string> = {
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
}

export function EmojiPicker({ onSelect, onClose, position = 'top' }: EmojiPickerProps) {
  const { i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const locale = i18nMapping[i18n.language] ?? 'en'

  return (
    <div
      ref={containerRef}
      className={`absolute z-50 ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 bg-bg-primary/95 backdrop-blur-xl rounded-[24px] border border-border-subtle shadow-[0_16px_64px_rgba(0,0,0,0.4)] overflow-hidden`}
    >
      <Picker
        data={data}
        onEmojiSelect={(emoji: { native: string }) => {
          onSelect(emoji.native)
          onClose()
        }}
        locale={locale}
        theme="dark"
        previewPosition="none"
        skinTonePosition="search"
        set="native"
      />
    </div>
  )
}
