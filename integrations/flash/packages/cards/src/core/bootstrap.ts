// ══════════════════════════════════════════════════════════════
// @shadowob/flash-cards — Bootstrap (register built-in plugins)
//
// Every built-in card kind is registered through the same plugin
// API that external plugins use.  Each plugin declares:
//   • contentSystem  — Canvas2D rendering function
//   • components      — style, icon, shader
//   • render          — fullBleed / bgColor hints
//
// Adding a new card kind?  Create a CardPlugin and register() it.
// ══════════════════════════════════════════════════════════════

// ── Icon draw functions ──
import {
  drawBarChartIcon,
  drawBookIcon,
  drawCodeIcon,
  drawComparisonIcon,
  drawImageIcon,
  drawLightbulbIcon,
  drawLineChartIcon,
  drawLinkIcon,
  drawMusicIcon,
  drawPenIcon,
  drawProcessIcon,
  drawQuoteIcon,
  drawSparkleIcon,
  drawStarIcon,
  drawSummaryIcon,
  drawTableIcon,
  drawTargetIcon,
  drawTextIcon,
  drawTimelineIcon,
  drawVideoIcon,
} from '../components/iconComponent'
import { argumentSystem } from '../plugins/argumentSystem'
import { chartSystem } from '../plugins/chartSystem'
import { codeSystem } from '../plugins/codeSystem'
import { colorSystem } from '../plugins/colorSystem'
import { commentSystem } from '../plugins/commentSystem'
import { comparisonSystem } from '../plugins/comparisonSystem'
import { countdownSystem } from '../plugins/countdownSystem'
// ── Built-in content system plugins ──
import { dataSystem } from '../plugins/dataSystem'
import { definitionSystem } from '../plugins/definitionSystem'
import { eventSystem } from '../plugins/eventSystem'
import { exampleSystem } from '../plugins/exampleSystem'
import { fileSystem } from '../plugins/fileSystem'
import { gifSystem } from '../plugins/gifSystem'
import { imageSystem } from '../plugins/imageSystem'
import { inspirationSystem } from '../plugins/inspirationSystem'
import { keypointSystem } from '../plugins/keypointSystem'
import { linkSystem } from '../plugins/linkSystem'
import { live2dSystem } from '../plugins/live2dSystem'
import { lottieSystem } from '../plugins/lottieSystem'
import { mathSystem } from '../plugins/mathSystem'
import { personSystem } from '../plugins/personSystem'
import { pokerSystem } from '../plugins/pokerSystem'
import { positionSystem } from '../plugins/positionSystem'
import { processSystem } from '../plugins/processSystem'
import { qrcodeSystem } from '../plugins/qrcodeSystem'
import { quoteSystem } from '../plugins/quoteSystem'
import { referenceSystem } from '../plugins/referenceSystem'
import { socialSystem } from '../plugins/socialSystem'
import { storySystem } from '../plugins/storySystem'
import { tableSystem } from '../plugins/tableSystem'
import { tarotSystem } from '../plugins/tarotSystem'
import { terminalSystem } from '../plugins/terminalSystem'
import { threeSystem } from '../plugins/threeSystem'
import { timelineSystem } from '../plugins/timelineSystem'
import { timestampSystem } from '../plugins/timestampSystem'
import { todoSystem } from '../plugins/todoSystem'
import { voiceSystem } from '../plugins/voiceSystem'
import { webpageSystem } from '../plugins/webpageSystem'
import { registry } from '../registry'
import { fallbackSystem } from '../systems/content/fallbackSystem'
import { footerSystem } from '../systems/content/footerSystem'
// ── Decorators ──
import { headerSystem } from '../systems/content/headerSystem'
import type { CardPlugin } from '../types'

let booted = false

// ── Helper: build a full CardPlugin with component data ──
function bp(
  kind: string | string[],
  contentSystem: CardPlugin['contentSystem'],
  priority: number,
  name: string,
  style: NonNullable<NonNullable<CardPlugin['components']>['style']>,
  icon: NonNullable<NonNullable<CardPlugin['components']>['icon']>,
  tapeColor: [number, number, number],
  render?: CardPlugin['render'],
): CardPlugin {
  return {
    kind,
    contentSystem,
    priority,
    name,
    components: { style, icon, shader: { tapeColor } },
    render,
  }
}

