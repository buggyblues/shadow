import * as Haptics from 'expo-haptics'

export function selectionHaptic() {
  void Haptics.selectionAsync().catch(() => {})
}

export function successHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

export function errorHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
}
