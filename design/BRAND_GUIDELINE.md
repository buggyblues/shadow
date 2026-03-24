# Shadow Brand & Design Guideline

## 1. Brand Foundation

### 1.1 Brand Vision
**让 AI 成为每个人的日常伙伴**

Shadow connects people with AI companions, making intelligent assistance accessible, personal, and social.

### 1.2 Target Audience
- **Primary**: 18-30 year olds, digital natives
- **Characteristics**: AI-native, value self-expression, seek authentic connections
- **Mindset**: Curious, creative, prefer tools that feel personal over corporate

### 1.3 Brand Personality
| Trait | Expression |
|-------|------------|
| **Friendly** | Approachable, welcoming, never intimidating |
| **Energetic** | Dynamic, alive, responsive |
| **Personal** | Customizable, adapts to individual style |
| **Smart** | Capable, reliable, seamless |

### 1.4 Brand Voice
- Direct and clear, no jargon
- Warm but not overly casual
- Encouraging, never condescending
- Confident without being arrogant

---

## 2. Visual Identity

### 2.1 Logo

**Primary Logo**
- Clean, modern wordmark
- Accompanied by mascot icon (虾/shrimp character)
- Works on dark and light backgrounds

**Usage Rules**
- Maintain clear space: minimum 2x logo height on all sides
- Never distort, rotate, or apply effects
- Use approved color variations only

### 2.2 Color System

#### Primary Palette
| Color | Hex | Usage |
|-------|-----|-------|
| Cyan | `#00C8D6` | Primary actions, links, highlights |
| Deep Navy | `#0F0F1A` | Primary background |
| Off-White | `#F2F3F5` | Primary text |

#### Secondary Palette
| Color | Hex | Usage |
|-------|-----|-------|
| Pink | `#FF6B9D` | Accent, tags, secondary highlights |
| Teal | `#00A3B0` | Hover states, secondary actions |
| Soft Gray | `#B5BAC1` | Secondary text |
| Muted Gray | `#80848E` | Tertiary text, hints |

#### Background Palette
| Color | Hex | Usage |
|-------|-----|-------|
| Background Primary | `#0F0F1A` | Main app background |
| Background Secondary | `#1A1A2E` | Cards, panels |
| Background Tertiary | `#252542` | Inputs, elevated surfaces |

#### Functional Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Success | `#57F287` | Positive states, confirmations |
| Warning | `#FEE75C` | Cautions, notices |
| Error | `#ED4245` | Errors, destructive actions |

#### Color Usage Principles
1. **Dark-first**: Primary experience is dark mode
2. **High contrast**: Text always readable against backgrounds
3. **Accent restraint**: Use pink sparingly for maximum impact
4. **Consistent hierarchy**: Same color = same meaning everywhere

### 2.3 Typography

**Font Family**
- Primary: Inter (Latin scripts)
- Secondary: Noto Sans SC (Chinese)
- Fallback: System fonts

**Type Scale**
| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| H1 | 24px | 700 | Page titles |
| H2 | 20px | 600 | Section headers |
| H3 | 16px | 600 | Card titles |
| Body | 15px | 400 | Main content |
| Small | 13px | 400 | Secondary content |
| Caption | 12px | 500 | Labels, timestamps |

**Typography Principles**
- Line height: 1.5 for body, 1.3 for headings
- Max line length: 75 characters for readability
- Use weight, not size, to create hierarchy within sections

### 2.4 Spacing System

**Base Unit: 4px**

| Token | Value | Usage |
|-------|-------|-------|
| XS | 4px | Tight spacing, icon gaps |
| SM | 8px | Component internal padding |
| MD | 12px | Related elements |
| LG | 16px | Standard spacing |
| XL | 24px | Section padding |
| 2XL | 32px | Large section gaps |
| 3XL | 48px | Page-level spacing |

**Spacing Principles**
- Use multiples of 4px exclusively
- Increase spacing with element size/importance
- Maintain consistent rhythm throughout

### 2.5 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| Small | 8px | Buttons, tags, small elements |
| Medium | 12px | Inputs, small cards |
| Large | 16px | Cards, modals |
| XL | 24px | Large cards, feature sections |
| Full | Pill shape | Avatars, capsule buttons |

### 2.6 Shadows

| Token | Usage |
|-------|-------|
| Small | Subtle elevation, buttons at rest |
| Medium | Cards, dropdowns |
| Large | Modals, popovers, floating elements |

**Shadow Principles**
- Shadows indicate elevation, not borders
- Darker backgrounds need stronger shadows
- Avoid shadows on dark mode backgrounds (use borders instead)

