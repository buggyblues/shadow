import { normalizePresenceStatus } from '@shadowob/shared'
import { BlurView } from 'expo-blur'
import {
  Bot,
  ChevronRight,
  MessageCircle,
  QrCode,
  Search,
  Server,
  UserPlus,
  X,
} from 'lucide-react-native'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Modal,
  type PanResponderInstance,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInput as TextInputHandle,
  View,
} from 'react-native'
import Reanimated, { FadeInUp } from 'react-native-reanimated'
import { Avatar } from '../../components/common/avatar'
import {
  AppSwitch,
  AppText,
  Button,
  IconBubble,
  InteractiveSheet,
  MotionPressable,
  SurfaceList,
  SurfaceListItem,
  TextField,
} from '../../components/ui'
import { iconSize, size, spacing, useColors } from '../../theme'
import { UnifiedCommandCandidateRow } from './components'
import { styles } from './home.styles'
import type { CommandCandidate, DirectChannelEntry } from './types'
import { createMenuLabel, directMessagePeerName } from './utils'

export function UnifiedCommandCenterModal({
  visible,
  bottomInset,
  commandCandidates,
  searchQuery,
  commandSearchInputRef,
  commandDismissPanResponder,
  onSearchQueryChange,
  onClose,
  onOpenCandidate,
}: {
  visible: boolean
  bottomInset: number
  commandCandidates: CommandCandidate[]
  searchQuery: string
  commandSearchInputRef: RefObject<TextInputHandle | null>
  commandDismissPanResponder: PanResponderInstance
  onSearchQueryChange: (query: string) => void
  onClose: () => void
  onOpenCandidate: (candidate: CommandCandidate) => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const homeAccent = colors.mode === 'light' ? colors.primaryDark : colors.primary

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onShow={() => commandSearchInputRef.current?.focus()}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={[
          styles.commandModalRoot,
          { paddingBottom: Math.max(bottomInset + spacing.md, spacing['2xl']) },
        ]}
      >
        <BlurView
          pointerEvents="none"
          intensity={colors.mode === 'dark' ? 24 : 36}
          tint={colors.mode === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
        />
        <View
          style={[
            styles.commandModalResults,
            {
              borderColor: colors.frostedBorder,
              backgroundColor: colors.frostedPanel,
              shadowColor: colors.shadowStrong,
            },
          ]}
          {...commandDismissPanResponder.panHandlers}
        >
          <BlurView
            pointerEvents="none"
            intensity={colors.mode === 'dark' ? 42 : 58}
            tint={colors.mode === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.frostedPanel }]}
          />
          <ScrollView
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.unifiedCommandResults}
          >
            {commandCandidates.length > 0 ? (
              commandCandidates.map((candidate, index) => (
                <UnifiedCommandCandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  isLast={index === commandCandidates.length - 1}
                  borderColor={colors.frostedBorder}
                  onPress={() => onOpenCandidate(candidate)}
                />
              ))
            ) : (
              <AppText variant="label" tone="secondary" style={styles.unifiedCommandEmptyText}>
                {t('common.noResults')}
              </AppText>
            )}
          </ScrollView>
        </View>
        <View
          style={[
            styles.commandModalSearchPill,
            {
              borderColor: colors.frostedBorder,
              backgroundColor: colors.frostedPanel,
              shadowColor: colors.shadowStrong,
            },
          ]}
          {...commandDismissPanResponder.panHandlers}
        >
          <BlurView
            pointerEvents="none"
            intensity={colors.mode === 'dark' ? 46 : 62}
            tint={colors.mode === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.frostedPanel }]}
          />
          <View style={styles.commandModalSearchIconBox}>
            <Search size={iconSize['5xl']} color={homeAccent} strokeWidth={2.6} />
          </View>
          <View style={styles.commandModalSearchInputBox}>
            <TextInput
              ref={commandSearchInputRef}
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              placeholder={t('common.search')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              autoComplete="off"
              showSoftInputOnFocus
              importantForAutofill="no"
              textContentType="none"
              returnKeyType="search"
              keyboardAppearance={colors.mode === 'dark' ? 'dark' : 'light'}
              underlineColorAndroid="transparent"
              style={[
                styles.unifiedCommandSearchInput,
                Platform.OS === 'android'
                  ? styles.unifiedCommandSearchInputAndroid
                  : styles.unifiedCommandSearchInputIos,
                { color: colors.text },
              ]}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            hitSlop={spacing.sm}
            style={styles.unifiedCommandSearchClose}
          >
            <X size={iconSize.lg} color={colors.textMuted} strokeWidth={2.5} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export function UnifiedDirectMessagePickerSheet({
  visible,
  directMessages,
  onClose,
  onOpenChannel,
  onOpenFriends,
}: {
  visible: boolean
  directMessages: DirectChannelEntry[]
  onClose: () => void
  onOpenChannel: (channel: DirectChannelEntry) => void
  onOpenFriends: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={t('server.addMenuDm')}
      snapPoints={['58%', '78%']}
    >
      {directMessages.length > 0 ? (
        <SurfaceList style={styles.edgeList}>
          {directMessages.map((channel, index) => {
            const peer = channel.otherUser
            return (
              <SurfaceListItem
                key={channel.id}
                last={index === directMessages.length - 1}
                onPress={() => {
                  onClose()
                  onOpenChannel(channel)
                }}
                style={styles.menuItem}
              >
                {peer ? (
                  <Avatar
                    uri={peer.avatarUrl}
                    name={directMessagePeerName(channel)}
                    size={size.avatarSm}
                    userId={peer.id}
                    status={normalizePresenceStatus(peer.status)}
                    showStatus
                  />
                ) : (
                  <IconBubble icon={MessageCircle} tone="muted" size={iconSize.xl} />
                )}
                <AppText variant="bodyStrong" style={styles.menuLabel} numberOfLines={1}>
                  {directMessagePeerName(channel)}
                </AppText>
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>
            )
          })}
        </SurfaceList>
      ) : (
        <View style={styles.unifiedDmPickerEmpty}>
          <AppText variant="bodyStrong">{t('dm.noDirectMessages')}</AppText>
          <AppText variant="label" tone="secondary" style={styles.unifiedDmPickerEmptyText}>
            {t('dm.noDirectMessagesDesc')}
          </AppText>
          <Button variant="primary" size="sm" icon={UserPlus} onPress={onOpenFriends}>
            {t('server.addMenuDm')}
          </Button>
        </View>
      )}
    </InteractiveSheet>
  )
}

export function UnifiedCreateMenuModal({
  visible,
  panelLeft,
  panelTop,
  arrowLeft,
  onClose,
  onCreateServer,
  onCreateBuddy,
  onOpenDm,
  onAddFriend,
  onScan,
}: {
  visible: boolean
  panelLeft: number
  panelTop: number
  arrowLeft: number
  onClose: () => void
  onCreateServer: () => void
  onCreateBuddy: () => void
  onOpenDm: () => void
  onAddFriend: () => void
  onScan: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const itemStyle = ({ pressed }: { pressed: boolean }) => [
    styles.createMenuRow,
    pressed ? { backgroundColor: colors.inputBackground } : null,
    pressed ? styles.unifiedPressed : null,
  ]

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlayModalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={[styles.overlayModalBackdrop, { backgroundColor: colors.overlay }]}
        />
        <Reanimated.View
          entering={FadeInUp.duration(180).springify()}
          style={[
            styles.createMenuPopover,
            {
              left: panelLeft,
              top: panelTop,
              shadowColor: colors.shadowStrong,
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              styles.createMenuArrow,
              {
                left: arrowLeft,
                borderBottomColor: colors.frostedPanelStrong,
              },
            ]}
          />
          <View
            style={[
              styles.createMenuPanel,
              {
                backgroundColor: colors.frostedPanelStrong,
                borderColor: colors.mode === 'light' ? colors.cardBorder : colors.frostedBorder,
              },
            ]}
          >
            <BlurView
              pointerEvents="none"
              intensity={colors.mode === 'dark' ? 42 : 64}
              tint={colors.mode === 'dark' ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.frostedPanelStrong }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.createMenuInnerStroke,
                {
                  borderColor:
                    colors.mode === 'light' ? colors.frostedPanelStrong : colors.frostedBorder,
                },
              ]}
            />
            <View style={styles.createMenuBubble}>
              <Pressable onPress={onCreateServer} style={itemStyle}>
                <Server size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('home.createServerAction'))}
                </AppText>
              </Pressable>
              <Pressable onPress={onCreateBuddy} style={itemStyle}>
                <Bot size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('home.createBuddyAction'))}
                </AppText>
              </Pressable>
              <Pressable onPress={onOpenDm} style={itemStyle}>
                <MessageCircle size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('server.addMenuDm'))}
                </AppText>
              </Pressable>
              <Pressable onPress={onAddFriend} style={itemStyle}>
                <UserPlus size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('friends.addFriend'))}
                </AppText>
              </Pressable>
              <Pressable onPress={onScan} style={itemStyle}>
                <QrCode size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {t('home.scanAction')}
                </AppText>
              </Pressable>
            </View>
          </View>
        </Reanimated.View>
      </View>
    </Modal>
  )
}

