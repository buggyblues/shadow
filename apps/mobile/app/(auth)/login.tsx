import { Link, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Svg, { Path, SvgXml } from 'react-native-svg'
import { useOAuth } from '../../src/hooks/use-oauth'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { useAuthStore } from '../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../src/theme'

const SHADOW_LOGO_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
  <defs>
    <radialGradient id="catBody" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#5a5a5e" />
      <stop offset="50%" stop-color="#3d3d40" />
      <stop offset="100%" stop-color="#18181a" />
    </radialGradient>

    <radialGradient id="eyeYellow" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffffcc" />
      <stop offset="35%" stop-color="#f8e71c" />
      <stop offset="100%" stop-color="#b3a100" />
    </radialGradient>

    <radialGradient id="eyeCyan" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ccffff" />
      <stop offset="35%" stop-color="#00f3ff" />
      <stop offset="100%" stop-color="#0099aa" />
    </radialGradient>
  </defs>

  <g id="cat" transform="translate(0, -2)">
    <path d="M 22,47 Q 15,24 28,24 Q 34,24 40,40" fill="url(#catBody)" stroke="#1a1a1c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M 78,47 Q 85,24 72,24 Q 66,24 60,40" fill="url(#catBody)" stroke="#1a1a1c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <ellipse cx="50" cy="62" rx="38" ry="26" fill="url(#catBody)" stroke="#1a1a1c" stroke-width="2.5" />
    <ellipse cx="50" cy="61" rx="35" ry="23" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
    <circle cx="32" cy="57" r="6.5" fill="url(#eyeYellow)" stroke="#1a1a1c" stroke-width="1.5" />
    <circle cx="30" cy="54.5" r="2.2" fill="#ffffff" />
    <circle cx="34" cy="60" r="1.2" fill="#ffffff" opacity="0.6" />
    <circle cx="68" cy="57" r="6.5" fill="url(#eyeCyan)" stroke="#1a1a1c" stroke-width="1.5" />
    <circle cx="66" cy="54.5" r="2.2" fill="#ffffff" />
    <circle cx="70" cy="60" r="1.2" fill="#ffffff" opacity="0.6" />
    <ellipse cx="50" cy="64" rx="4" ry="2.5" fill="#3a2a26" />
    <ellipse cx="49.5" cy="63.2" rx="1.5" ry="0.8" fill="#8c7772" />
    <path d="M 40,69 Q 45,74.5 50,69" fill="none" stroke="#1a1a1c" stroke-width="2.5" stroke-linecap="round" />
    <path d="M 50,69 Q 55,74.5 60,69" fill="none" stroke="#1a1a1c" stroke-width="2.5" stroke-linecap="round" />
  </g>
</svg>`

function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  )
}

function GitHubIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="#fff" accessibilityLabel="GitHub">
      <Path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </Svg>
  )
}

export default function LoginScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { signInWithGoogle, signInWithGitHub, isLoading: oauthLoading } = useOAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(main)')
    }
  }, [isAuthenticated, router])

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    try {
      const data = await fetchApi<{
        user: {
          id: string
          email: string
          username: string
          displayName: string | null
          avatarUrl: string | null
        }
        accessToken: string
        refreshToken: string
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      setAuth(data.user, data.accessToken, data.refreshToken)
      router.replace('/(main)')
    } catch (err) {
      showToast((err as Error).message || t('auth.loginFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle()
    } catch (err) {
      showToast((err as Error).message || t('auth.oauthFailed'), 'error')
    }
  }

  const handleGitHubLogin = async () => {
    try {
      await signInWithGitHub()
    } catch (err) {
      showToast((err as Error).message || t('auth.oauthFailed'), 'error')
    }
  }

  const isButtonDisabled = loading || oauthLoading

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <SvgXml xml={SHADOW_LOGO_XML} width={56} height={56} />
            <Text style={[styles.productName, { color: colors.text }]}>
              {t('auth.brandName', 'ShadowOwnBuddy')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('auth.brandSlogan', 'The super community for super individuals.')}
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {t('auth.emailLabel')} <Text style={{ color: '#f23f43' }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@shadowob.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {t('auth.passwordLabel')} <Text style={{ color: '#f23f43' }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.text }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />

            <Pressable
              style={[
                styles.button,
                { backgroundColor: '#5865F2', opacity: isButtonDisabled ? 0.6 : 1 },
              ]}
              onPress={handleLogin}
              disabled={isButtonDisabled}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('auth.loginSubmit')}</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.dividerContainer}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textMuted }]}>
              {t('auth.orContinueWith', 'OR')}
            </Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.oauthContainer}>
            <Pressable
              style={[
                styles.oauthButton,
                styles.googleButton,
                { opacity: isButtonDisabled ? 0.6 : 1 },
              ]}
              onPress={handleGoogleLogin}
              disabled={isButtonDisabled}
            >
              {oauthLoading ? (
                <ActivityIndicator size="small" color="#333" />
              ) : (
                <>
                  <GoogleIcon />
                  <Text style={styles.googleButtonText}>
                    {t('auth.continueWithGoogle', 'Continue with Google')}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[
                styles.oauthButton,
                styles.githubButton,
                { opacity: isButtonDisabled ? 0.6 : 1 },
              ]}
              onPress={handleGitHubLogin}
              disabled={isButtonDisabled}
            >
              {oauthLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <GitHubIcon />
                  <Text style={styles.githubButtonText}>
                    {t('auth.continueWithGitHub', 'Continue with GitHub')}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={{ color: colors.textSecondary }}>{t('auth.noAccount')} </Text>
            <Link href="/(auth)/register" style={{ color: '#00a8fc', fontWeight: '600' }}>
              {t('auth.registerLink')}
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: radius.md,
    alignSelf: 'center',
    padding: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  productName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  input: {
    height: 48,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
  },
  button: {
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  oauthContainer: {
    gap: spacing.sm,
  },
  oauthButton: {
    height: 48,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  googleButton: {
    backgroundColor: '#ffffff',
  },
  googleButtonText: {
    color: '#333333',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  githubButton: {
    backgroundColor: '#24292f',
  },
  githubButtonText: {
    color: '#ffffff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing['2xl'],
  },
})
