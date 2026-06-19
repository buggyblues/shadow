import { ChevronRight } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { changeLanguage, supportedLanguages } from '../../i18n'
import { fontSize, iconSize, useColors } from '../../theme'
import { ActionSheet, AppText, SurfaceList, SurfaceListItem } from '../ui'

interface LanguageSwitcherProps {
  visible?: boolean
  onClose?: () => void
}

export function LanguageSwitcher({ visible, onClose }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation()
  const colors = useColors()
  const [inlineSheetVisible, setInlineSheetVisible] = useState(false)
  const handleClose = onClose ?? (() => undefined)
  const currentLanguage =
    supportedLanguages.find((lang) => lang.code === i18n.language) ?? supportedLanguages[0]

  if (visible === undefined) {
    return (
      <>
        <SurfaceList>
          <SurfaceListItem last onPress={() => setInlineSheetVisible(true)}>
            <AppText variant="body" style={styles.label}>
              {currentLanguage.label}
            </AppText>
            <ChevronRight size={iconSize.md} color={colors.textMuted} />
          </SurfaceListItem>
        </SurfaceList>
        <LanguageSwitcher
          visible={inlineSheetVisible}
          onClose={() => setInlineSheetVisible(false)}
        />
      </>
    )
  }

  return (
    <ActionSheet
      visible={visible}
      onClose={handleClose}
      title={t('settings.languageLabel')}
      snapPoints={['42%']}
      items={supportedLanguages.map((lang) => ({
        key: lang.code,
        title: lang.label,
        left: <AppText style={styles.flag}>{lang.flag}</AppText>,
        selected: i18n.language === lang.code,
        onPress: () => changeLanguage(lang.code),
      }))}
    />
  )
}

const styles = StyleSheet.create({
  flag: {
    fontSize: fontSize.xl,
  },
  label: {
    flex: 1,
  },
})
