import { shadowServerAppMountedPath } from '@shadowob/sdk/bridge'
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router'
import clsx from 'clsx'
import {
  Bomb,
  Bot,
  ChevronRight,
  DoorOpen,
  Eye,
  Flag,
  Gamepad2,
  MessageSquare,
  NotepadText,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Send,
  Shield,
  SkipBack,
  Swords,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_WARBUDDY_RULES } from '../rules.js'
import type {
  BattleFrameState,
  BattleReplay,
  Direction,
  RuntimeEngineerState,
  RuntimeTankState,
  SkillType,
  UnitDeathState,
  WarbuddyPlayMode,
  WarbuddyRoom,
} from '../types.js'
import {
  addReplayComment,
  type BuddyInbox,
  bridgeAvailable,
  briefBuddies,
  challenge,
  createRoom,
  createTeam,
  getMatch,
  getOAuthSession,
  inboxDeliveryErrors,
  inboxDeliveryResults,
  inboxes,
  joinRoom,
  leaderboard,
  listMatches,
  listRooms,
  listTanks,
  listTeams,
  type MatchSummary,
  markMatchRead,
  openBuddyCreator,
  replayReviewBrief,
  simulate,
  type TankSummary,
} from './api.js'
import battleBgmUrl from './assets/audio/victory-at-seven-gates.mp3'
import {
  actionsForRole,
  companionActionsForRole,
  createHumanDuel,
  type DuelAction,
  type DuelRole,
  decideAgentActions,
  type HumanDuelState,
  heldKeysToDuelActions,
  keyToDuelAction,
  sanitizeDuelActions,
  stepHumanDuel,
} from './human-duel.js'
import './styles.css'

const queryClient = new QueryClient()

const ENGINEER_SPRITE_BASE_HEADING = 90
const WARBUDDY_FRAME_MS = Math.round(1000 / DEFAULT_WARBUDDY_RULES.timing.fps)
const REPLAY_FRAME_MS = WARBUDDY_FRAME_MS

type BattleSound = 'shoot' | 'dirt' | 'star' | 'flag' | 'skill' | 'crash' | 'clash' | 'settled'
type Locale = 'en' | 'zh'
type RoomSocketMessage = {
  type?: string
  peers?: Array<{ displayName: string; mode?: string | null }>
  payload?: {
    type?: string
    frame?: number
    status?: string
    action?: unknown
    actions?: unknown[]
  }
  from?: { displayName?: string }
}
type ArenaFlow =
  | 'needs_squad'
  | 'ready'
  | 'room_lobby'
  | 'in_match'
  | 'match_finished'
  | 'reviewing_replay'
  | 'buddy_coaching'
type SessionMode = 'idle' | 'practice' | 'ranked' | 'room' | 'replay'
type MachinePhase =
  | 'boot'
  | 'needs_squad'
  | 'ready'
  | 'room_lobby'
  | 'live_battle'
  | 'replay_loading'
  | 'replay_playing'
  | 'replay_paused'
  | 'replay_finished'
  | 'replay_review'
  | 'buddy_coaching'
type BattleEntryMode = Extract<SessionMode, 'practice' | 'ranked' | 'room'>
type WarbuddyMachine = {
  phase: MachinePhase
  sessionMode: SessionMode
  lastBattleMode: BattleEntryMode
  selectedMatchId: string
}
type MachineEvent =
  | { type: 'hydrate'; hasTeam: boolean }
  | { type: 'ready' }
  | { type: 'room'; roomCode?: string }
  | { type: 'live'; mode: BattleEntryMode }
  | { type: 'replay_loading'; matchId?: string; source: BattleEntryMode }
  | { type: 'replay_loaded'; matchId?: string; autoplay: boolean; source: BattleEntryMode }
  | { type: 'replay_play' }
  | { type: 'replay_pause' }
  | { type: 'replay_finished' }
  | { type: 'review'; matchId?: string }
  | { type: 'buddy'; matchId?: string }
  | { type: 'leave_battle'; fallback: SessionMode }
type WarbuddyRoute = '/' | '/squad' | '/rooms' | '/ranked' | '/replays' | '/buddy'
type OnboardingStep = 'squad' | 'practice' | 'replay' | 'review' | 'buddy' | null
type ReplayCommentIntent = 'resume' | 'buddy'
type GameMode = 'practice' | 'pk' | 'ranked' | 'room'