---

## 3. Component Guidelines

### 3.1 Buttons

**Primary Button**
- Background: Cyan (`#00C8D6`)
- Text: Dark (for contrast)
- Radius: 8px
- Padding: 12px 24px
- Shadow: Accent glow
- Hover: Darken 10%, lift slightly

**Secondary Button**
- Background: White/10% opacity
- Border: White/10% opacity
- Text: White
- Radius: 8px
- Hover: Increase opacity to 15%

**Ghost Button**
- Background: Transparent
- Text: Secondary gray
- Hover: Subtle background, text becomes white

**Button States**
- Default: At rest
- Hover: Elevated, brighter
- Active: Slightly compressed
- Disabled: 50% opacity, no interaction
- Loading: Spinner replaces text

### 3.2 Inputs

**Text Input**
- Background: Tertiary background
- Border: 1px subtle white/10%
- Radius: 12px
- Padding: 12px 16px
- Focus: Cyan border glow
- Error: Red border, red hint text

**Input States**
- Default: Subtle border
- Focus: Cyan ring
- Filled: Slightly elevated background
- Error: Red border, error message below
- Disabled: 50% opacity

### 3.3 Cards

**Standard Card**
- Background: Secondary background
- Border: 1px subtle
- Radius: 16px
- Padding: 24px
- Shadow: None (dark mode)

**Interactive Card**
- Same as standard
- Hover: Border becomes cyan-tinted, slight lift
- Active: Compressed feedback

**Card Types**
- Content cards: Text and media
- Profile cards: Avatar + info
- Settings cards: Icon + label + control

### 3.4 Avatars

**Sizes**
- XS: 24px (inline mentions)
- SM: 32px (message lists)
- MD: 40px (standard)
- LG: 48px (profile headers)
- XL: 80px (profile pages)

**Styling**
- Shape: Circle
- Ring: Optional status indicator
- Fallback: Generated pixel art character

### 3.5 Badges & Tags

**Badge**
- Background: Accent color/20%
- Text: Accent color
- Radius: Full (pill)
- Padding: 4px 12px

**Tag**
- Background: Secondary background
- Border: Subtle
- Radius: 8px
- Padding: 6px 12px

### 3.6 Icons

**Icon System**
- Library: Lucide icons
- Size: 16px (small), 20px (default), 24px (large)
- Stroke: 2px
- Color: Inherit from text

**Usage**
- Always paired with text for clarity
- Can standalone in toolbars (with tooltips)
- Maintain consistent sizing within contexts

---

## 4. Layout Principles

### 4.1 Container Widths
| Type | Max Width | Usage |
|------|-----------|-------|
| Full | 100% | Immersive experiences |
| Content | 720px | Reading content |
| Form | 480px | Input-heavy pages |
| Modal | 400px | Dialogs, confirmations |

### 4.2 Grid System
- Base: 12-column grid
- Gutter: 16px (24px on large screens)
- Margin: 16px mobile, 24px tablet, 48px desktop

### 4.3 Responsive Breakpoints
| Name | Width | Target |
|------|-------|--------|
| Mobile | < 640px | Phones |
| Tablet | 640-1024px | Tablets, small laptops |
| Desktop | 1024-1440px | Standard screens |
| Wide | > 1440px | Large monitors |

### 4.4 Navigation Patterns

**Desktop**
- Fixed sidebar (72px) for server list
- Collapsible channel sidebar (240px)
- Main content area (flexible)

**Mobile**
- Bottom tab bar (5 items)
- Full-screen overlays for secondary navigation
- Gesture-based back navigation

---

## 5. Motion & Animation

### 5.1 Duration Guidelines
| Type | Duration | Usage |
|------|----------|-------|
| Instant | 100ms | Color changes, opacity |
| Fast | 200ms | Button feedback, toggles |
| Normal | 300ms | Cards, panels, modals |
| Slow | 500ms | Page transitions |

### 5.2 Easing Functions
- Standard: `cubic-bezier(0.4, 0, 0.2, 1)`
- Enter: `cubic-bezier(0, 0, 0.2, 1)`
- Exit: `cubic-bezier(0.4, 0, 1, 1)`
- Bounce: `cubic-bezier(0.68, -0.55, 0.265, 1.55)`

### 5.3 Common Animations

**Fade In**
- Opacity: 0 → 1
- Duration: 300ms
- Use: Content appearance

**Slide Up**
- Transform: translateY(20px) → translateY(0)
- Opacity: 0 → 1
- Duration: 300ms
- Use: Cards, modals

