import {
  Apple,
  Bed,
  Cable,
  ChevronLeft,
  ChevronRight,
  Code2,
  Coffee,
  Compass,
  Dumbbell,
  EyeOff,
  Gamepad2,
  Hand,
  LogIn,
  type LucideIcon,
  MessageCircle,
  Mic,
  Sparkles,
  Timer,
  Waves,
} from 'lucide-react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PetAction } from '../lib/game'
import type {
  ConnectorSnapshot,
  PetServiceId,
  PetServiceState,
  WheelCommand,
  WheelLayer,
} from '../pet-types'

const WHEEL_SIZE = 300
const WHEEL_CENTER = WHEEL_SIZE / 2
const WHEEL_OUTER_RADIUS = 144
const WHEEL_INNER_RADIUS = 88
const WHEEL_LABEL_RADIUS = 116
const WHEEL_SECTOR_GAP = 0.5
const SERVICE_STATUS_ROTATE_MS = 2200
const SERVICE_STATUS_PRIORITY: PetServiceId[] = ['focus', 'water', 'fitness', 'coding']

const wheelItems: Array<{
  id: WheelCommand
  angle: number
  Icon: LucideIcon
  labelKey: string
}> = [
  { id: 'interact', angle: 330, Icon: Sparkles, labelKey: 'desktopPet.actions.interact' },
  { id: 'voice', angle: 270, Icon: Mic, labelKey: 'desktopPet.actions.voice' },
  { id: 'hide', angle: 210, Icon: EyeOff, labelKey: 'desktopPet.actions.hide' },
  { id: 'community', angle: 30, Icon: MessageCircle, labelKey: 'desktopPet.actions.community' },
  { id: 'panel', angle: 90, Icon: ChevronRight, labelKey: 'desktopPet.app.expand' },
  { id: 'services', angle: 150, Icon: Timer, labelKey: 'desktopPet.services.wheelServices' },
]

const interactionWheelItems: Array<{
  id: WheelCommand
  angle: number
  Icon: LucideIcon
  labelKey: string
}> = [
  { id: 'back', angle: 270, Icon: ChevronLeft, labelKey: 'desktopPet.actions.back' },
  { id: 'pet', angle: 321, Icon: Hand, labelKey: 'desktopPet.actions.pet' },
  { id: 'feed', angle: 13, Icon: Apple, labelKey: 'desktopPet.actions.feed' },
  { id: 'play', angle: 64, Icon: Gamepad2, labelKey: 'desktopPet.actions.play' },
  { id: 'rest', angle: 116, Icon: Bed, labelKey: 'desktopPet.actions.rest' },
  { id: 'explore', angle: 167, Icon: Compass, labelKey: 'desktopPet.actions.explore' },
  { id: 'tea', angle: 219, Icon: Coffee, labelKey: 'desktopPet.actions.tea' },
]

const serviceWheelItems: Array<{
  id: WheelCommand
  angle: number
  Icon: LucideIcon
  labelKey: string
}> = [
  { id: 'back', angle: 270, Icon: ChevronLeft, labelKey: 'desktopPet.actions.back' },
  { id: 'serviceFocus', angle: 330, Icon: Timer, labelKey: 'desktopPet.services.focus' },
  { id: 'serviceWater', angle: 30, Icon: Waves, labelKey: 'desktopPet.services.water' },
  { id: 'serviceFitness', angle: 90, Icon: Dumbbell, labelKey: 'desktopPet.services.fitness' },
  { id: 'serviceCoding', angle: 150, Icon: Code2, labelKey: 'desktopPet.services.coding' },
  { id: 'connection', angle: 210, Icon: Cable, labelKey: 'desktopPet.actions.connection' },
]

function serviceIdFromWheelCommand(command: WheelCommand): PetServiceId | null {
  if (command === 'serviceFocus') return 'focus'
  if (command === 'serviceWater') return 'water'
  if (command === 'serviceFitness') return 'fitness'
  if (command === 'serviceCoding') return 'coding'
  return null
}

