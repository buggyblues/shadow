import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { Plus, Volume2, VolumeX, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ACTION_BALANCE,
  ADVENTURE_MAPS,
  DAILY_ACTION_LIMITS,
  DAILY_TASKS,
  EXP_TO_NEXT,
  FURNITURE_UPGRADES,
  ROUTES,
  routeLabel,
  STAT_KEYS,
} from '../game-balance.js'
import type {
  CatActionLog,
  CatAsset,
  CatCareAction,
  CatReward,
  CatRoute,
  CatStatKey,
  DailyLimitedAction,
  PetCat,
} from '../types.js'
import {
  adoptCat,
  care,
  getCat,
  leaderboard,
  listAssets,
  listCats,
  playMinigame,
  runAdventure,
  trainCat,
  upgradeFurniture,
} from './api.js'
import './styles.css'

const queryClient = new QueryClient()

const statLabels: Record<CatStatKey, string> = {
  str: '力量',
  agi: '敏捷',
  int: '智慧',
  cha: '魅力',
  luk: '幸运',
}

const stageLabels: Record<PetCat['stage'], string> = {
  kitten: '幼年期',
  growth: '成长期',
  mature: '成熟期',
}

const spriteFrames = {
  pet: 6,
  feed: 5,
  play: 6,
  clean: 7,
  rest: 8,
  train: 9,
  minigame: 10,
  adventure: 11,
  coin: 12,
  star: 13,
  heart: 14,
  level: 15,
  reward: 16,
} as const

type GameActionResult = { cat: PetCat; log: CatActionLog }
type SfxKind = 'care' | 'train' | 'reward' | 'adventure' | 'error'

