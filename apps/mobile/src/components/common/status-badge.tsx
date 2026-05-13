import { View } from 'react-native'
import { spacing } from '../../theme'
import { AppText, Indicator } from '../ui'

interface StatusBadgeProps {
  status: 'online' | 'idle' | 'dnd' | 'offline' | string
  size?: number
  showLabel?: boolean
}

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'DND',
  offline: 'Offline',
}

export function StatusBadge({ status, size = 10, showLabel = false }: StatusBadgeProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <Indicator status={status} style={{ width: size, height: size, borderRadius: size / 2 }} />
      {showLabel && (
        <AppText variant="label" tone="secondary">
          {STATUS_LABELS[status] ?? status}
        </AppText>
      )}
    </View>
  )
}
