const MAX_BLURRED_WINDOW_AREA = 480_000

type WindowBackdropInput = {
  focused: boolean
  height: number
  maximized: boolean
  width: number
}

export function shouldUseWindowBackdrop(window: WindowBackdropInput) {
  return (
    window.focused || (!window.maximized && window.width * window.height <= MAX_BLURRED_WINDOW_AREA)
  )
}
