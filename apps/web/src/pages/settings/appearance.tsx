import { cn, Switch } from '@shadowob/ui'
import { Check, Image as ImageIcon, Monitor, Moon, Sun, X, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BACKGROUND_OPTIONS } from '../../lib/backgrounds'
import { type ThemeMode, useUIStore } from '../../stores/ui.store'
import { SettingsCard, SettingsPanel, SettingsRow } from './_shared'

export function AppearanceSettings() {
  const { t } = useTranslation()
  const {
    theme,
    setTheme,
    backgroundImage,
    setBackgroundImage,
    enableBackgroundMovement,
    setEnableBackgroundMovement,
  } = useUIStore()

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

  const bgOptions = BACKGROUND_OPTIONS.map((option) => ({
    ...option,
    label: t(option.labelKey),
    icon: option.id === 'none' ? X : undefined,
  }))

  return (
    <SettingsPanel>
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

      <SettingsCard>
        <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 mb-4">
          {t('settings.backgroundLabel')}
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {bgOptions.map(({ id, label, url, preview, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setBackgroundImage(url)}
              className={cn(
                'relative aspect-video rounded-2xl overflow-hidden border-2 transition-all duration-300 group',
                backgroundImage === url
                  ? 'border-primary shadow-[0_0_20px_rgba(0,198,209,0.2)]'
                  : 'border-border-subtle hover:border-border-dim',
              )}
            >
              {preview ? (
                <img src={preview} alt={label} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-bg-tertiary flex items-center justify-center">
                  {Icon ? (
                    <Icon size={24} className="text-text-muted" />
                  ) : (
                    <ImageIcon size={24} className="text-text-muted" />
                  )}
                </div>
              )}
              <div
                className={cn(
                  'absolute inset-0 bg-black/40 flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity',
                  backgroundImage === url && 'opacity-100 bg-black/20',
                )}
              >
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                  {label}
                </span>
              </div>
              {backgroundImage === url && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center z-10">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="pt-4 border-t border-border-subtle">
          <SettingsRow
            icon={Zap}
            labelKey="settings.backgroundMovementLabel"
            labelFallback="Dynamic Movement"
            descKey="settings.backgroundMovementDesc"
            descFallback="Background follows mouse cursor with smooth inertia"
            className="p-0 hover:bg-transparent"
          >
            <Switch
              checked={enableBackgroundMovement}
              onCheckedChange={setEnableBackgroundMovement}
            />
          </SettingsRow>
        </div>
      </SettingsCard>
    </SettingsPanel>
  )
}
