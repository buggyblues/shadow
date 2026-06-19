# Shadow Mobile Design System

This document is the product and implementation contract for `apps/mobile`. The
mobile home screen is the source of truth: every new screen should feel like it
belongs beside the unified home rail, workspace header, command search, and
bottom-sheet interactions.

## Home Baseline

Mobile uses the unified home screen as its visual baseline:

- Backgrounds are pure black or tokenized dark surfaces. Do not add page-local
  artwork, gradients, gloss, or decorative ambient shapes.
- Primary active state is cyan: selected server, channel, search focus, current
  tab, and confirmed selection.
- Creation and acquisition emphasis is yellow: create server, create Buddy,
  commerce, reward, and acquisition actions only.
- Presence is emerald and visual. Prefer avatar status dots, short live badges,
  and subtle pulse motion over text-only status.
- Surfaces use frosted panel tokens with thin borders. Do not write local `rgba`,
  alpha hex, shadows, or glass-style colors in pages.
- Layout is phone-native: bottom tabs, focused lists, sheets, compact cards,
  command search, and docked composers. Do not reproduce desktop rails.

## Token Contract

All visible dimensions and colors come from `apps/mobile/src/theme/tokens.ts`.
Use these groups only:

- `spacing`: padding, margins, gaps, offsets.
- `radius`: all corner radii.
- `fontSize`, `lineHeight`, `letterSpacing`: all type sizing.
- `border`: border widths.
- `iconSize`: icon glyph sizes.
- `size`: reusable component dimensions.
- `palette` and `useColors()`: semantic colors.
- `motion`: durations, press scale, springs, and presence motion.

Raw numeric style values are allowed only for ratios, flex values, z-index,
platform constants, and documented local algorithms. Component contracts belong
in `size`, not in page files.

## Typography

- Page title: `AppText variant="title"` or `fontSize.lg`, weight `800`.
- Section title: `AppText variant="bodyStrong"` or `fontSize.md`, weight `800`.
- Row title: `AppText variant="bodyStrong"`.
- Body: `AppText variant="body"`.
- Caption/meta: `AppText variant="label"`.
- Counters and compact badges: `fontSize.micro`.
- Letter spacing remains `letterSpacing.none`.

## Navigation

Every mobile route must use `MobileNavigationBar` when it owns a header.

- Expo/React Navigation native headers are disabled for product screens because
  iOS and Android render different back buttons, title metrics, and action
  spacing across OS versions.
- `MobileNavigationBar` owns safe-area top padding, height, background, divider,
  title centering, and fixed left/right slots.
- Back actions use `MobileBackButton`.
- Header actions use `ToolbarButton`, `IconButton`, or `ActionButton`.
- Do not create local `navBar`, `headerBackBtn`, `glassHeader`, or
  `paddingTop: insets.top + ...` page headers.

Immersive media, camera, webview, and chat overlays may hide the navigation bar
only when the full-screen interaction provides its own close affordance.

## Forms

Use the shared form primitives for every normal input surface:

- `Form`: vertical form stack with tokenized gaps.
- `FormField`: label, hint, and error wrapper for custom controls.
- `TextField`: normal text, password, URL, number, and multiline inputs.
- `SearchField`: search inputs with search icon, clear affordance, and return key.
- `AutocompleteField`: text input plus tokenized suggestion list.
- `SwitchRow`, `SegmentedControl`, and `ChipButton`: boolean and option controls.
- `Button` or `ActionButton`: submit and secondary actions.

Field rules:

- Minimum field height is `size.controlLg`.
- Radius is `radius.xl`.
- Focus border is cyan.
- Error border and error text are crimson.
- Labels and helper text use `AppText`, never raw `Text`.
- Multiline fields keep the same shell and only change height/input alignment.
- Placeholder, label, hint, error, and button copy must come from i18n keys.

Do not build page-local input rows unless the field has domain-specific rendering
such as chat composer, code editor, media picker, or payment entry. Even then,
reuse `InputValley`, `TextField`, or `FormField` where possible.

## Search And Autocomplete

Search is a first-class mobile pattern.

- Use `SearchField` for list filtering, member search, invite search, commerce
  search, and command-like focused search.
