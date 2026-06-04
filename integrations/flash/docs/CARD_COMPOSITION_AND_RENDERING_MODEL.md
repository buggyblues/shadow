# Flash Card Composition and Rendering Model

This document defines how Buddy and other Server App callers should turn prose, briefs, tables, test prompts, and generated content into typed Flash cards. It addresses the failure mode where every generated card becomes one large text block and loses the visual and semantic differences between card kinds.

## Problem

Flash cards are not generic notes. The `kind` field selects a renderer, and most renderers expect kind-specific metadata. For example, a Todo card expects checklist items, a Process card expects ordered steps, a Definition card expects a term and definition, an Argument card expects a claim and evidence, and a Rule card expects a rule description or executable rule metadata.

When Buddy calls `cards.create` repeatedly with only `title` and long `content`, the board technically has multiple cards, but the cards are semantically flat. The visual result is a set of text-heavy blocks. This also prevents later systems from using typed card behavior, such as rule-card execution, arena scripts, checklists, timelines, and renderer-specific layout.

The new model adds a server-side semantic composition layer. Buddy should call `cards.compose` for any multi-card creation request. The server then splits the material by intent, infers or respects card types, builds kind-specific metadata, places the cards, records a durable event, and returns a composition plan.

## Canonical command routing

Use `cards.compose` when the user asks Buddy to create, split, summarize, brainstorm, test, compare, plan, arrange, or generate more than one card. This includes prompts such as “做一组卡片”, “生成卡片测试”, “把这段内容拆成不同类型卡片”, “做一个项目计划板”, “做一个论证地图”, and “展示不同卡片类型”.

Use `cards.create` only when the caller already knows it needs exactly one card. Even then, the server normalizes the card into kind-specific metadata before persistence. `cards.create` should not receive an entire board brief as one large `content` field.

Use `cards.update` for editing an existing card. If kind, content, summary, title, tags, metadata, file, or upload fields change, the server refreshes semantic metadata. Layout-only updates remain layout-only and do not rebuild the semantic envelope.

## Server-side composition pipeline

The pipeline lives in `@shadowob/flash-types/card-semantics` and is used by `FlashService.composeCards`, `createCard`, `updateCard`, and snapshot/event transport normalization.

```text
Buddy/user prompt
  -> cards.compose input
  -> intent normalization
  -> explicit draft / card table / heading / paragraph / bullet split
  -> kind inference or preferred kind assignment
  -> kind-specific metadata generation
  -> semantic envelope in meta.flash
  -> server-side placement
  -> durable card.created events
  -> renderer plugin receives typed meta
```

Every normalized card receives `meta.flash.semanticVersion`, `meta.flash.intent`, and `meta.flash.renderProfile`. This makes generated cards auditable. It also gives future Buddy prompts a stable way to explain why a card was created as a specific kind.

The same normalization is applied on transport. If old persisted cards were created with only `content`, snapshots and card event patches are enriched before returning to the client. This does not rewrite old rows by itself, but it prevents legacy cards from rendering as completely untyped text when the server can infer a better structure.

## `cards.compose` input

`cards.compose` accepts either free-form material, explicit drafts, or both. The common fields are:
`intent`, `preferredKinds`, and draft `kind` accept canonical lower-case kinds as well as common aliases; canonical values are still recommended for Buddy-generated calls.


```json
{
  "intent": "card-showcase",
  "title": "卡片测试",
  "material": "每张卡只讲一个点，内容精简，类型各不相同。",
  "instructions": "生成一组适合画布展示的语义卡片。",
  "preferredKinds": ["story", "todo", "definition", "process", "argument", "quote", "timeline", "example", "rule", "inspiration", "reference"],
  "maxCards": 11,
  "placement": {
    "x": 260,
    "y": 240,
    "columns": 4,
    "gapX": 230,
    "gapY": 310,
    "angleJitter": 0.03
  },
  "clientMutationId": "optional-idempotency-key",
  "baseCursor": 123
}
```

For high-control generation, Buddy can pass explicit drafts. The server still normalizes metadata so renderers receive correct shapes:

```json
{
  "intent": "study-deck",
  "drafts": [
    {
      "kind": "definition",
      "title": "能量",
      "content": "能量是系统产生变化、完成工作或驱动过程的能力。"
    },
    {
      "kind": "todo",
      "title": "检查你头上的钉子",
      "content": "- 观察问题\n- 识别反复疼痛点\n- 提出一个可执行动作"
    },
    {
      "kind": "quote",
      "title": "演讲金句集",
      "content": "\"Everything you want is on the other side of worse first.\""
    }
  ]
}
```

## Supported intents

`auto` chooses a split strategy from the material. It should be used for general content where the user did not specify a board shape.

`card-showcase` is for testing and visual demos. It deliberately generates a diverse sequence: Story, Todo, Definition, Process, Argument, Quote, Timeline, Example, Rule, Inspiration, and Reference. This is the right intent for “卡片测试” prompts.

