/**
 * Pixel Art Cat Avatar System
 * 8 unique cat variants with distinct color schemes inspired by the Shadow logo
 */

interface CatColors {
  body: string
  stroke: string
  earInner: string
  eyeL: string
  eyeR: string
  nose: string
}

const variants: CatColors[] = [
  // 0: Shadow — Black cat (logo style)
  {
    body: '#2d2d30',
    stroke: '#1a1a1c',
    earInner: '#3d3d40',
    eyeL: '#f8e71c',
    eyeR: '#00f3ff',
    nose: '#3a2a26',
  },
  // 1: Mikan — Orange tabby
  {
    body: '#e8842c',
    stroke: '#1a1a1c',
    earInner: '#f5a623',
    eyeL: '#4ade80',
    eyeR: '#4ade80',
    nose: '#d46b1a',
  },
  // 2: Yuki — White cat
  {
    body: '#e8e8e8',
    stroke: '#a0a0a0',
    earInner: '#ffc0cb',
    eyeL: '#60a5fa',
    eyeR: '#60a5fa',
    nose: '#f5a0b0',
  },
  // 3: Haiiro — Gray cat
  {
    body: '#7a7a80',
    stroke: '#4a4a50',
    earInner: '#9a9aa0',
    eyeL: '#fbbf24',
    eyeR: '#fbbf24',
    nose: '#5a4a46',
  },
  // 4: Tuxedo — Black & white accents
  {
    body: '#2d2d30',
    stroke: '#1a1a1c',
    earInner: '#e0e0e0',
    eyeL: '#22c55e',
    eyeR: '#22c55e',
    nose: '#3a2a26',
  },
  // 5: Mocha — Cream/beige
  {
    body: '#d4a574',
    stroke: '#8b6914',
    earInner: '#e8c9a0',
    eyeL: '#d97706',
    eyeR: '#d97706',
    nose: '#a0705a',
  },
  // 6: Blue — Russian blue
  {
    body: '#6b8094',
    stroke: '#3d5060',
    earInner: '#8ba0b4',
    eyeL: '#22c55e',
    eyeR: '#22c55e',
    nose: '#5a6a76',
  },
  // 7: Sakura — Fantasy pink
  {
    body: '#f472b6',
    stroke: '#be185d',
    earInner: '#f9a8d4',
    eyeL: '#a855f7',
    eyeR: '#c084fc',
    nose: '#d44a8c',
  },
]

function makeCatSvg(c: CatColors): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    // Left ear
    `<path d="M22,45 Q15,22 28,22 Q34,22 40,38" fill="${c.body}" stroke="${c.stroke}" stroke-width="2.5" stroke-linecap="round"/>`,
    // Right ear
    `<path d="M78,45 Q85,22 72,22 Q66,22 60,38" fill="${c.body}" stroke="${c.stroke}" stroke-width="2.5" stroke-linecap="round"/>`,
    // Inner ears
    `<path d="M26,38 Q22,26 29,26 Q33,26 36,34" fill="${c.earInner}" opacity="0.5"/>`,
    `<path d="M74,38 Q78,26 71,26 Q67,26 64,34" fill="${c.earInner}" opacity="0.5"/>`,
    // Face
    `<ellipse cx="50" cy="58" rx="36" ry="28" fill="${c.body}" stroke="${c.stroke}" stroke-width="2.5"/>`,
    // Left eye
    `<circle cx="35" cy="52" r="7" fill="${c.eyeL}" stroke="${c.stroke}" stroke-width="1.5"/>`,
    `<circle cx="33" cy="49" r="2.5" fill="white"/>`,
    // Right eye
    `<circle cx="65" cy="52" r="7" fill="${c.eyeR}" stroke="${c.stroke}" stroke-width="1.5"/>`,
    `<circle cx="63" cy="49" r="2.5" fill="white"/>`,
    // Nose
    `<ellipse cx="50" cy="62" rx="3.5" ry="2.2" fill="${c.nose}"/>`,
    // Mouth
    `<path d="M42,67 Q46,72 50,67" fill="none" stroke="${c.stroke}" stroke-width="2" stroke-linecap="round"/>`,
    `<path d="M50,67 Q54,72 58,67" fill="none" stroke="${c.stroke}" stroke-width="2" stroke-linecap="round"/>`,
    '</svg>',
  ].join('')
}

// Pre-generate data URIs
const catDataUris = variants.map((v) => {
  const svg = makeCatSvg(v)
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
})

/** Get avatar data URI by index (0-7) */
export function getCatAvatar(index: number): string {
  return catDataUris[index % catDataUris.length]!
}

/** Get deterministic avatar by user ID string */
export function getCatAvatarByUserId(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return getCatAvatar(Math.abs(hash) % catDataUris.length)
}

/** Get all cat avatars for selection UI */
export function getAllCatAvatars(): { index: number; name: string; dataUri: string }[] {
  const names = ['影子', '蜜柑', '小雪', '灰灰', '燕尾服', '摩卡', '蓝蓝', '小樱']
  return catDataUris.map((uri, i) => ({ index: i, name: names[i]!, dataUri: uri }))
}

export const CAT_AVATAR_COUNT = variants.length