const UI_COPY: Record<Locale, Record<string, string>> = {
  en: {
    appTitle: 'WarBuddy Arena',
    pilot: 'Pilot',
    squad: 'War Room',
    noSquad: 'No Squad',
    guest: 'Guest',
    unread: 'Unread',
    rooms: 'Rooms',
    arena: 'Lobby',
    ranked: 'Ranked',
    replays: 'Recent Games',
    buddy: 'Buddy',
    signingIn: 'Signing in',
    signIn: 'Sign in',
    identityConnected: 'Identity connected',
    battleRunning: 'Battle running',
    return: 'Return',
    leave: 'Leave',
    currentQuest: 'Quest',
    buildSquad: 'Build a Squad',
    chooseBattle: 'Choose Battle',
    liveRoom: 'Live Room',
    battleInProgress: 'Battle in Progress',
    matchFinished: 'Match Finished',
    scoreboard: 'Scoreboard',
    kills: 'Kills',
    losses: 'Losses',
    alive: 'Alive',
    defeated: 'Down',
    battleStats: 'Battle stats',
    survived: 'Survived',
    deathBullet: 'shell hit',
    deathBomb: 'bomb blast',
    deathCrush: 'crushed',
    deathRuntime: 'strategy crashed',
    reviewReplay: 'Game Notes',
    coachBuddy: 'Coach Buddy',
    step: 'Step {value}',
    playHub: 'Battle Lobby',
    squadRequired: 'Squad required',
    createSquad: 'Create Squad',
    updateSquad: 'Update Squad',
    resumeBattle: 'Resume Battle',
    leaveBattle: 'Leave Battle',
    watchReplay: 'Watch Game',
    rematch: 'Rematch',
    sendToBuddy: 'Adjust Tactics',
    opponent: 'Opponent',
    map: 'Map',
    random: 'Random',
    practiceReplay: 'Start Practice',
    practiceBattle: 'Start Practice',
    tank: 'Tank',
    engineer: 'Engineer',
    auto: 'Auto',
    manual: 'Dual Control',
    coop: 'Co-op',
    battlefield: 'Battlefield',
    readyRoom: 'Ready room',
    squadName: 'Squad name',
    squadColor: 'Squad color',
    squadDescription: 'Squad description for Buddy coaching',
    createSquadFirst: 'Create a squad first',
    squadHelp: 'Squads own your tank, engineer, rank, and Buddy tasks.',
    noSquadTank: 'No squad tank',
    loadout: 'Loadout',
    skill: 'Skill',
    rating: 'Rating',
    wins: 'Wins',
    roomName: 'Room name',
    roomCode: 'Room code',
    noActiveRoom: 'No active room',
    createRoom: 'Create room',
    join: 'Join',
    startRoomBattle: 'Start room battle',
    exit: 'Exit',
    host: 'Host',
    guestSeat: 'Guest',
    mode: 'Mode',
    status: 'Status',
    readySquad: 'Ready squad',
    openSlot: 'Open slot',
    joined: 'Joined',
    waiting: 'Waiting',
    enter: 'Enter',
    noLiveRooms: 'No live rooms',
    challengeSetup: 'PK Setup',
    yourSquad: 'Your squad',
    defender: 'Defender',
    scoutReplay: 'Start Practice',
    rankedAuto: 'Start PK',
    rankedLive: 'Start PK',
    buddyWorkshop: 'Tactics Desk',
    noReplaySelected: 'No game selected',
    noBriefYet: 'No brief yet',
    delegateBuddy: 'Adjust Tactics',
    noBuddyConnected: 'No Buddy ready',
    noBuddyHelp: 'Create a Buddy that can review games and tune this squad.',
    strategyLoop: 'Tactics Table',
    squadCreated: 'Squad ready',
    replaySelected: 'Game reviewed',
    framesCommented: 'Notes captured',
    buddyBriefReady: 'Buddy brief ready',
    openReplays: 'Recent Games',
    findRival: 'Find Rival',
    replayReviewPanel: 'Game Review',
    openReplayToComment: 'Pick a recent game, then add a note while you watch.',
    frameCommentPlaceholder:
      'Write it naturally, for example: I should have hidden in the grass, the bomb was too early, or the tank should grab the flag first.',
    commentFrame: 'Record this moment',
    summarize: 'Adjust Tactics',
    rankedLadder: 'Ranked Ladder',
    replayInbox: 'Recent Games',
    noReplayLoaded: 'No game loaded',
    flags: 'Flags',
    frame: 'Frame',
    time: 'Time',
    fire: 'Fire',
    skillAction: 'Skill',
    bomb: 'Bomb',
    loading: 'Loading',
    replay: 'Watch',
    challenge: 'PK Duel',
    yourSquadLabel: 'Your squad',
    match: 'Match',
    pilots: 'pilots',
    comments: 'comments',
    online: 'online',
    vs: 'vs',
    noStandings: 'No standings',
    noBuddyInbox: 'No Buddy Inbox visible',
    youWon: 'You won',
    winnerText: '{name} won',
    draw: 'Draw',
    reasonHit: 'hit',
    reasonCrashed: 'crashed',
    reasonStars: 'stars',
    reasonFlags: 'flags',
    reasonRuntime: 'runtime',
    reasonDraw: 'draw',
    tankStats: 'SG {shotgun} · Armor {armor}',
    engineerStats: 'Bombs {bombs} · Range {range}',
    roomSelected: 'Room {code} selected',
    roomCreated: 'Room {code} created',
    roomJoined: 'Joined room {code}',
    battleLeft: 'Battle left',
    rivalLocked: 'Rival locked: {name}',
    simulationReady: 'Simulation ready',
    replayPlaying: 'Game playback started',
    loadingReplay: 'Loading game...',
    replayUnavailable: 'Game unavailable',
    frameCommentSaved: 'Frame comment saved ({count})',
    replayBriefReady: 'Tactic notes ready',
    noReplayComments: 'No replay comments yet',
    sentBriefs: 'Sent {count} battle brief(s)',
    briefPendingAdmission: 'Buddy inbox permission requested. Approve it, then send again.',
    briefDeliveryMissing:
      'No Buddy inbox delivery was confirmed. Open this inside Shadow and retry.',
    briefDeliveryError: 'Buddy inbox delivery failed: {error}',
    createSquadBeforeLive: 'Create a squad before entering live mode',
    pickAgentMap: 'Pick an agent tank and map first',
    liveStarted: '{modeLabel} {liveMode} battle started: {controlNote} against {agentName}',
    manualControl: 'you control the tank and engineer',
    coopControl: 'you drive the {role}, your Buddy handles the {otherRole}',
    onboardingSquadTitle: 'Create your squad',
    onboardingSquadBody:
      'Pick a name and color first. The color marks both your tank and engineer.',
    onboardingPracticeTitle: 'Run a first practice',
    onboardingPracticeBody:
      'Start an auto practice replay to learn the map, flags, bombs, and grass.',
    onboardingReplayTitle: 'Watch the game first',
    onboardingReplayBody: 'Let it play to the end. After that, write down one thing to improve.',
    onboardingReviewTitle: 'Add one useful note',
    onboardingReviewBody: 'What felt off in this moment? A short plain sentence is enough.',
    onboardingBuddyTitle: 'Let Buddy improve it',
    onboardingBuddyBody: 'Buddy will use your notes to tune the squad strategy.',
    startPractice: 'Start Practice',
    startReview: 'Start Review',
    chooseRecentGameFirst: 'Pick a recent game first',
    reviewSavedContinue: 'Saved {count} note(s). Continue watching.',
    reviewSavedBuddy: 'Saved {count} note(s). Preparing tactics.',
    reviewModalTitle: 'What could be better here?',
    reviewModalBody: 'Write one clear observation. Buddy can turn that into a strategy change.',
    reviewModalPrompt: 'Your note',
    reviewThisMoment: 'Record this moment',
    saveAndContinue: 'Save and keep watching',
    saveAndSendBuddy: 'Save and adjust tactics',
    continueWatching: 'Keep watching',
    sendSavedNotesToBuddy: 'Adjust Tactics',
    modePractice: 'Practice',
    modePk: 'PK Duel',
    modeRanked: 'Ranked',
    modeRoom: 'Custom Room',
    modePracticeDesc: 'Try a fast match and review it after the replay.',
    modePkDesc: 'Fight an agent directly. Manual mode controls both units.',
    modeRankedDesc: 'Challenge ladder players and record the result.',
    modeRoomDesc: 'Create or join a live room with a room code.',
    controlStyle: 'Control style',
    roomLobby: 'Room Lobby',
    warRoomTitle: 'Squad Profile',
    tacticsBrief: 'Tactics Desk',
    teamIdentity: 'Squad Profile',
    chooseBuddyTitle: 'Who should tune the tactics?',
    chooseBuddyBody:
      'Pick a Buddy to receive this replay and the notes. You can remember the choice for next time.',
    tacticsNoteLabel: 'What should Buddy improve?',
    tacticsNotePlaceholder:
      'Example: stop circling mines, pressure the flag lane earlier, or let the engineer bomb the wall first.',
    chooseBuddyFirst: 'Pick a Buddy first',
    briefSendFailed:
      'Could not send the tactics task. Sign in or open this inside a Shadow server, then try again.',
    rememberBuddy: 'Remember this Buddy',
    createBuddy: 'Create Buddy',
    createBuddyForWarbuddyTitle: 'Create a WarBuddy tactician',
    createBuddyForWarbuddyBody:
      'Create or connect a Buddy that can review replays, improve combined-arms tactics, and run practice matches.',
    buddyCreateOpening: 'Opening Buddy creator...',
    buddyCreateOpened: 'Buddy creator opened',
    bridgeBuddyUnavailable: 'Open this app inside a Shadow server to create a Buddy here.',
    tacticsDeskGoal:
      'Review the last game, write what went wrong, then send it as one tactics adjustment.',
    selectedGame: 'Selected game',
    noTacticsYet: 'No tactics notes yet. Watch a recent game and write one observation.',
    winnerLine: '{name} won',
    drawLine: 'Draw',
    resultDetailHit: 'Win condition: direct hit',
    resultDetailCrashed: 'Win condition: enemy squad eliminated',
    resultDetailFlags: 'Win condition: captured 3 flags',
    resultDetailStars: 'Win condition: stronger upgrades',
    resultDetailRuntime: 'Win condition: opponent strategy failed',
    resultDetailDraw: 'Neither side secured the win condition',
    returnLobby: 'Return to Lobby',
    practiceReplayNotes: 'Current replay result: {result}',
    activeMode: 'Active mode',
    later: 'Later',
    continue: 'Continue',
  },
  zh: {
    appTitle: '步坦竞技场',
    pilot: '玩家',
    squad: '战备',
    noSquad: '未建队',
    guest: '游客',
    unread: '未读',
    rooms: '房间',
    arena: '大厅',
    ranked: '排位',
    replays: '最近游戏',
    buddy: 'Buddy',
    signingIn: '登录中',
    signIn: '登录',
    identityConnected: '身份已连接',
    battleRunning: '对战进行中',
    return: '返回',
    leave: '离开',
    currentQuest: '任务',
    buildSquad: '创建小队',
    chooseBattle: '选择对战',
    liveRoom: '实时房间',
    battleInProgress: '对战中',
    matchFinished: '对局结束',
    scoreboard: '记分看板',
    kills: '击败',
    losses: '阵亡',
    alive: '存活',
    defeated: '阵亡',
    battleStats: '战绩',
    survived: '存活到最后',
    deathBullet: '被炮弹击中',
    deathBomb: '被炸弹炸倒',
    deathCrush: '被坦克碾压',
    deathRuntime: '策略崩溃',
    reviewReplay: '赛后记录',
    coachBuddy: 'Buddy 打磨',
    step: '第 {value} 步',
    playHub: '作战大厅',
    squadRequired: '需要小队',
    createSquad: '创建小队',
    updateSquad: '更新小队',
    resumeBattle: '继续对战',
    leaveBattle: '退出对战',
    watchReplay: '回看比赛',
    rematch: '再来一局',
    sendToBuddy: '调整战术策略',
    opponent: '对手',
    map: '地图',
    random: '随机',
    practiceReplay: '开始练习',
    practiceBattle: '开始练习',
    tank: '坦克',
    engineer: '工兵',
    auto: '自动',
    manual: '手动双控',
    coop: '人机协同',
    battlefield: '战场',
    readyRoom: '准备开战',
    squadName: '小队名称',
    squadColor: '小队颜色',
    squadDescription: '给 Buddy 的小队说明',
    createSquadFirst: '先创建小队',
    squadHelp: '小队绑定坦克、工兵、排位和 Buddy 任务。',
    noSquadTank: '暂无小队坦克',
    loadout: '配置',
    skill: '技能',
    rating: '评分',
    wins: '胜场',
    roomName: '房间名',
    roomCode: '房间号',
    noActiveRoom: '暂无房间',
    createRoom: '创建房间',
    join: '加入',
    startRoomBattle: '房间开战',
    exit: '退出',
    host: '房主',
    guestSeat: '对手',
    mode: '模式',
    status: '状态',
    readySquad: '已就绪',
    openSlot: '空位',
    joined: '已加入',
    waiting: '等待中',
    enter: '进入',
    noLiveRooms: '暂无实时房间',
    challengeSetup: 'PK 准备',
    yourSquad: '你的小队',
    defender: '防守方',
    scoutReplay: '开始练习',
    rankedAuto: '开始 PK',
    rankedLive: '开始 PK',
    buddyWorkshop: '战术桌',
    noReplaySelected: '还没选择游戏',
    noBriefYet: '暂无摘要',
    delegateBuddy: '调整战术策略',
    noBuddyConnected: '还没有可用 Buddy',
    noBuddyHelp: '创建一个能复盘比赛、打磨小队策略的 Buddy。',
    strategyLoop: '战术桌',
    squadCreated: '小队已就绪',
    replaySelected: '已回看比赛',
    framesCommented: '已记录问题',
    buddyBriefReady: 'Buddy 已有目标',
    openReplays: '最近游戏',
    findRival: '寻找对手',
    replayReviewPanel: '赛后复盘',
    openReplayToComment: '先选一局最近的游戏，边看边记录你发现的问题。',
    frameCommentPlaceholder: '像聊天一样写：这里应该进草丛、炸弹放早了、坦克应该先抢旗……',
    commentFrame: '记录这一幕',
    summarize: '调整战术策略',
    rankedLadder: '竞技排行榜',
    replayInbox: '最近的游戏',
    noReplayLoaded: '还没选择游戏',
    flags: '旗帜',
    frame: '帧',
    time: '时间',
    fire: '开火',
    skillAction: '技能',
    bomb: '炸弹',
    loading: '加载中',
    replay: '回看',
    challenge: 'PK 对决',
    yourSquadLabel: '你的小队',
    match: '对局',
    pilots: '玩家',
    comments: '条标注',
    online: '在线',
    vs: '对战',
    noStandings: '暂无排名',
    noBuddyInbox: '暂无 Buddy 收件箱',
    youWon: '你赢了',
    winnerText: '{name} 获胜',
    draw: '平局',
    reasonHit: '击毁',
    reasonCrashed: '全灭',
    reasonStars: '增强',
    reasonFlags: '夺旗',
    reasonRuntime: '运行错误',
    reasonDraw: '平局',
    tankStats: '霰弹 {shotgun} · 装甲 {armor}',
    engineerStats: '炸弹 {bombs} · 范围 {range}',
    roomSelected: '已选择房间 {code}',
    roomCreated: '已创建房间 {code}',
    roomJoined: '已加入房间 {code}',
    battleLeft: '已离开对战',
    rivalLocked: '已锁定对手：{name}',
    simulationReady: '模拟完成',
    replayPlaying: '开始回看比赛',
    loadingReplay: '正在加载游戏...',
    replayUnavailable: '这局暂时不能回看',
    frameCommentSaved: '已记录 {count} 条观察',
    replayBriefReady: '战术记录已整理好',
    noReplayComments: '还没有赛后记录',
    sentBriefs: '已发送 {count} 个 Buddy 任务',
    briefPendingAdmission: '已请求 Buddy 收件箱授权，批准后再发送一次即可投递。',
    briefDeliveryMissing: '没有检测到 Buddy 收件箱投递结果，请在 Shadow 服务器里打开应用后重试。',
    briefDeliveryError: 'Buddy 收件箱投递失败：{error}',
    createSquadBeforeLive: '先创建小队，再进入实时模式',
    pickAgentMap: '先选择对手和地图',
    liveStarted: '{modeLabel} {liveMode} 已开战：{controlNote}，对手 {agentName}',
    manualControl: '你同时控制坦克和工兵',
    coopControl: '你控制{role}，Buddy 控制{otherRole}',
    onboardingSquadTitle: '先创建小队',
    onboardingSquadBody: '选择名称和颜色。这个颜色会同时标记你的坦克和工兵。',
    onboardingPracticeTitle: '开始第一场练习',
    onboardingPracticeBody: '先跑一局自动练习复盘，熟悉地图、旗帜、炸弹和草丛。',
    onboardingReplayTitle: '先把比赛看完',
    onboardingReplayBody: '不用急着操作，先看到结尾。看完后再写一句哪里可以更好。',
    onboardingReviewTitle: '写一条赛后记录',
    onboardingReviewBody: '刚才哪一步有点可惜？像聊天一样写一句就行。',
    onboardingBuddyTitle: '让 Buddy 帮你改进',
    onboardingBuddyBody: 'Buddy 会根据你的记录，去打磨小队的作战策略。',
    startPractice: '开始练习',
    startReview: '写一条记录',
    chooseRecentGameFirst: '先选择一局最近的游戏',
    reviewSavedContinue: '已记下 {count} 条，继续看比赛。',
    reviewSavedBuddy: '已记下 {count} 条，正在整理战术建议。',
    reviewModalTitle: '刚才这一下，哪里可以更好？',
    reviewModalBody: '写一句你看到的问题。Buddy 会把它变成下一轮训练目标。',
    reviewModalPrompt: '你的观察',
    reviewThisMoment: '记录这一幕',
    saveAndContinue: '记下来，继续看',
    saveAndSendBuddy: '记下来，调整战术',
    continueWatching: '继续看',
    sendSavedNotesToBuddy: '调整战术策略',
    modePractice: '练习赛',
    modePk: 'PK 对决',
    modeRanked: '排位赛',
    modeRoom: '自定义房间',
    modePracticeDesc: '快速打一局，结束后回看并记录问题。',
    modePkDesc: '直接和 Agent 对战。手动模式会同时控制坦克和工兵。',
    modeRankedDesc: '挑战排行榜玩家，胜负会进入战绩。',
    modeRoomDesc: '创建或输入房间号，和别人实时对战。',
    controlStyle: '操作方式',
    roomLobby: '房间大厅',
    warRoomTitle: '小队档案',
    tacticsBrief: '战术桌',
    teamIdentity: '小队档案',
    chooseBuddyTitle: '让谁来调整战术？',
    chooseBuddyBody: '选择一个 Buddy 接收这局复盘和你的记录。勾选后，下次会默认用它。',
    tacticsNoteLabel: '希望 Buddy 重点调整什么？',
    tacticsNotePlaceholder: '比如：别在地雷前绕圈、坦克先压旗线、工兵先炸开土墙……',
    chooseBuddyFirst: '先选择一个 Buddy',
    briefSendFailed: '战术任务发送失败。请先登录，或在 Shadow 服务器里打开应用后再试。',
    rememberBuddy: '记住这个 Buddy',
    createBuddy: '创建 Buddy',
    createBuddyForWarbuddyTitle: '创建 WarBuddy 战术伙伴',
    createBuddyForWarbuddyBody: '创建或接入一个 Buddy，让它复盘比赛、打磨步坦协同策略、跑练习赛。',
    buddyCreateOpening: '正在打开 Buddy 创建窗口...',
    buddyCreateOpened: '已打开 Buddy 创建窗口',
    bridgeBuddyUnavailable: '请在 Shadow 服务器里打开这个应用后创建 Buddy。',
    tacticsDeskGoal: '先看最近一局，写一句问题，然后把它作为战术调整发出去。',
    selectedGame: '已选游戏',
    noTacticsYet: '还没有战术记录。先回看一局最近游戏，写一句观察。',
    winnerLine: '{name} 获胜',
    drawLine: '双方平局',
    resultDetailHit: '胜利条件：击毁对手',
    resultDetailCrashed: '胜利条件：全灭对手',
    resultDetailFlags: '胜利条件：夺得 3 面旗帜',
    resultDetailStars: '胜利条件：增强优势',
    resultDetailRuntime: '胜利条件：对手策略异常',
    resultDetailDraw: '双方未能达成胜利条件',
    returnLobby: '返回大厅',
    practiceReplayNotes: '当前回放结果：{result}',
    activeMode: '当前模式',
    later: '稍后',
    continue: '继续',
  },
}

const FLOW_STEPS: Array<{ flow: ArenaFlow; labelKey: string }> = [
  { flow: 'needs_squad', labelKey: 'squad' },
  { flow: 'ready', labelKey: 'battlefield' },
  { flow: 'match_finished', labelKey: 'matchFinished' },
  { flow: 'reviewing_replay', labelKey: 'reviewReplay' },
  { flow: 'buddy_coaching', labelKey: 'buddy' },
]

const INITIAL_MACHINE: WarbuddyMachine = {
  phase: 'boot',
  sessionMode: 'idle',
  lastBattleMode: 'practice',
  selectedMatchId: '',
}

function detectLocale(): Locale {
  if (typeof window !== 'undefined') {
    try {
      const savedLocale = window.localStorage.getItem('warbuddy.locale')
      if (savedLocale === 'zh' || savedLocale === 'en') return savedLocale
    } catch {
      // Ignore private-mode storage failures and fall back to environment detection.
    }
  }
  const languageCandidates =
    typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages ?? [])] : []
  if (languageCandidates.some((language) => language.toLowerCase().startsWith('zh'))) return 'zh'
  const timeZone =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''
  if (['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Macau'].includes(timeZone))
    return 'zh'
  return 'en'
}

function translate(locale: Locale, key: string, values: Record<string, string | number> = {}) {
  const template = UI_COPY[locale][key] ?? UI_COPY.en[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_, token: string) => String(values[token] ?? ''))
}

function warbuddyMachineReducer(state: WarbuddyMachine, event: MachineEvent): WarbuddyMachine {
  switch (event.type) {
    case 'hydrate':
      if (!event.hasTeam) return { ...state, phase: 'needs_squad', sessionMode: 'idle' }
      if (state.phase === 'boot' || state.phase === 'needs_squad') {
        return { ...state, phase: 'ready', sessionMode: 'idle' }
      }
      return state
    case 'ready':
      return { ...state, phase: 'ready', sessionMode: 'idle' }
    case 'room':
      return { ...state, phase: 'room_lobby', sessionMode: 'room' }
    case 'live':
      return { ...state, phase: 'live_battle', sessionMode: event.mode, lastBattleMode: event.mode }
    case 'replay_loading':
      return {
        ...state,
        phase: 'replay_loading',
        sessionMode: 'replay',
        lastBattleMode: event.source,
        selectedMatchId: event.matchId ?? '',
      }
    case 'replay_loaded':
      return {
        ...state,
        phase: event.autoplay ? 'replay_playing' : 'replay_paused',
        sessionMode: 'replay',
        lastBattleMode: event.source,
        selectedMatchId: event.matchId ?? state.selectedMatchId,
      }
    case 'replay_play':
      return { ...state, phase: 'replay_playing', sessionMode: 'replay' }
    case 'replay_pause':
      return { ...state, phase: 'replay_paused', sessionMode: 'replay' }
    case 'replay_finished':
      return { ...state, phase: 'replay_finished', sessionMode: 'replay' }
    case 'review':
      return {
        ...state,
        phase: 'replay_review',
        sessionMode: 'replay',
        selectedMatchId: event.matchId ?? state.selectedMatchId,
      }
    case 'buddy':
      return {
        ...state,
        phase: 'buddy_coaching',
        selectedMatchId: event.matchId ?? state.selectedMatchId,
      }
    case 'leave_battle':
      return {
        ...state,
        phase:
          event.fallback === 'room'
            ? 'room_lobby'
            : event.fallback === 'replay'
              ? 'replay_paused'
              : 'ready',
        sessionMode: event.fallback,
      }
  }
}

