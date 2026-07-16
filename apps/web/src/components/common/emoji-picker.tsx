import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { type ComponentType, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  position?: 'top' | 'bottom'
  inline?: boolean
}

const i18nMapping: Record<string, string> = {
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
}

interface EmojiMartPickerProps {
  locale: string
  onEmojiSelect: (emoji: { native: string }) => void
}

const PickerComponent = Picker as ComponentType<Record<string, unknown>>

export function preloadEmojiPicker() {
  // Kept for callers that warm the picker on hover. The picker is loaded eagerly to avoid
  // Rspack lazy-compilation active-module errors in proxied dev environments.
}

function EmojiMartPicker({ locale, onEmojiSelect }: EmojiMartPickerProps) {
  return (
    <PickerComponent
      data={data}
      onEmojiSelect={onEmojiSelect}
      locale={locale}
      theme="dark"
      previewPosition="none"
      skinTonePosition="search"
      set="native"
    />
  )
}

export function EmojiPicker({
  onSelect,
  onClose,
  position = 'top',
  inline = false,
}: EmojiPickerProps) {
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
      className={
        inline
          ? 'relative z-auto overflow-hidden rounded-[16px] bg-white/95 dark:bg-[#1A1D24]/95'
          : `absolute z-50 ${position === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]'} right-0 bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-bottom-right`
      }
    >
      <EmojiMartPicker
        locale={locale}
        onEmojiSelect={(emoji) => {
          onSelect(emoji.native)
          onClose()
        }}
      />
    </div>
  )
}
