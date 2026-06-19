export function getInteractiveSheetTopInset(safeAreaTop: number, topGap: number) {
  return Math.max(0, safeAreaTop) + Math.max(0, topGap)
}

export function shouldUseKeyboardSheet({
  keyboardAware,
  hasAutoFocus,
}: {
  keyboardAware: boolean
  hasAutoFocus: boolean
}) {
  return keyboardAware && hasAutoFocus
}

export function getInteractiveSheetPanelMaxHeight({
  windowHeight,
  topInset,
  bottomInset,
  keyboardHeight,
  keyboardBuffer,
  minHeight = 220,
}: {
  windowHeight: number
  topInset: number
  bottomInset: number
  keyboardHeight: number
  keyboardBuffer: number
  minHeight?: number
}) {
  const bottomAvoidance = (keyboardHeight > 0 ? keyboardHeight : bottomInset) + keyboardBuffer
  return Math.max(minHeight, windowHeight - topInset - bottomAvoidance)
}

export function getInteractiveSheetDragOffset(dragY: number, upwardResistance = 0.28) {
  if (dragY >= 0) return dragY
  return dragY * upwardResistance
}

export function shouldDismissInteractiveSheetDrag({
  dragY,
  velocityY,
  panelHeight,
}: {
  dragY: number
  velocityY: number
  panelHeight: number
}) {
  const distanceThreshold = Math.min(panelHeight * 0.28, 180)
  return dragY > distanceThreshold || velocityY > 1.15
}
