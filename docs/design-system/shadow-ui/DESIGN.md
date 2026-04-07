# Design System: Neon Frost (Cyan & Yellow Edition)

## 1. Visual Theme & Atmosphere

"Neon Frost" is a high-energy aesthetic defined by the intersection of **Pure Cyan** and **Electric Yellow** accents against deeply layered glass. It fuses the technical density of developer tools with the sensory vibrance of modern gaming interfaces.

**Key Characteristics:**
- **Dynamic Orbs**: Backgrounds feature moving, blurred radial glows that interact with glass surfaces.
- **Glassmorphism**: Components use `backdrop-filter: blur(24px)` and `inset` rim-lighting to feel like physical objects.
- **Pillowy Geometry**: Aggressive rounding (`rounded-full` for pills, `rounded-[40px]` for cards).
- **Physics-Based UI**: Bouncy transforms using `cubic-bezier(0.34, 1.56, 0.64, 1)`.

## 2. Color Palette (Logo-Matched)

### Core (Digital Midnight)
- **Primary Cyan** (`#00F3FF`): Main interactive color and primary CTAs.
- **Vivid Yellow** (`#F8E71C`): Left-eye color. Used for rewards, warnings, and accents.
- **Foundation** (`#050508`): Deep obsidian base.
- **Surface** (`#12121A`): Default card and panel background.

### Semantic Variants
- **Success Emerald** (`#00E676`): Success and online states.
- **Danger Crimson** (`#FF2A55`): Destructive actions.
- **Info Indigo** (`#7C4DFF`): Neutral info and badges.

## 3. Typography & CJK

### Stacks
- **UI/Latin**: `Nunito` (Friendly rounded terminals).
- **Technical/Mono**: `Inter`.
- **CJK**: `Noto Sans SC`.

### CJK Specifics
- **Body**: `line-height: 1.7` and `letter-spacing: 0.05em`.
- **Weight**: Pair `font-black` Latin with `font-bold` CJK for optical balance.

## 4. Component Catalog

### Buttons (Jelly Pills)
- **Primary**: `rounded-full` + Cyan Gradient + `inset` white shadow + colored glow.
- **Secondary**: Same metrics but using the Yellow Gradient.

### Message Stream (Channel Style)
- **Structure**: Discord-inspired high-density vertical flow.
- **Quote Blocks**: Glass surface with a thick accent-color left border.

### Identity & Forms
- **Avatars**: Always use a **Perfect Circle** frame.
- **Inputs**: `rounded-2xl` with internal inset shadows ("Valleys").
- **Cards**: Aggressive `rounded-3xl` with top-edge glass reflections.
