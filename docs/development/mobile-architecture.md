# Mobile Architecture

Technical architecture for the Shadow mobile app (`apps/mobile`), built with Expo (React Native).

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Expo SDK 55 + React Native 0.81 | Managed workflow |
| Navigation | Expo Router 6 | File-based routing with deep linking |
| Server state | TanStack Query | Cache, retry, invalidation |
| Client state | Zustand | UI state, auth session, temp interactions |
| Realtime | socket.io-client | Shared protocol with web client |
| i18n | i18next + react-i18next | Shared locale structure with web |
| Theme | Semantic design tokens | Dark/light, 8pt spacing grid |
| Lists | @shopify/flash-list | High-performance virtualized lists |
| Images | expo-image | Optimized loading and caching |
| Build | EAS Build + EAS Submit | Cloud builds, OTA via EAS Update |

## Project Structure

```
apps/mobile/
  app/                         # Expo Router file-based routes
    (auth)/                    # Login, register (unauthenticated)
    (main)/                    # Authenticated screens
      (tabs)/                  # Bottom tab navigator
        index.tsx              # Server list
        discover.tsx           # Discover public servers
        buddies.tsx            # Buddy marketplace
        settings.tsx           # User settings
      servers/[serverSlug]/    # Server screens
        index.tsx              # Server home (channels, members)
        channels/[channelId].tsx
        shop.tsx
        workspace.tsx
        server-settings.tsx
      profile/[userId].tsx
      buddy-detail/[listingId].tsx
      settings/                # Nested settings screens
    _layout.tsx                # Root layout
    index.tsx                  # Entry redirect

  src/
    components/                # UI components
      common/                  # Reusable (Avatar, EmptyState, etc.)
      chat/                    # Message bubble, attachments
      channel/                 # Channel sidebar
      server/                  # Server sidebar
      member/                  # Member list
    stores/                    # Zustand stores
    hooks/                     # Shared hooks (useSocket, useUnreadCount)
    lib/                       # API client, socket, query client, utils
    theme/                     # Token definitions, theme provider
    i18n/                      # i18next config + locale JSON files
    types/                     # TypeScript type definitions

  assets/                      # Icons, splash, images
  app.config.ts                # Expo configuration
  eas.json                     # EAS Build profiles
```

## Layered Architecture

### Presentation (UI)

Screens handle layout and user interaction only. Components are split into:
- **common** — Pure display, reusable across features
- **business** — Feature-specific composed components

### Application (Hooks & Stores)

- TanStack Query for all server data (query keys: `['domain', 'resource', ...params]`)
- Zustand for UI-only state (modals, selections, session token mirror)
- Mutations invalidate queries on success — no manual cache sync

### Infrastructure

- API client (`src/lib/api.ts`) — fetch wrapper aligned with web client
- Socket manager (`src/lib/socket.ts`) — connection lifecycle, reconnect with backoff
- Secure storage (`expo-secure-store`) — auth tokens
- Push notifications (`expo-notifications`) — payload carries route URL for deep link

## Routing & Deep Links

Expo Router provides native deep link support via file-based routes.

| URL Pattern | Screen |
|-------------|--------|
| `/servers/:serverSlug` | Server home |
| `/servers/:serverSlug/channels/:channelId` | Chat channel |
| `/servers/:serverSlug/shop` | Server shop |
| `/profile/:userId` | User profile |
| `/invite/:code` | Join via invite |

Configuration:
- URL scheme: `shadow://`
- iOS: `associatedDomains` for universal links
- Android: `intentFilters` with `autoVerify`

## Build & Release

### EAS Build Profiles

| Profile | Use Case |
|---------|----------|
| `development` | Local dev with dev client |
| `preview` | Internal testing (ad-hoc) |
| `production` | App Store / Play Store |

### OTA Updates (EAS Update)

JS/asset changes can ship over-the-air without app store review.

**Requires new build:**
- New native dependencies
- Permission or certificate changes
- Expo SDK upgrade
- Any native runtime change

### Deployment

Use `scripts/deploy-testflight.sh` for guided iOS TestFlight deployment.

## i18n

Supported locales: `en`, `zh-CN`, `zh-TW`, `ja`, `ko`

Locale files in `src/i18n/locales/` mirror the web client's key structure for consistency.

## Design Tokens

Theme uses semantic tokens (not raw color values):

- Colors: `colors.background`, `colors.text`, `colors.primary`, etc.
- Spacing: 8pt grid system
- Animation durations: 120ms / 200ms / 280ms tiers
- Platform-native navigation transitions preferred over custom animations