`study-deck` favors Definition, Keypoint, Example, Quote, Timeline, Todo, and Reference.

`research-map` favors Summary, Keypoint, Data, Argument, Comparison, Timeline, and Reference.

`project-plan` favors Process, Todo, Keypoint, Timeline, Argument, and Reference.

`argument-map` favors Argument, Quote, Data, Comparison, Example, and Reference.

`story-world` favors Story, Person, Timeline, Quote, Inspiration, and Rule.

`presentation` favors Summary, Keypoint, Data, Chart, Quote, Process, and Reference.

`ruleset` favors Rule, Definition, Process, Example, and Todo.

`brainstorm` favors Inspiration, Idea, Keypoint, Comparison, and Todo.

## Render profiles and required metadata

The semantic layer contains a render profile per card kind. The profile describes what the renderer should visually emphasize and which metadata fields are expected. Important profiles are:

| Kind | Rendering role | Generated metadata |
| --- | --- | --- |
| `story` | Narrative card | `title`, `body`, `chapters`, `readingTime` |
| `todo` | Checklist with progress | `items`, `progress` |
| `definition` | Term and explanation | `term`, `definition`, optional `example` |
| `process` | Numbered flow | `steps`, `isLinear`, `visualHint` |
| `argument` | Claim/evidence/counterpoint | `claim`, `evidence`, `counterpoint`, `strength` |
| `quote` | Pull quote | `text`, `author`, `language` |
| `timeline` | Ordered events | `events`, `span`, `direction` |
| `example` | Scenario/case card | `subject`, `scenario`, `challenge`, `approach`, `takeaway` |
| `rule` | Conceptual or executable rule | `enabled`, `trigger`, `scope`, `capabilities`, `description`, `principles`, optional `script` |
| `inspiration` | Creative spark | `body`, `ideaType`, `impact` |
| `reference` | Source/guide | `refTitle`, `url`, `refType`, `credibility` |

Renderers must continue to tolerate partial metadata, but Server App callers should rely on `cards.compose` instead of hand-building low-quality metadata.

## Rule card behavior

A `rule` card can be conceptual or executable.

A conceptual rule card has `enabled: false`, a `description`, and optional `principles`. It renders as a human-facing rule/principle card and does not run script.

An executable rule card has `enabled: true`, a `trigger`, `scope`, `capabilities`, and a bounded script. It participates in the Worker script engine according to the rule runtime model. The same visual renderer distinguishes conceptual and executable rules so users can see whether a card is just explanatory or active behavior.

## Buddy prompt contract

Buddy should follow this contract when using the Flash Server App:

1. Determine whether the user wants one card or a board/set of cards.
2. For a board/set, call `cards.compose` once rather than calling `cards.create` many times with large text bodies.
3. Set `intent` when the prompt implies a board shape. Use `card-showcase` for card demos/tests.
4. Pass `preferredKinds` only when the user explicitly asks for certain types or when a product flow owns the deck template.
5. Keep each explicit draft focused on one semantic unit. Do not put the entire source brief into every draft.
6. Read the returned `plan` to verify how the server interpreted the content.
7. Use `cards.layout.update` later if the generated layout needs adjustment.

## Event and network behavior

`cards.compose` is a durable mutation. It supports `clientMutationId` and `baseCursor`, goes through the same board-local cursor and mutation receipt path as other high-level commands, and produces one event containing multiple `card.created` patches.

Clients should consume the returned mutation result through the existing normalized mutation result path. The event stream should then apply the same patches idempotently. No full `boards.get` refresh is required after a successful `cards.compose` unless the client detects an unrecoverable cursor gap.

## Migration and compatibility

Existing `cards.create` calls still work. They now pass through semantic normalization, which improves single-card rendering but cannot reliably split a whole board prompt. Callers must migrate multi-card creation to `cards.compose`.

Existing malformed rows are normalized on snapshot and event transport. This is a compatibility layer, not a replacement for correct creation. For persistent cleanup, a future repair job can read old rows, run semantic normalization, and write back enriched metadata under a new card revision.

The `CARD_SEMANTIC_VERSION` value should be bumped when metadata generation changes in a way that affects rendering or replay expectations.

## Operational checks

A healthy “卡片测试” run should show one initial board load, one `cards.compose` command, one durable event, and many visually distinct cards. It should not show repeated `boards.get` after every generated card, and the returned cards should not all use identical generic body metadata.

When debugging a bad composition, inspect the command result:

```json
{
  "result": {
    "cards": ["..."],
    "plan": [
      {
        "kind": "todo",
        "title": "检查你头上的钉子",
        "source": "showcase-profile",
        "reason": "showcase checklist with progress bar"
      }
    ],
    "intent": "card-showcase",
    "semanticVersion": "flash.card-semantics/1.0.0"
  }
}
```

If the `plan` is correct but the card still looks generic, the renderer plugin for that kind is missing or ignoring the generated metadata. If the `plan` is wrong, adjust the intent, preferred kinds, or section headings in the input material.