export function UnifiedCreateServerSheet({
  visible,
  createName,
  isPublic,
  isPending,
  onClose,
  onCreate,
  onNameChange,
  onPublicChange,
}: {
  visible: boolean
  createName: string
  isPublic: boolean
  isPending: boolean
  onClose: () => void
  onCreate: () => void
  onNameChange: (name: string) => void
  onPublicChange: (isPublic: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={t('server.createTitle')}
      subtitle={t('server.createSubtitle')}
      snapPoints={['42%', '64%']}
      footer={
        <Button
          variant="primary"
          size="lg"
          onPress={onCreate}
          disabled={!createName.trim() || isPending}
          loading={isPending}
        >
          {t('server.create')}
        </Button>
      }
    >
      <TextField
        label={t('server.nameLabel')}
        style={styles.input}
        value={createName}
        onChangeText={onNameChange}
        placeholder={t('server.namePlaceholder')}
        autoFocus
      />
      <MotionPressable
        accessibilityRole="switch"
        onPress={() => onPublicChange(!isPublic)}
        contentStyle={styles.switchRow}
      >
        <AppText variant="bodyStrong">{t('server.publicServer')}</AppText>
        <AppSwitch value={isPublic} onValueChange={onPublicChange} />
      </MotionPressable>
    </InteractiveSheet>
  )
}
