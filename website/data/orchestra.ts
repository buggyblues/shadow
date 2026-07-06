export type OrchestraNote = {
  label: string
  frequency: number
}

export type OrchestraPlayer = {
  name: string
  image: string
  ariaKey: string
  note: OrchestraNote
  triad: OrchestraNote[]
  pan: number
}

export const ORCHESTRA_PLAYERS: OrchestraPlayer[] = [
  {
    name: 'rabbit',
    image: 'rabbit_flute_transparent.png',
    ariaKey: 'home.orchestra.rabbit',
    note: { label: 'C', frequency: 261.63 },
    triad: [
      { label: 'C', frequency: 261.63 },
      { label: 'E', frequency: 329.63 },
      { label: 'G', frequency: 392 },
    ],
    pan: -0.72,
  },
  {
    name: 'fox',
    image: 'fox_violin_transparent.png',
    ariaKey: 'home.orchestra.fox',
    note: { label: 'E', frequency: 329.63 },
    triad: [
      { label: 'E', frequency: 329.63 },
      { label: 'G', frequency: 392 },
      { label: 'B', frequency: 493.88 },
    ],
    pan: -0.36,
  },
  {
    name: 'bear',
    image: 'bear_cello_transparent.png',
    ariaKey: 'home.orchestra.bear',
    note: { label: 'G', frequency: 392 },
    triad: [
      { label: 'G', frequency: 392 },
      { label: 'B', frequency: 493.88 },
      { label: 'D', frequency: 587.33 },
    ],
    pan: 0,
  },
  {
    name: 'cat',
    image: 'black_cat_xylophone_transparent.png',
    ariaKey: 'home.orchestra.cat',
    note: { label: 'B', frequency: 493.88 },
    triad: [
      { label: 'B', frequency: 493.88 },
      { label: 'D', frequency: 587.33 },
      { label: 'F', frequency: 698.46 },
    ],
    pan: 0.38,
  },
  {
    name: 'duck',
    image: 'duck_clarinet_transparent.png',
    ariaKey: 'home.orchestra.duck',
    note: { label: 'D', frequency: 587.33 },
    triad: [
      { label: 'D', frequency: 587.33 },
      { label: 'F', frequency: 698.46 },
      { label: 'A', frequency: 880 },
    ],
    pan: 0.74,
  },
]
