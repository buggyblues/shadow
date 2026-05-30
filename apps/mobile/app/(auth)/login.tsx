import * as AppleAuthentication from 'expo-apple-authentication'
import { useRouter } from 'expo-router'
import { ChevronLeft, Github, KeyRound, Mail, ShieldCheck } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, SvgXml } from 'react-native-svg'
import { AppText, Button, Separator, TextField } from '../../src/components/ui'
import { useOAuth } from '../../src/hooks/use-oauth'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { useAuthStore } from '../../src/stores/auth.store'
import {
  border,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../src/theme'

const SHADOW_LOGO_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
  <defs>
    <radialGradient id="catBody" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="${palette.neutral600}" />
      <stop offset="50%" stop-color="${palette.neutral700}" />
      <stop offset="100%" stop-color="${palette.surface}" />
    </radialGradient>
    <radialGradient id="eyeYellow" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${palette.accentSurface}" />
      <stop offset="35%" stop-color="${palette.yellow}" />
      <stop offset="100%" stop-color="${palette.yellowDark}" />
    </radialGradient>
    <radialGradient id="eyeCyan" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${palette.cyanSoft}" />
      <stop offset="35%" stop-color="${palette.cyan}" />
      <stop offset="100%" stop-color="${palette.cyanDark}" />
    </radialGradient>
  </defs>
  <g id="cat" transform="translate(0, -2)">
    <path d="M 22,47 Q 15,24 28,24 Q 34,24 40,40" fill="url(#catBody)" stroke="${palette.foundation}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M 78,47 Q 85,24 72,24 Q 66,24 60,40" fill="url(#catBody)" stroke="${palette.foundation}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <ellipse cx="50" cy="62" rx="38" ry="26" fill="url(#catBody)" stroke="${palette.foundation}" stroke-width="2.5" />
    <ellipse cx="50" cy="61" rx="35" ry="23" fill="none" stroke="${palette.neutral800}" stroke-width="1.5" />
    <circle cx="32" cy="57" r="6.5" fill="url(#eyeYellow)" stroke="${palette.foundation}" stroke-width="1.5" />
    <circle cx="30" cy="54.5" r="2.2" fill="${palette.white}" />
    <circle cx="34" cy="60" r="1.2" fill="${palette.white}" />
    <circle cx="68" cy="57" r="6.5" fill="url(#eyeCyan)" stroke="${palette.foundation}" stroke-width="1.5" />
    <circle cx="66" cy="54.5" r="2.2" fill="${palette.white}" />
    <circle cx="70" cy="60" r="1.2" fill="${palette.white}" />
    <ellipse cx="50" cy="64" rx="4" ry="2.5" fill="${palette.neutral700}" />
    <ellipse cx="49.5" cy="63.2" rx="1.5" ry="0.8" fill="${palette.neutral400}" />
    <path d="M 40,69 Q 45,74.5 50,69" fill="none" stroke="${palette.foundation}" stroke-width="2.5" stroke-linecap="round" />
    <path d="M 50,69 Q 55,74.5 60,69" fill="none" stroke="${palette.foundation}" stroke-width="2.5" stroke-linecap="round" />
  </g>
</svg>`

type AuthSession = {
  user: {
    id: string
    email: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  }
  accessToken: string
  refreshToken: string
}

function GoogleIcon() {
  return (
    <Svg width={iconSize.lg} height={iconSize.lg} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill={palette.googleBlue}
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill={palette.googleGreen}
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill={palette.googleYellow}
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill={palette.googleRed}
      />
    </Svg>
  )
}

function AppleIcon({ color }: { color: string }) {
  return (
    <Svg width={iconSize.lg} height={iconSize.lg} viewBox="0 0 24 24" accessibilityLabel="Apple">
      <Path
        fill={color}
        d="M16.37 12.58c-.02-2.16 1.77-3.2 1.85-3.25-1.01-1.48-2.58-1.68-3.13-1.7-1.33-.14-2.59.78-3.26.78-.68 0-1.72-.76-2.83-.74-1.45.02-2.79.84-3.54 2.14-1.51 2.62-.39 6.49 1.09 8.61.72 1.04 1.58 2.21 2.71 2.17 1.09-.04 1.5-.7 2.81-.7 1.31 0 1.69.7 2.84.68 1.17-.02 1.92-1.06 2.64-2.1.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.35-.9-2.37-3.45ZM14.21 6.23c.6-.72 1-1.73.89-2.73-.86.04-1.9.57-2.52 1.29-.55.64-1.04 1.66-.91 2.64.96.07 1.94-.49 2.54-1.2Z"
      />
    </Svg>
  )
}

function AuthProviderButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
  dark = false,
}: {
  label: string
  icon: ReactNode
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  dark?: boolean
}) {
  const colors = useColors()
  const foreground = dark ? palette.white : colors.text
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.providerButton,
        {
          backgroundColor: dark ? palette.black : pressed ? colors.surfaceHover : colors.surface,
          borderColor: dark ? palette.black : colors.border,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <>
          {icon}
          <AppText variant="bodyStrong" style={{ color: foreground }}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  )
}

export default function LoginScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { signInWithGoogle, signInWithGitHub, isLoading: oauthLoading } = useOAuth()
  const logoTapCountRef = useRef(0)
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [step, setStep] = useState<'choose' | 'code' | 'password'>('choose')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [appleLoading, setAppleLoading] = useState(false)
  const [appleAvailable, setAppleAvailable] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(main)')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false))
  }, [])

  useEffect(() => {
    return () => {
      if (logoTapTimerRef.current) {
        clearTimeout(logoTapTimerRef.current)
      }
    }
  }, [])

  const handleLogoPress = () => {
    if (logoTapTimerRef.current) {
      clearTimeout(logoTapTimerRef.current)
    }

    logoTapCountRef.current += 1
    if (logoTapCountRef.current >= 10) {
      logoTapCountRef.current = 0
      router.push('/(auth)/server' as never)
      return
    }

    logoTapTimerRef.current = setTimeout(() => {
      logoTapCountRef.current = 0
    }, 1200)
  }

  const applySession = (session: AuthSession) => {
    setAuth(session.user, session.accessToken, session.refreshToken)
    router.replace('/(main)')
  }

  const handlePasswordLogin = async () => {
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    try {
      const data = await fetchApi<AuthSession>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      applySession(data)
    } catch (err) {
      showToast((err as Error).message || t('auth.loginFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSendCode = async () => {
    if (!email.trim()) return
    setCodeLoading(true)
    try {
      await fetchApi('/api/auth/email/start', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), locale: i18n.language }),
      })
      setCode('')
      setStep('code')
      showToast(t('auth.emailCodeSent'), 'success')
    } catch (err) {
      showToast((err as Error).message || t('auth.loginFailed'), 'error')
    } finally {
      setCodeLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!email.trim() || !code.trim()) return
    setLoading(true)
    try {
      const data = await fetchApi<AuthSession>('/api/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      })
      applySession(data)
    } catch (err) {
      showToast((err as Error).message || t('auth.loginFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      showToast(t('auth.passwordResetEmailRequired'), 'error')
      return
    }
    setResetLoading(true)
    try {
      await fetchApi('/api/auth/password-reset/start', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), locale: i18n.language }),
      })
      showToast(t('auth.passwordResetSent'), 'success')
    } catch (err) {
      showToast((err as Error).message || t('auth.passwordResetFailed'), 'error')
    } finally {
      setResetLoading(false)
    }
  }

  const handleAppleLogin = async () => {
    if (!appleAvailable) {
      showToast(t('auth.appleLoginUnavailable'), 'error')
      return
    }
    setAppleLoading(true)
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })
      if (!credential.identityToken) {
        throw new Error(t('auth.appleIdentityMissing'))
      }
      const data = await fetchApi<AuthSession>('/api/auth/oauth/apple/mobile', {
        method: 'POST',
        body: JSON.stringify({
          identityToken: credential.identityToken,
          email: credential.email,
          fullName: credential.fullName,
        }),
      })
      applySession(data)
    } catch (err) {
      if ((err as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        showToast((err as Error).message || t('auth.oauthFailed'), 'error')
      }
    } finally {
      setAppleLoading(false)
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

  const busy = loading || codeLoading || oauthLoading || appleLoading || resetLoading
  const showBack = step !== 'choose'
  const subtitle =
    step === 'code'
      ? t('auth.checkEmailMessage')
      : step === 'password'
        ? t('auth.passwordLoginSubtitle')
        : ''

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardView, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + spacing['4xl'] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.shell}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.brandName')}
            onPress={handleLogoPress}
            style={styles.brandBlock}
          >
            <SvgXml xml={SHADOW_LOGO_XML} width={iconSize.hero} height={iconSize.hero} />
          </Pressable>

          <View style={styles.panel}>
            <View style={styles.stepHeader}>
              {showBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.back')}
                  onPress={() => setStep('choose')}
                  style={({ pressed }) => [
                    styles.backButton,
                    { backgroundColor: pressed ? colors.surfaceHover : colors.inputBackground },
                  ]}
                >
                  <ChevronLeft size={iconSize.xl} color={colors.text} strokeWidth={2.5} />
                </Pressable>
              ) : null}
              <View style={styles.stepTitleWrap}>
                <AppText variant="headline" style={styles.stepTitle}>
                  {step === 'code'
                    ? t('auth.checkEmailTitle')
                    : step === 'password'
                      ? t('auth.passwordLoginTab')
                      : t('auth.loginTitle')}
                </AppText>
                {subtitle ? (
                  <AppText variant="body" tone="secondary" style={styles.stepSubtitle}>
                    {subtitle}
                  </AppText>
                ) : null}
              </View>
            </View>

            {step === 'choose' ? (
              <View style={styles.sectionStack}>
                <View style={styles.providerStack}>
                  {appleAvailable ? (
                    <AuthProviderButton
                      label={t('auth.continueWithApple')}
                      icon={<AppleIcon color={palette.white} />}
                      onPress={handleAppleLogin}
                      loading={appleLoading}
                      disabled={busy}
                      dark
                    />
                  ) : null}
                  <AuthProviderButton
                    label={t('auth.continueWithGoogle')}
                    icon={<GoogleIcon />}
                    onPress={handleGoogleLogin}
                    loading={oauthLoading}
                    disabled={busy}
                  />
                  <AuthProviderButton
                    label={t('auth.continueWithGitHub')}
                    icon={<Github size={iconSize.lg} color={colors.text} strokeWidth={2.3} />}
                    onPress={handleGitHubLogin}
                    loading={oauthLoading}
                    disabled={busy}
                  />
                </View>

                <View style={styles.dividerRow}>
                  <Separator style={styles.divider} />
                  <AppText variant="label" tone="secondary">
                    {t('auth.orContinueWith')}
                  </AppText>
                  <Separator style={styles.divider} />
                </View>

                <View style={styles.form}>
                  <TextField
                    icon={Mail}
                    label={t('auth.emailLabel')}
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('auth.emailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    onPress={handleSendCode}
                    disabled={busy || !email.trim()}
                    loading={codeLoading}
                  >
                    {codeLoading ? t('auth.sendingEmailCode') : t('auth.continueEmail')}
                  </Button>
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setStep('password')}
                  style={styles.switchButton}
                >
                  <AppText variant="label" tone="secondary">
                    {t('auth.switchToPassword')}
                  </AppText>
                </Pressable>
              </View>
            ) : step === 'code' ? (
              <View style={styles.sectionStack}>
                <View style={styles.form}>
                  <TextField
                    icon={ShieldCheck}
                    label={t('auth.emailCodeLabel')}
                    value={code}
                    onChangeText={setCode}
                    placeholder={t('auth.emailCodePlaceholder')}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoComplete="sms-otp"
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    onPress={handleVerifyCode}
                    disabled={busy || !code.trim()}
                    loading={loading}
                  >
                    {loading ? t('auth.verifyingEmailCode') : t('auth.verifyEmailCode')}
                  </Button>
                </View>
                <Button
                  variant="glass"
                  size="md"
                  onPress={handleSendCode}
                  disabled={busy || !email.trim()}
                  loading={codeLoading}
                >
                  {codeLoading ? t('auth.sendingEmailCode') : t('auth.resendEmailCode')}
                </Button>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setStep('password')}
                  style={styles.switchButton}
                >
                  <AppText variant="label" tone="secondary">
                    {t('auth.switchToPassword')}
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <View style={styles.sectionStack}>
                <View style={styles.form}>
                  <TextField
                    icon={Mail}
                    label={t('auth.emailOrUsernameLabel')}
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('auth.emailOrUsernamePlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                  />
                  <TextField
                    icon={KeyRound}
                    label={t('auth.passwordLabel')}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('auth.passwordPlaceholder')}
                    secureTextEntry
                    autoComplete="current-password"
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    onPress={handlePasswordLogin}
                    disabled={busy || !email.trim() || !password.trim()}
                    loading={loading}
                  >
                    {loading ? t('auth.loginLoading') : t('auth.loginSubmit')}
                  </Button>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={handlePasswordReset}
                  style={styles.switchButton}
                  disabled={resetLoading}
                >
                  <AppText variant="label" tone="secondary">
                    {resetLoading ? t('auth.passwordResetSending') : t('auth.forgotPassword')}
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setStep('choose')}
                  style={styles.secondarySwitchButton}
                >
                  <AppText variant="label" tone="secondary">
                    {t('auth.switchToEmailCode')}
                  </AppText>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['4xl'],
  },
  shell: {
    width: '100%',
    maxWidth: size.authCardMaxWidth,
    alignSelf: 'center',
    gap: spacing['2xl'],
  },
  brandBlock: {
    alignItems: 'center',
  },
  panel: {
    gap: spacing.xl,
  },
  stepHeader: {
    minHeight: size.avatarXl,
    justifyContent: 'center',
  },
  backButton: {
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  stepTitleWrap: {
    gap: spacing.xs,
  },
  stepTitle: {
    textAlign: 'center',
  },
  stepSubtitle: {
    lineHeight: lineHeight.md,
    textAlign: 'center',
  },
  sectionStack: {
    gap: spacing.lg,
  },
  providerStack: {
    gap: spacing.sm,
  },
  providerButton: {
    minHeight: size.controlLg,
    borderRadius: radius.xl,
    borderWidth: border.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  divider: {
    flex: 1,
  },
  form: {
    gap: spacing.md,
  },
  switchButton: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondarySwitchButton: {
    alignSelf: 'center',
    marginTop: -spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
})
