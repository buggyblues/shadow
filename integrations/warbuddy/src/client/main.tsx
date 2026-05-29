import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  Bot,
  Gamepad2,
  Pause,
  Play,
  RefreshCw,
  Save,
  Send,
  Shield,
  SkipBack,
  Swords,
  Trophy,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type {
  BattleFrameState,
  BattleReplay,
  Direction,
  RuntimeEngineerState,
  RuntimeTankState,
  SkillType,
} from '../types.js'
import {
  type BuddyInbox,
  briefBuddies,
  challenge,
  getMatch,
  inboxes,
  leaderboard,
  listMatches,
  listTanks,
  type MatchSummary,
  saveTankCode,
  simulate,
  type TankSummary,
} from './api.js'
import {
  createHumanDuel,
  type DuelAction,
  decideAgentActions,
  type HumanDuelState,
  heldKeysToDuelActions,
  keyToDuelAction,
  stepHumanDuel,
} from './human-duel.js'
import './styles.css'

const queryClient = new QueryClient()

const STARTER_CODE = `function aligned(a, b) {
  return a && b && (a[0] === b[0] || a[1] === b[1]);
}

var DIRS = ["up", "right", "down", "left"];
var DELTAS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

function open(game, position) {
  var column = game.map[position[0]];
  var tile = column && column[position[1]];
  return tile === "." || tile === "o";
}

function ahead(me) {
  var delta = DELTAS[me.tank.direction];
  return [me.tank.position[0] + delta[0], me.tank.position[1] + delta[1]];
}

function turnTo(me, direction) {
  var current = DIRS.indexOf(me.tank.direction);
  var wanted = DIRS.indexOf(direction);
  var clockwise = (wanted - current + 4) % 4;
  me.turn(clockwise === 3 ? "left" : "right");
}

function directionTo(me, target) {
  var dx = target[0] - me.tank.position[0];
  var dy = target[1] - me.tank.position[1];
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  if (dy !== 0) return dy > 0 ? "down" : "up";
  if (dx !== 0) return dx > 0 ? "right" : "left";
  return me.tank.direction;
}

function advance(me, game) {
  if (open(game, ahead(me))) me.go();
  else me.turn("right");
}

function turnToward(me, target, game) {
  if (!target) return me.turn("right");
  var direction = directionTo(me, target);
  if (direction === me.tank.direction) advance(me, game);
  else turnTo(me, direction);
}

function onIdle(me, enemy, game) {
  if (enemy.tank && aligned(me.tank.position, enemy.tank.position) && !enemy.status.shielded) {
    me.fire();
    return;
  }
  if (me.skill.remainingCooldownFrames === 0 && me.skill.type === "shield" && enemy.bullet) {
    me.shield();
    return;
  }
  if (game.star) {
    turnToward(me, game.star, game);
    return;
  }
  advance(me, game);
}`

const SKILLS: SkillType[] = [
  'shield',
  'freeze',
  'stun',
  'overload',
  'cloak',
  'poison',
  'teleport',
  'boost',
]

type BattleSound = 'shoot' | 'dirt' | 'star' | 'skill' | 'crash' | 'settled'

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

let battleAudioContext: AudioContext | null = null
let engineHum: {
  base: OscillatorNode
  overtone: OscillatorNode
  gain: GainNode
} | null = null

function unlockBattleAudio() {
  const context = ensureBattleAudio()
  if (context?.state === 'suspended') void context.resume()
}

function ensureBattleAudio() {
  if (typeof window === 'undefined') return null
  if (battleAudioContext) return battleAudioContext
  const audioWindow = window as AudioWindow
  const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext
  if (!AudioContextConstructor) return null
  battleAudioContext = new AudioContextConstructor()
  return battleAudioContext
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delay = 0,
) {
  const context = ensureBattleAudio()
  if (!context) return
  if (context.state === 'suspended') void context.resume()
  const start = context.currentTime + delay
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.03)
}

