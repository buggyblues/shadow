# Rule Card and Script Engine Model

Flash supports two script-bearing surfaces: arena scripts and `rule` cards. Both are executed by the server through `FlashScriptEngine` and can produce normalized, capability-filtered updates.

## Rule card metadata

A rule card should use kind `rule`. Its metadata is expected to carry:

```ts
type RuleCardMeta = {
  rule?: {
    trigger?: 'onArenaActivate' | string
    priority?: number
    script?: string
    config?: Record<string, unknown>
  }
}
```

Current server execution supports `onArenaActivate`. Future triggers should be added explicitly and should define their state input, capabilities, and merge behavior.

## Script state

Scripts receive read-only state values:

```ts
state.trigger
state.arena
state.cards
state.activeCardIds
state.rule
state.command
arena
cards
activeCardIds
rule
command
api
```

Scripts return a plain object. They do not mutate the database directly.

## Script result

The result shape is:

```ts
return {
  cards: [
    { id, x, y, angle, flipped, hidden, locked, meta, tags },
  ],
  arena: {
    cardIds,
    x,
    y,
    radius,
    color,
    label,
    script,
  },
  log: ['optional diagnostic line'],
}
```

The runtime clamps coordinates, limits output length, filters unknown card ids, and removes fields not allowed by the current capability set.

## Built-in deterministic API

`api.circle(ids, cx, cy, radius, startAngle)` returns a circular layout.

`api.grid(ids, cx, cy, columns, dx, dy)` returns a grid layout.

`api.stack(ids, x, y, dx, dy, angleStep)` returns a stacked layout.

`api.shuffle(ids, seed)` returns a deterministic shuffled id array.

`api.random()` returns deterministic pseudo-random values from the invocation seed.

`api.now()` returns the invocation timestamp supplied by the server.

`Math.random` and `Date.now` are replaced inside the VM with deterministic versions.

## Capabilities

Capabilities decide which output fields survive normalization:

- `cardLayout`
- `cardMeta`
- `cardVisibility`
- `arenaLayout`
- `arenaMembership`
- `arenaScript`
- `logs`

Arena scripts currently receive broader capabilities than rule cards. Rule cards can arrange and modify visibility for active cards but cannot rewrite arena scripts or arbitrary card metadata by default.

## Scope restriction

`allowedCardIds` constrains which cards a script can update. Arena activation passes the active card set. A script cannot update cards outside this set even if it returns their ids.

## Example: circular arena layout

```js
return api.circle(activeCardIds, arena.x, arena.y, arena.radius * 0.72)
```

## Example: priority rule card stack

```js
const ids = api.shuffle(activeCardIds, rule.config?.seed ?? rule.id)
return api.stack(ids, arena.x, arena.y, 22, 10, 0.02)
```

## Security model

The Worker/VM runtime is a bounded execution sandbox, not a final hard security boundary for hostile arbitrary code. Production deployment should keep timeout, script size, output limits, capability filters, audit logging, and eventually a worker pool or stronger isolation runtime. Do not expose raw database APIs or network APIs to scripts.

## Merge model

Arena script result is merged first. Rule cards then merge in priority order. Later results can override earlier card fields for the same card. The service deduplicates card updates by id before applying them.
