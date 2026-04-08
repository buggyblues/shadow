import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shadowob/ui'
import { useTranslation } from 'react-i18next'
import { type SupportedLanguage, supportedLanguages } from '../../lib/i18n'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const currentLang =
    supportedLanguages.find((l) => l.code === i18n.language) ?? supportedLanguages[0]

  return (
    <Select
      value={currentLang.code}
      onValueChange={(code: string) => i18n.changeLanguage(code as SupportedLanguage)}
    >
      <SelectTrigger aria-label="Switch language">
        <SelectValue>
          <span className="inline-flex items-center gap-2">
            <span>{currentLang.flag}</span>
            <span>{currentLang.label}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={4}>
        {supportedLanguages.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            <span className="inline-flex items-center gap-2">
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
