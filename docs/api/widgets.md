# Widgets

Shadow widgets are small responsive views backed by a generic data source. The
runtime is not coupled to Space Apps: clients only consume a catalog entry with
a `sourceId`, a declarative definition, options, and data. The current server
adapter lets an installed Space App publish catalog entries from its manifest.

## Capability boundary

| Capability | Supported | Contract |
| --- | --- | --- |
| Host-rendered DOM | Yes | The host maps a declarative view AST to trusted components. Apps do not supply elements or markup. |
| Arbitrary HTML, CSS, or JavaScript | No | Use the Space App iframe or a native WebView for an unrestricted application UI. |
| Responsive layout | Yes | Definitions provide cell constraints; host components adapt to their container and mobile width. |
| Custom options | Yes | Apps may declare validated `select` options and defaults. |
| Backend data | Yes | A registered read-only Space App command returns the widget data object. |
| Widget actions | No | The current AST is display-only and has no links, event handlers, or command buttons. |
| Direct move or resize | No | Every widget uses the host's shared **Change layout** mode. |

This boundary keeps the integration small: an App declares data, options, and a
view; the host owns rendering, styling, accessibility, layout editing, caching,
and platform-specific behavior.

## Security model

Widget definitions do not execute third-party HTML, CSS, JavaScript, modules,
event handlers, or URLs. The host renders a small view AST (`stack`, `row`,
`grid`, `text`, `metric`, `badge`, `divider`, and `spacer`) with text-only value
binding. Web uses a closed Shadow DOM custom element for style encapsulation;
mobile interprets the same AST with native views.

Shadow DOM is an encapsulation boundary, not a JavaScript security boundary.
Apps that need arbitrary DOM/CSS/JS must continue to use an isolated iframe or
native web-view process rather than this widget runtime.

The widget data command must be a registered read command. Shadow applies the
normal actor, installation, permission, input, SSRF, and command-token checks
before forwarding it. Returned widget data must be a JSON object no larger than
256 KiB.

## Registration flow

1. Define a stable widget `key` in the Space App manifest `widgets` array.
2. Define a command in the same manifest with `action: "read"` and an input
   schema matching the widget options.
3. Implement that command at the App's normal `/.shadow/commands/*` ingress.
4. Shadow publishes the installed definition in the server widget catalog.
5. The host stores only the opaque `sourceId`, selected options, and layout for
   each widget instance.
6. The host fetches data through the generic widget data endpoint. It does not
   call the App directly from the browser.

The App icon comes from provider metadata. A widget does not define or render
its own icon.

## Catalog

### `GET /api/servers/:serverIdOrSlug/widgets`

Returns the localized widgets available to the current member:

```json
[
  {
    "sourceId": "travel:currency",
    "provider": { "id": "travel", "name": "Travel", "iconUrl": "https://example/icon.svg" },
    "definition": {
      "key": "currency",
      "title": "Currency rate",
      "category": "finance",
      "surfaces": ["desktop", "mobile"],
      "size": { "default": { "widthCells": 6, "heightCells": 4 } },
      "options": [
        {
          "key": "base",
          "type": "select",
          "label": "Base currency",
          "defaultValue": "USD",
          "choices": [{ "value": "USD", "label": "USD" }]
        }
      ],
      "data": { "command": "travel.currencyWidget", "refreshIntervalSeconds": 300 },
      "view": { "type": "text", "value": { "path": "summary" } }
    }
  }
]
```

`sourceId` is opaque to clients. Do not split it in UI code.

`category` is optional and lets hosts group widgets by function. Supported
values are `productivity`, `communication`, `media`, `finance`, `information`,
`lifestyle`, `developer`, `web`, and `other`. Hosts fall back to `other` when
the field is omitted. The provider metadata is used for grouping by App and
showing the App icon.

## Data

### `POST /api/servers/:serverIdOrSlug/widgets/:sourceId/data`

Request:

```json
{ "options": { "base": "USD", "quote": "CNY" } }
```

Only declared option keys and choice values are accepted. Omitted options use
their declared defaults.

Response:

```json
{
  "sourceId": "travel:currency",
  "data": { "pair": "USD / CNY", "rate": 7.2, "summary": "1 USD = 7.2 CNY" },
  "updatedAt": "2026-07-13T08:00:00.000Z"
}
```

The host may refresh this endpoint using `data.refreshIntervalSeconds`, which
must be between 15 and 3600 seconds. Treat the response as a snapshot: the
current widget protocol does not open a Space App-owned WebSocket or execute App
client code.

## Manifest registration

An adapter may register a definition using the `widgets` array. For Space Apps,
`widgets[].data.command` must name a command in the same manifest and that
command must use `action: "read"`. Widget keys and option keys are unique within
their scopes. Select defaults must be one of their declared choices.

The current option model intentionally supports only `select`. The host rejects
undeclared keys and values before it calls the Space App command. The resulting
options object becomes the command input, so its JSON Schema should require the
same keys and constrain the same values or patterns.

Localized widget metadata is stored in `widgets[].i18n`. Reserved keys are
`$title`, `$description`, `$option.<key>`, and
`$choice.<optionKey>.<choiceValue>`; other entries localize `strings` used by
`stringKey` view values.

## View AST

The view is recursive and contains only these nodes:

| Node | Purpose |
| --- | --- |
| `stack` | Vertical children with a host-defined gap and alignment. |
| `row` | Horizontal children that wrap when space is constrained. |
| `grid` | Auto-fit columns with a minimum column width. |
| `text` | A text value with a host variant and tone. |
| `metric` | A label, primary value, and optional detail. |
| `badge` | Compact status text with a host tone. |
| `divider` | A host-styled separator. |
| `spacer` | Flexible layout space. |

Values use exactly one source:

- `{ "literal": "Open" }` for fixed, non-localized text.
- `{ "stringKey": "openLabel" }` for a manifest string localized by the host.
- `{ "path": "summary.openCount" }` for a text value read from the returned
  data object.

Value resolution converts primitives to text and returns an empty string for a
missing path. It never interprets HTML. Variants, tones, gaps, and alignment are
closed enums; Apps cannot inject style declarations or class names.

## Layout and responsiveness

Desktop stores a widget instance as `kind: "remote-widget"` with its opaque
`sourceId`, selected `options`, position, and cell size. Definitions may declare
default, minimum, and maximum cell sizes. The web renderer uses container
queries and auto-fit grids; mobile always uses the available card width and
wraps rows. Options are persisted with the desktop layout on web and locally per
server and source on mobile.

All built-in and App-provided widgets share one layout interaction. In normal
mode, widget content receives pointer input and no drag or resize behavior is
installed. The widget menu's **Change layout** action enters the host controller,
which owns move, resize, rotation, layer ordering, confirm, cancel, grid snapping,
and persistence. Do not implement these interactions inside an individual
widget. See [Server Desktop Layout](./server-desktop-layout.md).

## Integration checklist

- Keep the widget useful at its declared minimum and maximum sizes.
- Use `stringKey` and `i18n` for user-facing copy.
- Match option keys and defaults to the read command input schema.
- Return a plain JSON object within 256 KiB; do not return markup or executable
  URLs.
- Test catalog registration, localization, default and changed options, command
  authorization, data errors, and each declared surface.
- Use the full Space App UI when the feature needs arbitrary DOM/CSS/JS, navigation,
  file uploads, or rich interaction.

The Travel integration contains a complete exchange-rate example in
`integrations/travel/server/src/lib/manifest.ts` and its command handler in
`integrations/travel/server/src/handlers/commands.handler.ts`.
