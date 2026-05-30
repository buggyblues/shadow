import { Globe2, RotateCcw, Server } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import {
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  normalizeApiBaseUrl,
  setApiBaseUrl,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import { spacing } from '../../theme'
import { Button, Section, StatusNotice, TextField } from '../ui'

type SaveResult = {
  previousUrl: string
  nextUrl: string
  changed: boolean
}

export function ServerBaseUrlSettings({
  onSaved,
  notice,
}: {
  onSaved?: (result: SaveResult) => void | Promise<void>
  notice?: string
}) {
  const { t } = useTranslation()
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_API_BASE_URL)
  const [value, setValue] = useState(DEFAULT_API_BASE_URL)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    getApiBaseUrl()
      .then((url) => {
        if (!mounted) return
        setCurrentUrl(url)
        setValue(url)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const saveUrl = async (nextValue: string) => {
    setSaving(true)
    setError(null)
    try {
      const normalized = normalizeApiBaseUrl(nextValue)
      const nextUrl = await setApiBaseUrl(normalized)
      const result = {
        previousUrl: currentUrl,
        nextUrl,
        changed: currentUrl !== nextUrl,
      }
      setCurrentUrl(nextUrl)
      setValue(nextUrl)
      showToast(t('settings.serverUrlSaved'), 'success')
      await onSaved?.(result)
    } catch {
      setError(t('settings.serverUrlInvalid'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title={t('settings.serverUrlTitle')}
      subtitle={t('settings.serverUrlDescription')}
      icon={Server}
      padded
      cardStyle={styles.card}
    >
      <TextField
        icon={Globe2}
        label={t('settings.serverUrlLabel')}
        value={value}
        onChangeText={setValue}
        placeholder={DEFAULT_API_BASE_URL}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!loading && !saving}
        error={!!error}
      />

      <StatusNotice tone={error ? 'danger' : 'muted'}>
        {error ?? notice ?? t('settings.serverUrlLogoutNotice')}
      </StatusNotice>

      <View style={styles.actions}>
        <Button
          variant="glass"
          size="md"
          icon={RotateCcw}
          onPress={() => saveUrl(DEFAULT_API_BASE_URL)}
          disabled={loading || saving}
        >
          {t('settings.serverUrlReset')}
        </Button>
        <Button
          variant="primary"
          size="md"
          onPress={() => saveUrl(value)}
          loading={saving}
          disabled={loading || saving || !value.trim()}
          style={styles.saveButton}
        >
          {t('settings.serverUrlSave')}
        </Button>
      </View>
    </Section>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  saveButton: {
    flex: 1,
  },
})
