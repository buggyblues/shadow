import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: '虾豆 Shadow',
  owner: 'buggyblues',
  slug: 'shadowob',
  version: '1.3.40',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'shadow',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#050508',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.shadowob.mobile',
    usesAppleSignIn: true,
    associatedDomains: ['applinks:shadowob.shadowob.com'],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSSpeechRecognitionUsageDescription:
        'This app uses speech recognition to convert voice to text for chat input.',
      NSMicrophoneUsageDescription: 'This app uses the microphone for voice input in chat.',
      NSCameraUsageDescription: 'This app uses the camera to scan Shadow QR codes.',
    },
  },
  android: {
    permissions: ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'CAMERA'],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#050508',
    },
    package: 'com.shadowob.mobile',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'shadow' }, { scheme: 'https', host: 'shadowob.shadowob.com' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-image-picker',
    'expo-document-picker',
    'expo-web-browser',
    'expo-apple-authentication',
    'expo-localization',
    'expo-speech-recognition',
    'expo-audio',
    'expo-asset',
    'expo-camera',
  ],
  extra: {
    eas: {
      projectId: 'a978bcc2-9214-4f87-900b-ad192ccad5fc',
    },
  },
}

export default config