function playBattleSound(sound: BattleSound) {
  switch (sound) {
    case 'shoot':
      playTone(122, 0.07, 'square', 0.055)
      playTone(72, 0.1, 'sawtooth', 0.035, 0.018)
      break
    case 'dirt':
      playTone(150, 0.07, 'square', 0.04)
      playTone(92, 0.12, 'sawtooth', 0.032, 0.025)
      break
    case 'star':
      playTone(520, 0.08, 'triangle', 0.045)
      playTone(780, 0.11, 'triangle', 0.038, 0.055)
      break
    case 'skill':
      playTone(260, 0.1, 'triangle', 0.04)
      playTone(390, 0.12, 'square', 0.03, 0.04)
      break
    case 'crash':
      playTone(90, 0.16, 'sawtooth', 0.06)
      playTone(48, 0.2, 'square', 0.045, 0.04)
      break
    case 'settled':
      playTone(330, 0.09, 'triangle', 0.04)
      playTone(440, 0.12, 'triangle', 0.035, 0.08)
      break
  }
}

function setEngineHum(active: boolean) {
  if (!active && !engineHum) return
  const context = ensureBattleAudio()
  if (!context) return
  if (context.state === 'suspended') void context.resume()
  if (!engineHum) {
    const base = context.createOscillator()
    const overtone = context.createOscillator()
    const gain = context.createGain()
    base.type = 'triangle'
    overtone.type = 'sine'
    base.frequency.value = 52
    overtone.frequency.value = 104
    gain.gain.value = 0.0001
    base.connect(gain)
    overtone.connect(gain)
    gain.connect(context.destination)
    base.start()
    overtone.start()
    engineHum = { base, overtone, gain }
  }
  const now = context.currentTime
  engineHum.base.frequency.setTargetAtTime(active ? 56 : 44, now, 0.2)
  engineHum.overtone.frequency.setTargetAtTime(active ? 112 : 88, now, 0.2)
  engineHum.gain.gain.cancelScheduledValues(now)
  engineHum.gain.gain.setValueAtTime(engineHum.gain.gain.value, now)
  engineHum.gain.gain.linearRampToValueAtTime(
    active ? 0.0075 : 0.0001,
    now + (active ? 0.16 : 0.08),
  )
}

function useBattleSounds(
  state: BattleFrameState | null,
  resultLabel: string,
  liveHumanDuel: boolean,
) {
  const previousRef = useRef<{
    bulletIds: Set<string>
    unitPositions: Array<[number, number]>
    dirtTiles: number
    starTotal: number
    crashed: number
    activeEffects: number
    resultLabel: string
  } | null>(null)

  useEffect(() => {
    if (!state) {
      setEngineHum(false)
      previousRef.current = null
      return
    }

    const bulletIds = new Set(state.bullets.map((bullet) => bullet.id))
    const unitPositions = liveHumanDuel
      ? state.tanks[0]
        ? [state.tanks[0].position]
        : []
      : state.tanks.map((tank) => tank.position)
    const dirtTiles = countTiles(state, 'm')
    const starTotal = state.tanks.reduce((sum, tank) => sum + tank.stars, 0)
    const crashed =
      state.tanks.filter((tank) => tank.crashed).length +
      (state.engineers ?? []).filter((engineer) => !engineer.alive).length
    const activeEffects = state.tanks.filter(
      (tank) =>
        tank.status.shielded ||
        tank.status.boosted ||
        tank.status.overloaded ||
        tank.status.frozen ||
        tank.status.stunned ||
        tank.status.poisoned,
    ).length
    const previous = previousRef.current

    if (previous) {
      const unitMoved = unitPositions.some((position, index) => {
        const previousPosition = previous.unitPositions[index]
        return previousPosition
          ? Math.hypot(position[0] - previousPosition[0], position[1] - previousPosition[1]) > 0.018
          : false
      })
      setEngineHum(unitMoved)
      if ([...bulletIds].some((id) => !previous.bulletIds.has(id))) playBattleSound('shoot')
      if (dirtTiles < previous.dirtTiles) playBattleSound('dirt')
      if (starTotal > previous.starTotal) playBattleSound('star')
      if (activeEffects > previous.activeEffects) playBattleSound('skill')
      if (crashed > previous.crashed) playBattleSound('crash')
      if (resultLabel !== previous.resultLabel && !resultLabel.includes('· Agent')) {
        playBattleSound('settled')
      }
    }

    previousRef.current = {
      bulletIds,
      unitPositions,
      dirtTiles,
      starTotal,
      crashed,
      activeEffects,
      resultLabel,
    }
  }, [state, resultLabel, liveHumanDuel])
}

