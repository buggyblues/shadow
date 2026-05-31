import {
  Bell,
  FileText,
  type LucideIcon,
  MessageCircle,
  Sparkles,
  Store,
  Timer,
} from 'lucide-react'
import type { AppTab } from '../pet-types'

export const tabIcons: Record<AppTab, LucideIcon> = {
  chat: MessageCircle,
  care: Sparkles,
  services: Timer,
  community: Bell,
  subscriptions: FileText,
  store: Store,
}

export const visiblePanelTabs: AppTab[] = [
  'chat',
  'care',
  'services',
  'community',
  'subscriptions',
  'store',
]