export function PetWheel({
  visible,
  layer,
  panelOpen,
  voiceMode,
  services,
  serviceCompletions,
  serviceAlertFlags,
  serviceAttention,
  connectorSnapshot,
  recommendedActions,
  communityAuthRequired,
  communityAttention,
  onVoicePressStart,
  onVoicePressEnd,
  onVoicePressCancel,
  onLayerChange,
  onPanel,
  onConnection,
  onServiceAction,
  onCommunity,
  onHide,
  onCareAction,
}: {
  visible: boolean
  layer: WheelLayer
  panelOpen: boolean
  voiceMode: boolean
  services: PetServiceState
  serviceCompletions: Record<PetServiceId, boolean>
  serviceAlertFlags: Record<PetServiceId, boolean>
  serviceAttention: boolean
  connectorSnapshot: ConnectorSnapshot
  recommendedActions: PetAction[]
  communityAuthRequired?: boolean
  communityAttention?: boolean
  onVoicePressStart: (pointerId: number) => void
  onVoicePressEnd: (pointerId: number) => void
  onVoicePressCancel: (pointerId: number) => void
  onLayerChange: (layer: WheelLayer) => void
  onPanel: () => void
  onConnection: () => void
  onServiceAction: (service: PetServiceId) => void
  onCommunity: () => void
  onHide: () => void
  onCareAction: (action: PetAction) => void
}) {
  const { t } = useTranslation()
  const now = Date.now()
  const focusRemaining = Math.max(0, (services.focusEndsAt ?? now) - now)
  const waterRemaining = Math.max(0, services.lastWaterAt + services.waterIntervalMs - now)
  const fitnessRemaining = Math.max(0, services.lastFitnessAt + services.fitnessIntervalMs - now)
  const waterDue = services.water && waterRemaining <= 0
  const fitnessDue = services.fitness && fitnessRemaining <= 0
  const items =
    layer === 'main' ? wheelItems : layer === 'services' ? serviceWheelItems : interactionWheelItems
  const formatWheelDuration = (ms: number) => {
    const minutes = Math.max(1, Math.ceil(ms / 60_000))
    if (minutes < 60) return t('desktopPet.services.minutesShort', { count: minutes })
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    if (rest === 0) return t('desktopPet.services.hoursShort', { count: hours })
    return t('desktopPet.services.hoursMinutesShort', { hours, minutes: rest })
  }
  const serviceWheelLabel = (serviceId: PetServiceId) => {
    if (serviceAlertFlags[serviceId]) return t(`desktopPet.services.${serviceId}`)
    if (serviceId === 'focus' && services.focus && focusRemaining > 0) {
      return formatWheelDuration(focusRemaining)
    }
    if (serviceId === 'water' && waterDue) return t('desktopPet.services.water')
    if (serviceId === 'water' && services.water && waterRemaining > 0) {
      return formatWheelDuration(waterRemaining)
    }
    if (serviceId === 'fitness' && fitnessDue) return t('desktopPet.services.fitness')
    if (serviceId === 'fitness' && services.fitness && fitnessRemaining > 0) {
      return formatWheelDuration(fitnessRemaining)
    }
    if (serviceCompletions[serviceId]) return t(`desktopPet.services.${serviceId}Completed`)
    return t(`desktopPet.services.${serviceId}`)
  }
  const serviceStatusCandidates = [
    {
      id: 'focus' as const,
      Icon: Timer,
      active: services.focus || serviceCompletions.focus || serviceAlertFlags.focus,
      attention: serviceAlertFlags.focus,
      label: serviceWheelLabel('focus'),
    },
    {
      id: 'water' as const,
      Icon: Waves,
      active: services.water || serviceCompletions.water || serviceAlertFlags.water || waterDue,
      attention: serviceAlertFlags.water || waterDue,
      label: serviceWheelLabel('water'),
    },
    {
      id: 'fitness' as const,
      Icon: Dumbbell,
      active:
        services.fitness || serviceCompletions.fitness || serviceAlertFlags.fitness || fitnessDue,
      attention: serviceAlertFlags.fitness || fitnessDue,
      label: serviceWheelLabel('fitness'),
    },
    {
      id: 'coding' as const,
      Icon: Code2,
      active: serviceAlertFlags.coding,
      attention: serviceAlertFlags.coding,
      label: serviceWheelLabel('coding'),
    },
  ].filter((item) => item.active || item.attention)
  const serviceStatusById = new Map(serviceStatusCandidates.map((item) => [item.id, item]))
  const pinnedServiceStatus =
    SERVICE_STATUS_PRIORITY.map((id) => serviceStatusById.get(id)).find(
      (item) => item?.attention,
    ) ?? null
  const rotatingServiceStatusCandidates = serviceStatusCandidates.filter(
    (item) => item.id !== 'coding' && !item.attention,
  )
  const rotatingServiceStatus =
    pinnedServiceStatus ??
    (rotatingServiceStatusCandidates.length > 0
      ? rotatingServiceStatusCandidates[
          Math.floor(now / SERVICE_STATUS_ROTATE_MS) % rotatingServiceStatusCandidates.length
        ]
      : null)
  const shouldCompleteServiceFromMain =
    layer === 'main' && Boolean(pinnedServiceStatus?.attention) && Boolean(rotatingServiceStatus)
  const rotatingServiceCommand = rotatingServiceStatus?.id ?? null
  const servicesIcon =
    rotatingServiceStatus?.Icon ??
    (serviceAttention ? (serviceStatusById.get('coding')?.Icon ?? Timer) : Timer)
  const servicesLabel =
    rotatingServiceStatus?.label ??
    (serviceAttention
      ? t('desktopPet.services.wheelAttention')
      : t('desktopPet.services.wheelServices'))

  return (
    <div
      className={visible ? 'desktop-pet-radial visible' : 'desktop-pet-radial'}
      aria-label={t('desktopPet.app.actions')}
    >
      <svg
        className="desktop-pet-radial-svg"
        viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
        aria-label={t('desktopPet.app.actions')}
      >
        <title>{t('desktopPet.app.actions')}</title>
        {items.map((item) => {
          const serviceOverviewItem =
            item.id === 'services' && rotatingServiceStatus ? { ...item, Icon: servicesIcon } : item
          const currentItem =
            serviceOverviewItem.id === 'panel' && panelOpen
              ? { ...serviceOverviewItem, Icon: ChevronLeft, labelKey: 'desktopPet.app.compact' }
              : serviceOverviewItem.id === 'community' && communityAuthRequired
                ? { ...serviceOverviewItem, Icon: LogIn, labelKey: 'desktopPet.auth.loginAction' }
                : serviceOverviewItem
          const hasRecommendedCare = recommendedActions.length > 0
          const hasAttention =
            layer === 'main'
              ? (item.id === 'interact' && hasRecommendedCare) ||
                (item.id === 'community' && communityAttention) ||
                (item.id === 'services' &&
                  (serviceAttention || Boolean(rotatingServiceStatus?.attention)))
              : layer === 'services'
                ? (item.id === 'serviceFocus' && serviceAlertFlags.focus) ||
                  (item.id === 'serviceWater' && (serviceAlertFlags.water || waterDue)) ||
                  (item.id === 'serviceFitness' && (serviceAlertFlags.fitness || fitnessDue)) ||
                  (item.id === 'serviceCoding' && serviceAlertFlags.coding)
                : recommendedActions.includes(item.id as PetAction)
          const serviceId = serviceIdFromWheelCommand(item.id)
          const serviceCompleted = serviceId ? serviceCompletions[serviceId] : false
          const serviceActive =
            item.id === 'services'
              ? Boolean(rotatingServiceStatus?.active)
              : item.id === 'serviceFocus'
                ? services.focus || serviceCompleted
                : item.id === 'serviceCoding'
                  ? services.coding || serviceCompleted
                  : serviceId
                    ? services[serviceId] || serviceCompleted
                    : serviceCompleted
          const label =
            item.id === 'services'
              ? servicesLabel
              : item.id === 'connection'
                ? connectorSnapshot.connectorOnline
                  ? t('desktopPet.connector.online', { count: connectorSnapshot.onlineCount })
                  : t('desktopPet.connector.offline')
                : serviceId
                  ? serviceWheelLabel(serviceId)
                  : t(currentItem.labelKey)
          return (
            <WheelSector
              key={item.id}
              item={currentItem}
              sectorCount={items.length}
              active={(item.id === 'voice' && voiceMode) || serviceActive}
              attention={hasAttention}
              label={label}
              onPressStart={item.id === 'voice' ? onVoicePressStart : undefined}
              onPressEnd={item.id === 'voice' ? onVoicePressEnd : undefined}
              onPressCancel={
                item.id === 'voice' ? (pointerId) => onVoicePressCancel(pointerId) : undefined
              }
              onActivate={() => {
                if (item.id === 'voice') return
                if (item.id === 'back') {
                  onLayerChange('main')
                  return
                }
                if (item.id === 'interact') {
                  onLayerChange('interactions')
                  return
                }
                if (item.id === 'services') {
                  if (shouldCompleteServiceFromMain && rotatingServiceCommand) {
                    onServiceAction(rotatingServiceCommand)
                    return
                  }
                  onLayerChange('services')
                  return
                }
                if (item.id === 'panel') {
                  onPanel()
                  return
                }
                if (item.id === 'connection') {
                  onConnection()
                  return
                }
                if (serviceId) {
                  onServiceAction(serviceId)
                  return
                }
                if (item.id === 'community') {
                  onCommunity()
                  return
                }
                if (item.id === 'hide') {
                  onHide()
                  return
                }
                onCareAction(item.id as PetAction)
              }}
            />
          )
        })}
        <circle
          className="desktop-pet-radial-inner"
          cx={WHEEL_CENTER}
          cy={WHEEL_CENTER}
          r={WHEEL_INNER_RADIUS - 2}
        />
      </svg>
    </div>
  )
}

