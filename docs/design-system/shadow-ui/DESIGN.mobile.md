# Shadow Mobile Design System

This file is the mobile contract for `apps/mobile`. It intentionally overrides the
web-oriented glass language in `DESIGN.md` where mobile usability needs stronger
clarity.

## Direction

- Mobile is flat, high-contrast, and token-driven.
- No page-local glass, transparency, alpha color suffixes, gradient gloss, or ad-hoc shadows.
- Keep the Shadow palette from `DESIGN.md`: cyan primary, yellow accent, obsidian foundation,
  surface panels, emerald success, crimson danger, indigo info.
- All visual numbers come from `apps/mobile/src/theme/tokens.ts`.
- Legacy `Glass*` mobile primitives are compatibility aliases only. They must render as flat
  `surface/card + border` UI, not blur, alpha, shine, or translucent overlays.

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

Do not introduce raw values for `fontSize`, `lineHeight`, spacing, radius, border width, or
semantic UI colors outside token files. Brand SVGs and generated SVG path data are the only
acceptable literal-color exceptions.

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
- Accent/reward: yellow only for reward or commerce emphasis.
- Pressed state: use `colors.surfaceHover`; no scale or shine unless component standard owns it.
- Disabled state: reduce interaction through component variant, not arbitrary opacity.

## Page Layout

- Top-level page background: `colors.background`.
- Page content padding: `spacing.md`.
- Dense subpages: prefer full-width sections and list dividers over nested cards.
- Major panel radius: `radius['2xl']`; row radius: `radius.lg`; controls: `radius.full` or `radius.xl`.
- Bottom safe spacing: `size.tabBar + spacing['4xl']` for tabbed pages.

## Component Contracts

- `MobileNavigationBar`: the only custom page navigation primitive.
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
