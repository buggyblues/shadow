import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { Bot } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, TextField } from '../../src/components/ui'
import { fetchApi } from '../../src/lib/api'
import { useAuthStore } from '../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../src/theme'

export default function RegisterScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string }>()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState(params.code ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) return
    setError('')
    setLoading(true)
    try {
      const result = await fetchApi<{
        user: {
          id: string
          email: string
          username: string
          displayName: string | null
          avatarUrl: string | null
        }
        accessToken: string
        refreshToken: string
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          inviteCode: inviteCode.trim() || undefined,
          referralCode: params.code,
        }),
      })
      setAuth(result.user, result.accessToken, result.refreshToken)
      router.replace('/(main)')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={[styles.brand, { backgroundColor: `${colors.primary}18` }]}>
            <Bot size={34} color={colors.primary} strokeWidth={2.4} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{t('auth.registerTitle')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('auth.registerSubtitle')}
          </Text>
        </View>

        {error ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: 'rgba(242,63,67,0.1)', borderColor: 'rgba(242,63,67,0.2)' },
            ]}
          >
            <Text style={{ color: '#fa777c', fontSize: fontSize.sm }}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <TextField
            label={`${t('auth.emailLabel')} *`}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@shadowob.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextField
            label={`${t('auth.displayNameLabel')} (${t('auth.optional')})`}
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('auth.displayNamePlaceholder')}
          />

          <TextField
            label={`${t('auth.passwordLabel')} *`}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.passwordPlaceholder')}
            secureTextEntry
          />

          <TextField
            label={`${t('auth.inviteCodeLabel')} (${t('auth.optional')})`}
            style={styles.input}
            inputStyle={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              letterSpacing: 2,
            }}
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder={t('auth.inviteCodePlaceholder')}
            autoCapitalize="none"
          />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 }}>
            {t('auth.inviteCodeHint')}
          </Text>

          <Button
            variant="primary"
            size="lg"
            onPress={handleRegister}
            disabled={loading}
            loading={loading}
          >
            {t('auth.registerSubmit')}
          </Button>
        </View>

        <View style={styles.footer}>
          <Text style={{ color: colors.textMuted }}>{t('auth.hasAccount')} </Text>
          <Link href="/(auth)/login" style={{ color: colors.primary, fontWeight: '600' }}>
            {t('auth.loginLink')}
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
    marginBottom: spacing['2xl'],
  },
  brand: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
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
  errorBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    borderWidth: 1,
  },
  button: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing['2xl'],
  },
})
