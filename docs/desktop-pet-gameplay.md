# Shadow Desktop Pet Gameplay Plan

## Design Target

The desktop pet should be a light companion, not a full management game. The target loop is:

1. Notice the pet's visual state.
2. Open the interaction wheel or care panel.
3. Choose one short action.
4. Get a visible animation, a short response, and quiet long-term progress.

Exact raw stat numbers stay hidden from normal users. The care panel can show compact need bars,
level progress, quests, inventory, and recent achievements, while the pet primarily communicates
through sprite animation, emotion class, day phase, speech bubble, and occasional reminders.

The default pet profile is named `小懒` with a lazy personality. Users can rename the pet, choose a personality, or randomize both. Personality is treated as presentation and future behavior tuning, not a public stat meter.

## Research Basis

- Self-Determination Theory frames durable motivation around autonomy, competence, and relatedness. The pet uses optional actions, visible progress, and relationship-like feedback instead of heavy chores. Source: [Self-determination theory in games](https://open.metu.edu.tr/handle/11511/83802), [SDT in exergames](https://pmc.ncbi.nlm.nih.gov/articles/PMC7924718/).
- The emotion model uses the common valence/arousal framing from circumplex affect research. Shadow maps internal needs into seven readable states: excited, content, calm, lonely, hungry, sleepy, sick. Source: [circumplex affect model](https://pmc.ncbi.nlm.nih.gov/articles/PMC2367156/).
- Daily events use intermittent surprise without loot pressure. Reinforcement research shows schedule and timing affect response consistency, so Shadow keeps surprises small, once per day, and resolvable by normal care instead of encouraging repeated clicking. Source: [reinforcement schedules overview](https://www.simplypsychology.org/schedules-of-reinforcement.html), [variable-ratio/interval comparison](https://pmc.ncbi.nlm.nih.gov/articles/PMC1333678/).
- The asset format is inspired by Live2D's separation of model settings, motions, expressions, physics, display info, and relative file references. Source: [Live2D Cubism JSON manual](https://docs.live2d.com/en/cubism-sdk-manual/json-ue/), [Live2D model loading manual](https://docs.live2d.com/en/cubism-editor-manual/load-model-and-motion/).

## Core Systems

### Needs

Internal stats are mood, hunger, charm, energy, health, loyalty, XP, and level. They are serialized
for continuity; the pet panel exposes them as compact progress signals rather than editable raw
values.

- Hunger decays through the day and more slowly at night.
- Energy recovers strongly at night and decays lightly during active hours.
- Mood decays slowly, plus discomfort when hunger, energy, or health are low.
- Health drops only when hunger is critical or daytime exhaustion is severe.
- Good food, energy, and mood slowly restore health.

### Day Phases

Local time determines the pet's phase:

- Morning: 05:00-09:59
- Day: 10:00-16:59
- Evening: 17:00-21:59
- Night: 22:00-04:59

Night phase pushes the pet toward rest animation, even if stats are otherwise good.

### Emotion

Emotion is derived, not stored. This prevents stale emotion data and lets asset packs respond to the same standard state.

- Sick: health < 30
- Hungry: hunger < 28
- Sleepy: energy < 25 or night phase
- Excited: high valence and high arousal
- Content: high valence
- Lonely: low valence and low arousal
- Calm: default healthy low-intensity state

Valence is calculated from mood and need score; arousal is calculated from energy and mood.

### Actions

| Action | Purpose | Main Effects |
| --- | --- | --- |
| Feed | Fix hunger | hunger, small mood/health, XP |
| Pet | Relationship touch | mood, loyalty, small charm, XP |
| Play | High-arousal fun | mood, charm, loyalty, energy/hunger cost |
| Rest | Recovery | energy, health, mood, hunger cost |
| Explore | Discovery | shells/items/charm/XP if healthy; penalty if exhausted/hungry/night |
| Tea | Gentle recovery | health, energy, mood |

Repeated same-action XP scales down per local day: first 2 uses are full value, uses 3-4 are 65%, uses 5+ are 35%. This keeps the pet responsive while making spam weaker than varied care.

When the pet has an unresolved daily event or an abnormal need state, the main wheel's Interact sector gets a red dot first. After the user opens the second-level wheel, the exact recommended care action also gets a red dot. The same hint appears in the care panel and disappears when the user performs the recommended action and the derived state no longer needs it.

### Daily Event

One deterministic daily event is generated from local date, level, and loyalty. It asks for one ordinary action and gives a small bonus when resolved. Examples:

- Morning stretch -> play
- Window sunbeam -> pet
- Curious ping -> explore
- Rainy nap -> rest
- Midnight hungry -> feed
- Loose shell -> explore

The event appears as a short hint bubble. It is optional and never blocks normal use.

### Services

The pet can act as a lightweight helper without becoming a dashboard:

- Water reminder: hourly nudge when enabled.
- Focus timer: 25 minute block with completion nudge.
- Fitness reminder: 90 minute stretch nudge.
- Coding Agent monitor: local connector status nudge when online count changes.

These services use pet speech and panel toggles, not raw notification spam.

Service reminders also integrate with desktop attention:

- Dock badge and tray attention mirror unresolved community, subscription, and service reminders.
- The pet body also shows care recommendations for abnormal pet state.
- Opening the services panel clears service reminders after they have been checked.
- Community notifications and subscribed files keep their dots until opened or marked read.

The pet attention count combines community notifications, subscribed files, service reminders, and care recommendations, but it still routes users to the most relevant panel first.

### Expanded Panel UX

The expanded panel uses a left sidebar instead of a crowded top tab row. The sidebar keeps the six primary areas visible as compact icon+label targets:

- Chat, care, and services are grouped as daily companion actions.
- Community, subscriptions, and store are grouped as Shadow-connected surfaces.
- Red dots stay attached to the exact sidebar item that needs attention.
- The close control is separated from navigation so it does not compete with tabs.

The expanded pet window is sized for feature-bearing panels rather than a tiny chat card. The content area owns scrolling, while the sidebar remains stable and draggable so the pet window can still be moved without conflicting with tab clicks.

## Simulation Results

Script: `apps/desktop/scripts/simulate-pet-game.ts`

Round 1 found an over-punishment problem: `light_daily_30d` ended with health 0 because night energy recovery was too weak. The time-step model was tuned to stronger night recovery and lighter day decay.

Round 2 fixed night recovery but still punished low-frequency users too hard. Round 3 retuned the
model for a day-scale companion: hunger decays about 9 points per day, a normal feed restores 28,
and food/rest/tea are meaningful recovery actions.

| Scenario | 30d Outcome | Interpretation |
| --- | --- | --- |
| neglect_30d | Lv1, health 0, sick samples 33 | No care visibly fails after about a week, but no negative economy spiral. |
| light_daily_30d | Lv3, XP 154/240, shells 229, health 100, 10 events | Two touches per day are enough to feel successful. |
| balanced_30d | Lv6, XP 132/420, shells 445, health 100, 30 events | Active users progress faster and resolve all daily moments. |
| pet_spam_30d | Lv4, health 0, sick samples 152 | Repeating only petting gains less useful progress and still fails needs. |
| weekend_catchup_30d | Lv3, health 56, hunger 8, sick samples 0 | Weekend care can recover health, but visible hunger/low mood still guides better daily care. |

Accepted balance:

- Lightweight success path: 2 actions/day.
- Engaged path: 4-5 varied actions/day.
- Anti-spam: repeated petting does not substitute for food/rest.
- Failure is visual and recoverable; low-frequency users get warning states before sickness.

## Implementation Map

- Game state and tuning: `apps/desktop/src/renderer/lib/game.ts`
- Conversation, speech, bubble timing: `apps/desktop/src/renderer/hooks/use-pet-conversation.ts`
- Main pet orchestration: `apps/desktop/src/renderer/pet-app.tsx`
- Pet profile and storage: `apps/desktop/src/renderer/lib/pet-profile.ts` and `apps/desktop/src/renderer/lib/pet-storage.ts`
- Notification routing: `apps/desktop/src/renderer/lib/pet-notifications.ts`
- Radial wheel: `apps/desktop/src/renderer/components/pet-wheel.tsx`
- Panel navigation shell: `apps/desktop/src/renderer/components/pet-panel-shell.tsx`
- Panel surfaces: `apps/desktop/src/renderer/components/pet-panels.tsx`
- Shared panel buttons: `apps/desktop/src/renderer/components/pet-ui.tsx`
- Pet styles: `apps/desktop/src/renderer/styles/pet.css` and `apps/desktop/src/renderer/styles/pet-panels.css`
