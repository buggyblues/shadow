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
  Heart,
  type LucideIcon,
  Package,
  Shuffle,
  Timer,
  Waves,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { levelXpRequirement, type PetAction, type PetEmotion, type PetState } from '../lib/game'
import { PET_PERSONALITIES, type PetPersonalityId } from '../lib/pet-profile'
import type {
  PetProfile,
  PetServiceHistoryDay,
  PetServiceId,
  PetServiceIntervalId,
  PetServiceState,
} from '../pet-types'
import { PetPanelButton, PetPanelCard, PetPanelInput, PetPanelSelect } from './pet-ui'

const SERVICE_INTERVAL_STEP_MINUTES = 5
const SERVICE_INTERVAL_MINUTES_MIN = 5
const SERVICE_INTERVAL_MINUTES_MAX = 180

function careDateKey(now = Date.now()) {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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
  const visibleQuests = petState.game.quests.slice(0, 4)
  const actions: Array<{ id: PetAction; Icon: LucideIcon }> = [
    { id: 'pet', Icon: Hand },
    { id: 'feed', Icon: Apple },
    { id: 'play', Icon: Gamepad2 },
    { id: 'rest', Icon: Bed },
    { id: 'explore', Icon: Compass },
    { id: 'tea', Icon: Coffee },
  ]
  const todayKey = careDateKey()
  const todayActions = actions.map(({ id, Icon }) => {
    const entry = petState.game.dailyActions[id]
    return {
      id,
      Icon,
      count: entry?.date === todayKey ? entry.count : 0,
    }
  })
  const completedQuestCount = visibleQuests.filter((quest) => quest.completed).length

  return (
    <div className="desktop-pet-panel-body desktop-pet-care">
      <PetPanelCard className="desktop-pet-care-overview">
        <div className="desktop-pet-care-copy">
          <span className="desktop-pet-care-phase">{t(`desktopPet.phase.${emotion.phase}`)}</span>
          <div>
            <strong>
              {t('desktopPet.profile.statusLine', {
                name: profile.name,
                emotion: t(`desktopPet.emotions.${emotion.state}`),
              })}
            </strong>
            <p>
              {event
                ? t(
                    event.resolved
                      ? `desktopPet.events.${event.id}.resolved`
                      : `desktopPet.events.${event.id}.hint`,
                  )
                : t('desktopPet.care.noEvent')}
            </p>
          </div>
        </div>
        <div className="desktop-pet-care-action-grid" aria-label={t('desktopPet.actions.interact')}>
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
      </PetPanelCard>

      <div className="desktop-pet-care-grid">
        <PetPanelCard className="desktop-pet-care-profile">
          <div className="desktop-pet-care-section-heading">
            <strong>{t('desktopPet.care.profileTitle')}</strong>
            <PetPanelButton
              type="button"
              variant="warm"
              size="xs"
              className="desktop-pet-profile-random"
              onClick={onRandomProfile}
            >
              <Shuffle size={13} />
              <span>{t('desktopPet.profile.random')}</span>
            </PetPanelButton>
          </div>
          <div className="desktop-pet-profile-fields">
            <label>
              <span>{t('desktopPet.profile.name')}</span>
              <PetPanelInput
                value={profile.name}
                maxLength={18}
                onChange={(event) => onProfileChange({ ...profile, name: event.target.value })}
                onBlur={() => onProfileChange(profile)}
                aria-label={t('desktopPet.profile.name')}
              />
            </label>
            <label>
              <span>{t('desktopPet.profile.personality')}</span>
              <PetPanelSelect
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
              </PetPanelSelect>
            </label>
          </div>
        </PetPanelCard>

        <PetPanelCard className="desktop-pet-care-vitals">
          <div className="desktop-pet-care-section-heading">
            <strong>{t('desktopPet.care.vitalsTitle')}</strong>
            <span>{t('desktopPet.game.xp')}</span>
          </div>
          <div className="desktop-pet-care-metrics">
            <span>
              <Heart size={13} />
              {t('desktopPet.stats.loyalty')} {Math.round(petState.stats.loyalty)}
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
          <div className="desktop-pet-stat-list">
            {statBars.map((stat) => (
              <span key={stat.id}>
                <small>{t(`desktopPet.stats.${stat.id}`)}</small>
                <i>
                  <b style={{ width: `${Math.max(3, Math.round(stat.value))}%` }} />
                </i>
              </span>
            ))}
          </div>
        </PetPanelCard>
      </div>

      <PetPanelCard className="desktop-pet-care-journal">
        <div className="desktop-pet-care-list desktop-pet-routine-list">
          <div className="desktop-pet-care-list-header">
            <strong>{t('desktopPet.care.routinesTitle')}</strong>
            <span>
              {t('desktopPet.care.routinesProgress', {
                done: completedQuestCount,
                total: visibleQuests.length,
              })}
            </span>
          </div>
          {visibleQuests.map((quest) => (
            <div key={quest.id} className={quest.completed ? 'completed' : ''}>
              {quest.completed ? <CheckCircle2 size={12} /> : <i aria-hidden="true" />}
              <b>{t(`desktopPet.quests.${quest.id}`)}</b>
              <small>
                {quest.progress}/{quest.goal}
              </small>
              <em aria-hidden="true">
                <span style={{ width: `${Math.max(4, (quest.progress / quest.goal) * 100)}%` }} />
              </em>
            </div>
          ))}
        </div>
        <div className="desktop-pet-care-list desktop-pet-today-list">
          <div className="desktop-pet-care-list-header">
            <strong>{t('desktopPet.care.todayRhythmTitle')}</strong>
            <span>{t('desktopPet.care.todayRhythmSubtitle')}</span>
          </div>
          <div className="desktop-pet-today-action-grid">
            {todayActions.map(({ id, Icon, count }) => (
              <span key={id} className={count > 0 ? 'active' : ''}>
                <Icon size={13} />
                <b>{t(`desktopPet.actions.${id}`)}</b>
                <small>
                  {count > 0
                    ? t('desktopPet.care.actionCount', { count })
                    : t('desktopPet.care.actionNotYet')}
                </small>
              </span>
            ))}
          </div>
        </div>
      </PetPanelCard>
    </div>
  )
}

