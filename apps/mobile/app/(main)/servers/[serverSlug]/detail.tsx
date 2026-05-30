import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { MessageSquare, Share, ShoppingBag, UserPlus, Users } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { SettingsHeader } from '../../../../src/components/common/settings-header'
import { ActionTile, BackgroundSurface, Button } from '../../../../src/components/ui'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  radius,
  size,
  spacing,
  useColors,
} from '../../../../src/theme'

export default function ServerDetailScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () =>
      fetchApi<{
        id: string
        name: string
        slug: string | null
        description: string | null
        iconUrl: string | null
        bannerUrl: string | null
        ownerId: string
        isPublic: boolean
        inviteCode: string
        memberCount: number
      }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  if (isLoading || !server) return <LoadingScreen />

  return (
    <BackgroundSurface style={styles.container}>
      <SettingsHeader title={server.name} />
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        {/* Banner */}
        <View style={styles.bannerContainer}>
          {server.bannerUrl ? (
            <Image
              source={{ uri: getImageUrl(server.bannerUrl)! }}
              style={styles.bannerImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.bannerImage, { backgroundColor: colors.inputBackground }]} />
          )}
        </View>

        {/* Server Info */}
        <View style={styles.infoCard}>
          <View
            style={[
              styles.serverIconWrap,
              { backgroundColor: colors.background, borderColor: colors.surface },
            ]}
          >
            <Avatar
              uri={server.iconUrl}
              name={server.name}
              userId={server.id}
              size={84}
              shape="server"
            />
          </View>

          <Text style={[styles.serverName, { color: colors.text }]}>{server.name}</Text>

          <View style={styles.statsRow}>
            <Users size={iconSize.md} color={colors.textSecondary} />
            <Text style={[styles.statsText, { color: colors.textSecondary }]}>
              {t('server.membersTotal', { memberCount: server.memberCount ?? 0 })}
            </Text>
          </View>

          {server.description && (
            <Text style={[styles.description, { color: colors.text }]}>{server.description}</Text>
          )}

          <View style={styles.featureRow}>
            <ActionTile
              icon={MessageSquare}
              label={t('server.workspace')}
              tone="primary"
              onPress={() => router.push(`/(main)/servers/${serverSlug}/workspace` as never)}
            />
            <ActionTile
              icon={ShoppingBag}
              label={t('server.shop')}
              tone="warning"
              onPress={() => router.push(`/(main)/servers/${serverSlug}/shop` as never)}
            />
            <ActionTile
              icon={UserPlus}
              label={t('server.members')}
              tone="danger"
              onPress={() => router.push(`/(main)/servers/${serverSlug}/members` as never)}
            />
          </View>

          <Button
            variant="primary"
            size="lg"
            icon={Share}
            onPress={() => router.push(`/(main)/servers/${serverSlug}/invite` as never)}
          >
            {t('server.inviteMembers', 'Invite Friends')}
          </Button>
        </View>
      </ScrollView>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bannerContainer: {
    position: 'relative',
    height: size.dropdownMaxHeight,
    width: '100%',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  infoCard: {
    marginHorizontal: spacing.xl,
    marginTop: -(size.avatarXl - spacing.sm),
    paddingTop: spacing['6xl'],
    alignItems: 'center',
  },
  serverIconWrap: {
    position: 'absolute',
    top: -size.controlLg,
    zIndex: 5,
    width: size.avatarXl + spacing['3xl'],
    height: size.avatarXl + spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: border.active,
    borderRadius: radius['3xl'],
  },
  serverName: {
    fontSize: fontSize['2xl'],
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    marginBottom: spacing.lg,
  },
  statsText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  description: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  featureRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginBottom: spacing.lg,
  },
})
