import { Image } from 'expo-image'
import type { TFunction } from 'i18next'
import { Check, ShieldCheck } from 'lucide-react-native'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ShadowOAuthAuthorizationState } from '../../hooks/use-shadow-oauth-authorization'
import { getImageUrl } from '../../lib/api'
import { border, iconSize, lineHeight, radius, size, spacing, useColors } from '../../theme'
import { AppText, Button, Sheet } from '../ui'

function scopeLabel(scope: string, t: TFunction) {
  const labels: Record<string, string> = {
    'user:read': t('oauth.scopeUserRead'),
    'user:email': t('oauth.scopeUserEmail'),
    'servers:read': t('oauth.scopeServersRead'),
    'servers:write': t('oauth.scopeServersWrite'),
    'channels:read': t('oauth.scopeChannelsRead'),
    'channels:write': t('oauth.scopeChannelsWrite'),
    'messages:read': t('oauth.scopeMessagesRead'),
    'messages:write': t('oauth.scopeMessagesWrite'),
    'attachments:read': t('oauth.scopeAttachmentsRead'),
    'attachments:write': t('oauth.scopeAttachmentsWrite'),
    'workspaces:read': t('oauth.scopeWorkspacesRead'),
    'workspaces:write': t('oauth.scopeWorkspacesWrite'),
    'buddies:create': t('oauth.scopeBuddiesCreate'),
    'buddies:manage': t('oauth.scopeBuddiesManage'),
    'commerce:read': t('oauth.scopeCommerceRead'),
    'commerce:write': t('oauth.scopeCommerceWrite'),
  }
  return labels[scope] ?? scope
}

export function OAuthAuthorizationSheet({
  state,
  onApprove,
  onDeny,
  t,
}: {
  state: ShadowOAuthAuthorizationState & { visible: boolean }
  onApprove: () => void
  onDeny: () => void
  t: TFunction
}) {
  const colors = useColors()
  const appInfo = state.appInfo
  const logoUrl = getImageUrl(appInfo?.appLogoUrl)
  const scopes = (appInfo?.scope ?? state.request?.scope ?? 'user:read')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)

  return (
    <Sheet
      visible={state.visible}
      onClose={onDeny}
      title={t('oauth.authorizeTitle')}
      subtitle={appInfo ? t('oauth.appWantsAccess', { app: appInfo.appName }) : undefined}
      style={styles.sheetFrame}
    >
      {state.loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {state.error ? (
            <View style={[styles.errorBox, { borderColor: colors.error }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{state.error}</Text>
            </View>
          ) : null}

          {appInfo ? (
            <View style={styles.appRow}>
              <View style={[styles.logo, { backgroundColor: colors.inputBackground }]}>
                {logoUrl ? (
                  <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
                ) : (
                  <ShieldCheck size={iconSize['3xl']} color={colors.primary} strokeWidth={2.4} />
                )}
              </View>
              <View style={styles.appBody}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {appInfo.appName}
                </AppText>
                {appInfo.homepageUrl ? (
                  <AppText variant="label" tone="secondary" numberOfLines={1}>
                    {appInfo.homepageUrl}
                  </AppText>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.permissions}>
            <AppText tone="secondary" style={styles.permissionsLabel}>
              {t('oauth.permissionsLabel')}
            </AppText>
            {scopes.map((scope) => (
              <View key={scope} style={styles.scopeRow}>
                <View style={[styles.scopeIcon, { backgroundColor: colors.inputBackground }]}>
                  <Check size={iconSize.sm} color={colors.success} strokeWidth={3} />
                </View>
                <AppText style={styles.scopeText}>{scopeLabel(scope, t)}</AppText>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <Button variant="glass" size="sm" style={styles.actionButton} onPress={onDeny}>
              {t('oauth.deny')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              style={styles.actionButton}
              loading={state.approving}
              disabled={state.approving || !appInfo}
              onPress={onApprove}
            >
              {state.approving ? t('oauth.authorizing') : t('oauth.authorize')}
            </Button>
          </View>
        </ScrollView>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  loadingState: {
    minHeight: size.panelStateMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetFrame: {
    maxHeight: '78%',
  },
  scroll: {
    maxHeight: size.mediaViewportMaxHeight - spacing.xl,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  errorBox: {
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  errorText: {
    fontWeight: '700',
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logo: {
    width: size.controlMd,
    height: size.controlMd,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appBody: {
    flex: 1,
    minWidth: 0,
  },
  permissions: {
    gap: spacing.sm,
  },
  permissionsLabel: {
    lineHeight: lineHeight.sm,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scopeIcon: {
    width: size.avatarXs,
    height: size.avatarXs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeText: {
    flex: 1,
    lineHeight: lineHeight.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
})