/**
 * Built-in card plugins — fully self-describing through the plugin API.
 */
const BUILTIN_PLUGINS: CardPlugin[] = [
  // ── Data & Charts ──
  bp(
    'data',
    dataSystem,
    100,
    'data',
    { accentColor: '#22d3ee', kindLabel: 'Data', pip: '◆', rank: '10' },
    drawBarChartIcon,
    [0.133, 0.827, 0.91],
  ),
  bp(
    'chart',
    chartSystem,
    110,
    'chart',
    { accentColor: '#fbbf24', kindLabel: 'Chart', pip: '▲', rank: '8' },
    drawLineChartIcon,
    [0.984, 0.749, 0.165],
  ),

  // ── Prose ──
  bp(
    'quote',
    quoteSystem,
    120,
    'quote',
    { accentColor: '#f472b6', kindLabel: 'Quote', pip: '♦', rank: 'Q' },
    drawQuoteIcon,
    [0.957, 0.447, 0.714],
  ),
  bp(
    'argument',
    argumentSystem,
    130,
    'argument',
    { accentColor: '#fb923c', kindLabel: 'Argument', pip: '♠', rank: 'A' },
    drawTargetIcon,
    [0.984, 0.573, 0.235],
  ),

  // ── Structure ──
  bp(
    'timeline',
    timelineSystem,
    140,
    'timeline',
    { accentColor: '#f97316', kindLabel: 'Timeline', pip: '⏳', rank: 'T' },
    drawTimelineIcon,
    [0.976, 0.451, 0.086],
  ),
  bp(
    'comparison',
    comparisonSystem,
    150,
    'comparison',
    { accentColor: '#06b6d4', kindLabel: 'Comparison', pip: '⚖', rank: 'V' },
    drawComparisonIcon,
    [0.024, 0.714, 0.831],
  ),
  bp(
    'process',
    processSystem,
    160,
    'process',
    { accentColor: '#10b981', kindLabel: 'Process', pip: '⟳', rank: 'P' },
    drawProcessIcon,
    [0.063, 0.725, 0.506],
  ),
  bp(
    'table',
    tableSystem,
    170,
    'table',
    { accentColor: '#2dd4bf', kindLabel: 'Table', pip: '▦', rank: '9' },
    drawTableIcon,
    [0.176, 0.831, 0.749],
  ),

  // ── Key info ──
  bp(
    'keypoint',
    keypointSystem,
    180,
    'keypoint',
    { accentColor: '#818cf8', kindLabel: 'Keypoint', pip: '✦', rank: 'K' },
    drawStarIcon,
    [0.506, 0.549, 0.973],
  ),
  bp(
    'definition',
    definitionSystem,
    190,
    'definition',
    { accentColor: '#8b5cf6', kindLabel: 'Definition', pip: '♔', rank: 'Q' },
    drawBookIcon,
    [0.545, 0.361, 0.965],
  ),
  bp(
    'example',
    exampleSystem,
    200,
    'example',
    { accentColor: '#38bdf8', kindLabel: 'Example', pip: '✎', rank: '4' },
    drawPenIcon,
    [0.22, 0.741, 0.973],
  ),
  bp(
    'code',
    codeSystem,
    210,
    'code',
    { accentColor: '#a3e635', kindLabel: 'Code', pip: '<>', rank: '7' },
    drawCodeIcon,
    [0.639, 0.898, 0.145],
  ),

  // ── Creative ──
  bp(
    ['inspiration', 'idea'],
    inspirationSystem,
    220,
    'inspiration',
    { accentColor: '#d946ef', kindLabel: 'Inspiration', pip: '✺', rank: '★' },
    drawSparkleIcon,
    [0.851, 0.275, 0.937],
  ),
  bp(
    'reference',
    referenceSystem,
    230,
    'reference',
    { accentColor: '#9ca3af', kindLabel: 'Reference', pip: '⊕', rank: '3' },
    drawLinkIcon,
    [0.612, 0.639, 0.655],
  ),

  // ── Media ──
  bp(
    'gif',
    gifSystem,
    240,
    'gif',
    { accentColor: '#f59e0b', kindLabel: 'GIF', pip: '□■', rank: 'G' },
    drawImageIcon,
    [0.976, 0.62, 0.043],
  ),
  bp(
    'image',
    imageSystem,
    250,
    'image',
    { accentColor: '#a855f7', kindLabel: 'Image', pip: '✧', rank: 'J' },
    drawImageIcon,
    [0.659, 0.333, 0.969],
  ),
  bp(
    'qrcode',
    qrcodeSystem,
    260,
    'qrcode',
    { accentColor: '#1d4ed8', kindLabel: 'QR Code', pip: '⯀', rank: 'QR' },
    drawTableIcon,
    [0.114, 0.306, 0.878],
  ),
  bp(
    'person',
    personSystem,
    270,
    'person',
    { accentColor: '#ec4899', kindLabel: 'Person', pip: '●', rank: '♚' },
    drawSummaryIcon,
    [0.925, 0.306, 0.6],
  ),

  // ── Interactive ──
  bp(
    'terminal',
    terminalSystem,
    280,
    'terminal',
    { accentColor: '#22c55e', kindLabel: 'Terminal', pip: '$', rank: '>' },
    drawCodeIcon,
    [0.133, 0.773, 0.369],
  ),
  bp(
    'lottie',
    lottieSystem,
    290,
    'lottie',
    { accentColor: '#8b5cf6', kindLabel: 'Lottie', pip: '⬡', rank: 'L' },
    drawSparkleIcon,
    [0.545, 0.361, 0.965],
  ),
  bp(
    'webpage',
    webpageSystem,
    300,
    'webpage',
    { accentColor: '#0ea5e9', kindLabel: 'Webpage', pip: '⌘', rank: 'W' },
    drawLinkIcon,
    [0.055, 0.647, 0.914],
  ),
  bp(
    'countdown',
    countdownSystem,
    310,
    'countdown',
    { accentColor: '#ef4444', kindLabel: 'Countdown', pip: '⧗', rank: '⌛' },
    drawTimelineIcon,
    [0.937, 0.267, 0.267],
  ),
  bp(
    'threed',
    threeSystem,
    320,
    'three',
    { accentColor: '#06b6d4', kindLabel: '3D', pip: '◈', rank: '3' },
    drawSparkleIcon,
    [0.024, 0.714, 0.831],
  ),
  bp(
    'live2d',
    live2dSystem,
    330,
    'live2d',
    { accentColor: '#e879f9', kindLabel: 'Live2D', pip: '🎭', rank: 'L2' },
    drawSparkleIcon,
    [0.91, 0.475, 0.976],
  ),

  // ── Utility ──
  bp(
    'link',
    linkSystem,
    340,
    'link',
    { accentColor: '#0ea5e9', kindLabel: 'Link', pip: '↪', rank: '↪' },
    drawLinkIcon,
    [0.055, 0.647, 0.914],
  ),
  bp(
    'file',
    fileSystem,
    350,
    'file',
    { accentColor: '#94a3b8', kindLabel: 'File', pip: '📄', rank: 'F' },
    drawTextIcon,
    [0.584, 0.639, 0.655],
  ),
  bp(
    'math',
    mathSystem,
    360,
    'math',
    { accentColor: '#a78bfa', kindLabel: 'Formula', pip: 'Σ', rank: 'Σ' },
    drawSparkleIcon,
    [0.655, 0.545, 0.98],
  ),
  bp(
    'todo',
    todoSystem,
    370,
    'todo',
    { accentColor: '#4ade80', kindLabel: 'Todo', pip: '☑', rank: '☑' },
    drawStarIcon,
    [0.29, 0.871, 0.502],
  ),
  bp(
    'position',
    positionSystem,
    380,
    'position',
    { accentColor: '#f87171', kindLabel: 'Position', pip: '📍', rank: 'P' },
    drawTargetIcon,
    [0.973, 0.443, 0.443],
  ),
  bp(
    'timestamp',
    timestampSystem,
    390,
    'timestamp',
    { accentColor: '#fbbf24', kindLabel: 'Timestamp', pip: '🕐', rank: 'T' },
    drawTimelineIcon,
    [0.984, 0.749, 0.165],
  ),
  bp(
    'color',
    colorSystem,
    400,
    'color',
    { accentColor: '#f472b6', kindLabel: 'Color', pip: '🎨', rank: 'C' },
    drawSparkleIcon,
    [0.957, 0.447, 0.714],
  ),
  bp(
    'event',
    eventSystem,
    410,
    'event',
    { accentColor: '#60a5fa', kindLabel: 'Event', pip: '📅', rank: 'E' },
    drawTimelineIcon,
    [0.376, 0.647, 0.98],
  ),
  bp(
    'voice',
    voiceSystem,
    420,
    'voice',
    { accentColor: '#2dd4bf', kindLabel: 'Voice', pip: '🎙', rank: 'V' },
    drawMusicIcon,
    [0.176, 0.831, 0.749],
  ),
  bp(
    'comment',
    commentSystem,
    430,
    'comment',
    { accentColor: '#fb923c', kindLabel: 'Comment', pip: '💬', rank: 'N' },
    drawQuoteIcon,
    [0.984, 0.573, 0.235],
  ),
  bp(
    'story',
    storySystem,
    440,
    'story',
    { accentColor: '#818cf8', kindLabel: 'Story', pip: '📖', rank: 'S' },
    drawBookIcon,
    [0.506, 0.549, 0.973],
  ),
  bp(
    'social',
    socialSystem,
    450,
    'social',
    { accentColor: '#d946ef', kindLabel: 'Social', pip: '🔗', rank: '✦' },
    drawLinkIcon,
    [0.851, 0.275, 0.937],
  ),

  // ── Special (fullBleed takes over entire canvas) ──
  bp(
    'poker',
    pokerSystem,
    460,
    'poker',
    { accentColor: '#dc2626', kindLabel: 'Poker', pip: '♠♥', rank: '♠' },
    drawStarIcon,
    [0.863, 0.149, 0.149],
    { fullBleed: true },
  ),
  bp(
    'tarot',
    tarotSystem,
    470,
    'tarot',
    { accentColor: '#7c3aed', kindLabel: 'Tarot', pip: '☽', rank: '☽' },
    drawSparkleIcon,
    [0.486, 0.228, 0.929],
    { fullBleed: true },
  ),

  // ── Base kinds (no dedicated content system — use fallback) ──
  bp(
    'summary',
    fallbackSystem,
    900,
    'summary',
    { accentColor: '#60a5fa', kindLabel: 'Summary', pip: '♣', rank: 'K' },
    drawSummaryIcon,
    [0.376, 0.647, 0.98],
  ),
  bp(
    'text',
    fallbackSystem,
    901,
    'text',
    { accentColor: '#a1a1aa', kindLabel: 'Text', pip: '¶', rank: '6' },
    drawTextIcon,
    [0.631, 0.631, 0.667],
  ),
  bp(
    'audio',
    fallbackSystem,
    902,
    'audio',
    { accentColor: '#34d399', kindLabel: 'Audio', pip: '♪', rank: '5' },
    drawMusicIcon,
    [0.204, 0.827, 0.6],
  ),
  bp(
    'video',
    fallbackSystem,
    903,
    'video',
    { accentColor: '#fb7185', kindLabel: 'Video', pip: '▶', rank: 'J' },
    drawVideoIcon,
    [0.984, 0.443, 0.525],
  ),
  bp(
    'idea',
    fallbackSystem,
    904,
    'idea',
    { accentColor: '#facc15', kindLabel: 'Idea', pip: '★', rank: 'A' },
    drawLightbulbIcon,
    [0.98, 0.8, 0.082],
  ),
  bp(
    'flash',
    fallbackSystem,
    905,
    'flash',
    { accentColor: '#fbbf24', kindLabel: 'Flash', pip: '⚡', rank: '⚡' },
    drawLightbulbIcon,
    [0.984, 0.749, 0.165],
  ),

  // Fallback — always last — catches any unmatched kind
  { kind: '__fallback__', contentSystem: fallbackSystem, priority: 9999, name: 'fallback' },
]

/**
 * Register all built-in plugins and decorators. Idempotent.
 */
export function bootstrapCards(): void {
  if (booted) return
  booted = true

  // Register decorators
  registry.registerDecorator({ name: 'header', phase: 'pre', system: headerSystem, priority: 0 })
  registry.registerDecorator({ name: 'footer', phase: 'post', system: footerSystem, priority: 0 })

  // Register all built-in content plugins
  registry.registerBulk(BUILTIN_PLUGINS)
}

/**
 * Get all built-in plugins (for external composition).
 */
export function getBuiltinPlugins(): readonly CardPlugin[] {
  return BUILTIN_PLUGINS
}
