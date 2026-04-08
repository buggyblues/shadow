import { cn } from '@shadowob/ui'
import { Check, Monitor, Moon, Paintbrush, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type ThemeMode, useUIStore } from '../../stores/ui.store'
import { SettingsCard, SettingsHeader, SettingsPanel } from './_shared'

export function AppearanceSettings() {
  const { t } = useTranslation()
  const { theme, setTheme } = useUIStore()

  const options: { value: ThemeMode; icon: typeof Sun; label: string; desc: string }[] = [
    {
      value: 'light',
      icon: Sun,
      label: t('settings.themeLight'),
      desc: t('settings.themeLightDesc'),
    },
    {
      value: 'dark',
      icon: Moon,
      label: t('settings.themeDark'),
      desc: t('settings.themeDarkDesc'),
    },
    {
      value: 'system',
      icon: Monitor,
      label: t('settings.themeSystem'),
      desc: t('settings.themeSystemDesc'),
    },
  ]

  return (
    <SettingsPanel>
      <SettingsHeader
        titleKey="settings.tabAppearance"
        titleFallback="外观"
        descKey="settings.appearanceDesc"
        descFallback="自定义你的界面外观"
        icon={Paintbrush}
      />

      <SettingsCard>
        <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 mb-4">
          {t('settings.themeLabel')}
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map(({ value, icon: Icon, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                'relative flex flex-col items-center gap-2 p-4 rounded-3xl border-2 transition-all duration-300',
                theme === value
                  ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(0,198,209,0.15)]'
                  : 'border-border-subtle bg-bg-tertiary/20 hover:border-border-dim hover:bg-bg-modifier-hover',
              )}
            >
              <Icon size={28} className={theme === value ? 'text-primary' : 'text-text-muted'} />
              <span
                className={cn(
                  'text-sm font-black',
                  theme === value ? 'text-primary' : 'text-text-primary',
                )}
              >
                {label}
              </span>
              <span className="text-[11px] text-text-muted text-center leading-tight">{desc}</span>
              {theme === value && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </SettingsCard>
    </SettingsPanel>
  )
}
