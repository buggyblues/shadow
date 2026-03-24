import { useLocalSearchParams, useNavigation } from 'expo-router'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  X,
} from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import WebView from 'react-native-webview'
import { HeaderButton, HeaderButtonGroup } from '../../src/components/common/header-button'
import { useColors } from '../../src/theme'

export default function WebViewPreviewScreen() {
  const { url, title } = useLocalSearchParams<{
    url: string
    title?: string
  }>()
  const { t } = useTranslation()
  const colors = useColors()
  const navigation = useNavigation()
  const webViewRef = useRef<WebView>(null)

  const [loading, setLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(url ?? '')
  const [pageTitle, setPageTitle] = useState(title ?? '')

  const decodedUrl = url ? decodeURIComponent(url) : ''

  const handleGoBack = useCallback(() => {
    webViewRef.current?.goBack()
  }, [])

  const handleGoForward = useCallback(() => {
    webViewRef.current?.goForward()
  }, [])

  const handleRefresh = useCallback(() => {
    webViewRef.current?.reload()
  }, [])

  const handleClose = useCallback(() => {
    navigation.goBack()
  }, [navigation])

  const handleOpenInBrowser = useCallback(async () => {
    if (currentUrl) {
      await Linking.openURL(currentUrl)
    }
  }, [currentUrl])

  const onNavigationStateChange = useCallback((navState: {
    canGoBack: boolean
    canGoForward: boolean
    url: string
    title: string
  }) => {
    setCanGoBack(navState.canGoBack)
    setCanGoForward(navState.canGoForward)
    setCurrentUrl(navState.url)
    if (navState.title && navState.title !== 'about:blank') {
      setPageTitle(navState.title)
    }
  }, [])

  useEffect(() => {
    navigation.setOptions({
      title: pageTitle || t('chat.webPreview', '网页预览'),
      headerLeft: () => (
        <HeaderButtonGroup>
          <HeaderButton
            icon={ArrowLeft}
            onPress={handleGoBack}
            disabled={!canGoBack}
            color={canGoBack ? colors.text : colors.textMuted}
          />
          <HeaderButton
            icon={ArrowRight}
            onPress={handleGoForward}
            disabled={!canGoForward}
            color={canGoForward ? colors.text : colors.textMuted}
          />
        </HeaderButtonGroup>
      ),
      headerRight: () => (
        <HeaderButtonGroup>
          <HeaderButton
            icon={RefreshCw}
            onPress={handleRefresh}
            color={colors.text}
          />
          <HeaderButton
            icon={ExternalLink}
            onPress={handleOpenInBrowser}
            color={colors.text}
          />
          <HeaderButton
            icon={X}
            onPress={handleClose}
            color={colors.text}
          />
        </HeaderButtonGroup>
      ),
    })
  }, [
    navigation,
    pageTitle,
    colors,
    t,
    canGoBack,
    canGoForward,
    handleGoBack,
    handleGoForward,
    handleRefresh,
    handleOpenInBrowser,
    handleClose,
  ])

  if (!decodedUrl) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.textMuted }]}>
            {t('chat.invalidUrl', '无效的链接')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: decodedUrl }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={onNavigationStateChange}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        // Security settings
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // Allow navigation within the webview
        onShouldStartLoadWithRequest={(request) => {
          // Allow internal navigation
          if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
            return true
          }
          // Open other schemes in system browser
          if (request.url.startsWith('tel:') || request.url.startsWith('mailto:')) {
            Linking.openURL(request.url)
            return false
          }
          return true
        }}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
})
