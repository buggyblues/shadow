# Shadow Mobile Design System

This file is the mobile contract for `apps/mobile`. It intentionally overrides the
web-oriented glass language in `DESIGN.md` where mobile usability needs stronger
clarity.

## Direction

- Mobile inherits the current Web "Neon Frost" baseline through pure black page backgrounds,
  frosted panels, cyan active state, emerald presence, yellow primary creation action, compact
  rounded shells, and soft motion.
- Mobile must translate that baseline into phone-native hierarchy. Do not copy the desktop three
  rail layout; collapse it into bottom tabs, sheets, focused lists, and gesture-first chat surfaces.
- Mobile is high-contrast and token-driven. Frosted/translucent colors are allowed only as semantic
  tokens in `apps/mobile/src/theme/tokens.ts`.
- No page-local glass, `rgba`, alpha color suffixes, gradient gloss, or ad-hoc shadows.
- Keep the Shadow palette from `DESIGN.md`: cyan primary, yellow accent, obsidian foundation,
  surface panels, emerald success, crimson danger, indigo info.
- All visual numbers come from `apps/mobile/src/theme/tokens.ts`.
- Legacy `Glass*` mobile primitives are compatibility aliases only. They must render as flat
  `surface/card + border` UI, not blur, alpha, shine, or translucent overlays.

## Web Baseline Translation

The accepted Web baseline is the current chat surface shown in the desktop app:

- **Backdrop**: pure black page background; do not use page-level artwork, vignettes, or ambient
  image movement.
- **Shells**: rounded dark translucent rails and panels, thin borders, low-noise depth.
- **Primary action**: yellow "Add Buddy" / creation action, high contrast, reserved for create/buy.
- **Active state**: cyan channel/server pill, cyan hash/icon bubble, no competing accent.
- **Presence**: emerald online dot and subtle pulse; never replace with text-only status.
- **Chat surface**: dark readable message plane, floating contextual actions, composer docked at the
  bottom.

Mobile V2 maps this to:

- `MobileNavigationBar` + `InteractiveSheet` instead of desktop side rails.
- `colors.frostedPanel*`, `colors.activePill*`, `colors.composerBackground`, and
  `colors.heroAction*` tokens instead of page-local transparency.
- Bottom-sheet menus for create, filter, message actions, member actions, channel switchers, and
  server tools.
- Toast and haptics for transient feedback; native alerts only for destructive confirmations or OS
  permission dead-ends.

## Six Critical Problems

1. **Visual fragmentation**: pages mix flat lists, glass naming, neon accents, and local card styles.
   Fix by routing every new surface through semantic tokens and shared primitives.
2. **Interruptive feedback**: `Alert.alert` is used as a toast substitute. Fix by using
   `ToastViewport` and reserving blocking dialogs for decisions.
3. **Modal sprawl**: many screens own custom `Modal` behavior. Fix by moving mobile actions to
   `InteractiveSheet`, `Dialog`, or an explicit full-screen route.
4. **Motion without system**: Reanimated is present, but motion is local and inconsistent. Fix by
   using `motion` tokens, `MotionPressable`, `PresenceView`, and `useReducedMotion`.
5. **Core chat complexity**: channel, composer, bubble, thread, media, task, commerce, and OAuth
   logic are oversized modules. Fix by extracting interaction slices before visual rewrites.
6. **Performance and i18n drift**: long feeds still use mixed `FlatList`/`ScrollView`, and some copy
   bypasses i18n. Fix by migrating feed-like surfaces to FlashList and keeping all visible copy in
   locale files.

## Interaction Libraries

Use third-party libraries behind Shadow-owned wrappers only:

- `react-native-reanimated`: canonical engine for gesture, layout, presence, composer, and backdrop
  motion. Always respect `useReducedMotion`.
- `moti`: allowed for simple mount/unmount and press animations where it reduces boilerplate. Do
  not use it for scroll/gesture physics that should stay in Reanimated worklets.
- `@gorhom/bottom-sheet`: allowed for interactive sheets, action menus, filters, and contextual
  message/member operations.
- `@animatereactnative/marquee`: allowed only through `AmbientMarquee` for short status/ticker
  content; never for body text or navigation labels.
- `lottie-react-native`: asset-tier only. Add when there is a committed animation asset and a
  loading/empty/success state that genuinely needs it.
- `@rive-app/react-native` and `@shopify/react-native-skia`: advanced asset-tier only. Require a
  separate asset/runtime RFC because they add native rendering surface area.
