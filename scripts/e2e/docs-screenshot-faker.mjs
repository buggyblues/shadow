const DEFAULT_SEED = 'shadow-docs-v1'

const PEOPLE = [
  ['Mira Chen', 'planner'],
  ['Nolan Park', 'operator'],
  ['Sora Lin', 'producer'],
  ['Avery Stone', 'organizer'],
  ['Iris Vale', 'researcher'],
  ['Theo Morgan', 'editor'],
  ['Lena Ortiz', 'designer'],
  ['Kai Rivers', 'coordinator'],
  ['Rina Zhou', 'maker'],
  ['Jon Bell', 'host'],
]

const AGENT_PROFILES = [
  ['Atlas Planner', 'atlas-planner', 'Turns scattered plans into clear next steps.'],
  ['Kite Builder', 'kite-builder', 'Creates boards, checklists, and Server App actions.'],
  ['Moss Coordinator', 'moss-coordinator', 'Keeps handoffs, reminders, and files organized.'],
  ['Nova Analyst', 'nova-analyst', 'Reads shared context and writes concise summaries.'],
  ['Echo Mixer', 'echo-mixer', 'Prepares creative drafts, notes, and review queues.'],
  ['Pixel Curator', 'pixel-curator', 'Organizes visual references and creative assets.'],
]

const DESKTOP_ICON_GRID = {
  left: 24,
  top: 56,
  slotWidth: 104,
  slotHeight: 112,
}

function iconPoint(col, row) {
  return [
    DESKTOP_ICON_GRID.left + col * DESKTOP_ICON_GRID.slotWidth,
    DESKTOP_ICON_GRID.top + row * DESKTOP_ICON_GRID.slotHeight,
  ]
}

