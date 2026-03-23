import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
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
import { useOAuth } from '../../src/hooks/use-oauth'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { useAuthStore } from '../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../src/theme'

export default function LoginScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const { signInWithGoogle, signInWithGitHub, isLoading: oauthLoading } = useOAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

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
      router.replace('/(main)')
    } catch (err) {
      showToast((err as Error).message || t('auth.oauthFailed'), 'error')
    }
  }

  const handleGitHubLogin = async () => {
    try {
      await signInWithGitHub()
      router.replace('/(main)')
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
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.brand, { color: colors.primary }]}>🐱</Text>
          <Text style={[styles.title, { color: colors.text }]}>{t('auth.loginTitle')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('auth.loginSubtitle')}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('auth.emailLabel')}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('auth.passwordLabel')}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />

          <Pressable
            style={[
              styles.button,
              { backgroundColor: colors.primary, opacity: isButtonDisabled ? 0.6 : 1 },
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

        {/* Divider with OR text */}
        <View style={styles.dividerContainer}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.textMuted }]}>
            {t('auth.orContinueWith', 'OR')}
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        {/* OAuth Buttons */}
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
                <Text style={styles.googleIcon}>G</Text>
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
                <Text style={styles.githubIcon}>⌘</Text>
                <Text style={styles.githubButtonText}>
                  {t('auth.continueWithGitHub', 'Continue with GitHub')}
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={{ color: colors.textSecondary }}>{t('auth.noAccount')} </Text>
          <Link href="/(auth)/register" style={{ color: colors.primary, fontWeight: '600' }}>
            {t('auth.registerLink')}
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  brand: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.md,
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  input: {
    height: 48,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    borderWidth: 1,
  },
  button: {
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: '700',
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
  googleIcon: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: '#4285F4',
  },
  githubButton: {
    backgroundColor: '#24292f',
  },
  githubButtonText: {
    color: '#ffffff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  githubIcon: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing['2xl'],
  },
})
