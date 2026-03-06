export type CatPattern = 'none' | 'tabby' | 'tuxedo' | 'siamese' | 'calico' | 'bicolor'
export type CatExpression = 'smile' | 'open' | 'flat' | 'sad' | 'surprised' | 'kawaii' | 'winking' | 'smirk'
export type CatDecoration = 'none' | 'glasses' | 'blush' | 'scar' | 'flower' | 'fish' | 'headband'
export type BgPattern = 'none' | 'dots' | 'stripes' | 'grid' | 'stars'

export interface CatConfig {
  bg: string
  bgPattern: BgPattern
  body: string
  pattern: CatPattern
  patternColor: string
  eyeColor: string
  expression: CatExpression
  decoration: CatDecoration
}

const COLORS = {
  bg: ['transparent', '#1e1f22', '#313338', '#5865F2', '#23a559', '#da373c', '#f472b6', '#3b82f6', '#fbbf24', '#a855f7', '#1abc9c', '#f39c12', '#e74c3c'],
  body: ['#2d2d30', '#e8842c', '#e8e8e8', '#7a7a80', '#d4a574', '#6b8094', '#f472b6', '#c8d6e5', '#3e2723', '#bdc3c7', '#ffb8b8'],
  eyes: ['#f8e71c', '#00f3ff', '#4ade80', '#60a5fa', '#a855f7', '#fbbf24', '#f87171', '#ffc0cb', '#1dd1a1', '#e056fd'],
  pattern: ['#1a1a1c', '#ffffff', '#5a4a46', '#3d3d40', '#9a9aa0', '#d1ccc0', '#2d3436']
}

export function getRandomElement<T>(arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error('Cannot select a random element from an empty array')
  }

  return arr[Math.floor(Math.random() * arr.length)]!
}

export function generateRandomCatConfig(): CatConfig {
  return {
    bg: getRandomElement(COLORS.bg),
    bgPattern: getRandomElement(['none', 'dots', 'stripes', 'grid', 'stars'] as BgPattern[]),
    body: getRandomElement(COLORS.body),
    pattern: getRandomElement(['none', 'tabby', 'tuxedo', 'siamese', 'calico', 'bicolor'] as CatPattern[]),
    patternColor: getRandomElement(COLORS.pattern),
    eyeColor: getRandomElement(COLORS.eyes),
    expression: getRandomElement(['smile', 'open', 'flat', 'sad', 'surprised', 'kawaii', 'winking', 'smirk'] as CatExpression[]),
    decoration: getRandomElement(['none', 'glasses', 'blush', 'scar', 'flower', 'fish', 'headband'] as CatDecoration[])
  }
}