const DOCS_SCREENSHOT_SCENARIOS = [
  {
    key: 'travel',
    label: 'Travel',
    name: 'Harbor Trip Planner',
    slug: 'harbor-trip',
    tagline: 'A weekend travel desktop for routes, bookings, maps, and shared decisions.',
    domain: 'weekend travel',
    accent: '#0ea5e9',
    channelNames: ['trip-plan', 'booking-desk'],
    files: [
      {
        name: 'Weekend itinerary.md',
        title: 'Weekend itinerary',
        body: ({ scenario, people }) => `# ${scenario.name}

## Plan

Keep the route, hotel options, train times, and food list in one Desktop Mode workspace.

## People

- ${people[0].name}: final decisions
- ${people[1].name}: booking checks
- ${people[2].name}: local notes

## Today

- Compare the two harbor hotels.
- Pin the train and museum times.
- Ask Buddy to summarize the latest booking changes.
`,
      },
      {
        name: 'Booking checklist.md',
        title: 'Booking checklist',
        body: () => `# Booking checklist

- Confirm refundable hotel room.
- Save train confirmation numbers.
- Add museum opening hours.
- Share the walking route before Friday.
`,
      },
      {
        name: 'Food map notes.md',
        title: 'Food map notes',
        body: ({ scenario }) => `# Food map notes

Theme: ${scenario.domain}

- Breakfast near the station.
- Seafood lunch around the harbor.
- Quiet cafe for the last afternoon.
`,
      },
    ],
    messages: [
      'I moved the latest train options and hotel shortlist onto the desktop so we can decide without opening five tabs.',
      'Buddy can turn the pinned itinerary into a day-by-day checklist after we lock the ferry time.',
    ],
    inboxTask: {
      title: 'Prepare weekend booking handoff',
      body: 'Check the itinerary, booking checklist, and food notes before the group confirms the trip.',
      tags: ['travel', 'desktop-mode'],
    },
    desktop: {
      screenshot: 'docs-desktop-travel-home.png',
      capture: { kind: 'home' },
      builtins: [
        ['workspace', 'Workspace', ...iconPoint(0, 1)],
        ['cloud-computers', 'Cloud Computers', ...iconPoint(0, 2)],
        ['app-store', 'App Center', ...iconPoint(0, 3)],
        ['shop', 'Shop', ...iconPoint(0, 4)],
      ],
      files: [iconPoint(1, 1), iconPoint(1, 2), iconPoint(1, 3)],
      apps: [iconPoint(2, 1)],
      buddyInboxes: [
        [0, ...iconPoint(1, 4)],
        [1, ...iconPoint(2, 4)],
      ],
      widgets: {
        brief: {
          x: 520,
          y: 86,
          widthCells: 6,
          heightCells: 4,
          rotation: -2,
          content:
            '## Trip board\n\n- Pick hotel\n- Check train times\n- Share the harbor food map',
        },
        typewriter: {
          x: 1010,
          y: 94,
          widthCells: 6,
          heightCells: 4,
          content: 'Weekend plan\nRoutes + bookings + notes',
          fontSize: 30,
        },
        photo: {
          x: 1070,
          y: 430,
          widthCells: 5,
          aspectRatio: 1.5,
          rotation: 2,
          title: 'Harbor reference',
        },
        chat: {
          x: 520,
          y: 690,
          widthCells: 9,
          heightCells: 2,
          placeholder: 'Ask Buddy to compare the two hotels...',
          completionItems: ['Summarize bookings', 'Draft day two plan', 'Check packing list'],
        },
      },
    },
  },
  {
    key: 'gaming',
    label: 'Gaming',
    name: 'Night Raid Room',
    slug: 'night-raid',
    tagline: 'A game community desktop for raid timing, voice prep, clips, and team notes.',
    domain: 'game night',
    accent: '#8b5cf6',
    channelNames: ['raid-lobby', 'clip-review'],
    files: [
      {
        name: 'Raid plan.md',
        title: 'Raid plan',
        body: ({ people }) => `# Raid plan

## Tonight

- ${people[0].name}: party lead
- ${people[1].name}: clip review
- ${people[2].name}: loot notes

Keep the party roster, strategy notes, and clip links visible on Desktop Mode.
`,
      },
      {
        name: 'Build notes.md',
        title: 'Build notes',
        body: () => `# Build notes

- Mark the safe opening route.
- Save the two boss phase reminders.
- Review support loadouts before queue.
`,
      },
      {
        name: 'Clip queue.md',
        title: 'Clip queue',
        body: () => `# Clip queue

Clips to review after the match:

- Opening rotation
- Failed pull
- Final clear
`,
      },
    ],
    messages: [
      'Raid plan is pinned on the desktop. Keep the build notes beside chat while we queue.',
      'I added the clip queue so Buddy can turn highlights into a recap after the session.',
    ],
    inboxTask: {
      title: 'Prepare raid recap handoff',
      body: 'Review the raid plan, clip queue, and build notes before publishing the recap.',
      tags: ['gaming', 'desktop-mode'],
    },
    desktop: {
      screenshot: 'docs-desktop-gaming-channel.png',
      capture: { kind: 'channel' },
      builtins: [
        ['workspace', 'Workspace', ...iconPoint(10, 1)],
        ['cloud-computers', 'Cloud Computers', ...iconPoint(11, 1)],
        ['app-store', 'App Center', ...iconPoint(12, 1)],
        ['shop', 'Shop', ...iconPoint(13, 1)],
      ],
      files: [iconPoint(10, 2), iconPoint(11, 2), iconPoint(12, 2)],
      apps: [iconPoint(13, 2)],
      buddyInboxes: [
        [0, ...iconPoint(13, 3)],
        [1, ...iconPoint(14, 3)],
      ],
      widgets: {
        brief: {
          x: 940,
          y: 420,
          widthCells: 6,
          heightCells: 4,
          rotation: 2,
          content: '## Queue\n\n- Confirm roster\n- Keep phase notes open\n- Send clip recap',
        },
        typewriter: {
          x: 640,
          y: 92,
          widthCells: 6,
          heightCells: 4,
          content: 'Raid night\nChat + files + clips',
          fontSize: 30,
        },
        photo: {
          x: 1280,
          y: 548,
          widthCells: 5,
          aspectRatio: 1.5,
          rotation: -3,
          title: 'Setup reference',
        },
        chat: {
          x: 830,
          y: 720,
          widthCells: 8,
          heightCells: 2,
          placeholder: 'Ask Buddy to prepare the raid recap...',
          completionItems: ['Summarize clips', 'Draft raid recap', 'List next builds'],
        },
      },
    },
  },
  {
    key: 'family',
    label: 'Family',
    name: 'Family Home Board',
    slug: 'family-board',
    tagline: 'A shared family desktop for chores, school papers, photos, and weekend plans.',
    domain: 'family planning',
    accent: '#22c55e',
    channelNames: ['home-board', 'weekend-plan'],
    files: [
      {
        name: 'Family week.md',
        title: 'Family week',
        body: ({ people }) => `# Family week

## This week

- ${people[0].name}: school forms
- ${people[1].name}: grocery list
- ${people[2].name}: weekend route

Use Desktop Mode as a calm home board for the week.
`,
      },
      {
        name: 'Grocery list.md',
        title: 'Grocery list',
        body: () => `# Grocery list

- Vegetables
- Lunch boxes
- Breakfast fruit
- Picnic snacks
`,
      },
      {
        name: 'School forms.md',
        title: 'School forms',
        body: () => `# School forms

- Permission slip
- Club signup
- Library reminder
`,
      },
    ],
    messages: [
      'I put the grocery list and school forms on the desktop so the weekend plan stays visible.',
      'Buddy can turn the family week note into reminders after we finish the checklist.',
    ],
    inboxTask: {
      title: 'Prepare family week reminders',
      body: 'Review school forms, grocery list, and weekend notes before creating reminders.',
      tags: ['family', 'desktop-mode'],
    },
    desktop: {
      screenshot: 'docs-desktop-family-file.png',
      capture: {
        kind: 'file',
        fileName: 'Family week.md',
        window: { x: 64, y: 92, width: 900, height: 690 },
      },
      builtins: [
        ['workspace', 'Workspace', ...iconPoint(10, 1)],
        ['cloud-computers', 'Cloud Computers', ...iconPoint(11, 1)],
        ['app-store', 'App Center', ...iconPoint(12, 1)],
        ['shop', 'Shop', ...iconPoint(13, 1)],
      ],
      files: [iconPoint(10, 2), iconPoint(11, 2), iconPoint(12, 2)],
      apps: [iconPoint(13, 2)],
      buddyInboxes: [
        [0, ...iconPoint(13, 3)],
        [1, ...iconPoint(14, 3)],
      ],
      widgets: {
        brief: {
          x: 1040,
          y: 390,
          widthCells: 6,
          heightCells: 4,
          rotation: -1,
          content:
            '## Home board\n\n- Forms by Thursday\n- Groceries before dinner\n- Picnic route on Saturday',
        },
        typewriter: {
          x: 1040,
          y: 650,
          widthCells: 6,
          heightCells: 3,
          content: 'One family board\nEveryone sees the week',
          fontSize: 26,
        },
        photo: {
          x: 1370,
          y: 548,
          widthCells: 4,
          aspectRatio: 1.35,
          rotation: 2,
          title: 'Weekend photo',
        },
        chat: {
          x: 1040,
          y: 790,
          widthCells: 7,
          heightCells: 2,
          placeholder: 'Ask Buddy to make family reminders...',
          completionItems: ['Create reminders', 'Summarize chores', 'Plan picnic'],
        },
      },
    },
  },
  {
    key: 'art',
    label: 'Art',
    name: 'Sketch Studio Desk',
    slug: 'sketch-studio',
    tagline: 'A visual studio desktop for references, drafts, app tools, and cloud rendering.',
    domain: 'drawing studio',
    accent: '#f97316',
    channelNames: ['studio-wall', 'review-table'],
    files: [
      {
        name: 'Sketch direction.md',
        title: 'Sketch direction',
        body: ({ people }) => `# Sketch direction

## Board

- ${people[0].name}: art direction
- ${people[1].name}: reference cleanup
- ${people[2].name}: review notes

Keep reference files, comments, and render tools on the same desktop.
`,
      },
      {
        name: 'Reference board.md',
        title: 'Reference board',
        body: () => `# Reference board

- Warm daylight
- Soft material edges
- Three-color accent palette
`,
      },
      {
        name: 'Review notes.md',
        title: 'Review notes',
        body: () => `# Review notes

- Make silhouette clearer.
- Keep the background quieter.
- Export two alternate crops.
`,
      },
    ],
    messages: [
      'The reference board is pinned. Keep it next to the cloud computer while the render tool warms up.',
      'Buddy can collect review notes from the channel and turn them into the next sketch pass.',
    ],
    inboxTask: {
      title: 'Prepare sketch review handoff',
      body: 'Read the reference board and review notes before creating the next art pass.',
      tags: ['drawing', 'desktop-mode'],
    },
    desktop: {
      screenshot: 'docs-desktop-art-cloud-computer.png',
      capture: {
        kind: 'builtin',
        builtinKey: 'cloud-computers',
        window: { x: 56, y: 86, width: 920, height: 720 },
      },
      builtins: [
        ['workspace', 'Workspace', ...iconPoint(10, 1)],
        ['cloud-computers', 'Cloud Computers', ...iconPoint(11, 1)],
        ['app-store', 'App Center', ...iconPoint(12, 1)],
        ['shop', 'Shop', ...iconPoint(13, 1)],
      ],
      files: [iconPoint(10, 2), iconPoint(11, 2), iconPoint(12, 2)],
      apps: [iconPoint(13, 2)],
      buddyInboxes: [
        [0, ...iconPoint(13, 0)],
        [1, ...iconPoint(14, 0)],
      ],
      widgets: {
        brief: {
          x: 1030,
          y: 388,
          widthCells: 6,
          heightCells: 4,
          rotation: 3,
          content: '## Studio\n\n- Compare references\n- Render in cloud\n- Collect review notes',
        },
        typewriter: {
          x: 1030,
          y: 650,
          widthCells: 6,
          heightCells: 3,
          content: 'Sketch desk\nReferences + tools',
          fontSize: 26,
        },
        photo: {
          x: 1360,
          y: 535,
          widthCells: 4,
          aspectRatio: 1.35,
          rotation: -2,
          title: 'Reference table',
        },
        chat: {
          x: 1030,
          y: 790,
          widthCells: 7,
          heightCells: 2,
          placeholder: 'Ask Buddy to collect review notes...',
          completionItems: ['Summarize review', 'Prepare render list', 'Draft art caption'],
        },
      },
    },
  },
  {
    key: 'music',
    label: 'Music',
    name: 'Band Practice Desk',
    slug: 'band-practice',
    tagline: 'A music desktop for setlists, lyric notes, rehearsal tasks, and shared recordings.',
    domain: 'music rehearsal',
    accent: '#ec4899',
    channelNames: ['setlist', 'rehearsal'],
    files: [
      {
        name: 'Setlist.md',
        title: 'Setlist',
        body: ({ people }) => `# Setlist

## Practice order

- ${people[0].name}: rehearsal lead
- ${people[1].name}: recording notes
- ${people[2].name}: lyric changes

Keep setlist, lyrics, recordings, and Buddy task handoff on one desktop.
`,
      },
      {
        name: 'Lyric notes.md',
        title: 'Lyric notes',
        body: () => `# Lyric notes

- Shorten the second bridge.
- Try softer backing vocals.
- Mark the ending cue.
`,
      },
      {
        name: 'Recording checklist.md',
        title: 'Recording checklist',
        body: () => `# Recording checklist

- Save rehearsal room take.
- Add phone memo backup.
- Share mix notes after practice.
`,
      },
    ],
    messages: [
      'Setlist and lyric notes are pinned. Buddy can prepare the rehearsal recap when the take is uploaded.',
      'I kept the recording checklist visible so we do not lose the phone memo backup.',
    ],
    inboxTask: {
      title: 'Prepare rehearsal recap',
      body: 'Review the setlist, lyric notes, and recording checklist before writing the band recap.',
      tags: ['music', 'desktop-mode'],
    },
    desktop: {
      screenshot: 'docs-desktop-music-buddy-inbox.png',
      capture: { kind: 'inbox' },
      builtins: [
        ['workspace', 'Workspace', ...iconPoint(0, 1)],
        ['cloud-computers', 'Cloud Computers', ...iconPoint(1, 1)],
        ['app-store', 'App Center', ...iconPoint(2, 1)],
        ['shop', 'Shop', ...iconPoint(3, 1)],
      ],
      files: [iconPoint(0, 2), iconPoint(1, 2), iconPoint(2, 2)],
      apps: [iconPoint(3, 2)],
      buddyInboxes: [
        [0, ...iconPoint(0, 4)],
        [1, ...iconPoint(1, 4)],
      ],
      widgets: {
        brief: {
          x: 520,
          y: 86,
          widthCells: 6,
          heightCells: 4,
          rotation: -3,
          content:
            '## Practice\n\n- Confirm setlist\n- Record final take\n- Send recap after rehearsal',
        },
        typewriter: {
          x: 520,
          y: 405,
          widthCells: 6,
          heightCells: 3,
          content: 'Practice desk\nSetlist + lyrics + recap',
          fontSize: 26,
        },
        photo: {
          x: 800,
          y: 500,
          widthCells: 4,
          aspectRatio: 1.35,
          rotation: 2,
          title: 'Rehearsal reference',
        },
        chat: {
          x: 520,
          y: 720,
          widthCells: 8,
          heightCells: 2,
          placeholder: 'Ask Buddy to write the rehearsal recap...',
          completionItems: ['Draft recap', 'List lyric changes', 'Prepare next practice'],
        },
      },
    },
  },
]

