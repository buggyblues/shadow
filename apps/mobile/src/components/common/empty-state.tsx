import { FileQuestion, type LucideIcon } from 'lucide-react-native'
import type React from 'react'
import { EmptyState as BaseEmptyState, Button } from '../ui'

interface EmptyStateProps {
  icon?: React.ReactNode | LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const Icon = isLucideIcon(icon) ? icon : FileQuestion
  const action =
    actionLabel && onAction ? (
      <Button variant="primary" size="sm" onPress={onAction}>
        {actionLabel}
      </Button>
    ) : undefined

  return <BaseEmptyState title={title} description={description} icon={Icon} action={action} />
}

function isLucideIcon(icon: EmptyStateProps['icon']): icon is LucideIcon {
  return (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && 'render' in icon && '$$typeof' in icon)
  )
}