function polarPoint(radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: WHEEL_CENTER + radius * Math.cos(radians),
    y: WHEEL_CENTER + radius * Math.sin(radians),
  }
}

function sectorPath(angle: number, sectorCount: number) {
  const sectorSpan = 360 / Math.max(1, sectorCount)
  const startAngle = angle - sectorSpan / 2 + WHEEL_SECTOR_GAP / 2
  const endAngle = angle + sectorSpan / 2 - WHEEL_SECTOR_GAP / 2
  const outerStart = polarPoint(WHEEL_OUTER_RADIUS, startAngle)
  const outerEnd = polarPoint(WHEEL_OUTER_RADIUS, endAngle)
  const innerEnd = polarPoint(WHEEL_INNER_RADIUS, endAngle)
  const innerStart = polarPoint(WHEEL_INNER_RADIUS, startAngle)
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${WHEEL_OUTER_RADIUS} ${WHEEL_OUTER_RADIUS} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${WHEEL_INNER_RADIUS} ${WHEEL_INNER_RADIUS} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function activateOnKey(event: KeyboardEvent<SVGGElement>, onActivate: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onActivate()
}

function WheelSector({
  item,
  sectorCount,
  active,
  attention,
  label,
  onPressStart,
  onPressEnd,
  onPressCancel,
  onActivate,
}: {
  item: {
    id: WheelCommand
    angle: number
    Icon: LucideIcon
  }
  sectorCount: number
  active?: boolean
  attention?: boolean
  label: string
  onPressStart?: (pointerId: number) => void
  onPressEnd?: (pointerId: number) => void
  onPressCancel?: (pointerId: number) => void
  onActivate: () => void
}) {
  const { Icon } = item
  const labelPoint = polarPoint(WHEEL_LABEL_RADIUS, item.angle)
  const className = [
    'desktop-pet-sector',
    item.id === 'panel' ? 'panel' : '',
    active ? 'active' : '',
    attention ? 'attention' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <g
      className={className}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={(event) => activateOnKey(event, onActivate)}
      onPointerDown={(event: PointerEvent<SVGGElement>) => {
        if (!onPressStart) return
        if (event.button !== 0 || event.ctrlKey) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        onPressStart(event.pointerId)
      }}
      onPointerUp={(event: PointerEvent<SVGGElement>) => {
        if (!onPressEnd) return
        event.preventDefault()
        event.stopPropagation()
        try {
          event.currentTarget.releasePointerCapture(event.pointerId)
        } catch {
          // The captured element can be removed during a mode change.
        }
        onPressEnd(event.pointerId)
      }}
      onPointerCancel={(event: PointerEvent<SVGGElement>) => {
        if (!onPressCancel) return
        event.preventDefault()
        event.stopPropagation()
        onPressCancel(event.pointerId)
      }}
    >
      <path className="desktop-pet-sector-shape" d={sectorPath(item.angle, sectorCount)} />
      <foreignObject x={labelPoint.x - 42} y={labelPoint.y - 29} width={84} height={58}>
        <div className="desktop-pet-sector-content">
          <Icon size={18} strokeWidth={2.4} />
          <span>{label}</span>
          {attention ? <i className="desktop-pet-sector-dot" aria-hidden="true" /> : null}
        </div>
      </foreignObject>
    </g>
  )
}
