import { Button } from '@shadowob/ui'
import type { TFunction } from 'i18next'
import { EmojiPicker } from '../../common/emoji-picker'
import { quickEmojis } from './constants'
import type { BooleanSetter, FloatingStyleResolver } from './message-action-types'

interface EmojiPortalProps {
  getFloatingControlsStyle: FloatingStyleResolver
  messageId: string
  onMouseEnter: () => void
  onMouseLeave: () => void
  onReact?: (messageId: string, emoji: string) => void
}

interface QuickEmojiPickerProps extends EmojiPortalProps {
  setShowEmojiPicker: BooleanSetter
  setShowFullPicker: BooleanSetter
  t: TFunction
}

export function QuickEmojiPicker({
  getFloatingControlsStyle,
  messageId,
  onMouseEnter,
  onMouseLeave,
  onReact,
  setShowEmojiPicker,
  setShowFullPicker,
  t,
}: QuickEmojiPickerProps) {
  const floatingStyle = getFloatingControlsStyle(44, 284)
  if (!floatingStyle) return null

  return (
    <div
      data-message-actions-floating="true"
      className="fixed flex items-center bg-white/90 dark:bg-[#1A1D24]/90 backdrop-blur-xl rounded-[14px] border border-black/5 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-0.5 z-[66] transition-all"
      style={floatingStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {quickEmojis.map((emoji) => (
        <Button
          variant="ghost"
          size="xs"
          key={emoji}
          onClick={() => {
            onReact?.(messageId, emoji)
            setShowEmojiPicker(false)
          }}
          className="!w-8 !h-8 !rounded-[10px] !px-0 !font-normal !normal-case !tracking-normal text-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          {emoji}
        </Button>
      ))}
      <div className="w-px h-5 bg-black/5 dark:bg-white/10 mx-0.5 shrink-0" />
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          setShowEmojiPicker(false)
          setShowFullPicker(true)
        }}
        className="!w-8 !h-8 !rounded-[10px] !px-0 !font-normal !normal-case !tracking-normal text-sm text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        title={t('chat.addEmoji')}
      >
        +
      </Button>
    </div>
  )
}

interface FullEmojiPickerProps extends EmojiPortalProps {
  setShowFullPicker: BooleanSetter
}

export function FullEmojiPicker({
  getFloatingControlsStyle,
  messageId,
  onMouseEnter,
  onMouseLeave,
  onReact,
  setShowFullPicker,
}: FullEmojiPickerProps) {
  const fullPickerPosStyle = getFloatingControlsStyle(440, 352)
  if (!fullPickerPosStyle) return null

  return (
    <div
      data-message-actions-floating="true"
      className="fixed z-[70]"
      style={fullPickerPosStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <EmojiPicker
        onSelect={(emoji) => {
          onReact?.(messageId, emoji)
        }}
        onClose={() => setShowFullPicker(false)}
        position="bottom"
      />
    </div>
  )
}
