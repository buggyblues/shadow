import { cn } from '@shadowob/ui'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type ThemeMode, useUIStore } from '../../stores/ui.store'

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
    <>
      <h2 className="text-2xl font-black text-text-primary mb-2">{t('settings.tabAppearance')}</h2>
      <p className="text-text-muted text-sm mb-6">{t('settings.appearanceDesc')}</p>

      <div className="bg-bg-tertiary/30 backdrop-blur-xl rounded-[24px] border border-border-subtle p-6">
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-4">
          {t('settings.themeLabel')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map(({ value, icon: Icon, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                'relative flex flex-col items-center gap-2 p-4 rounded-[24px] border-2 transition-all duration-300',
                theme === value
                  ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(0,198,209,0.15)]'
                  : 'border-border-subtle bg-bg-tertiary/20 hover:border-border-subtle hover:bg-white/[0.04]',
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
      </div>
    </>
  )
}