- Do not introduce `react-native-snap-carousel`, `react-native-textinput-effects`,
  `react-native-animatable`, or `@react-spring/native` for the V2 foundation. They overlap with the
  Reanimated/Moti stack or have maintenance/fit risk for RN 0.81+.

## Tokens

Use these token groups only:

- `spacing`: layout gaps, padding, margins, offsets.
- `radius`: all corner radii.
- `fontSize` and `lineHeight`: all typography sizes.
- `letterSpacing`: only `none` unless a component standard adds another value.
- `border`: border widths.
- `iconSize`: icon glyph sizes.
- `size`: fixed UI control, avatar, navbar, tabbar, badge, and dot sizes.
- `palette` and `useColors()`: all colors.
- `motion`: durations, press scale, spring settings, marquee speed, and ambient movement values.

Do not introduce raw values for `fontSize`, `lineHeight`, spacing, radius, border width, motion
constants, or semantic UI colors outside token files. Brand SVGs and generated SVG path data are
the only acceptable literal-color exceptions.

Fixed dimensions must be semantic. If a value is reused or represents a component contract,
add it to `size` instead of writing the number in a page stylesheet. Examples: navbar slots,
icon bubbles, action tiles, input max heights, media placeholders, sheet handles, and preview
thumbnails.

## Typography

- Page title: `fontSize.lg`, weight `800`.
- Section title: `fontSize.md`, weight `800`.
- Row title: `fontSize.md`, weight `700`.
- Body: `fontSize.sm` or `fontSize.md`, with matching `lineHeight`.
- Meta/caption: `fontSize.xs`.
- Badge/count: `fontSize.micro`.
- CJK copy should avoid cramped line height. Prefer `lineHeight.md` for body paragraphs.

## Navigation Bar

Every screen that owns custom navigation must use `MobileNavigationBar`.

Structure:

- Height: safe-area top plus `size.navBar`.
- Background: `colors.surface`.
- Divider: one `border.hairline` bottom border using `colors.border`.
- Title: centered, single line, `AppText variant="title"`.
- Left and right slots: equal fixed width via `size.navSide`, so titles do not drift.
- Back action: use `MobileBackButton`.
- Header actions: use `HeaderButton` or `ToolbarButton`.

Do not hand-roll page headers with `paddingTop: insets.top + ...`, custom spacer widths,
Reanimated header wrappers, or page-specific nav title text styles.

## Tabs

Use `MobileTabBar` for mobile top tabs and swipeable sections.

- Tabs must be equal-width and fill the full screen width.
- The active state is a flat bottom indicator using `colors.primary`; do not use large pills,
  floating cards, shadows, gradients, or glass.
- The tab bar owns the vertical rhythm below it. Keep at least `spacing.md` between the tab
  indicator and the active page content.
- Tab labels use `AppText variant="label"` with tokenized icon sizes.
- Do not show count badges or redundant numbers inside top tabs. Counts belong inside the
  destination view only when they add operational value.
- Do not repeat a section header immediately below a tab when the tab label already names the
  view.

## Lists

Use list primitives instead of page-local row geometry.

- Simple settings/navigation list: `SurfaceList` + `SurfaceListItem` or `ListRow`.
- Row height: minimum `size.navBar` for dense lists, `size.avatarXl` for avatar rows.
- Row padding: horizontal `spacing.lg`, vertical `spacing.md`.
- Separators: `border.hairline`, not gaps between related list rows.
- Icon container: `IconBubble` with tokenized tone.
- Online state: avatar bottom-right green dot only.

Do not wrap every list row in separate large cards. Use one list container with dividers when
items belong to the same group.

## Forms

Mobile forms should be short and task-oriented.

- Use `TextField`, `Button`, `SegmentedControl`, `ChipButton`, and `SwitchRow`.
- Field height: at least `size.controlLg`.
- Field radius: `radius.xl`.
- Field label: `AppText variant="label"`.
- Form gap: `spacing.md`.
- Primary submit: bottom or header action, not multiple competing CTAs.
- Complex desktop-only configuration should be hidden or moved behind an advanced flow.

Do not build custom input shells unless the field has a domain-specific renderer.

## Authentication

Mobile login follows the Web login flow but compresses it into one focused task per screen:

- Third-party login actions first, then email-code login, with password login as a secondary switch.
- iOS shows Sign in with Apple when native capability is available; Android does not show Apple.
- OAuth callbacks must accept both query and fragment token payloads.
- Standalone builds use `shadow://oauth-callback`; Expo development links ending in
  `/oauth-callback` must also complete the same flow.
- Login screens should use `TextField`, `Button`, tokenized provider buttons, and flat sections.

