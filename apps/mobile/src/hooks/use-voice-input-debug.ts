import Constants from 'expo-constants'

// Debug info for voice input
export function getVoiceInputDebugInfo() {
  return {
    appOwnership: Constants.appOwnership,
    isExpoGo: Constants.appOwnership === 'expo',
    executionEnvironment: Constants.executionEnvironment,
    manifest: Constants.manifest ? 'exists' : 'null',
    manifest2: Constants.manifest2 ? 'exists' : 'null',
  }
}