export function ServicesPanel({
  services,
  serviceHistory,
  now,
  onToggle,
  onAcknowledge,
  onFocusStart,
  onIntervalChange,
}: {
  services: PetServiceState
  serviceHistory: PetServiceHistoryDay[]
  now: number
  onToggle: (service: PetServiceId) => void
  onAcknowledge: (service: Extract<PetServiceId, 'water' | 'fitness'>) => void
  onFocusStart: (minutes: number) => void
  onIntervalChange: (service: PetServiceIntervalId, minutes: number) => void
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
  const intervalMinutes = (ms: number) => Math.max(5, Math.round(ms / 60_000 / 5) * 5)
  const waterRemaining = Math.max(0, services.lastWaterAt + services.waterIntervalMs - now)
  const fitnessRemaining = Math.max(0, services.lastFitnessAt + services.fitnessIntervalMs - now)
  const waterDue = services.water && waterRemaining <= 0
  const fitnessDue = services.fitness && fitnessRemaining <= 0
  const focusDurationMs = Math.max(60_000, services.focusDurationMs || 25 * 60_000)
  const focusEndsAt = services.focusEndsAt ?? now
  const focusRemaining = Math.max(0, focusEndsAt - now)
  const historyByDate = new Map(serviceHistory.map((item) => [item.date, item]))
  const historyDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    return (
      historyByDate.get(key) ?? {
        date: key,
        focusMs: 0,
        waterCount: 0,
        fitnessCount: 0,
        codingReadyCount: 0,
      }
    )
  })
  const todayHistory = historyDays[historyDays.length - 1] ?? {
    date: '',
    focusMs: 0,
    waterCount: 0,
    fitnessCount: 0,
    codingReadyCount: 0,
  }
  const hasHistory = historyDays.some(
    (day) =>
      day.focusMs > 0 || day.waterCount > 0 || day.fitnessCount > 0 || day.codingReadyCount > 0,
  )
  const countMetric = (count: number) =>
    count > 0 ? t('desktopPet.services.times', { count }) : t('desktopPet.services.notYet')
  const dayCompletionCount = (day: PetServiceHistoryDay) =>
    [day.focusMs > 0, day.waterCount > 0, day.fitnessCount > 0, day.codingReadyCount > 0].filter(
      Boolean,
    ).length
  const dayLabel = (day: PetServiceHistoryDay, index: number) =>
    index === historyDays.length - 1
      ? t('desktopPet.services.today')
      : day.date.slice(5).replace('-', '/')
  const changeInterval = (service: PetServiceIntervalId, valueMs: number, delta: number) => {
    const next = Math.min(
      SERVICE_INTERVAL_MINUTES_MAX,
      Math.max(SERVICE_INTERVAL_MINUTES_MIN, intervalMinutes(valueMs) + delta),
    )
    onIntervalChange(service, next)
  }
  const renderIntervalStepper = (service: PetServiceIntervalId, valueMs: number, label: string) => {
    const minutes = intervalMinutes(valueMs)
    return (
      <div className="desktop-pet-service-stepper">
        <span className="desktop-pet-service-stepper-label">{label}</span>
        <div>
          <PetPanelButton
            type="button"
            variant="ghost"
            size="xs"
            disabled={minutes <= SERVICE_INTERVAL_MINUTES_MIN}
            onClick={() => changeInterval(service, valueMs, -SERVICE_INTERVAL_STEP_MINUTES)}
            aria-label={t('desktopPet.services.decreaseInterval')}
          >
            -
          </PetPanelButton>
          <strong>{minutes}</strong>
          <PetPanelButton
            type="button"
            variant="ghost"
            size="xs"
            disabled={minutes >= SERVICE_INTERVAL_MINUTES_MAX}
            onClick={() => changeInterval(service, valueMs, SERVICE_INTERVAL_STEP_MINUTES)}
            aria-label={t('desktopPet.services.increaseInterval')}
          >
            +
          </PetPanelButton>
        </div>
      </div>
    )
  }
  const renderTimerTile = ({
    Icon,
    title,
    meta,
    interval,
    active,
    due,
    primaryLabel,
    onPrimary,
  }: {
    Icon: LucideIcon
    title: string
    meta: string
    interval?: { service: PetServiceIntervalId; valueMs: number; label: string }
    active: boolean
    due?: boolean
    primaryLabel: string
    onPrimary: () => void
  }) => {
    return (
      <PetPanelCard
        className={['desktop-pet-timer-tile', active ? 'active' : '', due ? 'attention' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="desktop-pet-timer-tile-head">
          <span className="desktop-pet-timer-icon" aria-hidden="true">
            <Icon size={16} />
          </span>
          <span className="desktop-pet-timer-copy">
            <strong>{title}</strong>
            <small>{meta}</small>
          </span>
          {due ? (
            <i className="desktop-pet-timer-dot" aria-label={t('desktopPet.services.reminded')} />
          ) : null}
        </div>
        <div className="desktop-pet-timer-controls">
          {interval
            ? renderIntervalStepper(interval.service, interval.valueMs, interval.label)
            : null}
          <PetPanelButton
            type="button"
            size="sm"
            variant="primary"
            className="desktop-pet-timer-action"
            onClick={onPrimary}
          >
            <span>{primaryLabel}</span>
          </PetPanelButton>
        </div>
      </PetPanelCard>
    )
  }

  return (
    <div className="desktop-pet-panel-body desktop-pet-services">
      <PetPanelCard
        className="desktop-pet-service-action-board"
        aria-label={t('desktopPet.services.actionTitle')}
      >
        <div className="desktop-pet-service-section-heading">
          <strong>{t('desktopPet.services.actionTitle')}</strong>
          <small>{t('desktopPet.services.actionSubtitle')}</small>
        </div>
        <div className="desktop-pet-timer-grid">
          {renderTimerTile({
            Icon: Timer,
            title: t('desktopPet.services.focus'),
            meta: services.focus
              ? t('desktopPet.services.focusRemaining', {
                  time: formatDuration(focusRemaining),
                })
              : t('desktopPet.services.focusIdleShort'),
            interval: {
              service: 'focus',
              valueMs: focusDurationMs,
              label: t('desktopPet.services.durationLabel'),
            },
            active: services.focus,
            primaryLabel: services.focus
              ? t('desktopPet.services.stop')
              : t('desktopPet.services.start'),
            onPrimary: services.focus
              ? () => onToggle('focus')
              : () => onFocusStart(intervalMinutes(focusDurationMs)),
          })}
          {renderTimerTile({
            Icon: Waves,
            title: t('desktopPet.services.water'),
            meta: services.water
              ? waterDue
                ? t('desktopPet.services.reminded')
                : t('desktopPet.services.waterNext', { time: formatDuration(waterRemaining) })
              : t('desktopPet.services.intervalShort', {
                  time: formatDuration(services.waterIntervalMs),
                }),
            interval: {
              service: 'water',
              valueMs: services.waterIntervalMs,
              label: t('desktopPet.services.intervalLabel'),
            },
            active: services.water,
            due: waterDue,
            primaryLabel: services.water
              ? waterDue
                ? t('desktopPet.services.done')
                : t('desktopPet.services.stop')
              : t('desktopPet.services.enableReminder'),
            onPrimary: services.water
              ? waterDue
                ? () => onAcknowledge('water')
                : () => onToggle('water')
              : () => onToggle('water'),
          })}
          {renderTimerTile({
            Icon: Dumbbell,
            title: t('desktopPet.services.fitness'),
            meta: services.fitness
              ? fitnessDue
                ? t('desktopPet.services.reminded')
                : t('desktopPet.services.fitnessNext', {
                    time: formatDuration(fitnessRemaining),
                  })
              : t('desktopPet.services.intervalShort', {
                  time: formatDuration(services.fitnessIntervalMs),
                }),
            interval: {
              service: 'fitness',
              valueMs: services.fitnessIntervalMs,
              label: t('desktopPet.services.intervalLabel'),
            },
            active: services.fitness,
            due: fitnessDue,
            primaryLabel: services.fitness
              ? fitnessDue
                ? t('desktopPet.services.done')
                : t('desktopPet.services.stop')
              : t('desktopPet.services.start'),
            onPrimary: services.fitness
              ? fitnessDue
                ? () => onAcknowledge('fitness')
                : () => onToggle('fitness')
              : () => onToggle('fitness'),
          })}
          <PetPanelCard
            className={
              services.coding ? 'desktop-pet-runtime-tile active' : 'desktop-pet-runtime-tile'
            }
          >
            <div className="desktop-pet-timer-tile-head">
              <span className="desktop-pet-timer-icon" aria-hidden="true">
                <Code2 size={16} />
              </span>
              <span className="desktop-pet-timer-copy">
                <strong>{t('desktopPet.services.coding')}</strong>
                <small>
                  {services.coding
                    ? t('desktopPet.services.runtimeWatching')
                    : t('desktopPet.services.runtimeIdleShort')}
                </small>
              </span>
            </div>
            <PetPanelButton
              type="button"
              size="sm"
              variant={services.coding ? 'warm' : 'primary'}
              className="desktop-pet-runtime-action"
              onClick={() => onToggle('coding')}
            >
              <span>
                {services.coding ? t('desktopPet.services.stop') : t('desktopPet.services.start')}
              </span>
            </PetPanelButton>
          </PetPanelCard>
        </div>
      </PetPanelCard>

      <PetPanelCard
        className="desktop-pet-service-history"
        aria-label={t('desktopPet.services.historyTitle')}
      >
        <div className="desktop-pet-service-section-heading">
          <strong>{t('desktopPet.services.historyTitle')}</strong>
          <small>{t('desktopPet.services.historySubtitle')}</small>
        </div>
        <div className="desktop-pet-service-today-grid">
          <span className={todayHistory.focusMs > 0 ? 'done' : ''}>
            <Timer size={13} />
            <small>{t('desktopPet.services.historyFocus')}</small>
            <strong>
              {todayHistory.focusMs > 0
                ? formatDuration(todayHistory.focusMs)
                : t('desktopPet.services.notYet')}
            </strong>
          </span>
          <span className={todayHistory.waterCount > 0 ? 'done' : ''}>
            <Waves size={13} />
            <small>{t('desktopPet.services.historyWater')}</small>
            <strong>{countMetric(todayHistory.waterCount)}</strong>
          </span>
          <span className={todayHistory.fitnessCount > 0 ? 'done' : ''}>
            <Dumbbell size={13} />
            <small>{t('desktopPet.services.historyFitness')}</small>
            <strong>{countMetric(todayHistory.fitnessCount)}</strong>
          </span>
          <span className={todayHistory.codingReadyCount > 0 ? 'done' : ''}>
            <Code2 size={13} />
            <small>{t('desktopPet.services.historyCoding')}</small>
            <strong>{countMetric(todayHistory.codingReadyCount)}</strong>
          </span>
        </div>
        <div className="desktop-pet-service-week-grid">
          {historyDays.map((day, index) => {
            const completed = dayCompletionCount(day)
            return (
              <PetPanelCard
                key={day.date}
                className={
                  completed > 0 ? 'desktop-pet-service-day done' : 'desktop-pet-service-day'
                }
              >
                <time dateTime={day.date}>{dayLabel(day, index)}</time>
                <strong>
                  {completed > 0
                    ? t('desktopPet.services.dayCompleted', { count: completed })
                    : t('desktopPet.services.dayEmpty')}
                </strong>
                <div>
                  <span className={day.focusMs > 0 ? 'done' : ''}>
                    <Timer size={11} />
                    {day.focusMs > 0
                      ? formatDuration(day.focusMs)
                      : t('desktopPet.services.notYet')}
                  </span>
                  <span className={day.waterCount > 0 ? 'done' : ''}>
                    <Waves size={11} />
                    {day.waterCount > 0 ? day.waterCount : '-'}
                  </span>
                  <span className={day.fitnessCount > 0 ? 'done' : ''}>
                    <Dumbbell size={11} />
                    {day.fitnessCount > 0 ? day.fitnessCount : '-'}
                  </span>
                </div>
              </PetPanelCard>
            )
          })}
        </div>
        {!hasHistory ? (
          <p className="desktop-pet-service-history-empty">
            {t('desktopPet.services.historyEmpty')}
          </p>
        ) : null}
      </PetPanelCard>
    </div>
  )
}
