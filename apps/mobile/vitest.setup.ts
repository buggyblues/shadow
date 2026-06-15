import { vi } from 'vitest'
import { spacing } from './src/theme'

vi.stubGlobal('__DEV__', false)

type TestExpoListener = (...args: unknown[]) => void

class TestExpoEventEmitter {
  private listeners = new Map<string, Set<TestExpoListener>>()

  addListener(eventName: string, listener: TestExpoListener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set())
    }
    this.listeners.get(eventName)?.add(listener)
    return {
      remove: () => {
        this.removeListener(eventName, listener)
      },
    }
  }

  removeListener(eventName: string, listener: TestExpoListener) {
    this.listeners.get(eventName)?.delete(listener)
  }

  removeAllListeners(eventName: string) {
    this.listeners.get(eventName)?.clear()
  }

  emit(eventName: string, ...args: unknown[]) {
    this.listeners.get(eventName)?.forEach((listener) => {
      listener(...args)
    })
  }

  listenerCount(eventName: string) {
    return this.listeners.get(eventName)?.size ?? 0
  }
}

class TestExpoNativeModule extends TestExpoEventEmitter {
  [key: string]: unknown
}

class TestExpoSharedObject extends TestExpoEventEmitter {
  release() {}
}

class TestExpoSharedRef extends TestExpoSharedObject {
  nativeRefType = 'unknown'
}

Object.assign(globalThis, {
  expo: {
    EventEmitter: TestExpoEventEmitter,
    NativeModule: TestExpoNativeModule,
    SharedObject: TestExpoSharedObject,
    SharedRef: TestExpoSharedRef,
    modules: {},
  },
})

// Mock react-native modules not available in jsdom
vi.mock('react-native', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: React,
    Platform: {
      OS: 'ios',
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    Dimensions: {
      get: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
      flatten: (style: unknown) => style,
      compose: () => ({}),
    },
    TouchableOpacity: 'TouchableOpacity',
    Text: 'Text',
    View: 'View',
    ScrollView: 'ScrollView',
    FlatList: 'FlatList',
    SectionList: 'SectionList',
    Image: 'Image',
    Pressable: 'Pressable',
    SafeAreaView: 'SafeAreaView',
    Modal: 'Modal',
    Alert: { alert: vi.fn() },
    NativeModules: {},
    TurboModuleRegistry: {
      get: vi.fn(() => null),
      getEnforcing: vi.fn(() => ({})),
    },
    AppState: {
      currentState: 'active',
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Appearance: {
      getColorScheme: vi.fn(() => 'light'),
      addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    StatusBar: {
      setBarStyle: vi.fn(),
      setBackgroundColor: vi.fn(),
      setTranslucent: vi.fn(),
    },
    Keyboard: {
      addListener: vi.fn(() => ({ remove: vi.fn() })),
      dismiss: vi.fn(),
    },
    PixelRatio: {
      get: () => 2,
      getFontScale: () => 1,
    },
    Linking: {
      openURL: vi.fn(),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
      canOpenURL: vi.fn(() => Promise.resolve(true)),
    },
    Animated: {
      Value: class {
        constructor(public _value: number) {}
        setValue = vi.fn()
        interpolate = vi.fn(() => ({ __val: true }))
      },
      timing: vi.fn(() => ({ start: vi.fn() })),
      spring: vi.fn(() => ({ start: vi.fn() })),
      decay: vi.fn(() => ({ start: vi.fn() })),
    },
    Easing: {
      linear: vi.fn(),
      ease: vi.fn(),
      quad: vi.fn(),
      cubic: vi.fn(),
      poly: vi.fn(),
      sin: vi.fn(),
      circle: vi.fn(),
      exp: vi.fn(),
      elastic: vi.fn(),
      bounce: vi.fn(),
      back: vi.fn(),
      bezier: vi.fn(),
      in: vi.fn(),
      out: vi.fn(),
      inOut: vi.fn(),
    },
  }
})

// Mock react-native-reanimated
vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: (Component: unknown) => Component,
  useSharedValue: vi.fn((initial: unknown) => ({ value: initial })),
  useAnimatedStyle: vi.fn(() => ({})),
  useAnimatedRef: vi.fn(() => ({ current: null })),
  useDerivedValue: vi.fn(() => ({ value: 0 })),
  useAnimatedScrollHandler: vi.fn(() => ({})),
  withTiming: vi.fn((toVal: unknown) => toVal),
  withSpring: vi.fn((toVal: unknown) => toVal),
  withRepeat: vi.fn(),
  withDelay: vi.fn((_: unknown, v: unknown) => v),
  withSequence: vi.fn((...vals: unknown[]) => vals[vals.length - 1]),
  runOnJS: vi.fn((fn: unknown) => fn),
  runOnUI: vi.fn((fn: unknown) => fn),
  cancelAnimation: vi.fn(),
  measure: vi.fn(() => null),
  Layout: {
    linear: vi.fn(),
    spring: vi.fn(),
  },
  ZoomIn: {},
  ZoomOut: {},
  FadeIn: {},
  FadeOut: {},
  SlideInLeft: {},
  SlideOutRight: {},
}))

// Mock expo modules
vi.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { name: 'shadowob', slug: 'shadowob' },
    experienceUrl: 'exp://localhost:8081',
    manifest: {},
    manifest2: {},
    installationId: 'test-installation-id',
    appOwnership: 'standalone',
    runtimeVersion: '1.0.0',
    sessionId: 'test-session-id',
    debugMode: false,
    getIOSUserId: vi.fn(),
    statusBarHeight: 44,
    platform: { ios: {}, android: {}, web: {} },
    linkingUri: 'exp://localhost:8081',
  },
}))

