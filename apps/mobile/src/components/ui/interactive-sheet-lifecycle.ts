export type InteractiveSheetVisibilityEffect = 'present' | 'dismiss' | null

export interface InteractiveSheetLifecycleState {
  didMount: boolean
  isPresented: boolean
  programmaticDismissPending: boolean
  sheetDismissHandled: boolean
}

export function createInteractiveSheetLifecycleState(): InteractiveSheetLifecycleState {
  return {
    didMount: false,
    isPresented: false,
    programmaticDismissPending: false,
    sheetDismissHandled: false,
  }
}

export function markInteractiveSheetPresentRequested(state: InteractiveSheetLifecycleState) {
  state.isPresented = true
}

export function syncInteractiveSheetVisibility(
  state: InteractiveSheetLifecycleState,
  visible: boolean,
): InteractiveSheetVisibilityEffect {
  if (!state.didMount) {
    state.didMount = true
    if (!visible) return null
    markInteractiveSheetPresentRequested(state)
    return 'present'
  }

  if (visible) {
    markInteractiveSheetPresentRequested(state)
    return 'present'
  }

  if (state.sheetDismissHandled) {
    // The sheet was closed by a native backdrop/pan gesture. In that path
    // BottomSheetModal has already dismissed itself before React state changes,
    // so calling dismiss() again can leave the next open request racing an old
    // onDismiss callback.
    state.sheetDismissHandled = false
    state.isPresented = false
    return null
  }

  if (!state.isPresented) return null

  state.programmaticDismissPending = true
  return 'dismiss'
}

export function resolveInteractiveSheetDismiss(
  state: InteractiveSheetLifecycleState,
  desiredVisible: boolean,
) {
  state.isPresented = false

  if (state.programmaticDismissPending) {
    state.programmaticDismissPending = false
    // A prop-driven close animation may finish after the user has already
    // tapped a home action to open the same or another sheet. In that case the
    // stale onDismiss must not call onClose for the new open state; instead the
    // caller should present again after the native dismiss fully settles.
    return {
      shouldClose: false,
      shouldReopen: desiredVisible,
    }
  }

  if (desiredVisible) {
    state.sheetDismissHandled = true
    return {
      shouldClose: true,
      shouldReopen: false,
    }
  }

  return {
    shouldClose: false,
    shouldReopen: false,
  }
}