function App() {
  const [selectedCatId, setSelectedCatId] = useState('cat_demo')
  const [adoptOpen, setAdoptOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [toast, setToast] = useState<{ title: string; detail?: string; kind?: 'error' | 'ok' }>()
  const playSfx = useSfx(soundOn)
  const cats = useQuery({ queryKey: ['cats'], queryFn: listCats })
  const selected = useQuery({
    queryKey: ['cat', selectedCatId],
    queryFn: () => getCat(selectedCatId),
    enabled: !!selectedCatId,
  })
  const leaders = useQuery({
    queryKey: ['cats', 'leaderboard'],
    queryFn: () => leaderboard({ limit: 8 }),
  })

  const selectedCat = selected.data?.cat

  function refreshAll() {
    void cats.refetch()
    void selected.refetch()
    void leaders.refetch()
  }

  const action = useMutation<
    GameActionResult,
    Error,
    { title: string; sfx: SfxKind; run: () => Promise<GameActionResult> }
  >({
    mutationFn: (input) => input.run(),
    onSuccess: (payload, input) => {
      playSfx(payload.log.reward?.levelUps ? 'reward' : input.sfx)
      setToast({
        title: input.title,
        detail: rewardSummary(payload.log.reward),
        kind: 'ok',
      })
      refreshAll()
    },
    onError: (error) => {
      playSfx('error')
      setToast({ title: gameError(error), kind: 'error' })
    },
  })

  useEffect(() => {
    const first = cats.data?.cats[0]
    if (!selectedCatId && first) setSelectedCatId(first.id)
    if (selectedCatId && cats.data && !cats.data.cats.some((cat) => cat.id === selectedCatId)) {
      setSelectedCatId(first?.id ?? '')
    }
  }, [cats.data, selectedCatId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(undefined), toast.kind === 'error' ? 3200 : 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <main className="gameShell">
      <section className="gameFrame">
        <header className="topHud">
          <div className="brandLockup">
            <SpriteIcon frame={spriteFrames.star} />
            <div>
              <strong>StarPet Inn</strong>
              <span>3 分钟照顾 + 训练 + 小游戏，5 分钟后进入探险</span>
            </div>
          </div>
          <div className="hudStats" aria-label="Current pet resources">
            <HudPill frame={spriteFrames.coin} label="金币" value={selectedCat?.coins ?? 0} />
            <HudPill frame={spriteFrames.heart} label="亲密" value={selectedCat?.bond ?? 0} />
            <HudPill frame={spriteFrames.reward} label="星材" value={selectedCat?.materials ?? 0} />
          </div>
          <div className="hudActions">
            <button
              className="roundButton"
              type="button"
              aria-label={soundOn ? '关闭音效' : '开启音效'}
              onClick={() => setSoundOn((value) => !value)}
            >
              {soundOn ? <Volume2 /> : <VolumeX />}
            </button>
            <button className="primaryCommand" type="button" onClick={() => setAdoptOpen(true)}>
              <Plus />
              入住
            </button>
          </div>
        </header>

        <div className="gameBoard">
          <Roster
            cats={cats.data?.cats ?? []}
            selectedCatId={selectedCatId}
            onSelect={setSelectedCatId}
          />

          <section className="stagePane">
            {selected.data ? (
              <PetStage
                asset={selected.data.asset}
                cat={selected.data.cat}
                busy={action.isPending}
                toast={toast}
              />
            ) : (
              <div className="emptyStage">选择一只星宠开始今日循环</div>
            )}
          </section>

          <aside className="questDock">
            {selectedCat ? <TaskBoard cat={selectedCat} /> : null}
            <Leaderboard leaders={leaders.data?.leaderboard ?? []} />
          </aside>
        </div>

        {selected.data ? (
          <ActionDeck
            data={selected.data}
            busy={action.isPending}
            onCare={(careAction) =>
              action.mutate({
                title: careTitle(careAction),
                sfx: careAction === 'rest' ? 'reward' : 'care',
                run: () => care(`cats.${careAction}`, selected.data.cat.id),
              })
            }
            onTrain={(route) =>
              action.mutate({
                title: `${routeLabel(route)}训练完成`,
                sfx: 'train',
                run: () => trainCat(selected.data.cat.id, route),
              })
            }
            onMinigame={() =>
              action.mutate({
                title: '星铃小游戏结算',
                sfx: 'reward',
                run: () => playMinigame(selected.data.cat.id),
              })
            }
            onAdventure={(mapId) =>
              action.mutate({
                title: '探险返回',
                sfx: 'adventure',
                run: () => runAdventure(selected.data.cat.id, mapId),
              })
            }
            onFurniture={() =>
              action.mutate({
                title: '家具升级',
                sfx: 'reward',
                run: () => upgradeFurniture(selected.data.cat.id),
              })
            }
          />
        ) : null}
      </section>

      {adoptOpen ? (
        <AdoptModal
          onClose={() => setAdoptOpen(false)}
          onSaved={(catId) => {
            setAdoptOpen(false)
            setSelectedCatId(catId)
            refreshAll()
          }}
        />
      ) : null}
    </main>
  )
}

function Roster(props: {
  cats: Array<PetCat & { asset: CatAsset }>
  selectedCatId: string
  onSelect: (id: string) => void
}) {
  return (
    <aside className="rosterDock" aria-label="StarPet roster">
      <span className="dockTitle">旅社</span>
      <div className="rosterList">
        {props.cats.map((cat) => (
          <button
            className={cat.id === props.selectedCatId ? 'rosterPet isActive' : 'rosterPet'}
            type="button"
            key={cat.id}
            onClick={() => props.onSelect(cat.id)}
          >
            <img src={cat.asset.imageUrl} alt="" />
            <span>
              <strong>{cat.name}</strong>
              <small>
                Lv.{cat.level} · {routeLabel(cat.route)}
              </small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}

function PetStage(props: {
  cat: PetCat
  asset: CatAsset
  busy: boolean
  toast?: { title: string; detail?: string; kind?: 'error' | 'ok' }
}) {
  const expNeed = EXP_TO_NEXT[props.cat.level] ?? EXP_TO_NEXT.at(-1) ?? 2510
  return (
    <>
      <div className="stageTop">
        <div className="petNameplate">
          <span>{props.asset.personality}</span>
          <strong>{props.cat.name}</strong>
        </div>
        <div className="levelBadge">
          <b>Lv.{props.cat.level}</b>
          <span>{stageLabels[props.cat.stage]}</span>
        </div>
      </div>

      <div className={props.busy ? 'petSpot isActing' : 'petSpot'}>
        <img className="petShadow" src="/game/starpet-atlas/starpet-13.png" alt="" />
        <img className="petImage" src={props.asset.imageUrl} alt={props.cat.name} />
        {props.busy ? (
          <img className="actionFx" src="/game/starpet-atlas/starpet-15.png" alt="" />
        ) : null}
      </div>

      <div className="stageBottom">
        <NeedMeters cat={props.cat} />
        <div className="xpStrip">
          <span>EXP</span>
          <i>
            <em style={{ width: `${Math.min(100, (props.cat.exp / expNeed) * 100)}%` }} />
          </i>
          <b>
            {props.cat.exp}/{expNeed}
          </b>
        </div>
      </div>

      {props.toast ? (
        <div className={props.toast.kind === 'error' ? 'rewardToast isError' : 'rewardToast'}>
          <strong>{props.toast.title}</strong>
          {props.toast.detail ? <span>{props.toast.detail}</span> : null}
        </div>
      ) : null}
    </>
  )
}

function NeedMeters({ cat }: { cat: PetCat }) {
  return (
    <div className="needMeters">
      <Meter label="饥饿" value={cat.hunger} invert />
      <Meter label="心情" value={cat.happiness} />
      <Meter label="体力" value={cat.energy} />
      <Meter label="清洁" value={cat.cleanliness} />
      <Meter label="健康" value={cat.health} />
    </div>
  )
}

function dailyRemaining(cat: PetCat, action: DailyLimitedAction) {
  const limit = DAILY_ACTION_LIMITS[action]
  return Math.max(0, limit - (cat.dailyActionCounts[action] ?? 0))
}

function dailyLimitText(cat: PetCat, action: DailyLimitedAction) {
  return `${dailyRemaining(cat, action)}/${DAILY_ACTION_LIMITS[action]}`
}

function ActionDeck(props: {
  data: Awaited<ReturnType<typeof getCat>>
  busy: boolean
  onCare: (action: CatCareAction) => void
  onTrain: (route: CatRoute) => void
  onMinigame: () => void
  onAdventure: (mapId: number) => void
  onFurniture: () => void
}) {
  const { cat, logs } = props.data
  const nextFurniture = FURNITURE_UPGRADES.find((item) => item.level === cat.furnitureLevel + 1)
  const canPay = (coins: number) => cat.coins >= coins
  const canSpendEnergy = (energy: number) => cat.energy >= energy
  const canAct = (action: DailyLimitedAction) => dailyRemaining(cat, action) > 0
  return (
    <section className="actionDeck">
      <div className="controlPanel quickPanel">
        <span className="panelRibbon">照顾</span>
        <div className="buttonGrid five">
          <GameButton
            frame={spriteFrames.feed}
            title="喂食"
            meta={`60 金币 · ${dailyLimitText(cat, 'feed')}`}
            disabled={props.busy || !canPay(ACTION_BALANCE.feed.costCoin) || !canAct('feed')}
            onClick={() => props.onCare('feed')}
          />
          <GameButton
            frame={spriteFrames.pet}
            title="抚摸"
            meta={`+亲密 · ${dailyLimitText(cat, 'pet')}`}
            disabled={props.busy || !canAct('pet')}
            onClick={() => props.onCare('pet')}
          />
          <GameButton
            frame={spriteFrames.clean}
            title="清洁"
            meta={`45 金币 · ${dailyLimitText(cat, 'clean')}`}
            disabled={props.busy || !canPay(ACTION_BALANCE.clean.costCoin) || !canAct('clean')}
            onClick={() => props.onCare('clean')}
          />
          <GameButton
            frame={spriteFrames.rest}
            title="休息"
            meta={`+体力 · ${dailyLimitText(cat, 'rest')}`}
            disabled={props.busy || !canAct('rest')}
            onClick={() => props.onCare('rest')}
          />
          <GameButton
            frame={spriteFrames.play}
            title="玩耍"
            meta={`10 体力 · ${dailyLimitText(cat, 'play')}`}
            disabled={
              props.busy || !canSpendEnergy(ACTION_BALANCE.play.costEnergy) || !canAct('play')
            }
            onClick={() => props.onCare('play')}
          />
        </div>
      </div>

      <div className="controlPanel trainPanel">
        <span className="panelRibbon">今日路线</span>
        <div className="routeGrid">
          {ROUTES.map((route) => (
            <button
              className={route.id === cat.route ? 'routeButton isActive' : 'routeButton'}
              type="button"
              key={route.id}
              disabled={
                props.busy ||
                !canPay(ACTION_BALANCE.train.costCoin) ||
                !canSpendEnergy(ACTION_BALANCE.train.costEnergy) ||
                !canAct('train')
              }
              style={{ '--route-color': route.color } as CSSProperties}
              onClick={() => props.onTrain(route.id)}
            >
              <b>{route.shortLabel}</b>
              <span>{route.label}</span>
            </button>
          ))}
        </div>
        <StatBoard cat={cat} />
      </div>

      <div className="controlPanel mapPanel">
        <span className="panelRibbon">游玩</span>
        <div className="playCalls">
          <GameButton
            frame={spriteFrames.minigame}
            title="星铃小游戏"
            meta={`5 体力 · B/A/S · ${dailyLimitText(cat, 'minigame')}`}
            disabled={
              props.busy ||
              !canSpendEnergy(ACTION_BALANCE.minigame.costEnergy) ||
              !canAct('minigame')
            }
            onClick={props.onMinigame}
          />
          <button
            className="upgradeButton"
            type="button"
            disabled={
              props.busy ||
              !nextFurniture ||
              !canPay(nextFurniture.cost) ||
              !canAct('upgrade_furniture')
            }
            onClick={props.onFurniture}
          >
            <SpriteIcon frame={spriteFrames.star} />
            <span>
              <strong>{nextFurniture ? nextFurniture.name : '家具满级'}</strong>
              <small>
                {nextFurniture
                  ? `${nextFurniture.cost} 金币 · ${dailyLimitText(cat, 'upgrade_furniture')}`
                  : '已达 25% 加成上限'}
              </small>
            </span>
          </button>
        </div>
        <div className="mapList">
          {ADVENTURE_MAPS.map((map) => {
            const locked = cat.level < map.unlockLevel
            return (
              <button
                className={locked ? 'mapButton isLocked' : 'mapButton'}
                type="button"
                key={map.id}
                disabled={
                  props.busy || locked || !canSpendEnergy(map.costEnergy) || !canAct('adventure')
                }
                onClick={() => props.onAdventure(map.id)}
              >
                <SpriteIcon frame={spriteFrames.adventure} />
                <span>
                  <strong>{map.name}</strong>
                  <small>
                    Lv.{map.unlockLevel} · {map.costEnergy} 体力 ·{' '}
                    {map.recommendAttrs.map((key) => statLabels[key]).join('/')}
                  </small>
                </span>
                <b>{locked ? 'LOCK' : `${map.baseCoin}G`}</b>
              </button>
            )
          })}
        </div>
      </div>

      <LogPanel logs={logs} />
    </section>
  )
}

function StatBoard({ cat }: { cat: PetCat }) {
  const maxStat = Math.max(32, ...STAT_KEYS.map((key) => cat.stats[key]))
  return (
    <div className="statBoard">
      {STAT_KEYS.map((key) => (
        <div className="statLine" key={key}>
          <span>{statLabels[key]}</span>
          <i>
            <em style={{ width: `${Math.min(100, (cat.stats[key] / maxStat) * 100)}%` }} />
          </i>
          <b>{cat.stats[key]}</b>
        </div>
      ))}
    </div>
  )
}

function TaskBoard({ cat }: { cat: PetCat }) {
  const nextTask = DAILY_TASKS.find((task) => !cat.dailyClaimedTaskIds.includes(task.id))
  return (
    <section className="questPanel">
      <div className="questTitle">
        <SpriteIcon frame={spriteFrames.level} />
        <strong>今日任务</strong>
        <span>{cat.dailyActions}/10</span>
      </div>
      <div className="taskTrack">
        {DAILY_TASKS.map((task) => {
          const done = cat.dailyClaimedTaskIds.includes(task.id)
          const active = nextTask?.id === task.id
          return (
            <div
              className={done ? 'taskRow isDone' : active ? 'taskRow isActive' : 'taskRow'}
              key={task.id}
            >
              <i>
                <em
                  style={{
                    width: `${Math.min(100, (cat.dailyActions / task.requiredActions) * 100)}%`,
                  }}
                />
              </i>
              <span>{task.label}</span>
              <b>{done ? 'OK' : `${task.requiredActions}`}</b>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Leaderboard({
  leaders,
}: {
  leaders: Awaited<ReturnType<typeof leaderboard>>['leaderboard']
}) {
  return (
    <section className="questPanel leaderPanel">
      <div className="questTitle">
        <SpriteIcon frame={spriteFrames.reward} />
        <strong>排行</strong>
      </div>
      <div className="leaderList">
        {leaders.map((entry, index) => (
          <div className="leaderRow" key={entry.catId}>
            <span>{index + 1}</span>
            <img src={entry.imageUrl} alt="" />
            <div>
              <strong>{entry.ownerName}</strong>
              <small>
                {entry.name} · Lv.{entry.level} · {routeLabel(entry.route)}
              </small>
            </div>
            <b>{entry.score}</b>
          </div>
        ))}
      </div>
    </section>
  )
}

function LogPanel({ logs }: { logs: CatActionLog[] }) {
  return (
    <section className="controlPanel logPanel">
      <span className="panelRibbon">回放</span>
      <div className="logList">
        {logs.slice(0, 6).map((log) => (
          <div className="logRow" key={log.id}>
            <SpriteIcon
              frame={log.action === 'adventure' ? spriteFrames.adventure : spriteFrames.star}
            />
            <span>
              <strong>{actionLabel(log.action)}</strong>
              <small>{log.note ?? new Date(log.createdAt).toLocaleTimeString()}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Meter({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const display = Math.max(0, Math.min(100, value))
  const fill = invert ? 100 - display : display
  return (
    <div className="meter">
      <span>{label}</span>
      <i>
        <em style={{ width: `${fill}%` }} />
      </i>
      <b>{display}</b>
    </div>
  )
}

function HudPill(props: { frame: number; label: string; value: number }) {
  return (
    <div className="hudPill">
      <SpriteIcon frame={props.frame} />
      <span>{props.label}</span>
      <b>{props.value}</b>
    </div>
  )
}

function GameButton(props: {
  frame: number
  title: string
  meta: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button className="gameButton" type="button" disabled={props.disabled} onClick={props.onClick}>
      <SpriteIcon frame={props.frame} />
      <span>
        <strong>{props.title}</strong>
        <small>{props.meta}</small>
      </span>
    </button>
  )
}

function SpriteIcon({ frame }: { frame: number }) {
  return <img className="spriteIcon" src={`/game/starpet-atlas/starpet-${frame}.png`} alt="" />
}

function AdoptModal(props: { onClose: () => void; onSaved: (catId: string) => void }) {
  const assets = useQuery({ queryKey: ['cat-assets'], queryFn: listAssets })
  const [assetId, setAssetId] = useState('')
  const [name, setName] = useState('')
  const selectedAsset =
    assets.data?.assets.find((asset) => asset.id === assetId) ?? assets.data?.assets[0]
  const mutation = useMutation({
    mutationFn: () =>
      adoptCat({ name: name.trim() || selectedAsset?.name, assetId: selectedAsset?.id }),
    onSuccess: (payload) => props.onSaved(payload.cat.id),
  })
  useEffect(() => {
    if (!assetId && assets.data?.assets[0]) setAssetId(assets.data.assets[0].id)
  }, [assetId, assets.data])
  return (
    <div className="modalBackdrop">
      <div className="modalPanel" role="dialog" aria-modal="true">
        <button
          className="roundButton closeButton"
          type="button"
          aria-label="关闭"
          onClick={props.onClose}
        >
          <X />
        </button>
        <div className="modalTitle">
          <SpriteIcon frame={spriteFrames.pet} />
          <div>
            <strong>星宠入住</strong>
            <span>初始 600 金币，从 3 分钟循环开始</span>
          </div>
        </div>
        <label>
          名字
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={selectedAsset?.name}
          />
        </label>
        <div className="assetGrid">
          {(assets.data?.assets ?? []).map((asset: CatAsset) => (
            <button
              className={asset.id === selectedAsset?.id ? 'assetOption isActive' : 'assetOption'}
              type="button"
              key={asset.id}
              onClick={() => setAssetId(asset.id)}
            >
              <img src={asset.imageUrl} alt="" />
              <span>{asset.name}</span>
            </button>
          ))}
        </div>
        {mutation.error ? <div className="inlineError">{gameError(mutation.error)}</div> : null}
        <button
          className="primaryCommand fullWidth"
          type="button"
          disabled={!selectedAsset || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Plus />
          入住旅社
        </button>
      </div>
    </div>
  )
}

function careTitle(action: CatCareAction) {
  const labels: Record<CatCareAction, string> = {
    feed: '喂食完成',
    pet: '抚摸完成',
    play: '玩耍完成',
    clean: '清洁完成',
    rest: '休息完成',
  }
  return labels[action]
}

function actionLabel(action: CatActionLog['action']) {
  const labels: Record<CatActionLog['action'], string> = {
    feed: '喂食',
    pet: '抚摸',
    play: '玩耍',
    clean: '清洁',
    rest: '休息',
    train: '训练',
    minigame: '小游戏',
    adventure: '探险',
    upgrade_furniture: '家具',
    adopt: '入住',
  }
  return labels[action]
}

function rewardSummary(reward?: CatReward) {
  if (!reward) return undefined
  const parts: string[] = []
  if (reward.rank) parts.push(`${reward.rank} 评价`)
  if (reward.success === false) parts.push('探险擦边通过')
  if (reward.coins) parts.push(`+${reward.coins} 金币`)
  if (reward.exp) parts.push(`+${reward.exp} EXP`)
  if (reward.bond) parts.push(`+${reward.bond} 亲密`)
  if (reward.materials) parts.push(`+${reward.materials} 星材`)
  if (reward.cores) parts.push('路线核心 +1')
  if (reward.levelUps) parts.push(`升级 +${reward.levelUps}`)
  if (reward.taskRewards?.length) parts.push(`任务奖励 x${reward.taskRewards.length}`)
  return parts.join(' · ') || '今日行动 +1'
}

function gameError(error: Error) {
  if (error.message.includes('not_enough_coins')) return '金币不够，先玩小游戏或完成今日任务'
  if (error.message.includes('not_enough_energy')) return '体力不足，先休息再行动'
  if (error.message.includes('daily_limit_reached')) return '今日次数已用完，明天再继续'
  if (error.message.includes('map_locked')) return '地图等级未解锁'
  if (error.message.includes('furniture_maxed')) return '家具已经满级'
  return error.message || '行动失败'
}

function useSfx(soundOn: boolean) {
  const contextRef = useRef<AudioContext | null>(null)
  return useMemo(
    () => (kind: SfxKind) => {
      if (!soundOn) return
      const AudioContextCtor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) return
      const context = contextRef.current ?? new AudioContextCtor()
      contextRef.current = context
      const base = { care: 520, train: 330, reward: 760, adventure: 430, error: 160 }[kind]
      const nowTime = context.currentTime
      const notes = kind === 'reward' ? [base, base * 1.25, base * 1.5] : [base, base * 1.12]
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = kind === 'error' ? 'sawtooth' : 'triangle'
        oscillator.frequency.setValueAtTime(frequency, nowTime + index * 0.06)
        gain.gain.setValueAtTime(0.0001, nowTime + index * 0.06)
        gain.gain.exponentialRampToValueAtTime(0.08, nowTime + index * 0.06 + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, nowTime + index * 0.06 + 0.14)
        oscillator.connect(gain).connect(context.destination)
        oscillator.start(nowTime + index * 0.06)
        oscillator.stop(nowTime + index * 0.06 + 0.16)
      })
    },
    [soundOn],
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)
