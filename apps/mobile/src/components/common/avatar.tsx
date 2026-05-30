import { getCatAvatarByUserId } from '@shadowob/shared'
import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'
import { getImageUrl } from '../../lib/api'
import { border, palette, radius, spacing, useColors } from '../../theme'

interface AvatarProps {
  uri: string | null | undefined
  name: string
  size?: number
  userId?: string | null
  status?: string | null
  showStatus?: boolean
  shape?: 'circle' | 'server'
}

export function Avatar({
  uri,
  name,
  size = 40,
  userId,
  status,
  showStatus = false,
  shape = 'circle',
}: AvatarProps) {
  const colors = useColors()

  const resolvedUri = getImageUrl(uri)
  const fallbackSeed = userId?.trim() || name.trim() || 'default'
  const src = resolvedUri || getCatAvatarByUserId(fallbackSeed)
  const dotSize = Math.max(10, Math.round(size * 0.28))
  const statusColor = getStatusColor(colors, status)
  const borderRadius = shape === 'server' ? radius['2lg'] : size / 2

  const initials = (name || '?').slice(0, 2).toUpperCase()
  return (
    <View
      style={[
        styles.shell,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: shape === 'server' ? colors.surface : colors.inputBackground,
          borderColor: shape === 'server' ? colors.primary : colors.border,
        },
      ]}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          style={[styles.image, { borderRadius }]}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.fallback, { backgroundColor: colors.primary, borderRadius }]}>
          <Text style={[styles.initials, { fontSize: size * 0.4, color: palette.white }]}>
            {initials}
          </Text>
        </View>
      )}
      {showStatus ? (
        <View
          style={[
            styles.statusDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: statusColor,
              borderColor: colors.background,
            },
          ]}
        />
      ) : null}
    </View>
  )
}

function getStatusColor(colors: ReturnType<typeof useColors>, status?: string | null) {
  if (status === 'online') return colors.statusOnline
  if (status === 'idle') return colors.statusIdle
  if (status === 'dnd') return colors.statusDnd
  return colors.statusOffline
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    overflow: 'visible',
    borderWidth: border.active,
  },
  image: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    right: -spacing.xxs,
    bottom: -spacing.xxs,
    borderWidth: border.active,
  },
})