function arenaFlowFromMachine(input: {
  phase: MachinePhase
  hasTeam: boolean
  displayHumanDuel: HumanDuelState | null
  replayLoaded: boolean
  hasReplayComments: boolean
  coachBrief: string
  liveRoom: WarbuddyRoom | null
  arenaEndLabel: string | null
}): ArenaFlow {
  if (!input.hasTeam || input.phase === 'needs_squad') return 'needs_squad'
  if (input.displayHumanDuel?.status === 'running' || input.phase === 'live_battle')
    return 'in_match'
  if (input.coachBrief || input.phase === 'buddy_coaching') return 'buddy_coaching'
  if (
    input.phase === 'replay_review' ||
    (input.replayLoaded && input.hasReplayComments && input.phase !== 'replay_finished')
  ) {
    return 'reviewing_replay'
  }
  if (
    input.displayHumanDuel?.status === 'settled' ||
    input.phase === 'replay_finished' ||
    input.replayLoaded ||
    input.arenaEndLabel
  ) {
    return 'match_finished'
  }
  if (input.liveRoom && input.phase === 'room_lobby') return 'room_lobby'
  return 'ready'
}

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
let battleBgm: HTMLAudioElement | null = null
let battleBgmActive = false

function unlockBattleAudio() {
  const context = ensureBattleAudio()
  if (context?.state === 'suspended') void context.resume()
  if (battleBgmActive)
    void ensureBattleBgm()
      ?.play()
      .catch(() => {})
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

function ensureBattleBgm() {
  if (typeof window === 'undefined') return null
  if (battleBgm) return battleBgm
  battleBgm = new Audio(battleBgmUrl)
  battleBgm.loop = true
  battleBgm.preload = 'auto'
  battleBgm.volume = 0.18
  return battleBgm
}

function setBattleBgm(active: boolean) {
  battleBgmActive = active
  const audio = ensureBattleBgm()
  if (!audio) return
  if (active) {
    void audio.play().catch(() => {})
    return
  }
  audio.pause()
  audio.currentTime = 0
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
    case 'flag':
      playTone(420, 0.08, 'square', 0.045)
      playTone(640, 0.12, 'triangle', 0.038, 0.045)
      break
    case 'skill':
      playTone(260, 0.1, 'triangle', 0.04)
      playTone(390, 0.12, 'square', 0.03, 0.04)
      break
    case 'crash':
      playTone(90, 0.16, 'sawtooth', 0.06)
      playTone(48, 0.2, 'square', 0.045, 0.04)
      break
    case 'clash':
      playTone(880, 0.045, 'square', 0.04)
      playTone(310, 0.08, 'sawtooth', 0.035, 0.02)
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

function useBattleBgm(active: boolean) {
  useEffect(() => {
    setBattleBgm(active)
    return () => setBattleBgm(false)
  }, [active])
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
    flagTotal: number
    bulletClashes: number
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
    const flagTotal = (state.flagScores ?? [0, 0]).reduce((sum, score) => sum + score, 0)
    const bulletClashes = state.bulletClashes ?? 0
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
      if (flagTotal > previous.flagTotal) playBattleSound('flag')
      if (bulletClashes > previous.bulletClashes) playBattleSound('clash')
      if (activeEffects > previous.activeEffects) playBattleSound('skill')
      if (crashed > previous.crashed) playBattleSound('crash')
      if (
        resultLabel !== previous.resultLabel &&
        !resultLabel.startsWith('Flags ') &&
        !resultLabel.startsWith('旗帜 ')
      ) {
        playBattleSound('settled')
      }
    }

    previousRef.current = {
      bulletIds,
      unitPositions,
      dirtTiles,
      starTotal,
      flagTotal,
      bulletClashes,
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

function useWarbuddyAppModel() {
  const [challengerId, setChallengerId] = useState('')
  const [defenderId, setDefenderId] = useState('')
  const [mapId, setMapId] = useState('random')
  const [replay, setReplay] = useState<BattleReplay | null>(null)
  const [activeMatchId, setActiveMatchId] = useState('')
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [skillType] = useState<SkillType>('shield')
  const [teamName, setTeamName] = useState('')
  const [teamDescription, setTeamDescription] = useState('')
  const [teamColor, setTeamColor] = useState('#2f80ed')
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>('practice')
  const [liveMode, setLiveMode] = useState<WarbuddyPlayMode>('auto')
  const [machine, sendMachine] = useReducer(warbuddyMachineReducer, INITIAL_MACHINE)
  const [roomName, setRoomName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [liveRoom, setLiveRoom] = useState<WarbuddyRoom | null>(null)
  const [socketStatus, setSocketStatus] = useState('offline')
  const [roomPeers, setRoomPeers] = useState<Array<{ displayName: string; mode?: string | null }>>(
    [],
  )
  const [roomEvents, setRoomEvents] = useState<string[]>([])
  const [replayComment, setReplayComment] = useState('')
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [coachBrief, setCoachBrief] = useState('')
  const [tacticsNote, setTacticsNote] = useState('')
  const [briefTargets, setBriefTargets] = useState<string[]>([])
  const [buddyChoiceOpen, setBuddyChoiceOpen] = useState(false)
  const [rememberBuddy, setRememberBuddy] = useState(true)
  const [rememberedBuddyId, setRememberedBuddyId] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('warbuddy.rememberedBuddyId') ?? ''
  })
  const [notice, setNotice] = useState('')
  const [humanRole, setHumanRole] = useState<DuelRole>('tank')
  const [humanDuel, setHumanDuel] = useState<HumanDuelState | null>(null)
  const [oauthPopupOpen, setOauthPopupOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(null)
  const arenaFocusRef = useRef<HTMLDivElement | null>(null)
  const reviewInputRef = useRef<HTMLTextAreaElement | null>(null)
  const humanActionsRef = useRef<DuelAction[]>([])
  const pressedKeysRef = useRef(new Set<string>())
  const agentActionsRef = useRef<DuelAction[]>([])
  const agentThinkingRef = useRef(false)
  const liveSocketRef = useRef<WebSocket | null>(null)
  const oauthPopupPollRef = useRef<number | null>(null)
  const lastRoomFrameSentRef = useRef(0)

  const tanksQuery = useQuery({ queryKey: ['tanks'], queryFn: () => listTanks({ limit: 100 }) })
  const oauthSessionQuery = useQuery({
    queryKey: ['oauth-session'],
    queryFn: getOAuthSession,
    staleTime: 30_000,
  })
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: listTeams })
  const matchesQuery = useQuery({
    queryKey: ['matches'],
    queryFn: () => listMatches({ limit: 24 }),
  })
  const leaderboardQuery = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => leaderboard({ sort: 'rating', limit: 12 }),
  })
  const roomsQuery = useQuery({ queryKey: ['rooms'], queryFn: listRooms })
  const inboxesQuery = useQuery({ queryKey: ['inboxes'], queryFn: inboxes })
  const locale = useMemo(() => detectLocale(), [])
  const t = useMemo(() => {
    return (key: string, values?: Record<string, string | number>) => translate(locale, key, values)
  }, [locale])

  const tanks = tanksQuery.data?.tanks ?? []
  const maps = tanksQuery.data?.maps ?? []
  const myTeam = teamsQuery.data?.mine ?? null
  const oauthSession = oauthSessionQuery.data ?? null
  const identityLabel =
    oauthSession?.authenticated && oauthSession.profile
      ? (oauthSession.profile.displayName ?? oauthSession.profile.username ?? 'Pilot')
      : t('guest')
  const teamTank = myTeam ? tanks.find((tank) => tank.id === myTeam.tankId) : null
  const matches = matchesQuery.data?.matches ?? []
  const rooms = roomsQuery.data?.rooms ?? []
  const unreadMatches = matches.filter((match) => match.unread)
  const sessionMode = machine.sessionMode
  const lastBattleMode = machine.lastBattleMode
  const boardState = replay?.frames[frame]?.state ?? replay?.frames[0]?.state ?? null
  const displayHumanDuel = sessionMode === 'replay' ? null : humanDuel
  const activeMatch = activeMatchId
    ? (matches.find((match) => match.id === activeMatchId) ?? null)
    : null
  const activeBoardState = displayHumanDuel?.state ?? boardState
  const resultLabel = displayHumanDuel
    ? duelResultLabel(displayHumanDuel, t)
    : replay
      ? resultSummaryLabel(
          replay.summary.result.winner ?? t('draw'),
          replay.summary.result.reason,
          t,
        )
      : t('readyRoom')
  const arenaEndLabel = displayHumanDuel
    ? displayHumanDuel.status === 'settled'
      ? duelEndLabel(displayHumanDuel, t)
      : null
    : replay && frame >= replay.frames.length - 1
      ? replayEndLabel(replay, t)
      : null
  const canAdjustTactics = Boolean(myTeam && (activeMatchId || replay || coachBrief))
  const replayLoaded = Boolean(activeMatchId && replay)
  const hasReplayComments = Boolean(
    activeMatchId && matches.find((match) => match.id === activeMatchId)?.commentsCount,
  )
  const arenaFlow = arenaFlowFromMachine({
    phase: machine.phase,
    hasTeam: Boolean(myTeam),
    displayHumanDuel,
    replayLoaded,
    hasReplayComments,
    coachBrief,
    liveRoom,
    arenaEndLabel,
  })
  useBattleSounds(activeBoardState, resultLabel, Boolean(displayHumanDuel))
  useBattleBgm(Boolean(displayHumanDuel) || playing)

  const goTo = (to: WarbuddyRoute) => {
    void router.navigate({ to })
  }

  const focusArena = () => {
    window.setTimeout(() => {
      arenaFocusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }

  const dismissOnboarding = () => setOnboardingStep(null)

  const openReviewModal = () => {
    if (!activeMatchId) {
      setNotice(t('chooseRecentGameFirst'))
      goTo('/replays')
      return
    }
    setPlaying(false)
    sendMachine({ type: 'review', matchId: activeMatchId })
    setOnboardingStep(null)
    setReviewModalOpen(true)
    goTo('/replays')
    window.setTimeout(() => reviewInputRef.current?.focus(), 120)
  }

  const closeReviewModal = (resume: boolean) => {
    setReviewModalOpen(false)
    if (resume && replay && frame < replay.frames.length - 1) {
      setPlaying(true)
      sendMachine({ type: 'replay_play' })
    }
  }

  const submitReplayComment = (intent: ReplayCommentIntent) => {
    if (!activeMatchId || !replayComment.trim()) return
    commentMutation.mutate(intent)
  }

  const refreshIdentity = () => {
    if (oauthPopupPollRef.current !== null) {
      window.clearInterval(oauthPopupPollRef.current)
      oauthPopupPollRef.current = null
    }
    setOauthPopupOpen(false)
    void queryClient.invalidateQueries({ queryKey: ['oauth-session'] })
    void queryClient.invalidateQueries({ queryKey: ['teams'] })
    void queryClient.invalidateQueries({ queryKey: ['tanks'] })
    void queryClient.invalidateQueries({ queryKey: ['matches'] })
    void queryClient.invalidateQueries({ queryKey: ['rooms'] })
    setNotice(t('identityConnected'))
  }

  const connectOAuth = () => {
    const authorizeUrl = oauthSession?.authorizeUrl
    if (!authorizeUrl) return
    const popup = window.open(
      authorizeUrl,
      'warbuddy-oauth',
      'popup=yes,width=520,height=720,noopener=no,noreferrer=no',
    )
    if (!popup) {
      window.top?.location.assign(authorizeUrl)
      return
    }
    setOauthPopupOpen(true)
    if (oauthPopupPollRef.current !== null) window.clearInterval(oauthPopupPollRef.current)
    oauthPopupPollRef.current = window.setInterval(() => {
      if (!popup.closed) return
      refreshIdentity()
    }, 600)
  }

  const sendRoomMessage = (payload: Record<string, unknown>) => {
    const socket = liveSocketRef.current
    if (!liveRoom || !socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ ...payload, roomCode: liveRoom.code }))
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null
      if (!data || typeof data !== 'object' || data.type !== 'warbuddy.oauth.completed') return
      refreshIdentity()
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      if (oauthPopupPollRef.current !== null) window.clearInterval(oauthPopupPollRef.current)
    }
  }, [])

  const openReplayReview = () => {
    if (replay) {
      setFrame(0)
      setPlaying(true)
      sendMachine({ type: 'replay_play' })
    }
    setOnboardingStep(null)
    goTo('/replays')
    focusArena()
  }

  const openBuddyCoaching = () => {
    sendMachine({ type: 'buddy', matchId: activeMatchId })
    goTo('/squad')
  }

  const openBuddyChoice = () => {
    if (!myTeam) {
      setOnboardingStep('squad')
      setNotice(t('createSquadBeforeLive'))
      return
    }
    const inboxesList = inboxesQuery.data?.inboxes ?? []
    const remembered = inboxesList.find((inbox) => inbox.agent.id === rememberedBuddyId)
    if (remembered) setBriefTargets([remembered.agent.id])
    else if (briefTargets.length === 0 && inboxesList[0]) {
      setBriefTargets([inboxesList[0].agent.id])
    }
    sendMachine({ type: 'buddy', matchId: activeMatchId })
    setOnboardingStep(null)
    setBuddyChoiceOpen(true)
  }

  const closeBuddyChoice = () => setBuddyChoiceOpen(false)

  const confirmBuddyChoice = () => {
    const [target] = briefTargets
    if (!target) {
      setNotice(t('chooseBuddyFirst'))
      return
    }
    if (rememberBuddy) {
      window.localStorage.setItem('warbuddy.rememberedBuddyId', target)
      setRememberedBuddyId(target)
    } else {
      window.localStorage.removeItem('warbuddy.rememberedBuddyId')
      setRememberedBuddyId('')
    }
    briefMutation.mutate()
  }

  const requestBuddyCreation = () => {
    setNotice(t('buddyCreateOpening'))
    void openBuddyCreator({
      landing: {
        title: t('createBuddyForWarbuddyTitle'),
        description: t('createBuddyForWarbuddyBody'),
        source: 'warbuddy',
      },
    })
      .then((result) => {
        setNotice(result.opened ? t('buddyCreateOpened') : t('bridgeBuddyUnavailable'))
        void queryClient.invalidateQueries({ queryKey: ['inboxes'] })
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : String(error)))
  }

  const clearLiveDuel = () => {
    setBattleBgm(false)
    setHumanDuel(null)
    pressedKeysRef.current.clear()
    humanActionsRef.current = []
    agentActionsRef.current = []
    agentThinkingRef.current = false
  }

  const leaveBattle = () => {
    if (sessionMode === 'room') sendRoomMessage({ type: 'battle.leave' })
    clearLiveDuel()
    sendMachine({ type: 'leave_battle', fallback: replay ? 'replay' : liveRoom ? 'room' : 'idle' })
    setNotice(t('battleLeft'))
  }

  const rematch = () => {
    if (lastBattleMode === 'ranked') {
      startRankedChallenge()
      return
    }
    if (lastBattleMode === 'room') {
      startHumanDuel('room')
      return
    }
    startScout()
  }

  const selectRival = (tank: TankSummary) => {
    setDefenderId(tank.id)
    sendMachine({ type: 'ready' })
    setNotice(t('rivalLocked', { name: tank.name }))
  }

  const selectRoom = (room: WarbuddyRoom) => {
    setLiveRoom(room)
    setRoomCode(room.code)
    sendMachine({ type: 'room', roomCode: room.code })
    setNotice(t('roomSelected', { code: room.code }))
    goTo('/rooms')
  }

  const setReplayPlaying = (next: boolean) => {
    setPlaying(next)
    sendMachine({ type: next ? 'replay_play' : 'replay_pause' })
  }

  useEffect(() => {
    if (!tanks.length) return
    const preferred = myTeam?.tankId || tanks[0]?.id || ''
    setChallengerId((current) => current || preferred)
    setDefenderId((current) => current || tanks.find((tank) => tank.id !== preferred)?.id || '')
  }, [tanks, myTeam?.tankId])

  useEffect(() => {
    if (!teamsQuery.isSuccess) return
    sendMachine({ type: 'hydrate', hasTeam: Boolean(myTeam) })
    if (!myTeam) setOnboardingStep('squad')
  }, [teamsQuery.isSuccess, myTeam])

  useEffect(() => {
    if (!myTeam) return
    setTeamName(myTeam.name)
    setTeamDescription(myTeam.description)
    setTeamColor(myTeam.color)
    setChallengerId(myTeam.tankId)
  }, [myTeam])

  useEffect(() => {
    if (!playing || !replay) return
    focusArena()
    const timer = window.setInterval(() => {
      setFrame((current) => {
        const next = current + 1
        if (next >= replay.frames.length) {
          setPlaying(false)
          sendMachine({ type: 'replay_finished' })
          if (activeMatchId) {
            window.setTimeout(() => {
              sendMachine({ type: 'review', matchId: activeMatchId })
              setReviewModalOpen(true)
              setOnboardingStep(null)
              goTo('/replays')
              window.setTimeout(() => reviewInputRef.current?.focus(), 120)
            }, 300)
          }
          return current
        }
        return next
      })
    }, REPLAY_FRAME_MS)
    return () => window.clearInterval(timer)
  }, [playing, replay, activeMatchId])

  useEffect(() => {
    if (!reviewModalOpen) return
    const timer = window.setTimeout(() => reviewInputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [reviewModalOpen])

  useEffect(() => {
    if (displayHumanDuel || replay) focusArena()
  }, [displayHumanDuel?.id, replay])

  useEffect(() => {
    if (!liveRoom) {
      setSocketStatus('offline')
      setRoomPeers([])
      liveSocketRef.current = null
      return
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/api/live/rooms/${encodeURIComponent(liveRoom.code)}`,
    )
    liveSocketRef.current = socket
    setSocketStatus('connecting')
    socket.onopen = () => {
      setSocketStatus('connected')
      socket.send(
        JSON.stringify({
          type: 'hello',
          roomCode: liveRoom.code,
          mode: liveMode,
          teamId: myTeam?.id ?? null,
          displayName: myTeam?.name ?? identityLabel,
        }),
      )
    }
    socket.onmessage = (event) => {
      setSocketStatus('connected')
      let message: RoomSocketMessage
      try {
        message = JSON.parse(String(event.data)) as RoomSocketMessage
      } catch {
        return
      }
      if (message.type === 'presence' && Array.isArray(message.peers)) {
        setRoomPeers(message.peers)
        return
      }
      if (message.type === 'room.message' && message.payload?.type) {
        if (message.payload.type === 'battle.action' || message.payload.type === 'battle.actions') {
          const incoming = Array.isArray(message.payload.actions)
            ? message.payload.actions
            : [message.payload.action]
          const actions = sanitizeDuelActions(incoming)
          if (actions.length > 0) agentActionsRef.current.push(...actions)
        }
        const source = message.from?.displayName ?? 'Peer'
        setRoomEvents((current) =>
          [
            `${source}: ${message.payload?.type}${message.payload?.frame ? ` #${message.payload.frame}` : ''}`,
            ...current,
          ].slice(0, 5),
        )
      }
    }
    socket.onerror = () => setSocketStatus('error')
    socket.onclose = () => {
      if (liveSocketRef.current === socket) liveSocketRef.current = null
      setSocketStatus('offline')
    }
    return () => {
      if (liveSocketRef.current === socket) liveSocketRef.current = null
      socket.close()
    }
  }, [liveRoom, liveMode, myTeam?.id, myTeam?.name, identityLabel])

  useEffect(() => {
    pressedKeysRef.current.clear()
    humanActionsRef.current = []
  }, [humanRole, liveMode])

  useEffect(() => {
    if (!humanDuel || humanDuel.status !== 'running') return
    const onKeyDown = (event: KeyboardEvent) => {
      const action = keyToDuelAction(event.key)
      if (!action) return
      event.preventDefault()
      unlockBattleAudio()
      const [playerAction] = liveMode === 'manual' ? [action] : actionsForRole([action], humanRole)
      if (!playerAction) return
      if (playerAction.type === 'unit.move') pressedKeysRef.current.add(event.key)
      else humanActionsRef.current.push(playerAction)
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
  }, [humanDuel?.id, humanDuel?.status, humanRole, liveMode, sessionMode])

  useEffect(() => {
    if (!humanDuel || humanDuel.status !== 'running') return
    const timer = window.setInterval(() => {
      setHumanDuel((current) => {
        if (!current || current.status !== 'running') return current
        const rawHeldActions = heldKeysToDuelActions(pressedKeysRef.current)
        const rawQueuedActions = humanActionsRef.current.splice(0, 4)
        const heldActions =
          liveMode === 'manual' ? rawHeldActions : actionsForRole(rawHeldActions, humanRole)
        const queuedActions =
          liveMode === 'manual' ? rawQueuedActions : actionsForRole(rawQueuedActions, humanRole)
        const companionActions =
          liveMode === 'coop' ? companionActionsForRole(current, 0, humanRole) : []
        const playerActions = [...heldActions, ...queuedActions]
        if (sessionMode === 'room' && playerActions.length > 0) {
          sendRoomMessage({
            type: 'battle.actions',
            frame: current.frame,
            actions: playerActions,
          })
        }
        const next = stepHumanDuel(
          current,
          [...playerActions, ...companionActions],
          agentActionsRef.current.splice(0, 4),
        )
        if (next.status === 'running' && !agentThinkingRef.current) {
          agentThinkingRef.current = true
          void decideAgentActions(next)
            .then((actions) => agentActionsRef.current.push(...actions))
            .finally(() => {
              agentThinkingRef.current = false
            })
        }
        if (sessionMode === 'room' && next.frame - lastRoomFrameSentRef.current >= 8) {
          lastRoomFrameSentRef.current = next.frame
          sendRoomMessage({
            type: 'battle.frame',
            frame: next.frame,
            status: next.status,
            result: duelResultLabel(next, t),
          })
        }
        return next
      })
    }, WARBUDDY_FRAME_MS)
    return () => window.clearInterval(timer)
  }, [humanDuel?.id, humanDuel?.status, humanRole, liveMode, sessionMode])

  const teamMutation = useMutation({
    mutationFn: () =>
      createTeam({
        name: teamName,
        description: teamDescription,
        color: teamColor,
      }),
    onSuccess: (data) => {
      setNotice(`${t('squad')}: ${data.team.name}`)
      if (data.tank) setChallengerId(data.tank.id)
      setOnboardingStep('practice')
      goTo('/')
      void queryClient.invalidateQueries({ queryKey: ['teams'] })
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
        mapId,
      }),
    onSuccess: (data) => {
      clearLiveDuel()
      setReplay(data.replay)
      setActiveMatchId('')
      setFrame(0)
      setPlaying(true)
      sendMachine({ type: 'replay_loaded', source: 'practice', autoplay: true })
      setCoachBrief('')
      setOnboardingStep(null)
      setNotice(t('simulationReady'))
      goTo('/')
      focusArena()
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
      clearLiveDuel()
      setReplay(data.match.replay)
      setActiveMatchId(data.match.id)
      setFrame(0)
      setPlaying(true)
      sendMachine({
        type: 'replay_loaded',
        source: 'ranked',
        autoplay: true,
        matchId: data.match.id,
      })
      setCoachBrief('')
      setOnboardingStep(null)
      setNotice(
        data.match.winnerTankName
          ? resultSummaryLabel(
              t('winnerText', { name: data.match.winnerTankName }),
              data.match.resultReason,
              t,
            )
          : t('draw'),
      )
      goTo('/')
      focusArena()
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
        teamId: myTeam?.id,
        mapId,
        opponentHint:
          tanks.find((tank) => tank.id === challengerId)?.name ||
          tanks.find((tank) => tank.id === defenderId)?.name,
        notes: activeMatchId
          ? [`Use replay ${activeMatchId} comments as tactical feedback.`, tacticsNote, coachBrief]
              .filter(Boolean)
              .join('\n')
          : [
              replay ? t('practiceReplayNotes', { result: resultLabel }) : null,
              replay?.meta.mapName ? `Map: ${replay.meta.mapName}` : null,
              replay?.summary.framesTotal ? `Frames: ${replay.summary.framesTotal}` : null,
              tacticsNote,
              coachBrief,
            ]
              .filter(Boolean)
              .join('\n') || undefined,
      }),
    onSuccess: (data) => {
      const deliveries = inboxDeliveryResults(data)
      const errors = inboxDeliveryErrors(data)
      const pending = deliveries.filter((delivery) => delivery.pendingId && !delivery.messageId)
      if (errors.length) {
        setNotice(t('briefDeliveryError', { error: errors[0]?.error ?? 'unknown_error' }))
        setBuddyChoiceOpen(true)
        return
      }
      if (pending.length) {
        setNotice(t('briefPendingAdmission'))
        setBuddyChoiceOpen(false)
        return
      }
      if (data.briefed > 0 && deliveries.length === 0) {
        setNotice(t('briefDeliveryMissing'))
        setBuddyChoiceOpen(true)
        return
      }
      setNotice(t('sentBriefs', { count: deliveries.length || data.briefed }))
      setTacticsNote('')
      setBuddyChoiceOpen(false)
      goTo('/squad')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(
        message === 'team_not_owned_by_actor' || message === 'team_required'
          ? t('briefSendFailed')
          : message,
      )
      setBuddyChoiceOpen(true)
    },
  })

  const loadReplayMutation = useMutation({
    mutationFn: (matchId: string) => getMatch({ matchId, view: 'raw' }),
    onMutate: (matchId) => {
      clearLiveDuel()
      setActiveMatchId(matchId)
      setPlaying(false)
      sendMachine({ type: 'replay_loading', source: 'ranked', matchId })
      setNotice(t('loadingReplay'))
    },
    onSuccess: (data) => {
      if (data.match?.replay) {
        setReplay(data.match.replay)
        setActiveMatchId(data.match.id)
        setFrame(0)
        setPlaying(true)
        sendMachine({
          type: 'replay_loaded',
          source: 'ranked',
          autoplay: true,
          matchId: data.match.id,
        })
        setCoachBrief('')
        setOnboardingStep(null)
        setNotice(t('replayPlaying'))
        goTo('/replays')
        focusArena()
        void markReadMutation.mutate(data.match.id)
        return
      }
      setNotice(t('replayUnavailable'))
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const markReadMutation = useMutation({
    mutationFn: (matchId: string) => markMatchRead({ matchId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['matches'] }),
  })

  const reviewBriefMutation = useMutation({
    mutationFn: () => replayReviewBrief({ matchId: activeMatchId }),
    onSuccess: (data) => {
      setCoachBrief(data.summary ?? '')
      setNotice(data.summary ? t('replayBriefReady') : t('noReplayComments'))
      if (data.summary) {
        setOnboardingStep('buddy')
        sendMachine({ type: 'buddy', matchId: activeMatchId })
        goTo('/squad')
      }
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const commentMutation = useMutation({
    mutationFn: (intent: ReplayCommentIntent) =>
      addReplayComment({
        matchId: activeMatchId,
        frame,
        body: replayComment,
        rect: { x: 0.18, y: 0.18, width: 0.34, height: 0.24 },
      }).then((data) => ({ data, intent })),
    onSuccess: ({ data, intent }) => {
      setReplayComment('')
      setReviewModalOpen(false)
      setCoachBrief('')
      setOnboardingStep(null)
      sendMachine({ type: 'review', matchId: activeMatchId })
      void queryClient.invalidateQueries({ queryKey: ['matches'] })
      if (intent === 'resume') {
        setNotice(t('reviewSavedContinue', { count: data.comments.length }))
        if (replay && frame < replay.frames.length - 1) {
          setPlaying(true)
          sendMachine({ type: 'replay_play' })
        }
        return
      }
      setNotice(t('reviewSavedBuddy', { count: data.comments.length }))
      reviewBriefMutation.mutate()
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const createRoomMutation = useMutation({
    mutationFn: () =>
      createRoom({
        name: roomName,
        mapId,
        mode: liveMode,
        teamId: myTeam?.id,
      }),
    onSuccess: (data) => {
      setLiveRoom(data.room)
      setRoomCode(data.room.code)
      sendMachine({ type: 'room', roomCode: data.room.code })
      setNotice(t('roomCreated', { code: data.room.code }))
      goTo('/rooms')
      void queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const joinRoomMutation = useMutation({
    mutationFn: () => joinRoom({ code: roomCode, mode: liveMode, teamId: myTeam?.id }),
    onSuccess: (data) => {
      setLiveRoom(data.room)
      setRoomCode(data.room.code)
      sendMachine({ type: 'room', roomCode: data.room.code })
      setNotice(t('roomJoined', { code: data.room.code }))
      goTo('/rooms')
      void queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : String(error)),
  })

  const startHumanDuel = (
    mode: Extract<SessionMode, 'practice' | 'ranked' | 'room'> = 'practice',
  ) => {
    if (!myTeam) {
      setOnboardingStep('squad')
      setNotice(t('createSquadBeforeLive'))
      return
    }
    unlockBattleAudio()
    setBattleBgm(true)
    const agent =
      tanks.find((tank) => tank.id === defenderId) ??
      tanks.find((tank) => tank.id !== challengerId) ??
      tanks[0]
    const selectedMap =
      mapId === 'random'
        ? maps[Math.floor(Math.random() * maps.length)]
        : (maps.find((map) => map.id === mapId) ?? maps[0])
    if (!agent || !selectedMap) {
      setNotice(t('pickAgentMap'))
      return
    }

    humanActionsRef.current = []
    pressedKeysRef.current.clear()
    agentActionsRef.current = []
    agentThinkingRef.current = false
    setReplay(null)
    setActiveMatchId('')
    setCoachBrief('')
    setPlaying(false)
    setFrame(0)
    sendMachine({ type: 'live', mode })
    const duel = createHumanDuel({
      mapId: selectedMap.id,
      mapName: selectedMap.name,
      mapRaw: selectedMap.raw,
      humanName: myTeam.name,
      humanSkillType: skillType,
      agent,
    })
    setHumanDuel(duel)
    lastRoomFrameSentRef.current = 0
    setOnboardingStep(null)
    if (mode === 'room') {
      sendRoomMessage({
        type: 'battle.start',
        duelId: duel.id,
        mapId: selectedMap.id,
        mode: liveMode,
        role: humanRole,
      })
    }
    goTo('/')
    focusArena()
    const modeLabel =
      mode === 'ranked' ? t('rankedLive') : mode === 'room' ? t('liveRoom') : t('practiceBattle')
    const controlNote =
      liveMode === 'manual'
        ? t('manualControl')
        : t('coopControl', {
            role: t(humanRole),
            otherRole: t(humanRole === 'tank' ? 'engineer' : 'tank'),
          })
    setNotice(
      t('liveStarted', {
        modeLabel,
        liveMode: t(liveMode),
        controlNote,
        agentName: agent.name,
      }),
    )
  }

  const startScout = () => {
    if (liveMode === 'auto') {
      unlockBattleAudio()
      setBattleBgm(true)
      clearLiveDuel()
      sendMachine({ type: 'replay_loading', source: 'practice' })
      simulateMutation.mutate()
      return
    }
    startHumanDuel('practice')
  }

  const startRankedChallenge = () => {
    if (liveMode === 'auto') {
      unlockBattleAudio()
      setBattleBgm(true)
      clearLiveDuel()
      sendMachine({ type: 'replay_loading', source: 'ranked' })
      challengeMutation.mutate()
      return
    }
    startHumanDuel('ranked')
  }

  return {
    challengerId,
    setChallengerId,
    defenderId,
    setDefenderId,
    mapId,
    setMapId,
    replay,
    activeMatchId,
    frame,
    setFrame,
    playing,
    setPlaying: setReplayPlaying,
    teamName,
    setTeamName,
    teamDescription,
    setTeamDescription,
    teamColor,
    setTeamColor,
    selectedGameMode,
    setSelectedGameMode,
    liveMode,
    setLiveMode,
    machine,
    sessionMode,
    roomName,
    setRoomName,
    roomCode,
    setRoomCode,
    liveRoom,
    socketStatus,
    roomPeers,
    roomEvents,
    replayComment,
    setReplayComment,
    reviewModalOpen,
    setReviewModalOpen,
    reviewInputRef,
    coachBrief,
    tacticsNote,
    setTacticsNote,
    briefTargets,
    setBriefTargets,
    buddyChoiceOpen,
    rememberBuddy,
    setRememberBuddy,
    notice,
    locale,
    t,
    onboardingStep,
    setOnboardingStep,
    dismissOnboarding,
    arenaFocusRef,
    humanRole,
    setHumanRole,
    humanDuel,
    displayHumanDuel,
    setHumanDuel,
    humanActionsRef,
    tanks,
    maps,
    myTeam,
    oauthSession,
    oauthPopupOpen,
    identityLabel,
    teamTank,
    matches,
    rooms,
    unreadMatches,
    activeMatch,
    arenaFlow,
    hasReplayComments,
    canAdjustTactics,
    activeBoardState,
    resultLabel,
    arenaEndLabel,
    teamMutation,
    simulateMutation,
    challengeMutation,
    briefMutation,
    loadReplayMutation,
    commentMutation,
    reviewBriefMutation,
    createRoomMutation,
    joinRoomMutation,
    leaderboardQuery,
    inboxesQuery,
    startHumanDuel,
    startScout,
    startRankedChallenge,
    rematch,
    leaveBattle,
    selectRival,
    selectRoom,
    connectOAuth,
    goTo,
    openReplayReview,
    openReviewModal,
    closeReviewModal,
    submitReplayComment,
    openBuddyCoaching,
    openBuddyChoice,
    closeBuddyChoice,
    confirmBuddyChoice,
    requestBuddyCreation,
  }
}

type WarbuddyAppContextValue = ReturnType<typeof useWarbuddyAppModel>

const WarbuddyAppContext = createContext<WarbuddyAppContextValue | null>(null)

function useWarbuddyApp() {
  const context = useContext(WarbuddyAppContext)
  if (!context) throw new Error('WarBuddy app context is missing')
  return context
}

function App() {
  const model = useWarbuddyAppModel()
  return (
    <WarbuddyAppContext.Provider value={model}>
      <RouterProvider router={router} />
    </WarbuddyAppContext.Provider>
  )
}

function RootLayout() {
  const app = useWarbuddyApp()
  return (
    <main
      className="app community-app"
      style={{ '--team-color': app.myTeam?.color ?? '#a5342b' } as CSSProperties}
    >
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          <GameLogo />
        </div>
        <div>
          <h1>{app.t('appTitle')}</h1>
        </div>
        <div className="top-stats">
          <Stat icon={<UserRound size={14} />} value={app.identityLabel} label={app.t('pilot')} />
          <Stat
            icon={<Shield size={14} />}
            value={app.myTeam ? app.myTeam.name : app.t('noSquad')}
            label={app.t('squad')}
          />
          <Stat
            icon={<Eye size={14} />}
            value={String(app.unreadMatches.length)}
            label={app.t('unread')}
          />
          <Stat
            icon={<DoorOpen size={14} />}
            value={String(app.rooms.length)}
            label={app.t('rooms')}
          />
          {app.oauthSession?.configured && !app.oauthSession.authenticated ? (
            <Button
              className="identity-button"
              onClick={app.connectOAuth}
              disabled={app.oauthPopupOpen}
              icon={<UserRound size={15} />}
            >
              {app.oauthPopupOpen ? app.t('signingIn') : app.t('signIn')}
            </Button>
          ) : null}
        </div>
      </header>
      <TopNav />
      <ActiveBattleStrip />
      <GlobalNotice />
      <Outlet />
      <OnboardingModal />
      <ReplayCommentModal />
      <BuddyChoiceModal />
    </main>
  )
}

function GlobalNotice() {
  const app = useWarbuddyApp()
  return app.notice ? <div className="notice global-notice">{app.notice}</div> : null
}

function ActiveBattleStrip() {
  const app = useWarbuddyApp()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  if (!app.displayHumanDuel || app.displayHumanDuel.status !== 'running' || pathname === '/') {
    return null
  }
  return (
    <div className="active-battle-strip">
      <div>
        <strong>{app.t('battleRunning')}</strong>
        <span>
          {app.displayHumanDuel.tanks[0].name} {app.t('vs')} {app.displayHumanDuel.tanks[1].name} ·{' '}
          {app.t('time')}{' '}
          {formatBattleClock(app.displayHumanDuel.frame, DEFAULT_WARBUDDY_RULES.timing.fps)}
        </span>
      </div>
      <div className="button-row compact-row">
        <Button variant="primary" onClick={() => app.goTo('/')} icon={<Gamepad2 size={15} />}>
          {app.t('return')}
        </Button>
        <Button onClick={app.leaveBattle} icon={<Pause size={15} />}>
          {app.t('leave')}
        </Button>
      </div>
    </div>
  )
}

function TopNav() {
  const app = useWarbuddyApp()
  return (
    <nav className="top-nav" aria-label="WarBuddy sections">
      <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: 'active' }}>
        <Gamepad2 size={16} />
        <span>{app.t('arena')}</span>
      </Link>
      <Link to="/squad" activeProps={{ className: 'active' }}>
        <Users size={16} />
        <span>{app.t('squad')}</span>
      </Link>
      <Link to="/replays" activeProps={{ className: 'active' }}>
        <Eye size={16} />
        <span>{app.t('replays')}</span>
      </Link>
    </nav>
  )
}

function ArenaPage() {
  const app = useWarbuddyApp()
  return (
    <section className={clsx('route-shell arena-route', app.activeBoardState && 'focus-mode')}>
      <div className="battle-column">
        <ArenaPanelView />
      </div>
      <aside className="side-column">
        <PlayHubPanel />
        <CurrentQuestPanel />
      </aside>
    </section>
  )
}

function CurrentQuestPanel() {
  const app = useWarbuddyApp()
  const flowIndex = flowStepIndex(app.arenaFlow)
  const titleByFlow: Record<ArenaFlow, string> = {
    needs_squad: app.t('buildSquad'),
    ready: app.t('chooseBattle'),
    room_lobby: app.liveRoom ? `#${app.liveRoom.code}` : app.t('liveRoom'),
    in_match: app.t('battleInProgress'),
    match_finished: app.arenaEndLabel?.split('\n')[0] ?? app.t('matchFinished'),
    reviewing_replay: app.t('reviewReplay'),
    buddy_coaching: app.t('coachBuddy'),
  }

  return (
    <Panel className="quest-panel">
      <div className="section-title">
        <Flag size={18} />
        <span>{app.t('currentQuest')}</span>
      </div>
      <div className={clsx('quest-card', `flow-${app.arenaFlow}`)}>
        <span className="quest-badge">{app.t('step', { value: Math.max(1, flowIndex + 1) })}</span>
        <strong>{titleByFlow[app.arenaFlow]}</strong>
      </div>
    </Panel>
  )
}

function PlayHubPanel() {
  const app = useWarbuddyApp()
  const duel = app.displayHumanDuel
  const mode = app.selectedGameMode
  const startSelectedMode = () => {
    if (mode === 'ranked') {
      app.startRankedChallenge()
      return
    }
    if (mode === 'pk' && app.liveMode !== 'auto') {
      app.startHumanDuel('practice')
      return
    }
    app.startScout()
  }
  const startLabel =
    mode === 'ranked'
      ? app.t('rankedAuto')
      : mode === 'pk'
        ? app.t('challenge')
        : app.t('practiceReplay')
  const startDisabled =
    !app.myTeam ||
    (mode !== 'room' && !app.defenderId) ||
    app.simulateMutation.isPending ||
    app.challengeMutation.isPending

  return (
    <Panel className="play-hub-panel">
      <div className="section-title">
        <Gamepad2 size={18} />
        <span>{app.t('playHub')}</span>
      </div>
      {!app.myTeam ? (
        <div className="locked-panel">
          <Shield size={26} />
          <strong>{app.t('squadRequired')}</strong>
          <Button
            variant="primary"
            onClick={() => app.setOnboardingStep('squad')}
            icon={<Shield size={16} />}
          >
            {app.t('createSquad')}
          </Button>
        </div>
      ) : duel?.status === 'running' ? (
        <div className="lobby-actions">
          <Button variant="primary" onClick={() => app.goTo('/')} icon={<Gamepad2 size={16} />}>
            {app.t('resumeBattle')}
          </Button>
          <Button onClick={app.leaveBattle} icon={<Pause size={16} />}>
            {app.t('leaveBattle')}
          </Button>
        </div>
      ) : app.arenaFlow === 'match_finished' ? (
        <div className="lobby-actions">
          <Button variant="primary" onClick={app.openReplayReview} icon={<Eye size={16} />}>
            {app.t('watchReplay')}
          </Button>
          <Button onClick={app.rematch} icon={<RefreshCw size={16} />}>
            {app.t('rematch')}
          </Button>
          <Button
            onClick={app.openBuddyChoice}
            disabled={!app.canAdjustTactics}
            icon={<Bot size={16} />}
          >
            {app.t('sendToBuddy')}
          </Button>
        </div>
      ) : (
        <>
          <GameModeCards />
          <div className="mode-context-card">
            <span>{app.t('activeMode')}</span>
            <strong>{app.t(`mode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)}</strong>
            <em>{app.t(`mode${mode.charAt(0).toUpperCase()}${mode.slice(1)}Desc`)}</em>
          </div>
          <ModeSelector mode={app.liveMode} onMode={app.setLiveMode} />
          {app.liveMode === 'manual' ? (
            <div className="room-status">
              <Gamepad2 size={15} />
              <span>{app.t('manualControl')}</span>
            </div>
          ) : app.liveMode === 'coop' ? (
            <RoleSelector role={app.humanRole} onRole={app.setHumanRole} />
          ) : null}
          {mode === 'room' ? (
            <>
              <div className="control-grid compact lobby-setup">
                <input
                  value={app.roomName}
                  onChange={(event) => app.setRoomName(event.target.value)}
                  placeholder={app.t('roomName')}
                />
                <input
                  value={app.roomCode}
                  onChange={(event) => app.setRoomCode(event.target.value.toUpperCase())}
                  placeholder={app.t('roomCode')}
                />
                <Select
                  label={app.t('map')}
                  value={app.mapId}
                  onChange={app.setMapId}
                  options={[
                    { value: 'random', label: app.t('random') },
                    ...app.maps.map((map) => ({ value: map.id, label: map.name })),
                  ]}
                />
              </div>
              <div className="lobby-actions two-up">
                <Button
                  onClick={() => app.createRoomMutation.mutate()}
                  disabled={!app.myTeam || app.createRoomMutation.isPending}
                  icon={<DoorOpen size={16} />}
                >
                  {app.t('createRoom')}
                </Button>
                <Button
                  onClick={() => app.joinRoomMutation.mutate()}
                  disabled={!app.myTeam || !app.roomCode.trim() || app.joinRoomMutation.isPending}
                  icon={<Users size={16} />}
                >
                  {app.t('join')}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => app.startHumanDuel('room')}
                  disabled={!app.myTeam || !app.tanks.length}
                  icon={<Swords size={16} />}
                >
                  {app.t('startRoomBattle')}
                </Button>
                <Button onClick={() => app.goTo('/rooms')} icon={<DoorOpen size={16} />}>
                  {app.t('roomLobby')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="control-grid compact lobby-setup">
                <Select
                  label={app.t('opponent')}
                  value={app.defenderId}
                  onChange={app.setDefenderId}
                  options={tankOptions(app.tanks.filter((tank) => tank.id !== app.challengerId))}
                />
                <Select
                  label={app.t('map')}
                  value={app.mapId}
                  onChange={app.setMapId}
                  options={[
                    { value: 'random', label: app.t('random') },
                    ...app.maps.map((map) => ({ value: map.id, label: map.name })),
                  ]}
                />
              </div>
              <div className="lobby-actions">
                <Button
                  variant="primary"
                  onClick={startSelectedMode}
                  disabled={startDisabled}
                  icon={<Swords size={16} />}
                >
                  {startLabel}
                </Button>
              </div>
              {app.replay ? (
                <div className="lobby-actions two-up recent-result-actions">
                  <Button onClick={app.openReplayReview} icon={<Eye size={16} />}>
                    {app.t('watchReplay')}
                  </Button>
                  <Button
                    onClick={app.openBuddyChoice}
                    disabled={!app.canAdjustTactics}
                    icon={<Bot size={16} />}
                  >
                    {app.t('delegateBuddy')}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </Panel>
  )
}

function GameModeCards() {
  const app = useWarbuddyApp()
  const modes: Array<{ value: GameMode; icon: ReactNode }> = [
    { value: 'practice', icon: <Gamepad2 size={18} /> },
    { value: 'pk', icon: <Swords size={18} /> },
    { value: 'ranked', icon: <Trophy size={18} /> },
    { value: 'room', icon: <DoorOpen size={18} /> },
  ]
  const chooseMode = (value: GameMode) => {
    app.setSelectedGameMode(value)
    if (value === 'practice') app.setLiveMode('auto')
    if (value === 'pk' && app.liveMode === 'auto') app.setLiveMode('manual')
    if (value === 'ranked') app.setLiveMode('auto')
  }
  return (
    <div className="game-mode-grid" role="group" aria-label="Game mode">
      {modes.map((item) => {
        const labelKey = `mode${item.value.charAt(0).toUpperCase()}${item.value.slice(1)}`
        return (
          <button
            key={item.value}
            type="button"
            className={clsx('game-mode-card', app.selectedGameMode === item.value && 'selected')}
            onClick={() => chooseMode(item.value)}
          >
            {item.icon}
            <span>{app.t(labelKey)}</span>
          </button>
        )
      })}
    </div>
  )
}

function flowStepIndex(flow: ArenaFlow) {
  if (flow === 'room_lobby' || flow === 'in_match') return 1
  return Math.max(
    0,
    FLOW_STEPS.findIndex((step) => step.flow === flow),
  )
}

function SquadPage() {
  return (
    <section className="route-shell war-room-grid">
      <SquadPanel />
      <TacticsDeskPanel />
    </section>
  )
}

function RoomsPage() {
  return (
    <section className="route-shell page-grid two-column">
      <LiveRoomPanel />
      <RoomListPanel />
    </section>
  )
}

function RankedPage() {
  const app = useWarbuddyApp()
  return (
    <section className="route-shell page-grid two-column wide-left">
      <RankedPanel />
      <ChallengePanel title={app.t('challengeSetup')} context="ranked" />
    </section>
  )
}

function ReplaysPage() {
  const app = useWarbuddyApp()
  if (!app.replay) {
    return (
      <section className="route-shell page-grid two-column wide-left">
        <HistoryPanel limit={12} />
        <ReplayReviewPanel />
      </section>
    )
  }

  return (
    <section
      className={clsx('route-shell page-grid replay-route', app.activeBoardState && 'focus-mode')}
    >
      <div className="battle-column">
        <ArenaPanelView />
      </div>
      <aside className="side-column">
        <ReplayReviewPanel />
        <HistoryPanel limit={12} />
      </aside>
    </section>
  )
}

function BuddyPage() {
  return <SquadPage />
}

function ArenaPanelView() {
  const app = useWarbuddyApp()
  const duel = app.displayHumanDuel
  const usesWorldCoordinates = Boolean(duel) || app.replay?.meta.coordinateSpace === 'world'
  return (
    <div ref={app.arenaFocusRef}>
      <Panel className="arena-panel">
        <div className="battle-head">
          <div>
            <span className="eyebrow">{app.t('battlefield')}</span>
            <h2>
              {duel
                ? `${app.myTeam?.name ?? app.t('yourSquad')} ${app.t('vs')} ${duel.tanks[1].name}`
                : app.replay
                  ? `${app.replay.meta.players[0]?.name} ${app.t('vs')} ${app.replay.meta.players[1]?.name}`
                  : app.t('readyRoom')}
            </h2>
          </div>
          <div className="result-pill">{app.resultLabel}</div>
        </div>
        <Arena
          state={app.activeBoardState}
          continuous={usesWorldCoordinates}
          endLabel={app.arenaEndLabel}
          teamColor={app.myTeam?.color ?? app.teamColor}
        />
        {duel ? (
          <HumanDuelControls
            duel={duel}
            role={app.humanRole}
            onAction={(action) => app.humanActionsRef.current.push(action)}
            onClose={app.leaveBattle}
          />
        ) : (
          <ReplayControls
            replay={app.replay}
            frame={app.frame}
            playing={app.playing}
            onFrame={app.setFrame}
            onPlaying={app.setPlaying}
          />
        )}
      </Panel>
    </div>
  )
}

function PostMatchActions() {
  const app = useWarbuddyApp()
  return (
    <div className="post-match-actions">
      <strong>{app.arenaEndLabel ?? app.resultLabel}</strong>
      <div className="button-row split">
        <Button variant="primary" onClick={app.openReplayReview} icon={<Eye size={16} />}>
          {app.t('watchReplay')}
        </Button>
        <Button onClick={app.rematch} icon={<RefreshCw size={16} />}>
          {app.t('rematch')}
        </Button>
        <Button
          onClick={app.openBuddyCoaching}
          disabled={!app.activeMatchId}
          icon={<Bot size={16} />}
        >
          {app.t('sendToBuddy')}
        </Button>
      </div>
    </div>
  )
}

function SquadPanel() {
  const app = useWarbuddyApp()
  return (
    <Panel className="squad-panel">
      <div className="section-title">
        <Users size={18} />
        <span>{app.t('warRoomTitle')}</span>
      </div>
      <div className="team-card" style={{ borderColor: app.myTeam?.color ?? app.teamColor }}>
        <strong>{app.myTeam?.name ?? app.t('createSquadFirst')}</strong>
        <span>{app.myTeam?.description ?? app.t('squadHelp')}</span>
        <div className="squad-summary-grid compact-stats">
          <Stat value={app.teamTank?.skillType ?? 'shield'} label={app.t('skill')} />
          <Stat value={String(app.teamTank?.rankScore ?? 0)} label={app.t('rating')} />
          <Stat value={String(app.teamTank?.wins ?? 0)} label={app.t('wins')} />
        </div>
        <em>{app.teamTank?.name ?? app.t('noSquadTank')}</em>
      </div>
      <div className="editor-grid">
        <input
          value={app.teamName}
          onChange={(event) => app.setTeamName(event.target.value)}
          placeholder={app.t('squadName')}
        />
        <input
          type="color"
          value={app.teamColor}
          onChange={(event) => app.setTeamColor(event.target.value)}
          aria-label={app.t('squadColor')}
        />
      </div>
      <textarea
        className="brief-textarea"
        value={app.teamDescription}
        onChange={(event) => app.setTeamDescription(event.target.value)}
        placeholder={app.t('squadDescription')}
      />
      <Button
        variant="primary"
        className="full"
        onClick={() => app.teamMutation.mutate()}
        disabled={!app.teamName.trim() || app.teamMutation.isPending}
        icon={<Shield size={16} />}
      >
        {app.myTeam ? app.t('updateSquad') : app.t('createSquad')}
      </Button>
    </Panel>
  )
}

function SquadLoadoutPanel() {
  const app = useWarbuddyApp()
  return (
    <Panel className="squad-summary-panel">
      <div className="section-title">
        <Shield size={18} />
        <span>{app.t('teamIdentity')}</span>
      </div>
      <div className="squad-summary-grid">
        <Stat value={app.teamTank?.skillType ?? 'shield'} label={app.t('skill')} />
        <Stat value={String(app.teamTank?.rankScore ?? 0)} label={app.t('rating')} />
        <Stat value={String(app.teamTank?.wins ?? 0)} label={app.t('wins')} />
      </div>
      <div
        className="team-card compact"
        style={{ borderColor: app.myTeam?.color ?? app.teamColor }}
      >
        <strong>{app.teamTank?.name ?? app.t('noSquadTank')}</strong>
        <span>{app.teamTank?.appearance ?? app.t('squadHelp')}</span>
      </div>
    </Panel>
  )
}

function LiveRoomPanel() {
  const app = useWarbuddyApp()
  return (
    <Panel className="mission-control-panel">
      <div className="section-title">
        <Gamepad2 size={18} />
        <span>{app.t('liveRoom')}</span>
      </div>
      <ModeSelector mode={app.liveMode} onMode={app.setLiveMode} />
      {app.liveMode === 'manual' ? (
        <div className="room-status">
          <Gamepad2 size={15} />
          <span>{app.t('manualControl')}</span>
        </div>
      ) : app.liveMode === 'coop' ? (
        <RoleSelector role={app.humanRole} onRole={app.setHumanRole} />
      ) : null}
      <div className="editor-grid">
        <input
          value={app.roomName}
          onChange={(event) => app.setRoomName(event.target.value)}
          placeholder={app.t('roomName')}
        />
        <input
          value={app.roomCode}
          onChange={(event) => app.setRoomCode(event.target.value.toUpperCase())}
          placeholder={app.t('roomCode')}
        />
      </div>
      <div className="room-status">
        <DoorOpen size={15} />
        <span>
          {app.liveRoom ? `${app.liveRoom.code} · ${app.socketStatus}` : app.t('noActiveRoom')}
        </span>
      </div>
      {app.liveRoom ? (
        <RoomLobbyCard room={app.liveRoom} peers={app.roomPeers} events={app.roomEvents} />
      ) : null}
      <div className="button-row split">
        <Button
          onClick={() => app.createRoomMutation.mutate()}
          disabled={!app.myTeam || app.createRoomMutation.isPending}
          icon={<DoorOpen size={16} />}
        >
          {app.t('createRoom')}
        </Button>
        <Button
          onClick={() => app.joinRoomMutation.mutate()}
          disabled={!app.myTeam || !app.roomCode.trim() || app.joinRoomMutation.isPending}
          icon={<Users size={16} />}
        >
          {app.t('join')}
        </Button>
      </div>
      <div className="button-row split">
        <Button
          variant="primary"
          onClick={() => app.startHumanDuel('room')}
          disabled={!app.myTeam || !app.tanks.length}
          icon={<Swords size={16} />}
        >
          {app.t('startRoomBattle')}
        </Button>
        <Button
          onClick={app.leaveBattle}
          disabled={!app.displayHumanDuel}
          icon={<Pause size={16} />}
        >
          {app.t('exit')}
        </Button>
      </div>
    </Panel>
  )
}

function RoomLobbyCard({
  room,
  peers,
  events,
}: {
  room: WarbuddyRoom
  peers: Array<{ displayName: string; mode?: string | null }>
  events: string[]
}) {
  const app = useWarbuddyApp()
  return (
    <div className="room-lobby-card">
      <div className="room-code-block">
        <span>{app.t('roomCode')}</span>
        <strong>{room.code}</strong>
      </div>
      <div className="room-seat-grid">
        <div>
          <strong>{app.t('host')}</strong>
          <span>{room.hostTeamId ? app.t('readySquad') : app.t('openSlot')}</span>
        </div>
        <div>
          <strong>{app.t('guestSeat')}</strong>
          <span>{room.guestTeamId ? app.t('joined') : app.t('waiting')}</span>
        </div>
        <div>
          <strong>{app.t('mode')}</strong>
          <span>{app.t(room.mode)}</span>
        </div>
        <div>
          <strong>{app.t('status')}</strong>
          <span>{room.status}</span>
        </div>
      </div>
      <div className="participant-row">
        {(peers.length ? peers : room.participants).map((participant) => (
          <span key={`${participant.displayName}-${participant.mode}`}>
            {participant.displayName} ·{' '}
            {participant.mode ? app.t(participant.mode) : app.t('online')}
          </span>
        ))}
      </div>
      {events.length ? (
        <div className="room-event-feed">
          {events.map((event) => (
            <span key={event}>{event}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RoomListPanel() {
  const app = useWarbuddyApp()
  return (
    <Panel className="rooms-panel">
      <div className="section-title">
        <DoorOpen size={18} />
        <span>{app.t('rooms')}</span>
      </div>
      {app.rooms.length ? (
        <div className="room-list">
          {app.rooms.map((room) => (
            <article key={room.id} className="room-card">
              <strong>{room.name}</strong>
              <span>
                {room.code} · {room.status} · {app.t(room.mode)}
              </span>
              <em>
                {room.participants.length} {app.t('pilots')}
              </em>
              <Button onClick={() => app.selectRoom(room)} icon={<DoorOpen size={14} />}>
                {app.t('enter')}
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-list">{app.t('noLiveRooms')}</div>
      )}
    </Panel>
  )
}

function ChallengePanel({
  title,
  context = 'practice',
}: {
  title: string
  context?: 'practice' | 'ranked'
}) {
  const app = useWarbuddyApp()
  return (
    <Panel className="challenge-panel">
      <div className="section-title">
        <Flag size={18} />
        <span>{title}</span>
      </div>
      {!app.myTeam ? (
        <div className="locked-panel">
          <Shield size={26} />
          <strong>{app.t('squadRequired')}</strong>
          <span>{app.t('createSquadBeforeLive')}</span>
          <Button
            variant="primary"
            onClick={() => app.setOnboardingStep('squad')}
            icon={<Shield size={16} />}
          >
            {app.t('createSquad')}
          </Button>
        </div>
      ) : (
        <>
          <ModeSelector mode={app.liveMode} onMode={app.setLiveMode} />
          {app.liveMode === 'manual' ? (
            <div className="room-status">
              <Gamepad2 size={15} />
              <span>{app.t('manualControl')}</span>
            </div>
          ) : app.liveMode === 'coop' ? (
            <RoleSelector role={app.humanRole} onRole={app.setHumanRole} />
          ) : null}
          <div className="control-grid compact">
            <Select
              label={app.t('yourSquad')}
              value={app.challengerId}
              onChange={app.setChallengerId}
              options={tankOptions(app.teamTank ? [app.teamTank] : app.tanks)}
            />
            <Select
              label={app.t('defender')}
              value={app.defenderId}
              onChange={app.setDefenderId}
              options={tankOptions(app.tanks.filter((tank) => tank.id !== app.challengerId))}
            />
            <Select
              label={app.t('map')}
              value={app.mapId}
              onChange={app.setMapId}
              options={[
                { value: 'random', label: app.t('random') },
                ...app.maps.map((map) => ({ value: map.id, label: map.name })),
              ]}
            />
          </div>
          <div className={clsx('button-row', context === 'practice' ? 'split' : 'single-action')}>
            {context === 'practice' ? (
              <Button
                onClick={app.startScout}
                disabled={!app.myTeam || !app.defenderId || app.simulateMutation.isPending}
                icon={<RefreshCw size={16} />}
              >
                {app.liveMode === 'auto' ? app.t('scoutReplay') : app.t('practiceBattle')}
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={app.startRankedChallenge}
              disabled={
                !app.myTeam ||
                !app.challengerId ||
                !app.defenderId ||
                app.challengeMutation.isPending
              }
              icon={<Swords size={16} />}
            >
              {app.t('rankedAuto')}
            </Button>
          </div>
        </>
      )}
    </Panel>
  )
}

function TacticsDeskPanel() {
  const app = useWarbuddyApp()
  const selectedMatchLabel = app.activeMatch
    ? `${app.activeMatch.participants.challenger.tankName} ${app.t('vs')} ${app.activeMatch.participants.defender.tankName}`
    : app.activeMatchId
      ? `${app.t('match')} ${app.activeMatchId}`
      : app.t('noReplaySelected')
  return (
    <Panel className="tactics-desk-panel">
      <div className="section-title">
        <Shield size={18} />
        <span>{app.t('strategyLoop')}</span>
      </div>
      <div className="coach-brief-box">
        <span>{app.t('selectedGame')}</span>
        <strong>{selectedMatchLabel}</strong>
      </div>
      <div className="coach-brief-box muted">
        <span>{app.t('tacticsBrief')}</span>
        <strong>{app.coachBrief || app.t('noTacticsYet')}</strong>
      </div>
      <div className="button-row split">
        <Button onClick={() => app.goTo('/replays')} icon={<Eye size={16} />}>
          {app.t('openReplays')}
        </Button>
        <Button variant="primary" onClick={app.openBuddyChoice} icon={<Bot size={16} />}>
          {app.t('delegateBuddy')}
        </Button>
      </div>
    </Panel>
  )
}

function ReplayReviewPanel() {
  const app = useWarbuddyApp()
  const canSendNotes = app.canAdjustTactics
  return (
    <Panel className="replay-panel">
      <div className="section-title">
        <MessageSquare size={18} />
        <span>{app.t('replayReviewPanel')}</span>
      </div>
      <div className="replay-review-box">
        <strong>
          {app.activeMatchId
            ? `${app.t('match')} ${app.activeMatchId}`
            : app.t('openReplayToComment')}
        </strong>
        <span>
          {app.activeMatchId ? app.t('frameCommentPlaceholder') : app.t('chooseRecentGameFirst')}
        </span>
        <div className="button-row split review-actions">
          <Button onClick={() => app.goTo('/')} icon={<Gamepad2 size={16} />}>
            {app.t('returnLobby')}
          </Button>
          <Button
            onClick={app.openReviewModal}
            disabled={!app.activeMatchId}
            icon={<MessageSquare size={16} />}
          >
            {app.t('reviewThisMoment')}
          </Button>
        </div>
        <div className="button-row single-action review-actions">
          <Button
            variant="primary"
            onClick={app.openBuddyChoice}
            disabled={!canSendNotes || app.reviewBriefMutation.isPending}
            icon={<Bot size={16} />}
          >
            {app.t('sendSavedNotesToBuddy')}
          </Button>
        </div>
      </div>
      {app.coachBrief ? <div className="coach-brief-box">{app.coachBrief}</div> : null}
    </Panel>
  )
}

function RankedPanel() {
  const app = useWarbuddyApp()
  return (
    <Panel className="standings-panel">
      <div className="section-title">
        <Trophy size={18} />
        <span>{app.t('rankedLadder')}</span>
      </div>
      <Leaderboard
        rows={app.leaderboardQuery.data?.leaderboard ?? []}
        currentTankId={app.teamTank?.id}
        onChallenge={app.selectRival}
      />
    </Panel>
  )
}

function HistoryPanel({ limit }: { limit: number }) {
  const app = useWarbuddyApp()
  return (
    <Panel className="history-panel">
      <div className="section-title">
        <Eye size={18} />
        <span>{app.t('replayInbox')}</span>
      </div>
      <History
        matches={app.matches.slice(0, limit)}
        loadingMatchId={app.loadReplayMutation.isPending ? app.loadReplayMutation.variables : ''}
        onReplay={(match) => app.loadReplayMutation.mutate(match.id)}
      />
    </Panel>
  )
}

function OnboardingModal() {
  const app = useWarbuddyApp()
  const step = app.onboardingStep
  if (!step) return null

  if (step === 'squad') {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="guide-modal squad-guide-modal">
          <div className="guide-art">
            <GameLogo />
          </div>
          <div className="guide-copy">
            <span className="eyebrow">{app.t('step', { value: 1 })}</span>
            <h2>{app.t('onboardingSquadTitle')}</h2>
            <p>{app.t('onboardingSquadBody')}</p>
          </div>
          <div className="editor-grid">
            <input
              value={app.teamName}
              onChange={(event) => app.setTeamName(event.target.value)}
              placeholder={app.t('squadName')}
              autoFocus
            />
            <input
              type="color"
              value={app.teamColor}
              onChange={(event) => app.setTeamColor(event.target.value)}
              aria-label={app.t('squadColor')}
            />
          </div>
          <textarea
            className="brief-textarea"
            value={app.teamDescription}
            onChange={(event) => app.setTeamDescription(event.target.value)}
            placeholder={app.t('squadDescription')}
          />
          <div className="button-row split">
            <Button onClick={app.dismissOnboarding}>{app.t('later')}</Button>
            <Button
              variant="primary"
              onClick={() => app.teamMutation.mutate()}
              disabled={!app.teamName.trim() || app.teamMutation.isPending}
              icon={<ChevronRight size={16} />}
            >
              {app.t('createSquad')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const config: Record<
    Exclude<OnboardingStep, 'squad' | null>,
    { title: string; body: string; icon: ReactNode; action: () => void; actionLabel: string }
  > = {
    practice: {
      title: app.t('onboardingPracticeTitle'),
      body: app.t('onboardingPracticeBody'),
      icon: <Gamepad2 size={38} />,
      action: () => {
        app.dismissOnboarding()
        app.startRankedChallenge()
      },
      actionLabel: app.t('startPractice'),
    },
    replay: {
      title: app.t('onboardingReplayTitle'),
      body: app.t('onboardingReplayBody'),
      icon: <Eye size={38} />,
      action: () => {
        app.dismissOnboarding()
        app.openReplayReview()
      },
      actionLabel: app.t('watchReplay'),
    },
    review: {
      title: app.t('onboardingReviewTitle'),
      body: app.t('onboardingReviewBody'),
      icon: <NotepadText size={38} />,
      action: () => {
        app.dismissOnboarding()
        app.openReviewModal()
      },
      actionLabel: app.t('startReview'),
    },
    buddy: {
      title: app.t('onboardingBuddyTitle'),
      body: app.t('onboardingBuddyBody'),
      icon: <Bot size={38} />,
      action: () => {
        app.dismissOnboarding()
        app.goTo('/squad')
      },
      actionLabel: app.t('sendToBuddy'),
    },
  }
  const item = config[step]
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="guide-modal">
        <div className="guide-art">{item.icon}</div>
        <div className="guide-copy">
          <h2>{item.title}</h2>
          <p>{item.body}</p>
        </div>
        <div className="button-row split">
          <Button onClick={app.dismissOnboarding}>{app.t('later')}</Button>
          <Button variant="primary" onClick={item.action} icon={<ChevronRight size={16} />}>
            {item.actionLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReplayCommentModal() {
  const app = useWarbuddyApp()
  if (!app.reviewModalOpen) return null
  const saving = app.commentMutation.isPending || app.reviewBriefMutation.isPending
  const canSave = Boolean(app.activeMatchId && app.replayComment.trim() && !saving)
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="guide-modal review-write-modal">
        <div className="guide-art">
          <MessageSquare size={46} />
        </div>
        <div className="guide-copy">
          <span className="eyebrow">
            {app.activeMatchId ? `${app.t('match')} ${app.activeMatchId}` : app.t('replay')}
          </span>
          <h2>{app.t('reviewModalTitle')}</h2>
          <p>{app.t('reviewModalBody')}</p>
        </div>
        <label className="review-field">
          <span>{app.t('reviewModalPrompt')}</span>
          <textarea
            ref={app.reviewInputRef}
            value={app.replayComment}
            onChange={(event) => app.setReplayComment(event.target.value)}
            placeholder={app.t('frameCommentPlaceholder')}
          />
        </label>
        <div className="button-row review-modal-actions">
          <Button onClick={() => app.closeReviewModal(true)} disabled={saving}>
            {app.t('continueWatching')}
          </Button>
          <Button
            onClick={() => app.submitReplayComment('resume')}
            disabled={!canSave}
            icon={<MessageSquare size={16} />}
          >
            {app.t('saveAndContinue')}
          </Button>
          <Button
            variant="primary"
            onClick={() => app.submitReplayComment('buddy')}
            disabled={!canSave}
            icon={<Send size={16} />}
          >
            {app.t('saveAndSendBuddy')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function BuddyChoiceModal() {
  const app = useWarbuddyApp()
  if (!app.buddyChoiceOpen) return null
  const inboxesList = app.inboxesQuery.data?.inboxes ?? []
  const selected = app.briefTargets[0] ?? ''
  const sending = app.briefMutation.isPending
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="guide-modal buddy-choice-modal">
        <div className="guide-art">
          <Bot size={46} />
        </div>
        <div className="guide-copy">
          <h2>{app.t('chooseBuddyTitle')}</h2>
          <p>{app.t('chooseBuddyBody')}</p>
        </div>
        {inboxesList.length ? (
          <>
            <div className="buddy-choice-list">
              {inboxesList.map((inbox) => {
                const label =
                  inbox.agent.user?.displayName?.trim() ||
                  inbox.agent.user?.username?.trim() ||
                  inbox.agent.id
                return (
                  <button
                    key={inbox.agent.id}
                    type="button"
                    className={clsx('buddy-choice', selected === inbox.agent.id && 'selected')}
                    onClick={() => app.setBriefTargets([inbox.agent.id])}
                  >
                    <Bot size={18} />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
            <label className="review-field tactics-note-field">
              <span>{app.t('tacticsNoteLabel')}</span>
              <textarea
                autoFocus
                value={app.tacticsNote}
                onChange={(event) => app.setTacticsNote(event.target.value)}
                placeholder={app.t('tacticsNotePlaceholder')}
              />
            </label>
            <label className="remember-row">
              <input
                type="checkbox"
                checked={app.rememberBuddy}
                onChange={(event) => app.setRememberBuddy(event.target.checked)}
              />
              <span>{app.t('rememberBuddy')}</span>
            </label>
            <div className="button-row split">
              <Button onClick={app.closeBuddyChoice} disabled={sending}>
                {app.t('later')}
              </Button>
              <Button
                variant="primary"
                onClick={app.confirmBuddyChoice}
                disabled={!selected || sending}
                icon={<Send size={16} />}
              >
                {app.t('delegateBuddy')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="locked-panel compact">
              <Bot size={22} />
              <strong>{app.t('noBuddyConnected')}</strong>
              <span>{app.t('noBuddyHelp')}</span>
            </div>
            <div className="button-row split">
              <Button onClick={app.closeBuddyChoice}>{app.t('later')}</Button>
              <Button variant="primary" onClick={app.requestBuddyCreation} icon={<Bot size={16} />}>
                {app.t('createBuddy')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const rootRoute = createRootRoute({ component: RootLayout })
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ArenaPage })
const squadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/squad',
  component: SquadPage,
})
const roomsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rooms',
  component: RoomsPage,
})
const rankedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ranked',
  component: RankedPage,
})
const replaysRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/replays',
  component: ReplaysPage,
})
const buddyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/buddy',
  component: BuddyPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  squadRoute,
  roomsRoute,
  rankedRoute,
  replaysRoute,
  buddyRoute,
])

const router = createRouter({ routeTree, basepath: shadowServerAppMountedPath('/shadow/server') })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('panel', className)}>{children}</section>
}

function Button({
  children,
  className,
  icon,
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode
  variant?: 'default' | 'primary' | 'quiet'
}) {
  return (
    <button
      type="button"
      className={clsx('ui-button', variant !== 'default' && variant, className)}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

function GameLogo() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="WarBuddy">
      <rect x="5" y="5" width="54" height="54" rx="8" fill="#213a2b" />
      <path d="M12 42h28v8H12zM18 22h22v16H18z" fill="#d9c84d" />
      <path d="M40 27h13v5H40z" fill="#d9c84d" />
      <path d="M20 18h14v8H20z" fill="#4f8f63" />
      <circle cx="18" cy="50" r="3" fill="#f4ead0" />
      <circle cx="34" cy="50" r="3" fill="#f4ead0" />
      <path d="M45 44l5 4 5-4v9H45z" fill="#c75b44" />
    </svg>
  )
}

function Stat({ value, label, icon }: { value: string; label: string; icon?: ReactNode }) {
  return (
    <div className="stat">
      {icon ? <span className="stat-icon">{icon}</span> : null}
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

function RoleSelector({ role, onRole }: { role: DuelRole; onRole: (role: DuelRole) => void }) {
  const app = useWarbuddyApp()
  return (
    <div className="role-switch" role="group" aria-label="Human role">
      <Button
        className={clsx(role === 'tank' && 'selected')}
        onClick={() => onRole('tank')}
        icon={<Radio size={15} />}
      >
        {app.t('tank')}
      </Button>
      <Button
        className={clsx(role === 'engineer' && 'selected')}
        onClick={() => onRole('engineer')}
        icon={<UserRound size={15} />}
      >
        {app.t('engineer')}
      </Button>
    </div>
  )
}

function ModeSelector({
  mode,
  onMode,
}: {
  mode: WarbuddyPlayMode
  onMode: (mode: WarbuddyPlayMode) => void
}) {
  const app = useWarbuddyApp()
  const modes: Array<{ value: WarbuddyPlayMode; label: string }> = [
    { value: 'auto', label: app.t('auto') },
    { value: 'manual', label: app.t('manual') },
    { value: 'coop', label: app.t('coop') },
  ]
  return (
    <div className="mode-switch" role="group" aria-label="Live mode">
      {modes.map((item) => (
        <Button
          key={item.value}
          className={clsx(mode === item.value && 'selected')}
          onClick={() => onMode(item.value)}
          icon={
            item.value === 'auto' ? (
              <Bot size={15} />
            ) : item.value === 'manual' ? (
              <Gamepad2 size={15} />
            ) : (
              <Users size={15} />
            )
          }
        >
          {item.label}
        </Button>
      ))}
    </div>
  )
}

function tankOptions(tanks: TankSummary[]) {
  return tanks.map((tank) => ({
    value: tank.id,
    label: `${tank.name} · ${tank.skillType} · ${tank.rankScore}`,
  }))
}

function Arena({
  state,
  continuous,
  endLabel,
  teamColor,
}: {
  state: BattleFrameState | null
  continuous: boolean
  endLabel: string | null
  teamColor: string
}) {
  const app = useWarbuddyApp()
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

  if (!state) return <div className="arena empty">{app.t('noReplayLoaded')}</div>
  const width = state.map.length
  const height = state.map[0]?.length ?? 0
  const endLines = endLabel?.split('\n') ?? null
  const tankMoveMs = continuous
    ? WARBUDDY_FRAME_MS
    : WARBUDDY_FRAME_MS * DEFAULT_WARBUDDY_RULES.units.tank.moveCooldownFrames
  const engineerMotionMs = continuous
    ? WARBUDDY_FRAME_MS
    : WARBUDDY_FRAME_MS * DEFAULT_WARBUDDY_RULES.units.engineer.moveCooldownFrames
  const entityMotionStyle = {
    '--tank-move-ms': `${tankMoveMs}ms`,
    '--engineer-motion-ms': `${engineerMotionMs}ms`,
  } as CSSProperties
  return (
    <div className="arena-wrap">
      {state.scoreboard || endLines ? (
        <div className="arena-hud">
          {endLines ? (
            <div className="end-card end-card-inline">
              <strong>{endLines[0]}</strong>
              <span>{endLines[1] ?? app.resultLabel}</span>
              <EndBattleStats state={state} />
            </div>
          ) : null}
          <BattleScoreboard state={state} />
        </div>
      ) : null}
      <div
        className="arena"
        style={{ gridTemplateColumns: `repeat(${width}, 1fr)`, aspectRatio: `${width}/${height}` }}
      >
        {cells.map((cell) => {
          return <div key={`${cell.x}:${cell.y}`} className={clsx('tile', `tile-${cell.tile}`)} />
        })}
        <div
          className={clsx('arena-entities', continuous ? 'motion-live' : 'motion-replay')}
          style={entityMotionStyle}
        >
          {state.flag ? (
            <span
              className="arena-entity flag-anchor"
              style={entityStyle(state.flag, width, height, 0.74, 0, continuous)}
            >
              <span className="flag" />
            </span>
          ) : null}
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
                continuous || bullet.headingDegrees !== undefined,
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
                unitRotationDegrees(tank.headingDegrees, tank.direction),
                continuous,
              )}
            >
              <TankPiece
                index={tankIndex}
                teamColor={teamColor}
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
                0.58,
                engineerRotationDegrees(engineer.headingDegrees, engineer.direction),
                continuous,
              )}
            >
              <EngineerPiece
                engineer={engineer}
                teamColor={teamColor}
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
                style={entityStyle(position, width, height, 1.04, 0, continuous)}
              >
                <span className="explosion" />
              </span>
            )),
          )}
          {(state.speeches ?? []).map((speech) => (
            <span
              key={speech.id}
              className="arena-entity speech-anchor"
              style={entityStyle(speech.position, width, height, 1.2, 0, continuous)}
            >
              <span className={clsx('speech-bubble', speech.owner === 0 ? 'red' : 'blue')}>
                {speech.text}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function BattleScoreboard({ state }: { state: BattleFrameState }) {
  const app = useWarbuddyApp()
  if (!state.scoreboard) return null
  return (
    <div className="battle-scoreboard" aria-label={app.t('scoreboard')}>
      {state.scoreboard.sides.map((side) => {
        const tank = state.tanks[side.owner]
        return (
          <div key={side.owner} className={clsx('score-side', side.owner === 0 ? 'red' : 'blue')}>
            <strong>{tank?.name ?? `P${side.owner + 1}`}</strong>
            <span>
              <Flag size={12} /> {side.flags}
            </span>
            <span>
              {app.t('kills')} {side.kills}
            </span>
            <span>
              {app.t('losses')} {side.losses}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function EndBattleStats({ state }: { state: BattleFrameState }) {
  const app = useWarbuddyApp()
  return (
    <div className="end-stats" aria-label={app.t('battleStats')}>
      {state.tanks.map((tank, index) => {
        const engineer = state.engineers[index]
        return (
          <div key={tank.id} className="end-stat-row">
            <strong>{tank.name}</strong>
            <span>
              {app.t('tank')}: {deathLabel(tank.death, app.t)}
            </span>
            <span>
              {app.t('engineer')}: {deathLabel(engineer?.death, app.t)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function deathLabel(death: UnitDeathState | null | undefined, t: (key: string) => string) {
  if (!death) return t('survived')
  const key = `death${death.cause.charAt(0).toUpperCase()}${death.cause.slice(1)}`
  return t(key)
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

function unitRotationDegrees(headingDegrees: number | undefined, direction: Direction) {
  return headingDegrees ?? rotationForDirection(direction)
}

function engineerRotationDegrees(headingDegrees: number | undefined, direction: Direction) {
  return unitRotationDegrees(headingDegrees, direction) - ENGINEER_SPRITE_BASE_HEADING
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

function unitTeamColor(owner: number, _teamColor: string) {
  return owner === 0 ? '#df362f' : '#3187ee'
}

function TankPiece({
  index,
  teamColor,
  direction,
  crashed,
  status,
  hiddenFromHuman,
}: {
  index: number
  teamColor: string
  direction: Direction
  crashed: boolean
  status: RuntimeTankState['status']
  hiddenFromHuman: boolean
}) {
  return (
    <span
      style={{ '--unit-color': unitTeamColor(index, teamColor) } as CSSProperties}
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
        status.powered && 'powered',
        hiddenFromHuman && 'hidden-from-human',
      )}
      data-dir={direction}
    />
  )
}

function EngineerPiece({
  engineer,
  teamColor,
  hiddenFromHuman,
}: {
  engineer: RuntimeEngineerState
  teamColor: string
  hiddenFromHuman: boolean
}) {
  return (
    <span
      style={{ '--unit-color': unitTeamColor(engineer.owner, teamColor) } as CSSProperties}
      className={clsx(
        'engineer',
        engineer.owner === 0 ? 'challenger' : 'defender',
        !engineer.alive && 'defeated',
        engineer.status.cloaked && 'cloaked',
        engineer.status.swimming && 'swimming',
        engineer.status.fireLocked && 'cooling',
        engineer.status.powered && 'powered',
        hiddenFromHuman && 'hidden-from-human',
      )}
      data-dir={engineer.direction}
      data-range={engineer.bombRange}
    />
  )
}

function HumanDuelControls({
  duel,
  role,
  onAction,
  onClose,
}: {
  duel: HumanDuelState
  role: DuelRole
  onAction: (action: DuelAction) => void
  onClose: () => void
}) {
  const app = useWarbuddyApp()
  const sendAction = (action: DuelAction) => {
    unlockBattleAudio()
    onAction(action)
  }
  return (
    <div className="human-duel-controls">
      <div className="duel-score">
        <span>
          {app.t('flags')}{' '}
          <strong>
            {duel.flagScores[0]} / {duel.flagScores[1]}
          </strong>
        </span>
        <span>
          {app.t('tank')}{' '}
          <strong>
            {app.t('tankStats', {
              shotgun: duel.tanks[0].shotgunLevel,
              armor: duel.tanks[0].armor,
            })}
          </strong>
        </span>
        <span>
          {app.t('engineer')}{' '}
          <strong>
            {app.t('engineerStats', {
              bombs: duel.engineers[0].maxBombs,
              range: duel.engineers[0].bombRange,
            })}
          </strong>
        </span>
        <span>
          {app.t('time')}{' '}
          <strong>
            {formatBattleClock(
              Math.min(duel.frame, duel.maxFrames),
              DEFAULT_WARBUDDY_RULES.timing.fps,
            )}
            /{formatBattleClock(duel.maxFrames, DEFAULT_WARBUDDY_RULES.timing.fps)}
          </strong>
        </span>
      </div>
      <div className="duel-buttons">
        {role === 'tank' ? (
          <>
            <Button
              onClick={() => sendAction({ type: 'unit.fire', unit: { kind: 'tank' } })}
              icon={<Swords size={14} />}
            >
              Q {app.t('fire')}
            </Button>
            <Button
              onClick={() =>
                sendAction({ type: 'unit.ability', unit: { kind: 'tank' }, ability: 'primary' })
              }
              icon={<Shield size={14} />}
            >
              E {app.t('skillAction')}
            </Button>
          </>
        ) : (
          <Button
            onClick={() =>
              sendAction({ type: 'unit.ability', unit: { kind: 'engineer' }, ability: 'bomb' })
            }
            icon={<Bomb size={14} />}
          >
            U {app.t('bomb')}
          </Button>
        )}
        <Button onClick={onClose} icon={<Pause size={14} />}>
          {app.t('exit')}
        </Button>
      </div>
    </div>
  )
}

function duelResultLabel(
  duel: HumanDuelState,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  if (duel.status === 'running') {
    return `${t('flags')} ${duel.flagScores[0]} · ${duel.flagScores[1]}`
  }
  const winner =
    duel.result.winner === 'human'
      ? t('youWon')
      : duel.result.winner === 'agent'
        ? t('winnerText', { name: duel.tanks[1].name })
        : t('draw')
  return resultSummaryLabel(winner, duel.result.reason, t)
}

function duelEndLabel(
  duel: HumanDuelState,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const winnerName =
    duel.result.winner === 'human'
      ? duel.tanks[0].name
      : duel.result.winner === 'agent'
        ? duel.tanks[1].name
        : null
  return resultEndLabel(winnerName, duel.result.reason, t)
}

function replayEndLabel(
  replay: BattleReplay,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  return resultEndLabel(replay.summary.result.winner ?? null, replay.summary.result.reason, t)
}

function formatBattleClock(frame: number, fps: number) {
  const seconds = Math.max(0, Math.floor(frame / Math.max(1, fps)))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function resultEndLabel(
  winnerName: string | null,
  reason: string,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const title = winnerName ? t('winnerLine', { name: winnerName }) : t('drawLine')
  return `${title}\n${resultReasonDetailLabel(reason, t)}`
}

function resultSummaryLabel(
  winner: string,
  reason: string,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const reasonLabel = resultReasonLabel(reason, t)
  if (winner === t('draw') && reasonLabel === t('reasonDraw')) return winner
  return `${winner} · ${reasonLabel}`
}

function resultReasonLabel(
  reason: string,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const key = `reason${reason.charAt(0).toUpperCase()}${reason.slice(1)}`
  const label = t(key)
  return label === key ? reason : label
}

function resultReasonDetailLabel(
  reason: string,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const key = `resultDetail${reason.charAt(0).toUpperCase()}${reason.slice(1)}`
  const label = t(key)
  return label === key ? resultReasonLabel(reason, t) : label
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
  const app = useWarbuddyApp()
  const max = Math.max(0, (replay?.frames.length ?? 1) - 1)
  const fps = replay?.meta.fps ?? DEFAULT_WARBUDDY_RULES.timing.fps
  return (
    <div className="replay-controls">
      <Button onClick={() => onFrame(0)} disabled={!replay} icon={<SkipBack size={16} />}>
        <span className="sr-only">{app.t('replay')}</span>
      </Button>
      <Button
        onClick={() => {
          unlockBattleAudio()
          onPlaying(!playing)
        }}
        disabled={!replay}
        icon={playing ? <Pause size={16} /> : <Play size={16} />}
      >
        <span className="sr-only">{app.t('replay')}</span>
      </Button>
      <input
        type="range"
        min={0}
        max={max}
        value={Math.min(frame, max)}
        onChange={(event) => onFrame(Number(event.target.value))}
        disabled={!replay}
      />
      <span>
        {replay
          ? `${formatBattleClock(Math.min(frame + 1, replay.meta.maxFrames), fps)}/${formatBattleClock(replay.meta.maxFrames, fps)}`
          : '0:00/0:00'}
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
  const app = useWarbuddyApp()
  if (!inboxes.length) return <div className="empty-list">{app.t('noBuddyInbox')}</div>
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

function Leaderboard({
  rows,
  currentTankId,
  onChallenge,
}: {
  rows: TankSummary[]
  currentTankId?: string
  onChallenge?: (tank: TankSummary) => void
}) {
  const app = useWarbuddyApp()
  if (!rows.length) return <div className="empty-list">{app.t('noStandings')}</div>
  return (
    <ol className="leaderboard">
      {rows.map((tank) => (
        <li key={tank.id} className={clsx(tank.id === currentTankId && 'mine')}>
          <span>#{tank.rank}</span>
          <strong>{tank.name}</strong>
          <em>{tank.rankScore}</em>
          {onChallenge && tank.id !== currentTankId ? (
            <Button onClick={() => onChallenge(tank)} icon={<Swords size={14} />}>
              {app.t('challenge')}
            </Button>
          ) : (
            <small>{app.t('yourSquadLabel')}</small>
          )}
        </li>
      ))}
    </ol>
  )
}

function History({
  matches,
  loadingMatchId,
  onReplay,
}: {
  matches: MatchSummary[]
  loadingMatchId?: string
  onReplay: (match: MatchSummary) => void
}) {
  const app = useWarbuddyApp()
  if (!matches.length) return null
  return (
    <div className="history-grid">
      {matches.slice(0, 8).map((match) => (
        <article key={match.id} className={clsx(match.unread && 'unread')}>
          <strong>
            {match.unread ? <span className="unread-dot" /> : null}
            {match.participants.challenger.tankName} vs {match.participants.defender.tankName}
          </strong>
          <span>
            {resultSummaryLabel(match.winnerTankName ?? app.t('draw'), match.resultReason, app.t)} ·{' '}
            {match.excitementScore}
            {match.commentsCount ? ` · ${match.commentsCount} ${app.t('comments')}` : ''}
          </span>
          <Button
            onClick={() => onReplay(match)}
            disabled={loadingMatchId === match.id}
            icon={<Eye size={14} />}
          >
            {loadingMatchId === match.id ? app.t('loading') : app.t('replay')}
          </Button>
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
