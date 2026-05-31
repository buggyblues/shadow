import {
  Apple,
  Bed,
  Cable,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Compass,
  EyeOff,
  Gamepad2,
  Hand,
  LogIn,
  type LucideIcon,
  MessageCircle,
  Mic,
  Sparkles,
} from 'lucide-react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PetAction } from '../lib/game'
import type { ConnectorSnapshot, WheelCommand, WheelLayer } from '../pet-types'

const WHEEL_SIZE = 220
const WHEEL_CENTER = WHEEL_SIZE / 2
const WHEEL_OUTER_RADIUS = 106
const WHEEL_INNER_RADIUS = 58
const WHEEL_SECTOR_GAP = 0.4

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
  { id: 'connection', angle: 150, Icon: Cable, labelKey: 'desktopPet.actions.connection' },
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

export function PetWheel({
  visible,
  layer,
  panelOpen,
  voiceMode,
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
  onCommunity,
  onHide,
  onCareAction,
}: {
  visible: boolean
  layer: WheelLayer
  panelOpen: boolean
  voiceMode: boolean
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
  onCommunity: () => void
  onHide: () => void
  onCareAction: (action: PetAction) => void
}) {
  const { t } = useTranslation()
  const items = layer === 'main' ? wheelItems : interactionWheelItems

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
          const currentItem =
            item.id === 'panel' && panelOpen
              ? { ...item, Icon: ChevronLeft, labelKey: 'desktopPet.app.compact' }
              : item.id === 'community' && communityAuthRequired
                ? { ...item, Icon: LogIn, labelKey: 'desktopPet.auth.loginAction' }
                : item
          const hasRecommendedCare = recommendedActions.length > 0
          const hasAttention =
            layer === 'main'
              ? (item.id === 'interact' && hasRecommendedCare) ||
                (item.id === 'community' && communityAttention)
              : recommendedActions.includes(item.id as PetAction)
          const label =
            item.id === 'connection'
              ? connectorSnapshot.running
                ? t('desktopPet.connector.online', { count: connectorSnapshot.onlineCount })
                : t('desktopPet.connector.offline')
              : t(currentItem.labelKey)
          return (
            <WheelSector
              key={item.id}
              item={currentItem}
              sectorCount={items.length}
              active={item.id === 'voice' && voiceMode}
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
                if (item.id === 'panel') {
                  onPanel()
                  return
                }
                if (item.id === 'connection') {
                  onConnection()
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
        <circle className="desktop-pet-radial-inner" cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={56} />
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
  const labelPoint = polarPoint(82, item.angle)
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
      <foreignObject x={labelPoint.x - 30} y={labelPoint.y - 23} width={60} height={46}>
        <div className="desktop-pet-sector-content">
          <Icon size={14} />
          <span>{label}</span>
          {attention ? <i className="desktop-pet-sector-dot" aria-hidden="true" /> : null}
        </div>
      </foreignObject>
    </g>
  )
}
