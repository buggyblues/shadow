import type { ButtonHTMLAttributes } from 'react'

type PetPanelButtonVariant = 'default' | 'primary' | 'warm' | 'ghost' | 'tile' | 'chip'
type PetPanelButtonSize = 'xs' | 'sm' | 'md' | 'icon'

type PetPanelButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: PetPanelButtonVariant
  size?: PetPanelButtonSize
}

type PetPanelSwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function PetPanelButton({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...props
}: PetPanelButtonProps) {
  return (
    <button
      {...props}
      className={[
        'desktop-pet-ui-button',
        `desktop-pet-ui-button-${variant}`,
        `desktop-pet-ui-button-${size}`,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  )
}

export function PetPanelIconButton(props: PetPanelButtonProps) {
  return <PetPanelButton variant="ghost" size="icon" {...props} />
}

export function PetPanelSwitch({
  checked,
  onCheckedChange,
  className,
  disabled,
  ...props
}: PetPanelSwitchProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={['desktop-pet-ui-switch', checked ? 'active' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      onClick={(event) => {
        props.onClick?.(event)
        if (event.defaultPrevented || disabled) return
        onCheckedChange(!checked)
      }}
    >
      <span aria-hidden="true" />
    </button>
  )
}
