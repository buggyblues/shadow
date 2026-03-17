import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { ChevronLeft, Share, Users } from 'lucide-react-native'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { radius, spacing, useColors } from '../../../../src/theme'

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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { top: insets.top + spacing.sm }]}
          >
            <View style={styles.backBtnInner}>
              <ChevronLeft size={24} color="#fff" />
            </View>
          </Pressable>
        </View>

        {/* Server Info Card */}
        <View
          style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.serverIconWrap, { borderColor: colors.surface }]}>
            {server.iconUrl ? (
              <Image
                source={{ uri: getImageUrl(server.iconUrl)! }}
                style={styles.serverIcon}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  styles.serverIcon,
                  {
                    backgroundColor: colors.primary,
                    justifyContent: 'center',
                    alignItems: 'center',
                  },
                ]}
              >
                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900' }}>
                  {server.name?.[0] ?? '?'}
                </Text>
              </View>
            )}
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

          <Pressable
            style={[styles.inviteBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push(`/(main)/servers/${serverSlug}/invite` as any)}
          >
            <Share size={18} color="#fff" strokeWidth={2.5} />
            <Text style={styles.inviteBtnText}>{t('server.inviteMembers', 'Invite Friends')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
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
  backBtnInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    margin: spacing.md,
    marginTop: -40,
    borderRadius: radius.xl,
    padding: spacing.xl,
    paddingTop: 50,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  serverIconWrap: {
    position: 'absolute',
    top: -45,
    borderWidth: 4,
    borderRadius: 45,
  },
  serverIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
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
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: 8,
  },
  inviteBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
})
