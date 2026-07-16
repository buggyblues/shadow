# Host-rendered Widgets

Use this reference when adding or reviewing a small desktop or mobile view
provided by a Space App. Widgets are a generic host capability; the current
Space App adapter is only one source of catalog definitions.

## Choose the Correct Surface

Use a widget for compact, read-only, glanceable data with a small set of declared
options. Use the full Space App UI when the feature needs arbitrary DOM, CSS,
JavaScript, navigation, uploads, or rich interaction.

The widget view AST accepts no Space App markup, style declarations, class names,
modules, URL-bearing nodes, event handlers, or action callbacks. Web renders
trusted components inside a closed Shadow DOM; mobile renders native components.
Shadow DOM provides style encapsulation, not a JavaScript security boundary.

## Implementation Workflow

1. Define a stable widget `key` in manifest `widgets`.
2. Declare `category`, `surfaces`, default/min/max cell sizes, options, data, and
   the view tree.
3. Define `data.command` in the same manifest with `action: "read"`, a narrow
   permission, a suitable `dataClass`, and JSON Schema matching the options.
4. Implement the command at the Space App's `/.shadow/commands/*` ingress. Return a
   plain JSON object no larger than 256 KiB.
5. Add translations for the title, description, option labels, choices, and
   view strings.
6. Test catalog registration, default and changed options, command authorization,
   data failures, localization, and every declared surface.

The browser does not call the Space App command directly. It calls Shadow's generic
widget data endpoint; Shadow validates the actor, installation, permissions,
input, target, and command token before forwarding the options as command input.

- Catalog: `GET /api/servers/:serverIdOrSlug/widgets`
- Data: `POST /api/servers/:serverIdOrSlug/widgets/:sourceId/data`

## Manifest Contract

```json
{
  "commands": [
    {
      "name": "travel.currencyWidget",
      "ingress": {
        "path": "/.shadow/commands/travel.currencyWidget",
        "auth": "shadow-command-jwt"
      },
      "permission": "travel.trips:read",
      "action": "read",
      "dataClass": "server-private",
      "inputSchema": {
        "type": "object",
        "properties": {
          "base": { "type": "string", "enum": ["USD", "EUR"] }
        },
        "required": ["base"],
        "additionalProperties": false
      }
    }
  ],
  "widgets": [
    {
      "key": "currency",
      "title": "Currency rate",
      "category": "finance",
      "surfaces": ["desktop", "mobile"],
      "strings": { "rate": "Latest rate" },
      "i18n": {
        "zh-CN": {
          "$title": "实时汇率",
          "$option.base": "基础货币",
          "rate": "最新汇率"
        }
      },
      "size": {
        "default": { "widthCells": 6, "heightCells": 4 },
        "min": { "widthCells": 4, "heightCells": 3 },
        "max": { "widthCells": 10, "heightCells": 8 }
      },
      "options": [
        {
          "key": "base",
          "type": "select",
          "label": "Base currency",
          "defaultValue": "USD",
          "choices": [
            { "value": "USD", "label": "USD" },
            { "value": "EUR", "label": "EUR" }
          ]
        }
      ],
      "data": {
        "command": "travel.currencyWidget",
        "refreshIntervalSeconds": 300
      },
      "view": {
        "type": "metric",
        "label": { "stringKey": "rate" },
        "value": { "path": "rateText" },
        "detail": { "path": "summary" }
      }
    }
  ]
}
```

Rules:

- Widget keys and option keys are unique in their scopes.
- The current option type is only `select`. Defaults must be declared choices;
  the host rejects unknown keys and values.
- Refresh intervals are optional and range from 15 through 3600 seconds.
- Categories are `productivity`, `communication`, `media`, `finance`,
  `information`, `lifestyle`, `developer`, `web`, or `other`.
- Provider name and icon come from the installed Space App. Do not add a separate
  widget icon.
- The host treats the catalog `sourceId` as opaque. Space App code must not parse or
  synthesize it.

## View Contract

Use only `stack`, `row`, `grid`, `text`, `metric`, `badge`, `divider`, and
`spacer`. Bind text with:

- `literal` for fixed text.
- `stringKey` for localized manifest strings.
- `path` for a nested value in the returned data object.

Missing paths render as empty text. Values never render as HTML. Use host enums
for variants, tones, gaps, and alignment; do not attempt to inject styles.

Localized metadata lives in `widgets[].i18n`. Reserved keys are `$title`,
`$description`, `$option.<key>`, and `$choice.<optionKey>.<choiceValue>`.
Other keys localize values referenced by `stringKey`.

## Layout and Responsiveness

Declare size constraints, then make the view useful throughout that range.
Desktop uses grid cells and container-based rendering. Mobile uses the available
card width and wraps rows.

Every built-in and Space App widget follows the same host interaction:

- Normal mode has no direct move, resize, or rotation gestures.
- The widget menu's **Change layout** action enters the shared controller.
- The host owns move, resize, rotation, layers, grid snapping, confirm, cancel,
  and persistence.

Never add widget-specific drag handles or persist layout from a Space App component.

## Review Checklist

- Confirm the data command is present in the same manifest and is read-only.
- Confirm the option declaration and command input schema agree.
- Confirm all visible copy is localized.
- Confirm the view stays readable at minimum, default, maximum, and mobile
  widths.
- Confirm data is a plain JSON object within 256 KiB and contains no markup that
  the UI expects to execute.
- Confirm errors and unavailable data fail safely without stale controls.
- Confirm the widget relies on the shared host layout interaction.
