import { UserAvatarMenu } from '../../../components/server/user-avatar-menu'
import type { AuthenticatedUser } from '../../../lib/auth-session'
import type { SettingsModalTab } from '../../settings/settings-modal'

export function OsAvatarMenu({
  user,
  onExit,
  onOpenProfile,
  onOpenSettings,
  isFullscreen,
  onToggleFullscreen,
  floatingLayerZIndex = 2_147_482_000,
}: {
  user: AuthenticatedUser | null | undefined
  onExit: () => void
  onOpenProfile?: () => void
  onOpenSettings?: (tab?: SettingsModalTab) => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  floatingLayerZIndex?: number
}) {
  return (
    <UserAvatarMenu
      user={user}
      mode="os"
      variant="os-topbar"
      menuZIndex={floatingLayerZIndex}
      onExit={onExit}
      onOpenProfile={onOpenProfile}
      onOpenSettings={onOpenSettings}
      isFullscreen={isFullscreen}
      onToggleFullscreen={onToggleFullscreen}
    />
  )
}