vi.mock('expo-device', () => ({
  __esModule: true,
  default: {
    deviceName: 'Test Device',
    osName: 'iOS',
    osVersion: '17.0',
    platformApiLevel: 17,
    totalMemory: 4096,
    isDevice: true,
  },
  OS: { IOS: 'ios', ANDROID: 'android', WEB: 'web' },
}))

vi.mock('expo-font', () => ({
  __esModule: true,
  isLoaded: vi.fn(() => true),
  isLoading: vi.fn(() => false),
  hasErrored: vi.fn(() => false),
  loadAsync: vi.fn(() => Promise.resolve()),
  unloadAsync: vi.fn(() => Promise.resolve()),
}))

vi.mock('expo-router', () => ({
  __esModule: true,
  Link: 'Link',
  Stack: () => null,
  Tabs: () => null,
  Drawer: () => null,
  Slot: () => null,
  Redirect: () => null,
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useLocalSearchParams: vi.fn(() => ({})),
  useGlobalSearchParams: vi.fn(() => ({})),
  useFocusEffect: vi.fn((cb: () => void) => cb()),
  useNavigation: vi.fn(() => ({ navigate: vi.fn(), goBack: vi.fn() })),
  Href: class {},
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), dismiss: vi.fn() },
}))

vi.mock('expo-secure-store', () => ({
  __esModule: true,
  default: {
    getItemAsync: vi.fn(() => Promise.resolve(null)),
    setItemAsync: vi.fn(() => Promise.resolve()),
    deleteItemAsync: vi.fn(() => Promise.resolve()),
  },
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}))

vi.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map<string, string>()
  const asyncStorage = {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value)
      return Promise.resolve()
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key)
      return Promise.resolve()
    }),
    clear: vi.fn(() => {
      storage.clear()
      return Promise.resolve()
    }),
    multiGet: vi.fn((keys: string[]) =>
      Promise.resolve(keys.map((key) => [key, storage.get(key) ?? null])),
    ),
    multiSet: vi.fn((entries: [string, string][]) => {
      entries.forEach(([key, value]) => storage.set(key, value))
      return Promise.resolve()
    }),
    multiRemove: vi.fn((keys: string[]) => {
      keys.forEach((key) => storage.delete(key))
      return Promise.resolve()
    }),
  }
  return {
    __esModule: true,
    default: asyncStorage,
    ...asyncStorage,
  }
})

vi.mock('expo-image-picker', () => ({
  __esModule: true,
  default: {
    launchImageLibraryAsync: vi.fn(() => Promise.resolve({ canceled: true })),
    launchCameraAsync: vi.fn(() => Promise.resolve({ canceled: true })),
    getMediaLibraryPermissionsAsync: vi.fn(() => Promise.resolve({ status: 'granted' })),
  },
  launchImageLibraryAsync: vi.fn(() => Promise.resolve({ canceled: true })),
  launchCameraAsync: vi.fn(() => Promise.resolve({ canceled: true })),
}))

vi.mock('expo-clipboard', () => ({
  __esModule: true,
  default: {
    setStringAsync: vi.fn(() => Promise.resolve()),
    getStringAsync: vi.fn(() => Promise.resolve('')),
  },
  setStringAsync: vi.fn(() => Promise.resolve()),
  getStringAsync: vi.fn(() => Promise.resolve('')),
}))

vi.mock('@shopify/flash-list', () => ({
  __esModule: true,
  FlashList: vi
    .fn()
    .mockImplementation(
      ({
        renderItem,
        data,
      }: {
        renderItem: (args: { item: unknown; index: number }) => unknown
        data: unknown[]
      }) => data?.map((item, index) => renderItem({ item, index })),
    ),
}))

vi.mock('react-native-gesture-handler', () => {
  const createGestureMock = (id: string) => {
    const gesture = {
      id,
      maxDistance: vi.fn(() => gesture),
      maxDuration: vi.fn(() => gesture),
      minDuration: vi.fn(() => gesture),
      onBegin: vi.fn(() => gesture),
      onFinalize: vi.fn(() => gesture),
      onStart: vi.fn(() => gesture),
      runOnJS: vi.fn(() => gesture),
      shouldCancelWhenOutside: vi.fn(() => gesture),
    }
    return gesture
  }

  return {
    __esModule: true,
    GestureHandlerRootView: 'GestureHandlerRootView',
    GestureDetector: 'GestureDetector',
    Gesture: {
      Tap: () => createGestureMock('tap'),
      Pan: () => createGestureMock('pan'),
      Fling: () => createGestureMock('fling'),
    },
    Directions: { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 },
  }
})

vi.mock('react-native-pager-view', () => {
  const React = require('react')
  const PagerView = React.forwardRef(
    ({ children, ...props }: { children?: unknown }, ref: unknown) => {
      const setPage = vi.fn()
      const setPageWithoutAnimation = vi.fn()
      React.useImperativeHandle(ref, () => ({
        setPage,
        setPageWithoutAnimation,
      }))
      return React.createElement('PagerView', props, children)
    },
  )
  return { __esModule: true, default: PagerView }
})

vi.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: vi.fn(() => ({
    top: 44,
    bottom: 34,
    left: spacing.none,
    right: spacing.none,
  })),
  initialWindowMetrics: {
    frame: { x: 0, y: 0, width: 375, height: 812 },
    insets: { top: 44, bottom: 34, left: spacing.none, right: spacing.none },
  },
}))
