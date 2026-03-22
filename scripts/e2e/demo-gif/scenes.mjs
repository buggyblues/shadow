/**
 * Demo GIF — Scene Script (i18n)
 *
 * Scene types:
 *   title — brand title card with dot grid, blobs, text
 *   frame — Playwright screenshot with optional zoom, highlight, label
 *
 * Frame annotations:
 *   zoom      — { cx, cy, scale } centre-based zoom preserving canvas AR
 *   highlight — { x, y, r } normalised centre + radius for a ring callout
 *   label     — bottom badge text caption (string or { en, zh })
 *
 * Title styles: hero | tagline | act | closing
 *
 * Text/label can be a plain string (shared across locales) or { en, zh }.
 */

export const config = {
  outputWidth: 720,

  // ── Timing (ms) ──────────────────────────────────────────
  heroDuration: 2000,
  actDuration: 1000,
  taglineDuration: 1600,
  frameDuration: 1800,
  frameZoomedDuration: 1200,
  shortFrameDuration: 1000,
  closingDuration: 2400,

  // ── Typewriter ───────────────────────────────────────────
  typewriterDelay: 70,

  // ── Zoom ─────────────────────────────────────────────────
  zoomFrames: 4,
  zoomFrameDelay: 50,

  // ── Crossfade ────────────────────────────────────────────
  crossfadeFrames: 3,
  crossfadeDelay: 60,
}

// ── i18n helpers ─────────────────────────────────────────

function t(v, lang) {
  if (v == null) return v
  if (typeof v === 'string') return v
  return v[lang] ?? v.en
}

export function scenesFor(lang) {
  return _scenes.map((s) => ({
    ...s,
    text: t(s.text, lang),
    label: t(s.label, lang),
  }))
}

// ── Scene definitions ────────────────────────────────────

const _scenes = [
  // ── Opening ─────────────────────────────────────────────
  {
    type: 'title',
    id: 'hero',
    text: { en: 'Shadow', zh: '虾豆' },
    style: 'hero',
    typewriter: true,
    duration: config.heroDuration,
  },
  {
    type: 'title',
    id: 'tagline',
    text: {
      en: 'The super community\nfor super individuals.',
      zh: '面向超级个体的\n超级社区',
    },
    style: 'tagline',
    typewriter: true,
    duration: config.taglineDuration,
  },

  // ── Act 1 · Create ─────────────────────────────────────
  {
    type: 'title',
    id: 'act-create',
    text: { en: 'Create', zh: '创建' },
    style: 'act',
    duration: config.actDuration,
  },
  {
    type: 'frame',
    id: 'create-server',
    source: '00-create-server.png',
    label: { en: 'Name your community', zh: '为你的社区命名' },
    zoom: { cx: 0.50, cy: 0.47, scale: 2.2 },
    duration: config.frameDuration,
  },
  {
    type: 'frame',
    id: 'server-home',
    source: '01-server-home.png',
    label: { en: 'Home', zh: '社区主页' },
    duration: config.frameDuration,
  },
  {
    type: 'frame',
    id: 'create-channel',
    source: '02-create-channel.png',
    label: { en: 'Create a channel', zh: '创建频道' },
    zoom: { cx: 0.50, cy: 0.47, scale: 2.2 },
    duration: config.frameDuration,
  },

  // ── Act 2 · Converse ───────────────────────────────────
  {
    type: 'title',
    id: 'act-converse',
    text: { en: 'Converse', zh: '交流' },
    style: 'act',
    duration: config.actDuration,
  },
  {
    type: 'frame',
    id: 'channel-empty',
    source: '03-channel-empty.png',
    label: { en: 'A blank canvas', zh: '空白画布' },
    duration: config.shortFrameDuration,
  },
  {
    type: 'frame',
    id: 'channel-typing',
    source: '04-channel-typing.png',
    label: { en: 'Type your first message', zh: '发送第一条消息' },
    highlight: { x: 0.50, y: 0.90, r: 0.06 },
    zoom: { cx: 0.50, cy: 0.85, scale: 2.0 },
    duration: config.frameDuration,
  },
  {
    type: 'frame',
    id: 'channel-sent',
    source: '05-channel-sent.png',
    label: { en: 'Sent', zh: '已发送' },
    duration: config.shortFrameDuration,
  },
  {
    type: 'frame',
    id: 'channel-active',
    source: '06-channel-active.png',
    label: { en: 'Conversation grows', zh: '对话热了起来' },
    duration: config.frameDuration,
  },

  // ── Act 3 · Connect ────────────────────────────────────
  {
    type: 'title',
    id: 'act-connect',
    text: { en: 'Connect', zh: '联系' },
    style: 'act',
    duration: config.actDuration,
  },
  {
    type: 'frame',
    id: 'dm-typing',
    source: '07-dm-typing.png',
    label: { en: 'Direct messages', zh: '私信' },
    highlight: { x: 0.50, y: 0.85, r: 0.06 },
    zoom: { cx: 0.50, cy: 0.82, scale: 2.0 },
    duration: config.frameDuration,
  },
  {
    type: 'frame',
    id: 'dm-conversation',
    source: '08-dm-conversation.png',
    label: { en: 'Private conversations', zh: '私密对话' },
    duration: config.frameDuration,
  },

  // ── Act 4 · Explore ────────────────────────────────────
  {
    type: 'title',
    id: 'act-explore',
    text: { en: 'Explore', zh: '探索' },
    style: 'act',
    duration: config.actDuration,
  },
  {
    type: 'frame',
    id: 'buddies',
    source: '09-buddies.png',
    label: { en: 'AI Agents', zh: 'AI 智能体' },
    duration: config.frameDuration,
  },
  {
    type: 'frame',
    id: 'shop',
    source: '10-shop.png',
    label: { en: 'Commerce', zh: '社区店铺' },
    duration: config.frameDuration,
  },
  {
    type: 'frame',
    id: 'workspace',
    source: '11-workspace.png',
    label: { en: 'Workspace', zh: '工作区' },
    duration: config.frameDuration,
  },
  {
    type: 'frame',
    id: 'discover',
    source: '12-discover.png',
    label: { en: 'Discover', zh: '发现' },
    duration: config.frameDuration,
  },

  // ── Closing ─────────────────────────────────────────────
  {
    type: 'title',
    id: 'closing',
    text: {
      en: 'Everything your community needs.\nOne product.',
      zh: '你的社区需要的一切\n尽在一个产品',
    },
    style: 'closing',
    typewriter: true,
    duration: config.closingDuration,
  },
]

export const scenes = scenesFor('en')
