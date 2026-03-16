import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: '虾豆 Shadow',
  owner: 'buggyblues',
  slug: 'shadowob',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'shadow',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#1E1F22',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.shadowob.mobile',
    associatedDomains: ['applinks:shadowob.shadowob.com'],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSSpeechRecognitionUsageDescription:
        'This app uses speech recognition to convert voice to text for chat input.',
      NSMicrophoneUsageDescription: 'This app uses the microphone for voice input in chat.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1E1F22',
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
    'expo-speech-recognition',
  ],
  extra: {
    eas: {
      projectId: 'a978bcc2-9214-4f87-900b-ad192ccad5fc',
    },
  },
}

export default config
