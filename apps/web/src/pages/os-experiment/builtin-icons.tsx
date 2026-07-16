import { cn } from '@shadowob/ui'
import appStoreIcon from '../../assets/os-app-icons/app-store.png'
import discoverIcon from '../../assets/os-app-icons/discover.png'
import myBuddiesIcon from '../../assets/os-app-icons/my-buddies.png'
import profileIcon from '../../assets/os-app-icons/profile.png'
import serverSettingsIcon from '../../assets/os-app-icons/server-settings.png'
import settingsIcon from '../../assets/os-app-icons/settings.png'
import shadowCloudIcon from '../../assets/os-app-icons/shadow-cloud.png'
import shopIcon from '../../assets/os-app-icons/shop.png'
import workspaceIcon from '../../assets/os-app-icons/workspace.png'
import type { OsBuiltinAppKey } from './types'

const OS_BUILTIN_APP_ICON_SRC: Record<OsBuiltinAppKey, string> = {
  workspace: workspaceIcon,
  discover: discoverIcon,
  'app-store': appStoreIcon,
  shop: shopIcon,
  settings: settingsIcon,
  profile: profileIcon,
  'server-settings': serverSettingsIcon,
  'cloud-computers': shadowCloudIcon,
  'shadow-cloud': shadowCloudIcon,
  'my-buddies': myBuddiesIcon,
  contacts: profileIcon,
  tasks: settingsIcon,
  wallet: shopIcon,
}

export function osBuiltinAppIconSrc(key: OsBuiltinAppKey | null | undefined) {
  return key ? OS_BUILTIN_APP_ICON_SRC[key] : undefined
}

export function OsBuiltinAppIcon({
  appKey,
  className,
}: {
  appKey: OsBuiltinAppKey | null | undefined
  className?: string
}) {
  const src = osBuiltinAppIconSrc(appKey)
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={cn('h-full w-full object-contain', className)}
      draggable={false}
    />
  )
}