function countTiles(state: BattleFrameState, tile: string) {
  return state.map.reduce(
    (sum, column) => sum + column.reduce((inner, value) => inner + (value === tile ? 1 : 0), 0),
    0,
  )
}

function App() {
  const [challengerId, setChallengerId] = useState('')
  const [defenderId, setDefenderId] = useState('')
  const [mapId, setMapId] = useState('random')
  const [replay, setReplay] = useState<BattleReplay | null>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [tankName, setTankName] = useState('')
  const [skillType, setSkillType] = useState<SkillType>('shield')
  const [code, setCode] = useState(STARTER_CODE)
  const [briefTargets, setBriefTargets] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [humanDuel, setHumanDuel] = useState<HumanDuelState | null>(null)
  const humanActionsRef = useRef<DuelAction[]>([])
  const pressedKeysRef = useRef(new Set<string>())
  const agentActionsRef = useRef<DuelAction[]>([])
  const agentThinkingRef = useRef(false)

  const tanksQuery = useQuery({ queryKey: ['tanks'], queryFn: () => listTanks({ limit: 100 }) })
  const matchesQuery = useQuery({
    queryKey: ['matches'],
    queryFn: () => listMatches({ limit: 24 }),
  })
  const leaderboardQuery = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => leaderboard({ sort: 'rating', limit: 12 }),
  })
  const inboxesQuery = useQuery({ queryKey: ['inboxes'], queryFn: inboxes })

  const tanks = tanksQuery.data?.tanks ?? []
  const maps = tanksQuery.data?.maps ?? []
  const matches = matchesQuery.data?.matches ?? []
  const boardState = replay?.frames[frame]?.state ?? replay?.frames[0]?.state ?? null
  const activeBoardState = humanDuel?.state ?? boardState
  const resultLabel = humanDuel
    ? duelResultLabel(humanDuel)
    : replay
      ? `${replay.summary.result.winner ?? 'Draw'} · ${replay.summary.result.reason}`
      : 'No winner yet'
  useBattleSounds(activeBoardState, resultLabel, Boolean(humanDuel))

  useEffect(() => {
    if (!tanks.length) return
    setChallengerId((current) => current || tanks[0]?.id || '')
    setDefenderId((current) => current || tanks.find((tank) => tank.id !== tanks[0]?.id)?.id || '')
  }, [tanks])

  useEffect(() => {
    if (!playing || !replay) return
    const timer = window.setInterval(() => {
      setFrame((current) => {
        const next = current + 1
        if (next >= replay.frames.length) {
          setPlaying(false)
          return current
        }
        return next
      })
    }, 180)
    return () => window.clearInterval(timer)
  }, [playing, replay])

  useEffect(() => {
    if (!humanDuel || humanDuel.status !== 'running') return
    const onKeyDown = (event: KeyboardEvent) => {
      const action = keyToDuelAction(event.key)
      if (!action) return
      event.preventDefault()
      unlockBattleAudio()
      if (action.type === 'move' || action.type === 'engineerMove')
        pressedKeysRef.current.add(event.key)
      else humanActionsRef.current.push(action)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeysRef.current.delete(event.key)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      pressedKeysRef.current.clear()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [humanDuel?.id, humanDuel?.status])

  useEffect(() => {
    if (!humanDuel || humanDuel.status !== 'running') return
    const timer = window.setInterval(() => {
      setHumanDuel((current) => {
        if (!current || current.status !== 'running') return current
        const heldActions = heldKeysToDuelActions(pressedKeysRef.current)
        const next = stepHumanDuel(
          current,
          [...heldActions, ...humanActionsRef.current.splice(0, 3)],
          agentActionsRef.current.splice(0, 3),
        )
        if (next.status === 'running' && !agentThinkingRef.current) {
          agentThinkingRef.current = true
          void decideAgentActions(next)
            .then((actions) => agentActionsRef.current.push(...actions))
            .finally(() => {
              agentThinkingRef.current = false
            })
        }
        return next
      })
    }, 50)
    return () => window.clearInterval(timer)
  }, [humanDuel?.id, humanDuel?.status])

  const saveMutation = useMutation({
    mutationFn: () =>
      saveTankCode({
        name: tankName || undefined,
        skillType,
        code,
        submittedBy: 'Shadow',
        notes: 'Published from the WarBuddy Arena UI.',
      }),
    onSuccess: (data) => {
      setNotice(`Published ${data.tank.name} v${data.tank.codeVersion}`)
      setChallengerId(data.tank.id)
      void queryClient.invalidateQueries({ queryKey: ['tanks'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const simulateMutation = useMutation({
    mutationFn: () =>
      simulate({
        challengerTankId: challengerId,
        defenderTankId: defenderId,
        candidateCode: code,
        candidateName: tankName || 'Candidate',
        candidateSkillType: skillType,
        mapId,
      }),
    onSuccess: (data) => {
      setReplay(data.replay)
      setFrame(0)
      setPlaying(true)
      setNotice('Simulation ready')
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const challengeMutation = useMutation({
    mutationFn: () =>
      challenge({
        challengerTankId: challengerId,
        defenderTankId: defenderId,
        mapId,
      }),
    onSuccess: (data) => {
      setReplay(data.match.replay)
      setFrame(0)
      setPlaying(true)
      setNotice(
        data.match.winnerTankName
          ? `${data.match.winnerTankName} won by ${data.match.resultReason}`
          : 'Draw recorded',
      )
      void queryClient.invalidateQueries({ queryKey: ['matches'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
      void queryClient.invalidateQueries({ queryKey: ['tanks'] })
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const briefMutation = useMutation({
    mutationFn: () =>
      briefBuddies({
        targets: briefTargets.map((agentId) => ({ agentId })),
        mapId,
        opponentHint:
          tanks.find((tank) => tank.id === challengerId)?.name ||
          tanks.find((tank) => tank.id === defenderId)?.name,
      }),
    onSuccess: (data) =>
      setNotice(`Sent ${data.briefed} battle brief${data.briefed === 1 ? '' : 's'}`),
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const loadReplayMutation = useMutation({
    mutationFn: (matchId: string) => getMatch({ matchId, view: 'raw' }),
    onSuccess: (data) => {
      if (data.match?.replay) {
        setReplay(data.match.replay)
        setFrame(0)
        setPlaying(true)
      }
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const selectedTank = tanks.find((tank) => tank.id === challengerId)

  const startHumanDuel = () => {
    unlockBattleAudio()
    const agent =
      tanks.find((tank) => tank.id === defenderId) ??
      tanks.find((tank) => tank.id !== challengerId) ??
      tanks[0]
    const selectedMap =
      mapId === 'random'
        ? maps[Math.floor(Math.random() * maps.length)]
        : (maps.find((map) => map.id === mapId) ?? maps[0])
    if (!agent || !selectedMap) {
      setNotice('Pick an agent tank and map first')
      return
    }

    humanActionsRef.current = []
    pressedKeysRef.current.clear()
    agentActionsRef.current = []
    agentThinkingRef.current = false
    setReplay(null)
    setPlaying(false)
    setFrame(0)
    setHumanDuel(
      createHumanDuel({
        mapId: selectedMap.id,
        mapName: selectedMap.name,
        mapRaw: selectedMap.raw,
        humanName: tankName || 'Human Pilot',
        humanSkillType: skillType,
        agent,
      }),
    )
    setNotice(`Human match started against ${agent.name}`)
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand-mark">AT</div>
        <div>
          <h1>WarBuddy Arena</h1>
          <p>Build. Battle. Iterate.</p>
        </div>
        <div className="top-stats">
          <Stat value={String(tanks.length)} label="Tanks" />
          <Stat value={String(matches.length)} label="Matches" />
        </div>
      </header>

      <section className="layout">
        <div className="battle-column">
          <Panel className="arena-panel">
            <div className="battle-head">
              <div>
                <span className="eyebrow">Battlefield</span>
                <h2>
                  {humanDuel
                    ? `Human vs ${humanDuel.tanks[1].name}`
                    : replay
                      ? `${replay.meta.players[0]?.name} vs ${replay.meta.players[1]?.name}`
                      : 'Ready room'}
                </h2>
              </div>
              <div className="result-pill">{resultLabel}</div>
            </div>
            <Arena state={activeBoardState} continuous={!!humanDuel} />
            {humanDuel ? (
              <HumanDuelControls
                duel={humanDuel}
                onAction={(action) => humanActionsRef.current.push(action)}
                onClose={() => setHumanDuel(null)}
              />
            ) : (
              <ReplayControls
                replay={replay}
                frame={frame}
                playing={playing}
                onFrame={setFrame}
                onPlaying={setPlaying}
              />
            )}
          </Panel>

          <Panel>
            <div className="section-title">
              <Gamepad2 size={18} />
              <span>Human vs Agent</span>
            </div>
            <div className="human-duel-copy">
              Tank: WASD or arrow keys move, Q/Space fires, E uses skill. Engineer: IJKL moves, U/O
              plants bombs.
            </div>
            <div className="button-row">
              <button
                type="button"
                className="primary"
                onClick={startHumanDuel}
                disabled={!tanks.length}
              >
                <Swords size={16} />
                Play live duel
              </button>
              <button type="button" onClick={() => setHumanDuel(null)} disabled={!humanDuel}>
                <Pause size={16} />
                Exit live duel
              </button>
            </div>
          </Panel>

          <Panel>
            <div className="section-head">
              <span className="eyebrow">Console</span>
              <div className="control-grid">
                <Select
                  label="Challenger"
                  value={challengerId}
                  onChange={setChallengerId}
                  options={tankOptions(tanks)}
                />
                <Select
                  label="Defender"
                  value={defenderId}
                  onChange={setDefenderId}
                  options={tankOptions(tanks.filter((tank) => tank.id !== challengerId))}
                />
                <Select
                  label="Map"
                  value={mapId}
                  onChange={setMapId}
                  options={[
                    { value: 'random', label: 'Random' },
                    ...maps.map((map) => ({ value: map.id, label: map.name })),
                  ]}
                />
              </div>
            </div>
            <div className="button-row">
              <button
                type="button"
                onClick={() => {
                  unlockBattleAudio()
                  simulateMutation.mutate()
                }}
                disabled={!defenderId || simulateMutation.isPending}
              >
                <RefreshCw size={16} />
                Simulate
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  unlockBattleAudio()
                  challengeMutation.mutate()
                }}
                disabled={!challengerId || !defenderId || challengeMutation.isPending}
              >
                <Swords size={16} />
                Start battle
              </button>
            </div>
            {notice ? <div className="notice">{notice}</div> : null}
          </Panel>
        </div>

        <aside className="side-column">
          <Panel>
            <div className="section-title">
              <Shield size={18} />
              <span>Tank brain</span>
            </div>
            <div className="editor-grid">
              <input
                value={tankName}
                onChange={(event) => setTankName(event.target.value)}
                placeholder={selectedTank?.name ?? 'Tank name'}
              />
              <select
                value={skillType}
                onChange={(event) => setSkillType(event.target.value as SkillType)}
              >
                {SKILLS.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              className="primary full"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save size={16} />
              Publish brain
            </button>
          </Panel>

          <Panel>
            <div className="section-title">
              <Bot size={18} />
              <span>Server Buddies</span>
            </div>
            <BuddyPicker
              inboxes={inboxesQuery.data?.inboxes ?? []}
              selected={briefTargets}
              onSelected={setBriefTargets}
            />
            <button
              type="button"
              className="full"
              onClick={() => briefMutation.mutate()}
              disabled={!briefTargets.length || briefMutation.isPending}
            >
              <Send size={16} />
              Send battle brief
            </button>
          </Panel>

          <Panel>
            <div className="section-title">
              <Trophy size={18} />
              <span>Leaderboard</span>
            </div>
            <Leaderboard rows={leaderboardQuery.data?.leaderboard ?? []} />
          </Panel>
        </aside>
      </section>

      <section className="history-band">
        <History matches={matches} onReplay={(match) => loadReplayMutation.mutate(match.id)} />
      </section>
    </main>
  )
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('panel', className)}>{children}</section>
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function tankOptions(tanks: TankSummary[]) {
  return tanks.map((tank) => ({
    value: tank.id,
    label: `${tank.name} · ${tank.skillType} · ${tank.rankScore}`,
  }))
}

function Arena({ state, continuous }: { state: BattleFrameState | null; continuous: boolean }) {
  const cells = useMemo(() => {
    if (!state) return []
    const width = state.map.length
    const height = state.map[0]?.length ?? 0
    const output = []
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        output.push({ x, y, tile: state.map[x]?.[y] ?? 'x' })
      }
    }
    return output
  }, [state])

  if (!state) return <div className="arena empty">No replay loaded</div>
  const width = state.map.length
  const height = state.map[0]?.length ?? 0
  return (
    <div className="arena-wrap">
      <div
        className="arena"
        style={{ gridTemplateColumns: `repeat(${width}, 1fr)`, aspectRatio: `${width}/${height}` }}
      >
        {cells.map((cell) => {
          return <div key={`${cell.x}:${cell.y}`} className={clsx('tile', `tile-${cell.tile}`)} />
        })}
        <div className="arena-entities">
          {state.star ? (
            <span
              className="arena-entity star-anchor"
              style={entityStyle(state.star, width, height, 0.82, 0, continuous)}
            >
              <span className="star">★</span>
            </span>
          ) : null}
          {state.bullets.map((bullet) => (
            <span
              key={bullet.id}
              className="arena-entity bullet-anchor"
              style={entityStyle(
                bullet.position,
                width,
                height,
                0.48,
                bullet.headingDegrees ?? rotationForDirection(bullet.direction),
                continuous,
              )}
            >
              <span className={clsx('bullet', bullet.owner === 0 ? 'red' : 'blue')} />
            </span>
          ))}
          {(state.bombs ?? []).map((bomb) => (
            <span
              key={bomb.id}
              className="arena-entity bomb-anchor"
              style={entityStyle(bomb.position, width, height, 0.62, 0, continuous)}
            >
              <span
                className={clsx(
                  'bomb',
                  bomb.owner === 0 ? 'red' : 'blue',
                  bomb.remainingFrames < 18 && 'urgent',
                )}
              />
            </span>
          ))}
          {state.tanks.map((tank, tankIndex) => (
            <span
              key={tank.id}
              className="arena-entity tank-anchor"
              style={entityStyle(
                tank.position,
                width,
                height,
                0.9,
                tank.headingDegrees ?? rotationForDirection(tank.direction),
                continuous,
              )}
            >
              <TankPiece
                index={tankIndex}
                direction={tank.direction}
                crashed={tank.crashed}
                status={tank.status}
                hiddenFromHuman={continuous && tankIndex === 1 && tank.status.cloaked}
              />
            </span>
          ))}
          {(state.engineers ?? []).map((engineer) => (
            <span
              key={engineer.id}
              className="arena-entity engineer-anchor"
              style={entityStyle(
                engineer.position,
                width,
                height,
                0.44,
                engineer.headingDegrees ?? rotationForDirection(engineer.direction),
                continuous,
              )}
            >
              <EngineerPiece
                engineer={engineer}
                hiddenFromHuman={continuous && engineer.owner === 1 && engineer.status.cloaked}
              />
            </span>
          ))}
          {cells
            .filter((cell) => cell.tile === 'o')
            .map((cell) => (
              <span
                key={`grass:${cell.x}:${cell.y}`}
                className="arena-entity grass-canopy-anchor"
                style={entityStyle([cell.x + 0.5, cell.y + 0.5], width, height, 1.16, 0, true)}
              >
                <span className="grass-canopy" />
              </span>
            ))}
          {(state.explosions ?? []).flatMap((explosion) =>
            explosion.positions.map((position, index) => (
              <span
                key={`${explosion.id}:${index}`}
                className="arena-entity explosion-anchor"
                style={entityStyle(position, width, height, 1.04, 0, true)}
              >
                <span className="explosion" />
              </span>
            )),
          )}
        </div>
      </div>
    </div>
  )
}

function entityStyle(
  position: [number, number],
  width: number,
  height: number,
  scale: number,
  rotationDegrees = 0,
  continuous = true,
): CSSProperties {
  const x = continuous ? position[0] : position[0] + 0.5
  const y = continuous ? position[1] : position[1] + 0.5
  return {
    left: `${(x / width) * 100}%`,
    top: `${(y / height) * 100}%`,
    width: `${(scale / width) * 100}%`,
    transform: `translate(-50%, -50%) rotate(${rotationDegrees}deg)`,
  }
}

function rotationForDirection(direction: Direction) {
  switch (direction) {
    case 'up':
      return -90
    case 'down':
      return 90
    case 'left':
      return 180
    case 'right':
      return 0
  }
}

function TankPiece({
  index,
  direction,
  crashed,
  status,
  hiddenFromHuman,
}: {
  index: number
  direction: Direction
  crashed: boolean
  status: RuntimeTankState['status']
  hiddenFromHuman: boolean
}) {
  return (
    <span
      className={clsx(
        'tank',
        index === 0 ? 'challenger' : 'defender',
        crashed && 'crashed',
        status.shielded && 'shielded',
        status.frozen && 'frozen',
        status.poisoned && 'poisoned',
        status.cloaked && 'cloaked',
        status.boosted && 'boosted',
        status.overloaded && 'overloaded',
        hiddenFromHuman && 'hidden-from-human',
      )}
      data-dir={direction}
    />
  )
}

function EngineerPiece({
  engineer,
  hiddenFromHuman,
}: {
  engineer: RuntimeEngineerState
  hiddenFromHuman: boolean
}) {
  return (
    <span
      className={clsx(
        'engineer',
        engineer.owner === 0 ? 'challenger' : 'defender',
        !engineer.alive && 'defeated',
        engineer.status.cloaked && 'cloaked',
        engineer.status.fireLocked && 'cooling',
        hiddenFromHuman && 'hidden-from-human',
      )}
      data-dir={engineer.direction}
      data-range={engineer.bombRange}
    />
  )
}

function HumanDuelControls({
  duel,
  onAction,
  onClose,
}: {
  duel: HumanDuelState
  onAction: (action: DuelAction) => void
  onClose: () => void
}) {
  const sendAction = (action: DuelAction) => {
    unlockBattleAudio()
    onAction(action)
  }
  return (
    <div className="human-duel-controls">
      <div className="duel-score">
        <span>
          Human <strong>{duel.tanks[0].stars}</strong>
        </span>
        <span>
          Agent <strong>{duel.tanks[1].stars}</strong>
        </span>
        <span>
          Engineer range <strong>{duel.engineers[0].bombRange}</strong>
        </span>
        <span>
          Frame{' '}
          <strong>
            {Math.min(duel.frame, duel.maxFrames)}/{duel.maxFrames}
          </strong>
        </span>
      </div>
      <div className="duel-buttons">
        <button type="button" onClick={() => sendAction({ type: 'move', direction: 'up' })}>
          Tank ↑
        </button>
        <button type="button" onClick={() => sendAction({ type: 'move', direction: 'left' })}>
          Tank ←
        </button>
        <button type="button" onClick={() => sendAction({ type: 'move', direction: 'down' })}>
          Tank ↓
        </button>
        <button type="button" onClick={() => sendAction({ type: 'move', direction: 'right' })}>
          Tank →
        </button>
        <button type="button" onClick={() => sendAction({ type: 'fire' })}>
          Q Fire
        </button>
        <button type="button" onClick={() => sendAction({ type: 'skill' })}>
          E Skill
        </button>
        <button type="button" onClick={() => sendAction({ type: 'engineerMove', direction: 'up' })}>
          Eng ↑
        </button>
        <button
          type="button"
          onClick={() => sendAction({ type: 'engineerMove', direction: 'left' })}
        >
          Eng ←
        </button>
        <button
          type="button"
          onClick={() => sendAction({ type: 'engineerMove', direction: 'down' })}
        >
          Eng ↓
        </button>
        <button
          type="button"
          onClick={() => sendAction({ type: 'engineerMove', direction: 'right' })}
        >
          Eng →
        </button>
        <button type="button" onClick={() => sendAction({ type: 'engineerBomb' })}>
          U Bomb
        </button>
        <button type="button" onClick={onClose}>
          Exit
        </button>
      </div>
      <div className="duel-log">
        {duel.log.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </div>
  )
}

function duelResultLabel(duel: HumanDuelState) {
  if (duel.status === 'running') {
    return `Human ${duel.tanks[0].stars} · Agent ${duel.tanks[1].stars}`
  }
  const winner =
    duel.result.winner === 'human'
      ? 'You won'
      : duel.result.winner === 'agent'
        ? `${duel.tanks[1].name} won`
        : 'Draw'
  return `${winner} · ${duel.result.reason}`
}

function ReplayControls({
  replay,
  frame,
  playing,
  onFrame,
  onPlaying,
}: {
  replay: BattleReplay | null
  frame: number
  playing: boolean
  onFrame: (frame: number) => void
  onPlaying: (playing: boolean) => void
}) {
  const max = Math.max(0, (replay?.frames.length ?? 1) - 1)
  return (
    <div className="replay-controls">
      <button type="button" onClick={() => onFrame(0)} disabled={!replay}>
        <SkipBack size={16} />
      </button>
      <button
        type="button"
        onClick={() => {
          unlockBattleAudio()
          onPlaying(!playing)
        }}
        disabled={!replay}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <input
        type="range"
        min={0}
        max={max}
        value={Math.min(frame, max)}
        onChange={(event) => onFrame(Number(event.target.value))}
        disabled={!replay}
      />
      <span>
        {replay ? `${Math.min(frame + 1, replay.frames.length)}/${replay.frames.length}` : '0/0'}
      </span>
    </div>
  )
}

function BuddyPicker({
  inboxes,
  selected,
  onSelected,
}: {
  inboxes: BuddyInbox[]
  selected: string[]
  onSelected: (selected: string[]) => void
}) {
  if (!inboxes.length) return <div className="empty-list">No Buddy Inbox visible</div>
  return (
    <div className="buddy-list">
      {inboxes.map((inbox) => {
        const label =
          inbox.agent.user?.displayName?.trim() ||
          inbox.agent.user?.username?.trim() ||
          inbox.agent.id
        const checked = selected.includes(inbox.agent.id)
        return (
          <label key={inbox.agent.id} className="buddy-row">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => {
                onSelected(
                  event.target.checked
                    ? [...selected, inbox.agent.id]
                    : selected.filter((id) => id !== inbox.agent.id),
                )
              }}
            />
            <span>{label}</span>
          </label>
        )
      })}
    </div>
  )
}

function Leaderboard({ rows }: { rows: TankSummary[] }) {
  if (!rows.length) return <div className="empty-list">No standings</div>
  return (
    <ol className="leaderboard">
      {rows.map((tank) => (
        <li key={tank.id}>
          <span>#{tank.rank}</span>
          <strong>{tank.name}</strong>
          <em>{tank.rankScore}</em>
        </li>
      ))}
    </ol>
  )
}

function History({
  matches,
  onReplay,
}: {
  matches: MatchSummary[]
  onReplay: (match: MatchSummary) => void
}) {
  if (!matches.length) return null
  return (
    <div className="history-grid">
      {matches.slice(0, 8).map((match) => (
        <article key={match.id}>
          <strong>
            {match.participants.challenger.tankName} vs {match.participants.defender.tankName}
          </strong>
          <span>
            {match.winnerTankName ?? 'Draw'} · {match.resultReason} · {match.excitementScore}
          </span>
          <button type="button" onClick={() => onReplay(match)}>
            <Play size={14} />
            Replay
          </button>
        </article>
      ))}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)