export function renderCatSvg(config: CatConfig): string {
  const { bg, bgPattern, body, pattern, patternColor, eyeColor, expression, decoration } = config
  const stroke = '#1a1a1c'
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`
  
  // Background
  if (bg && bg !== 'transparent') {
    svg += `<rect width="100" height="100" fill="${bg}" rx="20" />`
    
    // Background Pattern
    const pColor = `rgba(255,255,255,0.15)`
    const cleanBg = bg.replace('#','')
    if (bgPattern === 'dots') {
      svg += `<pattern id="p-${cleanBg}-dots" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="${pColor}"/></pattern><rect width="100" height="100" fill="url(#p-${cleanBg}-dots)" rx="20" />`
    } else if (bgPattern === 'stripes') {
      svg += `<pattern id="p-${cleanBg}-str" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12" stroke="${pColor}" stroke-width="4"/></pattern><rect width="100" height="100" fill="url(#p-${cleanBg}-str)" rx="20" />`
    } else if (bgPattern === 'grid') {
      svg += `<pattern id="p-${cleanBg}-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M 16 0 L 0 0 0 16" fill="none" stroke="${pColor}" stroke-width="1"/></pattern><rect width="100" height="100" fill="url(#p-${cleanBg}-grid)" rx="20" />`
    } else if (bgPattern === 'stars') {
      svg += `<pattern id="p-${cleanBg}-star" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M10,2 L12,8 L18,8 L13,12 L15,18 L10,14 L5,18 L7,12 L2,8 L8,8 Z" fill="${pColor}" transform="scale(0.5) translate(5,5)"/></pattern><rect width="100" height="100" fill="url(#p-${cleanBg}-star)" rx="20" />`
    }
  }

  // Shadow for depth
  svg += `<ellipse cx="50" cy="85" rx="30" ry="6" fill="rgba(0,0,0,0.2)"/>`

  // Ears
  svg += `<path d="M22,45 C15,22 28,18 34,22 C38,25 40,38 40,38" fill="${body}" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
  svg += `<path d="M78,45 C85,22 72,18 66,22 C62,25 60,38 60,38" fill="${body}" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`

  // Inner ears (pinkish/white mix)
  svg += `<path d="M26,38 C22,26 29,24 33,26 C35,28 36,34 36,34" fill="#ffb8b8" opacity="0.8"/>`
  svg += `<path d="M74,38 C78,26 71,24 67,26 C65,28 64,34 64,34" fill="#ffb8b8" opacity="0.8"/>`

  // Face Background
  svg += `<ellipse cx="50" cy="58" rx="38" ry="30" fill="${body}" stroke="${stroke}" stroke-width="2.5"/>`

  // Patterns
  if (pattern === 'tabby') {
    svg += `<path d="M50,30 L50,40 M42,32 L46,39 M58,32 L54,39" stroke="${patternColor}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`
    svg += `<path d="M18,55 L26,57 M20,62 L27,62" stroke="${patternColor}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>`
    svg += `<path d="M82,55 L74,57 M80,62 L73,62" stroke="${patternColor}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>`
  } else if (pattern === 'tuxedo') {
    // White muzzle and chest area
    svg += `<path d="M50,56 C30,68 28,88 50,88 C72,88 70,68 50,56" fill="${patternColor}" opacity="0.95"/>`
    svg += `<ellipse cx="50" cy="65" rx="16" ry="12" fill="${patternColor}" opacity="0.95"/>`
  } else if (pattern === 'siamese') {
    // Dark fading mask
    svg += `<ellipse cx="50" cy="62" rx="20" ry="16" fill="${patternColor}" opacity="0.6" filter="blur(2px)"/>` 
  } else if (pattern === 'calico') {
    svg += `<path d="M25,40 Q35,30 45,45 Q35,55 25,40" fill="${patternColor}" opacity="0.8"/>`
    svg += `<path d="M75,45 Q65,60 55,50 Q65,35 75,45" fill="#e8842c" opacity="0.8"/>`
  } else if (pattern === 'bicolor') {
    svg += `<path d="M12,58 Q30,30 50,40 Q60,70 50,88 Q12,88 12,58 Z" fill="${patternColor}" opacity="0.8"/>`
  }

  // Blush Decoration
  if (decoration === 'blush') {
    svg += `<ellipse cx="28" cy="62" rx="5" ry="3" fill="#ff7675" opacity="0.7" filter="blur(1px)"/>`
    svg += `<ellipse cx="72" cy="62" rx="5" ry="3" fill="#ff7675" opacity="0.7" filter="blur(1px)"/>`
  }
  
  // Scar Decoration
  if (decoration === 'scar') {
    svg += `<path d="M28,42 L40,52 M30,48 L35,43 M34,51 L39,46 M32,53 L37,48" stroke="#d63031" stroke-width="1.5" stroke-linecap="round"/>`
  }

  // Eyes Base & Pupils depending on Expression
  const drawEye = (cx: number, cy: number, lookDir: number = 0) => {
    if (expression === 'kawaii') {
      return `<path d="M${cx-8},${cy} Q${cx},${cy-8} ${cx+8},${cy} Q${cx},${cy-3} ${cx-8},${cy}" fill="${eyeColor}" stroke="${stroke}" stroke-width="1.5"/><circle cx="${cx+lookDir}" cy="${cy-2}" r="3" fill="white"/><circle cx="${cx-3+lookDir}" cy="${cy}" r="1" fill="white"/>`
    } else if (expression === 'winking' && cx > 50) { // Wink right eye
      return `<path d="M${cx-7},${cy+2} Q${cx},${cy-4} ${cx+7},${cy+2}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>`
    } else if (expression === 'surprised') {
      return `<circle cx="${cx}" cy="${cy}" r="8" fill="white" stroke="${stroke}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="3" fill="${eyeColor}"/>`
    } else {
      // Default cute large eyes
      return `<circle cx="${cx}" cy="${cy}" r="7.5" fill="${eyeColor}" stroke="${stroke}" stroke-width="1.5"/>
              <circle cx="${cx-2+lookDir}" cy="${cy-2}" r="2.5" fill="white"/>
              <circle cx="${cx+2+lookDir}" cy="${cy+1}" r="1" fill="white"/>`
    }
  }

  // Draw Eyes
  if (expression === 'smirk') {
    svg += `<path d="M26,50 L42,50" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>`
    svg += drawEye(66, 52, 2)
  } else {
    svg += drawEye(34, 52, 0)
    svg += drawEye(66, 52, 0)
  }

  // Glasses Decoration
  if (decoration === 'glasses') {
    svg += `<circle cx="34" cy="52" r="11" fill="rgba(255,255,255,0.2)" stroke="#2d3436" stroke-width="2.5"/>`
    svg += `<circle cx="66" cy="52" r="11" fill="rgba(255,255,255,0.2)" stroke="#2d3436" stroke-width="2.5"/>`
    svg += `<path d="M45,50 Q50,48 55,50" fill="none" stroke="#2d3436" stroke-width="2.5" stroke-linecap="round"/>`
  }

  // Nose
  svg += `<path d="M47,62 L53,62 L50,65 Z" fill="#ff9ff3" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`

  // Expression (Mouth)
  if (expression === 'smile' || expression === 'kawaii' || expression === 'winking') {
    svg += `<path d="M42,67 Q46,72 50,67 M50,67 Q54,72 58,67" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`
  } else if (expression === 'open') {
    svg += `<path d="M46,67 Q50,75 54,67 Z" fill="#ff7675" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>`
  } else if (expression === 'flat') {
    svg += `<path d="M47,68 L53,68" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`
  } else if (expression === 'sad') {
    svg += `<path d="M43,70 Q50,64 57,70" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`
  } else if (expression === 'surprised') {
    svg += `<circle cx="50" cy="70" r="3" fill="#1a1a1c"/>`
  } else if (expression === 'smirk') {
    svg += `<path d="M46,67 Q52,69 56,64" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`
  }

  // Whiskers
  svg += `<path d="M28,62 L15,60 M28,65 L14,66" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>`
  svg += `<path d="M72,62 L85,60 M72,65 L86,66" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>`

  // Extra Decorations
  if (decoration === 'headband') {
    svg += `<path d="M16,35 Q50,20 84,35" fill="none" stroke="#e17055" stroke-width="6" stroke-linecap="round"/>`
    svg += `<path d="M50,15 L60,25 L50,28 L40,25 Z" fill="#fab1a0" stroke="#e17055" stroke-width="2"/>`
  } else if (decoration === 'flower') {
    svg += `<path d="M75,30 Q80,20 85,30 Q95,25 85,35 Q90,45 80,40 Q70,45 75,35 Q65,25 75,30 Z" fill="#ffeaa7" stroke="#fdcb6e" stroke-width="1.5"/>`
    svg += `<circle cx="80" cy="33" r="3" fill="#d63031"/>`
  } else if (decoration === 'fish') {
    svg += `<path d="M40,82 Q50,75 60,82 L65,78 L65,86 L60,82 Q50,89 40,82 Z" fill="#81ecec" stroke="${stroke}" stroke-width="1.5"/>`
    svg += `<circle cx="45" cy="81" r="1" fill="${stroke}"/>`
  }

  svg += `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`
}