Do not use segmented controls to expose multiple auth forms at once on mobile. Do not create
provider-specific callback parsing in screens; use the shared OAuth callback helper.

## Buttons And States

- Primary action: cyan fill, `colors.onPrimary` text.
- Secondary/neutral: surface fill, border `colors.border`.
- Danger: crimson fill, `colors.onDanger` text.
- Accent/reward: yellow only for create, reward, commerce, or Buddy acquisition emphasis.
- Pressed state: use `MotionPressable` or the component-owned press standard. No page-local scale
  constants.
- Disabled state: reduce interaction through component variant, not arbitrary opacity.

## Motion

- Default presence: `PresenceView` with `motion.presence`.
- Default press: `MotionPressable` with `motion.pressScale`.
- Page backdrop: `BackgroundSurface` renders the pure black app background. Do not add artwork
  backdrop primitives or large background assets to mobile screens.
- Lists: stagger only the first viewport. Long feeds must not animate every recycled row.
- Composer: animate height and action disclosure with Reanimated shared values, not React state
  loops.
- Toasts: `ToastViewport`; do not use native alerts for transient success/error/info.
- Marquee: `AmbientMarquee`; only for short live-status or ticker content.

## Page Layout

- Top-level page background: `colors.background` (`palette.black` in dark mode).
- Page content padding: `spacing.md`.
- Dense subpages: prefer full-width sections and list dividers over nested cards.
- Major panel radius: `radius['2xl']`; row radius: `radius.lg`; controls: `radius.full` or `radius.xl`.
- Bottom safe spacing: `size.tabBar + spacing['4xl']` for tabbed pages.

## Component Contracts

- `MobileNavigationBar`: the only custom page navigation primitive.
- `BackgroundSurface`: the only top-level page background primitive.
- `ToastViewport`: the only transient notification host.
- `InteractiveSheet`: the preferred gesture sheet for mobile actions and menus.
- `MotionPressable` / `PresenceView`: the preferred simple motion primitives.
- `AmbientMarquee`: the only marquee primitive.
- `SurfaceList` / `SurfaceListItem`: grouped rows with dividers.
- `ListRow`: standalone row inside a page section.
- `TextField`: all normal text input shells.
- `Button`, `ToolbarButton`, `MobileBackButton`: all actions.
- `Avatar`: all user/Buddy/server avatars; online state is the bottom-right status dot.

Do not create local `navBar`, `headerBackBtn`, `headerTitleRow`, `glassHeader`, `card wrapper`,
or one-off input-row styles in page files. Add a primitive or a semantic token instead.

## Audit Rules

Before finishing mobile UI work, run the automated gate:

```sh
pnpm -C apps/mobile style:check
pnpm -C apps/mobile lint
pnpm -C apps/mobile typecheck
```

`style:check` is implemented by `scripts/check-mobile-style.mjs`. It scans `apps/mobile/app`
and `apps/mobile/src` for:

- raw typography numbers instead of `fontSize`, `lineHeight`, and `letterSpacing` tokens;
- raw layout numbers instead of `spacing`, `radius`, `border`, `size`, and `iconSize` tokens;
- literal hex colors outside the theme token file and brand SVG assets;
- `rgba`, alpha-suffixed template colors, and page-local opacity;
- custom safe-area navigation math or local `navBar` geometry.

The historical grep equivalent is:

```sh
rg -n "fontSize:\s*[0-9]|lineHeight:\s*[0-9]|letterSpacing:\s*-?[0-9]" apps/mobile/app apps/mobile/src --glob '*.{tsx,ts}'
rg -n "borderRadius:\s*[0-9]|padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?:\s*[0-9]|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?:\s*[0-9]|gap:\s*[0-9]|width:\s*[0-9]|height:\s*[0-9]|minHeight:\s*[0-9]|minWidth:\s*[0-9]|maxHeight:\s*[0-9]|maxWidth:\s*[0-9]" apps/mobile/app apps/mobile/src --glob '*.{tsx,ts}'
rg -n "rgba\(|\$\{[^}]+\}[0-9A-Fa-f]{2}\b|opacity:\s*0\." apps/mobile/app apps/mobile/src --glob '*.{tsx,ts}'
rg -n "paddingTop:\s*insets\.top|Custom header|Custom navigation|styles\.navBar" apps/mobile/app apps/mobile/src --glob '*.{tsx,ts}'
```

The automated gate allows documented exceptions such as `minWidth: 0`, theme tokens, brand SVG
assets, and the shared `MobileNavigationBar` safe-area implementation. Do not add page-local
exceptions; move repeated behavior into a primitive or semantic token instead.
