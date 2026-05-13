import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import {
  ChevronLeft,
  MessageSquare,
  Share,
  ShoppingBag,
  UserPlus,
  Users,
} from 'lucide-react-native'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { ActionTile, BackgroundSurface, Button, IconButton } from '../../../../src/components/ui'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { spacing, useColors } from '../../../../src/theme'

export default function ServerDetailScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()

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

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    })
  }, [navigation])

  if (isLoading || !server) return <LoadingScreen />

  return (
    <BackgroundSurface style={styles.container}>
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
            <LinearGradient
              colors={['#00f3ff', '#ff7da5', '#f8e71c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bannerImage}
            />
          )}

          {/* Floating Back Button */}
          <IconButton
            icon={ChevronLeft}
            variant="glass"
            onPress={() => router.back()}
            containerStyle={[styles.backBtn, { top: insets.top + spacing.sm }]}
          />
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
            <Users size={16} color={colors.textSecondary} />
            <Text style={[styles.statsText, { color: colors.textSecondary }]}>
              {server.memberCount} {t('server.membersTotal', 'Members')}
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
    height: 240,
    width: '100%',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  backBtn: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 10,
  },
  infoCard: {
    marginHorizontal: spacing.xl,
    marginTop: -54,
    paddingTop: 64,
    alignItems: 'center',
  },
  serverIconWrap: {
    position: 'absolute',
    top: -48,
    zIndex: 5,
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderRadius: 31,
  },
  serverName: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.lg,
  },
  statsText: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
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