- Search clear buttons use `X` icon only and keep the field width stable.
- Search result rows use `SurfaceList`, `SurfaceListItem`, or `MenuItem`.
- Use `AutocompleteField` for suggestion-driven fields such as usernames,
  members, tags, or server/channel candidates.
- Suggestions animate in with presence motion and are dismissed when the field
  clears, blurs, or a suggestion is selected.

## Menus, Sheets, And Modals

Prefer gesture-first mobile surfaces:

- `InteractiveSheet`: low-level bottom-sheet primitive.
- `ActionSheet`: action menus, filters, contextual member/message actions,
  create menus, and sort menus.
- `MenuList` + `MenuItem`: grouped menu rows inside sheets, cards, or settings.
- `MobileModal`: centered decisions or compact custom modal content.
- `Dialog`: destructive confirmation or blocking decision.

Use native alerts only for OS permission dead-ends or true blocking decisions.
Transient success/error/info feedback must go through `ToastViewport` /
`showToast`.

Sheet rules:

- Sheet handle uses `size.sheetHandleWidth` and `size.sheetHandleHeight`.
- Sheet background uses `colors.frostedPanelStrong`.
- Row press feedback uses shared motion scale and `colors.activePill`.
- Destructive items use `tone="danger"`.
- Footer actions use `ActionButton`.

## Buttons And Actions

- `Button`: standard command button.
- `IconButton` / `ToolbarButton`: icon-only actions.
- `ActionButton`: page and sheet actions with consistent home-style tone.
- `FloatingActionButton`: floating create or high-emphasis action.
- `ActionTile`: grid actions.

Tone mapping:

- `primary`: cyan fill, `colors.onPrimary` text.
- `accent`: yellow fill for create/acquire/reward/commerce.
- `danger`: crimson fill.
- `glass` or `secondary`: quiet surface action.

All pressable controls use shared scale/haptic behavior where appropriate. Do
not define page-local press opacity or scale constants.

## Cards And Lists

- `Card`: static surface.
- `CardPressable`: interactive card.
- `SurfaceList` / `SurfaceListItem`: grouped rows with dividers.
- `ListRow`: standalone settings or navigation row.
- `Section`: titled content block.

Use one list container with dividers for related rows. Avoid wrapping every row
in its own large card unless the item is an independent object with rich content.
Cards use `radius.xl` or smaller inside dense screens; avoid nested cards.

## Motion

Motion should make the app feel responsive, not ornamental.

- Press feedback uses `MotionPressable`/component-owned scale.
- Entering content uses `PresenceView`.
- Sheets use `InteractiveSheet` physics.
- Lists stagger only the first viewport.
- Composer height and panels animate with Reanimated shared values.
- Respect reduced-motion settings.

## Page Layout

- Top-level background uses `BackgroundSurface`.
- Standard pages use `PageScroll`.
- Dense subpages use `SurfaceList` and dividers instead of nested cards.
- Tabbed pages leave bottom safe spacing for `size.tabBar + spacing['4xl']`.
- Fixed UI elements must declare stable dimensions via tokens.

## Component Inventory

Required shared components for mobile UI work:

- Navigation: `MobileNavigationBar`, `MobileBackButton`, `ToolbarButton`.
- Layout: `BackgroundSurface`, `PageScroll`, `Section`, `SurfaceList`.
- Forms: `Form`, `FormField`, `TextField`, `SearchField`,
  `AutocompleteField`, `InputValley`.
- Actions: `Button`, `ActionButton`, `IconButton`, `FloatingActionButton`,
  `ActionTile`, `ChipButton`, `SegmentedControl`, `SwitchRow`.
- Menus and overlays: `InteractiveSheet`, `ActionSheet`, `MenuList`,
  `MenuItem`, `MobileModal`, `Dialog`.
- Feedback and motion: `ToastViewport`, `StatusNotice`, `PresenceView`,
  `MotionPressable`, `AmbientMarquee`.
- Identity: `Avatar`, `IconBubble`, presence indicators.

## Audit Rules

Before finishing mobile UI work, run:

```sh
pnpm -C apps/mobile style:check
pnpm -C apps/mobile lint
pnpm -C apps/mobile typecheck
```

The style gate scans `apps/mobile/app` and `apps/mobile/src` for raw typography,
raw layout numbers, literal colors outside tokens/assets, local alpha colors,
and custom navigation geometry. Fix violations by moving behavior into shared
components or semantic tokens.
