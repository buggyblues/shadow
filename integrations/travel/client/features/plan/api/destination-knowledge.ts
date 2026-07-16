export interface DestinationCultureProfile {
  timezone: string
  currency: string
  language: string
  etiquetteNotes: string[]
  tabooNotes: string[]
}

const destinationProfiles: Array<{ tokens: string[]; profile: DestinationCultureProfile }> = [
  {
    tokens: ['paris', 'france', 'française', '法国', '巴黎'],
    profile: {
      currency: 'EUR',
      etiquetteNotes: [
        'Service is usually included; rounding up or leaving a small tip is appreciated.',
        'Start interactions with a greeting before asking for help.',
      ],
      language: 'French',
      tabooNotes: [
        'Avoid speaking loudly in restaurants and public transit.',
        'Do not assume every small shop accepts cards for tiny purchases.',
      ],
      timezone: 'Europe/Paris',
    },
  },
  {
    tokens: ['tokyo', 'japan', '日本', '东京', '東京'],
    profile: {
      currency: 'JPY',
      etiquetteNotes: [
        'Queue carefully and keep phone calls quiet on trains.',
        'Cash is still useful for smaller restaurants and shrines.',
      ],
      language: 'Japanese',
      tabooNotes: [
        'Do not eat while walking in crowded streets.',
        'Avoid sticking chopsticks upright in rice.',
      ],
      timezone: 'Asia/Tokyo',
    },
  },
  {
    tokens: ['new york', 'united states', 'usa', '美国', '纽约'],
    profile: {
      currency: 'USD',
      etiquetteNotes: [
        'Restaurant tipping commonly starts around 18 percent before tax.',
        'Stand to the right on escalators when others are walking.',
      ],
      language: 'English',
      tabooNotes: [
        'Do not block sidewalks or subway doors while deciding directions.',
        'Avoid discussing private income, politics, or religion with strangers.',
      ],
      timezone: 'America/New_York',
    },
  },
  {
    tokens: ['barcelona', 'spain', 'catalonia', '西班牙', '巴塞罗那'],
    profile: {
      currency: 'EUR',
      etiquetteNotes: [
        'Dinner often starts later than in many countries.',
        'A small tip is appreciated but not mandatory for casual meals.',
      ],
      language: 'Catalan, Spanish',
      tabooNotes: [
        'Be careful with pickpockets in dense tourist areas.',
        'Do not treat Catalan identity as interchangeable with the rest of Spain.',
      ],
      timezone: 'Europe/Madrid',
    },
  },
  {
    tokens: ['singapore', '新加坡'],
    profile: {
      currency: 'SGD',
      etiquetteNotes: [
        'Hawker centres are casual; reserve seats with a small personal item only where customary.',
        'Keep public spaces clean and follow posted rules closely.',
      ],
      language: 'English, Mandarin, Malay, Tamil',
      tabooNotes: [
        'Do not litter or eat on public transit.',
        'Be respectful around religious spaces and remove shoes where required.',
      ],
      timezone: 'Asia/Singapore',
    },
  },
]

const fallbackProfile: DestinationCultureProfile = {
  currency: 'USD',
  etiquetteNotes: ['Check local tipping expectations before dining or taking taxis.'],
  language: 'Local language',
  tabooNotes: ['Review local religious, dietary, and clothing customs before arrival.'],
  timezone: 'UTC',
}

export function resolveDestinationProfile(destination: string): DestinationCultureProfile {
  const normalized = destination.trim().toLowerCase()
  const match = destinationProfiles.find((item) =>
    item.tokens.some((token) => normalized.includes(token.toLowerCase())),
  )
  return match?.profile ?? fallbackProfile
}