export const LEGACY_DOCS_SCREENSHOT_FILE_NAMES = [
  'Launch brief.md',
  'Cloud runbook.md',
  'Interview notes.md',
  'Desktop launch brief.md',
  'Desktop cloud runbook.md',
  'Desktop interview notes.md',
]

function fnv1a(input) {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function createRng(seed) {
  let state = fnv1a(seed) || 0xdecafbad
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length) % values.length]
}

function shuffle(rng, values) {
  const next = [...values]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

function shortHash(seed) {
  return fnv1a(seed).toString(36).padStart(7, '0').slice(0, 7)
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const WEBSITE_SCENARIO_ASSETS = {
  travel: {
    wallpaper: 'animal-orchestra/wallpapers/travel-planning.png',
    workspacePhoto: 'animal-orchestra/photos/travel-planning.png',
    banner: 'home-sections/space-earth-horizon-2.png',
    serverIcon: 'animal-orchestra/server-icons/travel-map.png',
    appIcon: 'animal-orchestra/app-icons/travel-map.png',
  },
  gaming: {
    wallpaper: 'animal-orchestra/wallpapers/game-night.png',
    workspacePhoto: 'animal-orchestra/photos/family-game-board.png',
    banner: 'home-sections/space-ringed-planet.png',
    serverIcon: 'animal-orchestra/server-icons/game-night.png',
    appIcon: 'animal-orchestra/app-icons/game-dice.png',
  },
  family: {
    wallpaper: 'animal-orchestra/wallpapers/family-board.png',
    workspacePhoto: 'animal-orchestra/photos/community-shop.png',
    banner: 'home-sections/space-planet-left-2.png',
    serverIcon: 'animal-orchestra/server-icons/family-board.png',
    appIcon: 'animal-orchestra/app-icons/message-board.png',
  },
  art: {
    wallpaper: 'animal-orchestra/wallpapers/art-studio.png',
    workspacePhoto: 'animal-orchestra/photos/art-workshop.png',
    banner: 'home-sections/space-planet-close.png',
    serverIcon: 'animal-orchestra/server-icons/art-studio.png',
    appIcon: 'animal-orchestra/app-icons/paint-palette.png',
  },
  music: {
    wallpaper: 'animal-orchestra/wallpapers/music-rehearsal.png',
    workspacePhoto: 'animal-orchestra/photos/orchestra-rehearsal.png',
    banner: 'home-sections/space-ringed-planet.png',
    serverIcon: 'animal-orchestra/server-icons/music-rehearsal.png',
    appIcon: 'animal-orchestra/app-icons/music-keys.png',
  },
}

const PEOPLE_AVATAR_ASSETS = [
  'animal-orchestra/avatars/rabbit-head.png',
  'animal-orchestra/avatars/bear-head.png',
  'animal-orchestra/avatars/black-cat-head.png',
  'animal-orchestra/avatars/duck-head.png',
  'animal-orchestra/avatars/fox-head.png',
  'animal-orchestra/avatars/owl-head.png',
  'animal-orchestra/avatars/otter-head.png',
  'animal-orchestra/avatars/deer-head.png',
  'animal-orchestra/avatars/frog-head.png',
  'animal-orchestra/avatars/red-panda-head.png',
  'animal-orchestra/avatars/penguin-head.png',
  'animal-orchestra/avatars/hedgehog-head.png',
]

const AGENT_AVATAR_ASSETS = [
  'animal-orchestra/avatars/owl-head.png',
  'animal-orchestra/avatars/red-panda-head.png',
  'animal-orchestra/avatars/black-cat-head.png',
  'animal-orchestra/avatars/otter-head.png',
  'animal-orchestra/avatars/deer-head.png',
  'animal-orchestra/avatars/frog-head.png',
  'animal-orchestra/avatars/penguin-head.png',
  'animal-orchestra/avatars/fox-head.png',
]

function websiteAsset(relativePath) {
  return `website/docs/public/${relativePath}`
}

function assetRelativeFromList(seed, values, index) {
  const offset = fnv1a(`${seed}:asset`) % values.length
  return values[(offset + index) % values.length]
}

function scenarioBySeed(seed) {
  const rng = createRng(seed)
  return pick(rng, DOCS_SCREENSHOT_SCENARIOS)
}

export function createDocsScreenshotFixtures(seed = DEFAULT_SEED) {
  const normalizedSeed = String(seed || DEFAULT_SEED)
  return DOCS_SCREENSHOT_SCENARIOS.map((scenario) =>
    createDocsScreenshotFixture(`${normalizedSeed}:${scenario.key}`, scenario),
  )
}

export function createDocsScreenshotFixture(seed = DEFAULT_SEED, scenarioInput) {
  const normalizedSeed = String(seed || DEFAULT_SEED)
  const scenario = scenarioInput ?? scenarioBySeed(normalizedSeed)
  const rng = createRng(normalizedSeed)
  const hash = shortHash(normalizedSeed)
  const scenarioAssets = WEBSITE_SCENARIO_ASSETS[scenario.key] ?? WEBSITE_SCENARIO_ASSETS.music
  const people = shuffle(rng, PEOPLE)
    .slice(0, 4)
    .map(([name, role], index) => {
      const avatarAsset = assetRelativeFromList(normalizedSeed, PEOPLE_AVATAR_ASSETS, index)
      return {
        name,
        role,
        email: `docs.${scenario.key}.${slugify(name)}.${hash}@shadowob.local`,
        password: 'ShadowDocs123!',
        avatarUrl: null,
        avatarAsset: websiteAsset(avatarAsset),
        avatarAssetPublicPath: avatarAsset,
        primary: index === 0,
      }
    })
  const agentProfiles = shuffle(rng, AGENT_PROFILES)
    .slice(0, 3)
    .map(([name, username, description], index) => {
      const avatarAsset = assetRelativeFromList(normalizedSeed, AGENT_AVATAR_ASSETS, index)
      return {
        name,
        username: `${username}-${scenario.key}-${hash.slice(0, 4)}`,
        description,
        kernelType: 'openclaw',
        avatarUrl: null,
        avatarAsset: websiteAsset(avatarAsset),
        avatarAssetPublicPath: avatarAsset,
      }
    })

  const stableTimestamp = new Date(
    Date.UTC(2026, 0, 12 + (fnv1a(normalizedSeed) % 12), 9, 30, 0),
  ).toISOString()

  const channels = [
    {
      key: 'general',
      name: 'general',
      type: 'text',
      topic: `Daily discussion for ${scenario.name}.`,
    },
    {
      key: 'briefing',
      name: scenario.channelNames[0],
      type: 'announcement',
      topic: `${scenario.label} decisions, updates, and pinned handoffs.`,
    },
    {
      key: 'handoff',
      name: scenario.channelNames[1],
      type: 'text',
      topic: `${scenario.label} tasks, files, cloud computer notes, and Buddy coordination.`,
    },
  ]

  const files = scenario.files.map((file) => ({
    name: file.name,
    mime: 'text/markdown',
    content: file.body({ scenario, people }),
  }))

  const server = {
    name: scenario.name,
    slug: `docs-${scenario.slug}-${hash.slice(0, 6)}`,
    description: scenario.tagline,
    iconUrl: null,
    iconAsset: websiteAsset(scenarioAssets.serverIcon),
    bannerUrl: null,
    bannerAsset: websiteAsset(scenarioAssets.banner),
    isPublic: true,
  }
  const serverAppKey = `${scenario.key}-handoff-${hash.slice(0, 4)}`
  const serverAppName = `${scenario.label} Server App`
  const serverAppDescription = `A Server App for ${scenario.domain} handoffs.`
  const serverAppIconUrl = `https://example.com/shadow-docs/${scenario.key}/icon.png`
  const serverAppIconAsset = websiteAsset(scenarioAssets.appIcon)
  const serverAppBaseUrl = `https://example.com/shadow-docs/${scenario.key}`
  const serverApps = [
    {
      appKey: serverAppKey,
      name: serverAppName,
      description: serverAppDescription,
      iconUrl: serverAppIconUrl,
      iconAsset: serverAppIconAsset,
      manifest: {
        schemaVersion: 'shadow.app/1',
        appKey: serverAppKey,
        name: serverAppName,
        description: serverAppDescription,
        version: '1.0.0',
        updatedAt: stableTimestamp,
        iconUrl: serverAppIconUrl,
        iframe: {
          entry: `${serverAppBaseUrl}/app`,
          allowedOrigins: ['https://example.com'],
        },
        api: {
          baseUrl: `${serverAppBaseUrl}/api`,
          auth: { type: 'oauth2-bearer' },
        },
        access: {
          defaultPermissions: [`${scenario.key}.handoff:read`],
          defaultApprovalMode: 'none',
        },
        commands: [
          {
            name: 'handoff.prepare',
            title: 'Prepare handoff',
            description: `Prepare a ${scenario.domain} handoff from the desktop context.`,
            ingress: { path: '/commands/handoff.prepare' },
            permission: `${scenario.key}.handoff:read`,
            action: 'read',
            dataClass: 'server-private',
            approvalMode: 'none',
          },
        ],
        skills: [
          {
            name: `${scenario.label} handoff`,
            description: `Summarize ${scenario.domain} workspace context for the team.`,
            commandHints: ['handoff.prepare'],
          },
        ],
      },
    },
  ]

  return {
    seed: normalizedSeed,
    hash,
    stableTimestamp,
    scenario: {
      key: scenario.key,
      label: scenario.label,
      name: scenario.name,
      slug: scenario.slug,
      tagline: scenario.tagline,
      domain: scenario.domain,
      accent: scenario.accent,
    },
    owner: people[0],
    teammates: people.slice(1),
    people,
    server,
    channels,
    agents: agentProfiles,
    serverApps,
    cloudComputer: {
      name: `${scenario.name} Cloud`,
      description: `Always-on browser, terminal, and desktop runtime for ${scenario.domain}.`,
    },
    files,
    media: {
      wallpaperName: `docs-${scenario.key}-wallpaper-${hash}.png`,
      wallpaperAsset: websiteAsset(scenarioAssets.wallpaper),
      workspacePhotoName: `docs-${scenario.key}-reference-${hash}.png`,
      workspacePhotoAsset: websiteAsset(scenarioAssets.workspacePhoto),
      workspacePhotoUrl: '',
      publicAssets: {
        wallpaper: scenarioAssets.wallpaper,
        workspacePhoto: scenarioAssets.workspacePhoto,
        serverIcon: scenarioAssets.serverIcon,
        serverBanner: scenarioAssets.banner,
        serverAppIcon: scenarioAssets.appIcon,
        peopleAvatars: people.map((person) => person.avatarAssetPublicPath),
        agentAvatars: agentProfiles.map((agent) => agent.avatarAssetPublicPath),
      },
    },
    messages: [
      {
        channelKey: 'briefing',
        author: 'owner',
        content: scenario.messages[0],
      },
      {
        channelKey: 'briefing',
        author: 'teammate:0',
        content: scenario.messages[1],
      },
      {
        channelKey: 'handoff',
        author: 'owner',
        content: `@${agentProfiles[0].name} please use the pinned files and keep the next handoff readable.`,
      },
    ],
    inboxTask: scenario.inboxTask,
    desktop: scenario.desktop,
    shop: {
      category: {
        name: `${scenario.label} Kits`,
        slug: `${scenario.key}-kits-${hash.slice(0, 4)}`,
      },
      products: [
        {
          name: `${scenario.label} Desktop Kit`,
          slug: `${scenario.key}-desktop-kit-${hash.slice(0, 4)}`,
          summary: `Templates for a ${scenario.domain} desktop.`,
          description: `Includes pinned files, channel conventions, and Buddy handoff patterns for ${scenario.domain}.`,
          basePrice: 6900,
          status: 'active',
          tags: [scenario.key, 'desktop'],
          specNames: ['Edition'],
          skus: [
            {
              specValues: ['Team'],
              price: 6900,
              stock: 32,
              skuCode: `${scenario.key.slice(0, 3).toUpperCase()}-${hash.slice(0, 4).toUpperCase()}`,
            },
          ],
        },
      ],
    },
  }
}

function builtinItem([builtinKey, title, x, y]) {
  return {
    id: `docs-builtin-${builtinKey}`,
    kind: 'builtin-app',
    builtinKey,
    title,
    x,
    y,
  }
}

function visibleFileItem(file, [x, y]) {
  return {
    id: `docs-file-${file.id}`,
    kind: 'workspace-node',
    workspaceNodeId: file.id,
    source: 'pinned',
    x,
    y,
  }
}

function hiddenFileItem(file, index) {
  return {
    id: `docs-file-${file.id}`,
    kind: 'workspace-node',
    workspaceNodeId: file.id,
    source: 'pinned',
    hidden: true,
    x: 40 + index * 24,
    y: 900,
  }
}

function serverAppItem(app, [x, y]) {
  return {
    id: `docs-app-${app.appKey}`,
    kind: 'server-app',
    appKey: app.appKey,
    appId: app.id,
    title: app.name,
    iconUrl: app.iconUrl,
    x,
    y,
  }
}

function buddyInboxItem(agent, [x, y]) {
  return {
    id: `docs-buddy-inbox-${agent.id}`,
    kind: 'buddy-inbox',
    agentId: agent.id,
    title: agent.botUser?.displayName ?? agent.name,
    x,
    y,
  }
}

export function createDocsDesktopLayout({
  fixture,
  files,
  agents,
  serverApps = fixture.serverApps,
}) {
  const updatedAt = fixture.stableTimestamp
  const fileByName = new Map(files.map((file) => [file.name, file]))
  const visibleFiles = fixture.files
    .map((file, index) => {
      const record = fileByName.get(file.name)
      const point = fixture.desktop.files[index]
      return record && point ? visibleFileItem(record, point) : null
    })
    .filter(Boolean)
  const hiddenFiles = files.filter(
    (file) =>
      file.name === 'Wallpapers' ||
      file.name.startsWith('docs-') ||
      file.name.startsWith('docs-wallpaper-') ||
      file.name.startsWith('docs-os-sketch-') ||
      LEGACY_DOCS_SCREENSHOT_FILE_NAMES.includes(file.name),
  )
  const visibleServerApps = (fixture.desktop.apps ?? [])
    .map((point, index) => {
      const app = serverApps[index]
      return app && point ? serverAppItem(app, point) : null
    })
    .filter(Boolean)
  const visibleBuddyInboxes = (fixture.desktop.buddyInboxes ?? [])
    .map(([agentIndex, x, y]) => {
      const agent = agents[agentIndex]
      return agent ? buddyInboxItem(agent, [x, y]) : null
    })
    .filter(Boolean)
  const workspacePhotoFile = fixture.media.workspacePhotoName
    ? fileByName.get(fixture.media.workspacePhotoName)
    : null
  const photoSource = workspacePhotoFile
    ? {
        sourceType: 'workspace-file',
        source: workspacePhotoFile.id,
        workspaceFileName: workspacePhotoFile.name,
      }
    : {
        sourceType: 'url',
        source: fixture.media.workspacePhotoUrl,
      }
  const defaultAgentId = agents[0]?.id ?? null
  const widgets = fixture.desktop.widgets

  return {
    version: 2,
    items: [
      ...fixture.desktop.builtins.map(builtinItem),
      ...visibleFiles,
      ...visibleServerApps,
      ...visibleBuddyInboxes,
      ...hiddenFiles.map(hiddenFileItem),
    ],
    widgets: [
      {
        id: 'docs-widget-brief',
        kind: 'sticky-note',
        zIndex: 20,
        updatedAt,
        ...widgets.brief,
      },
      {
        id: 'docs-widget-typewriter',
        kind: 'typewriter',
        zIndex: 10,
        speedMs: 15,
        pauseMs: 8000,
        loop: false,
        cursor: false,
        fontFamily: 'system',
        color: '#f8fafc',
        textShadow: 'soft',
        textStrokeWidth: 0,
        textStrokeColor: '#0f172a',
        updatedAt,
        ...widgets.typewriter,
      },
      {
        id: 'docs-widget-photo',
        kind: 'photo',
        ...photoSource,
        zIndex: 15,
        updatedAt,
        ...widgets.photo,
      },
      {
        id: 'docs-widget-chat',
        kind: 'chat-input',
        zIndex: 30,
        defaultAgentId,
        inboxViewMode: 'chat',
        updatedAt,
        ...widgets.chat,
      },
    ],
  }
}
