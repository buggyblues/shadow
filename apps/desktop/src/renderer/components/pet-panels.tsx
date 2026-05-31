import {
  Apple,
  Award,
  Bed,
  CheckCircle2,
  Code2,
  Coffee,
  Compass,
  Dumbbell,
  Gamepad2,
  Hand,
  type LucideIcon,
  Package,
  Play,
  Shell,
  Shuffle,
  Square,
  Timer,
  Waves,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { levelXpRequirement, type PetAction, type PetEmotion, type PetState } from '../lib/game'
import { PET_PERSONALITIES, type PetPersonalityId } from '../lib/pet-profile'
import type { ConnectorSnapshot, PetProfile, PetServiceId, PetServiceState } from '../pet-types'
import { PetPanelButton, PetPanelSwitch } from './pet-ui'

const WATER_INTERVAL_MS = 60 * 60_000
const FITNESS_INTERVAL_MS = 90 * 60_000

export {
  ChatPanel,
  CommunityPanel,
  PetLoginGuide,
  PetStorePanel,
  SubscriptionsPanel,
} from './pet-community-panels'

export function CarePanel({
  petState,
  emotion,
  profile,
  recommendedActions,
  onAction,
  onProfileChange,
  onRandomProfile,
}: {
  petState: PetState
  emotion: PetEmotion
  profile: PetProfile
  recommendedActions: PetAction[]
  onAction: (action: PetAction) => void
  onProfileChange: (profile: PetProfile) => void
  onRandomProfile: () => void
}) {
  const { t } = useTranslation()
  const event = petState.game.todayEvent
  const xpTarget = levelXpRequirement(petState.stats.level)
  const xpProgress = Math.min(100, Math.round((petState.stats.xp / xpTarget) * 100))
  const statBars = [
    { id: 'mood', value: petState.stats.mood },
    { id: 'hunger', value: petState.stats.hunger },
    { id: 'energy', value: petState.stats.energy },
    { id: 'health', value: petState.stats.health },
  ] as const
  const visibleInventory = petState.inventory.filter((item) => item.count > 0)
  const visibleAchievements = petState.game.achievements.slice(-3)
  const actions: Array<{ id: PetAction; Icon: LucideIcon }> = [
    { id: 'pet', Icon: Hand },
    { id: 'feed', Icon: Apple },
    { id: 'play', Icon: Gamepad2 },
    { id: 'rest', Icon: Bed },
    { id: 'explore', Icon: Compass },
    { id: 'tea', Icon: Coffee },
  ]

  return (
    <div className="desktop-pet-panel-body desktop-pet-care">
      <section className="desktop-pet-profile-card">
        <div className="desktop-pet-profile-fields">
          <label>
            <span>{t('desktopPet.profile.name')}</span>
            <input
              value={profile.name}
              maxLength={18}
              onChange={(event) => onProfileChange({ ...profile, name: event.target.value })}
              onBlur={() => onProfileChange(profile)}
              aria-label={t('desktopPet.profile.name')}
            />
          </label>
          <label>
            <span>{t('desktopPet.profile.personality')}</span>
            <select
              value={profile.personality}
              onChange={(event) =>
                onProfileChange({
                  ...profile,
                  personality: event.target.value as PetPersonalityId,
                })
              }
              aria-label={t('desktopPet.profile.personality')}
            >
              {PET_PERSONALITIES.map((personality) => (
                <option key={personality} value={personality}>
                  {t(`desktopPet.profile.personality_${personality}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <PetPanelButton
          type="button"
          variant="warm"
          size="sm"
          className="desktop-pet-profile-random"
          onClick={onRandomProfile}
        >
          <Shuffle size={14} />
          <span>{t('desktopPet.profile.random')}</span>
        </PetPanelButton>
      </section>

      <section className="desktop-pet-mood-card">
        <span>{t(`desktopPet.phase.${emotion.phase}`)}</span>
        <strong>
          {t('desktopPet.profile.statusLine', {
            name: profile.name,
            emotion: t(`desktopPet.emotions.${emotion.state}`),
          })}
        </strong>
      </section>

      <section className="desktop-pet-game-card">
        <div className="desktop-pet-game-summary">
          <span>
            <Shell size={13} />
            {t('desktopPet.game.shells')} {petState.game.shells}
          </span>
          <span>
            <Award size={13} />
            {t('desktopPet.game.streak')}{' '}
            {t('desktopPet.game.days', { count: petState.game.streakDays })}
          </span>
          <span>
            <Package size={13} />
            {t('desktopPet.game.level', { level: petState.stats.level })}
          </span>
        </div>
        <div className="desktop-pet-xp-bar" aria-label={t('desktopPet.game.xp')}>
          <i style={{ width: `${xpProgress}%` }} />
        </div>
        <div className="desktop-pet-stat-grid">
          {statBars.map((stat) => (
            <span key={stat.id}>
              <small>{t(`desktopPet.stats.${stat.id}`)}</small>
              <i>
                <b style={{ width: `${Math.max(3, Math.round(stat.value))}%` }} />
              </i>
            </span>
          ))}
        </div>
      </section>

      <section className="desktop-pet-event-card">
        <div>
          <strong>{t('desktopPet.care.todayEvent')}</strong>
          <span>
            {event
              ? t(
                  event.resolved
                    ? `desktopPet.events.${event.id}.resolved`
                    : `desktopPet.events.${event.id}.hint`,
                )
              : t('desktopPet.care.noEvent')}
          </span>
        </div>
      </section>

      <section className="desktop-pet-progress-card">
        <div>
          <strong>{t('desktopPet.game.quests')}</strong>
          {petState.game.quests.slice(0, 4).map((quest) => (
            <span key={quest.id} className={quest.completed ? 'completed' : ''}>
              {quest.completed ? <CheckCircle2 size={12} /> : null}
              {t(`desktopPet.quests.${quest.id}`)} {quest.progress}/{quest.goal}
            </span>
          ))}
        </div>
        <div>
          <strong>{t('desktopPet.game.inventory')}</strong>
          {visibleInventory.length ? (
            visibleInventory.slice(0, 4).map((item) => (
              <span key={item.id}>
                {t(`desktopPet.inventory.${item.id}`)} x{item.count}
              </span>
            ))
          ) : (
            <span>{t('desktopPet.inventory.empty')}</span>
          )}
        </div>
        <div>
          <strong>{t('desktopPet.game.achievements')}</strong>
          {visibleAchievements.length ? (
            visibleAchievements.map((id) => (
              <span key={id}>{t(`desktopPet.achievements.${id}`)}</span>
            ))
          ) : (
            <span>{t('desktopPet.game.noAchievements')}</span>
          )}
        </div>
      </section>

      <div className="desktop-pet-care-actions" aria-label={t('desktopPet.actions.interact')}>
        {actions.map(({ id, Icon }) => (
          <PetPanelButton
            key={id}
            type="button"
            variant="tile"
            className="desktop-pet-care-action"
            onClick={() => onAction(id)}
          >
            <Icon size={16} />
            <span>{t(`desktopPet.actions.${id}`)}</span>
            {recommendedActions.includes(id) ? (
              <i
                className="desktop-pet-action-dot"
                aria-label={t('desktopPet.care.recommendedAction')}
              />
            ) : null}
          </PetPanelButton>
        ))}
      </div>
    </div>
  )
}

export function ServicesPanel({
  services,
  connectorSnapshot,
  now,
  onToggle,
  onAcknowledge,
  onFocusStart,
}: {
  services: PetServiceState
  connectorSnapshot: ConnectorSnapshot
  now: number
  onToggle: (service: PetServiceId) => void
  onAcknowledge: (service: Extract<PetServiceId, 'water' | 'fitness'>) => void
  onFocusStart: (minutes: number) => void
}) {
  const { t } = useTranslation()
  const formatDuration = (ms: number) => {
    const minutes = Math.max(1, Math.ceil(ms / 60_000))
    if (minutes < 60) return t('desktopPet.services.minutes', { count: minutes })
    return t('desktopPet.services.hoursMinutes', {
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
    })
  }
  const waterRemaining = Math.max(0, services.lastWaterAt + WATER_INTERVAL_MS - now)
  const fitnessRemaining = Math.max(0, services.lastFitnessAt + FITNESS_INTERVAL_MS - now)
  const waterDue = services.water && waterRemaining <= 0
  const fitnessDue = services.fitness && fitnessRemaining <= 0
  const focusDurationMs = Math.max(60_000, services.focusDurationMs || 25 * 60_000)
  const focusEndsAt = services.focusEndsAt ?? now
  const focusStartedAt = services.focusStartedAt ?? Math.max(now, focusEndsAt - focusDurationMs)
  const focusRemaining = Math.max(0, focusEndsAt - now)
  const focusElapsed = Math.max(0, now - focusStartedAt)
  const focusProgress = services.focus
    ? Math.min(100, Math.max(4, (focusElapsed / focusDurationMs) * 100))
    : 0
  const codingMeta = connectorSnapshot.running
    ? t('desktopPet.connector.online', { count: connectorSnapshot.onlineCount })
    : t('desktopPet.connector.offline')

  return (
    <div className="desktop-pet-panel-body desktop-pet-services">
      <section
        className={
          services.focus
            ? 'desktop-pet-service-card desktop-pet-service-focus active'
            : 'desktop-pet-service-card desktop-pet-service-focus'
        }
      >
        <div className="desktop-pet-service-main">
          <span className="desktop-pet-service-icon" aria-hidden="true">
            <Timer size={17} />
          </span>
          <span className="desktop-pet-service-copy">
            <strong>{t('desktopPet.services.focus')}</strong>
            <small>
              {services.focus
                ? t('desktopPet.services.focusRemaining', {
                    time: formatDuration(focusRemaining),
                  })
                : t('desktopPet.services.focusIdle')}
            </small>
          </span>
          <i>{services.focus ? t('desktopPet.services.active') : t('desktopPet.services.idle')}</i>
        </div>
        <div className="desktop-pet-service-progress" aria-hidden="true">
          <span style={{ width: `${focusProgress}%` }} />
        </div>
        <div className="desktop-pet-service-actions">
          {services.focus ? (
            <PetPanelButton type="button" size="sm" onClick={() => onToggle('focus')}>
              <Square size={12} />
              <span>{t('desktopPet.services.stop')}</span>
            </PetPanelButton>
          ) : (
            <>
              <PetPanelButton type="button" size="sm" onClick={() => onFocusStart(25)}>
                <Play size={12} />
                <span>{t('desktopPet.services.start25')}</span>
              </PetPanelButton>
              <PetPanelButton type="button" size="sm" onClick={() => onFocusStart(50)}>
                <Play size={12} />
                <span>{t('desktopPet.services.start50')}</span>
              </PetPanelButton>
            </>
          )}
        </div>
      </section>

      <section
        className={[
          'desktop-pet-service-card',
          services.water ? 'active' : '',
          waterDue ? 'attention' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="desktop-pet-service-main">
          <span className="desktop-pet-service-icon" aria-hidden="true">
            <Waves size={17} />
          </span>
          <span className="desktop-pet-service-copy">
            <strong>{t('desktopPet.services.water')}</strong>
            <small>
              {services.water
                ? waterDue
                  ? t('desktopPet.services.dueNow')
                  : t('desktopPet.services.waterNext', { time: formatDuration(waterRemaining) })
                : t('desktopPet.services.waterMeta')}
            </small>
          </span>
          <span className="desktop-pet-service-state">
            <i>
              {waterDue
                ? t('desktopPet.services.reminded')
                : services.water
                  ? t('desktopPet.services.active')
                  : t('desktopPet.services.idle')}
            </i>
            <PetPanelSwitch
              checked={services.water}
              onCheckedChange={() => onToggle('water')}
              aria-label={t('desktopPet.services.water')}
            />
          </span>
        </div>
        {services.water ? (
          <div className="desktop-pet-service-actions">
            <PetPanelButton type="button" size="sm" onClick={() => onAcknowledge('water')}>
              <CheckCircle2 size={12} />
              <span>{t('desktopPet.services.done')}</span>
            </PetPanelButton>
          </div>
        ) : null}
      </section>

      <section
        className={[
          'desktop-pet-service-card',
          services.fitness ? 'active' : '',
          fitnessDue ? 'attention' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="desktop-pet-service-main">
          <span className="desktop-pet-service-icon" aria-hidden="true">
            <Dumbbell size={17} />
          </span>
          <span className="desktop-pet-service-copy">
            <strong>{t('desktopPet.services.fitness')}</strong>
            <small>
              {services.fitness
                ? fitnessDue
                  ? t('desktopPet.services.dueNow')
                  : t('desktopPet.services.fitnessNext', {
                      time: formatDuration(fitnessRemaining),
                    })
                : t('desktopPet.services.fitnessMeta')}
            </small>
          </span>
          <span className="desktop-pet-service-state">
            <i>
              {fitnessDue
                ? t('desktopPet.services.reminded')
                : services.fitness
                  ? t('desktopPet.services.active')
                  : t('desktopPet.services.idle')}
            </i>
            <PetPanelSwitch
              checked={services.fitness}
              onCheckedChange={() => onToggle('fitness')}
              aria-label={t('desktopPet.services.fitness')}
            />
          </span>
        </div>
        {services.fitness ? (
          <div className="desktop-pet-service-actions">
            <PetPanelButton type="button" size="sm" onClick={() => onAcknowledge('fitness')}>
              <CheckCircle2 size={12} />
              <span>{t('desktopPet.services.done')}</span>
            </PetPanelButton>
          </div>
        ) : null}
      </section>

      <section
        className={services.coding ? 'desktop-pet-service-card active' : 'desktop-pet-service-card'}
      >
        <div className="desktop-pet-service-main">
          <span className="desktop-pet-service-icon" aria-hidden="true">
            <Code2 size={17} />
          </span>
          <span className="desktop-pet-service-copy">
            <strong>{t('desktopPet.services.coding')}</strong>
            <small>{codingMeta}</small>
          </span>
          <span className="desktop-pet-service-state">
            <i>
              {services.coding ? t('desktopPet.services.active') : t('desktopPet.services.idle')}
            </i>
            <PetPanelSwitch
              checked={services.coding}
              onCheckedChange={() => onToggle('coding')}
              aria-label={t('desktopPet.services.coding')}
            />
          </span>
        </div>
      </section>
    </div>
  )
}
