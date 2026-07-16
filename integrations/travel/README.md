# Travel Space App

Travel is a Space App for collaborative trip planning and trip operations. It owns travel-specific domain state and reuses platform capabilities for chat, file storage, Buddy task delivery, command approval, and Space App installation.

## Run Locally

Start the API server and Vite client in separate terminals:

```bash
pnpm --filter @shadowob/travel-space-app dev
pnpm --filter @shadowob/travel-space-app client:dev
```

The default API URL is `http://localhost:4224`; the client is served from
`http://localhost:5179`.

Before submitting a change, run the package-level checks:

```bash
pnpm --filter @shadowob/travel-space-app typecheck
pnpm --filter @shadowob/travel-space-app test
pnpm --filter @shadowob/travel-space-app build
```

## Exchange-rate Widget

Travel registers a host-rendered `currency` widget for desktop and mobile. It
supports base and quote currency selectors, fetches the latest available rate
through the read-only `travel.currencyWidget` command, and refreshes its snapshot
every five minutes. The host owns rendering, responsive layout, option UI, and
the shared **Change layout** interaction; Travel returns data only.

- Manifest definition: `server/src/lib/manifest.ts`
- Command handler: `server/src/handlers/commands.handler.ts`
- Integration coverage: `test/community-integration.test.ts`

See [Widgets API](../../docs/api/widgets.md) before adding another widget.

## Structure

The backend follows the same dependency direction as `apps/server`: handlers call use cases,
use cases coordinate services, and services persist through domain DAOs. Platform and provider
access stays behind gateways.

- HTTP routes: `server/src/handlers`
- Space App manifest and commands: `server/src/lib/manifest.ts` and
  `server/src/handlers/commands.handler.ts`
- Persistence: `server/src/db` and `server/src/dao`
- Client routes: `client/routes/router.tsx`
- Integration and unit coverage: `test`

Treat the implementation, manifest, schemas, and tests as the source of truth. Avoid adding
point-in-time route inventories, product mockups, or completion reports here because they drift
as the app evolves.