**Scale In**
- Transform: scale(0.95) → scale(1)
- Opacity: 0 → 1
- Duration: 200ms
- Use: Popovers, tooltips

**Pulse**
- Box-shadow spread animation
- Duration: 2s, infinite
- Use: Notifications, online status

### 5.4 Animation Principles
1. **Purposeful**: Every animation serves a function
2. **Subtle**: Enhance, don't distract
3. **Consistent**: Same action = same animation
4. **Performant**: 60fps, use transform/opacity only

---

## 6. Voice & Tone

### 6.1 Writing Principles
- Be concise: Cut unnecessary words
- Be specific: Avoid vague language
- Be active: Use active voice
- Be helpful: Focus on user benefit

### 6.2 UI Copy Guidelines

**Buttons**
- Use verb-noun: "Save Changes", "Send Message"
- One word when clear: "Save", "Cancel", "Delete"
- Avoid: "Click here", "Submit"

**Labels**
- Be descriptive: "Display Name" not "Name"
- Use sentence case: "Email address" not "Email Address"
- Avoid punctuation

**Messages**
- Error: Explain what happened and how to fix
- Success: Brief confirmation
- Empty: Guide toward action

### 6.3 Examples

| Don't | Do |
|-------|-----|
| "Your request has been processed successfully" | "Changes saved" |
| "An error occurred" | "Couldn't save. Check your connection." |
| "Click here to learn more" | "Learn more" |
| "Are you sure you want to delete this item?" | "Delete this message?" |

---

## 7. Accessibility

### 7.1 Color Contrast
- Text on background: Minimum 4.5:1 (AA)
- Large text: Minimum 3:1
- Interactive elements: Must be distinguishable

### 7.2 Touch Targets
- Minimum size: 44x44px
- Spacing: 8px between interactive elements

### 7.3 Motion
- Respect `prefers-reduced-motion`
- Provide static alternatives for animations
- No flashing content (>3Hz)

### 7.4 Screen Readers
- All images have alt text
- Form inputs have labels
- Interactive elements have aria-labels
- Status updates are announced

---

## 8. File Organization

### 8.1 Design Assets
```
design/
├── BRAND_GUIDELINE.md      # This document
├── assets/
│   ├── logo/
│   │   ├── logo-primary.svg
│   │   ├── logo-white.svg
│   │   └── logo-mark.svg
│   └── illustrations/
├── templates/
│   ├── web/
│   ├── mobile/
│   └── desktop/
└── exports/
    ├── colors.ase
    └── typography.pdf
```

### 8.2 Version Control
- Major versions: Significant brand changes
- Minor versions: Guidelines updates
- Date format: YYYY-MM-DD

---

## 9. Feature Matrix

### 9.1 Core Features (P0)
| Feature | Description |
|---------|-------------|
| AI Chat | Real-time messaging with AI companions |
| Buddy Discovery | Browse and search public AI companions |
| Friend System | Add friends and direct messaging |
| Server/Channel | Group chat spaces with organization |

### 9.2 Important Features (P1)
| Feature | Description |
|---------|-------------|
| Buddy Creation | Custom AI companion configuration |
| Voice Messages | Audio messaging support |
| File Sharing | Image and document transfer |
| Notifications | Push and in-app notifications |

### 9.3 Nice-to-Have (P2)
| Feature | Description |
|---------|-------------|
| Marketplace | Buddy rental and exchange |
| Workspace | File management and collaboration |
| Themes | Custom color schemes |
| Integrations | Third-party service connections |

### 9.4 Platform Coverage
| Platform | Status |
|----------|--------|
| Web | Live |
| Desktop | Live |
| iOS | In Development |
| Android | In Development |

---

## 10. Design Principles

### 10.1 Core Principles

**1. Clarity First**
- Information hierarchy is obvious
- Actions are clearly labeled
- Feedback is immediate

**2. Consistency**
- Same patterns work the same way
- Visual language is unified
- Interactions are predictable

**3. Efficiency**
- Reduce steps to complete tasks
- Support keyboard shortcuts
- Smart defaults

**4. Delight**
- Thoughtful animations
- Surprising micro-interactions
- Personal expression

### 10.2 Design Checklist

Before shipping any feature:
- [ ] Colors meet contrast requirements
- [ ] Touch targets are adequate
- [ ] Loading states are handled
- [ ] Empty states are designed
- [ ] Error states are helpful
- [ ] Keyboard navigation works
- [ ] Screen reader compatible

---

*Version: 1.0*
*Last Updated: 2025-01*
*Owner: Design Team*
