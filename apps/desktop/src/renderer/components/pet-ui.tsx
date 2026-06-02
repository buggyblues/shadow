import {
  Button,
  Card,
  cn,
  Input,
  type InputProps,
  NativeSelect,
  type NativeSelectProps,
  Switch,
} from '@shadowob/ui'
import { type ButtonHTMLAttributes, forwardRef, type HTMLAttributes } from 'react'

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
    <Button
      {...props}
      variant="ghost"
      size="sm"
      className={cn(
        'desktop-pet-ui-button',
        `desktop-pet-ui-button-${variant}`,
        `desktop-pet-ui-button-${size}`,
        className,
      )}
    >
      {children}
    </Button>
  )
}

export function PetPanelIconButton(props: PetPanelButtonProps) {
  return <PetPanelButton variant="ghost" size="icon" {...props} />
}

export function PetPanelCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <Card variant="glassPanel" {...props} className={cn('desktop-pet-ui-card', className)} />
}

export const PetPanelInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input {...props} ref={ref} className={cn('desktop-pet-ui-input', className)} />
  ),
)
PetPanelInput.displayName = 'PetPanelInput'

export function PetPanelSelect({ className, ...props }: NativeSelectProps) {
  return <NativeSelect {...props} className={cn('desktop-pet-ui-select', className)} />
}

export function PetPanelSwitch({
  checked,
  onCheckedChange,
  className,
  disabled,
  ...props
}: PetPanelSwitchProps) {
  return (
    <Switch
      {...props}
      type="button"
      checked={checked}
      disabled={disabled}
      className={cn('desktop-pet-ui-switch', checked && 'active', className)}
      onCheckedChange={(nextChecked) => {
        if (disabled) return
        onCheckedChange(nextChecked)
      }}
      onClick={(event) => {
        props.onClick?.(event)
      }}
    />
  )
}
