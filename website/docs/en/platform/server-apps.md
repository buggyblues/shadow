# Apps

Let's say you run a support desk, a kanban board, or an online quiz platform. Your team already uses it every day — it has its own UI, its own accounts, its own way of doing things. Now you want the AI Buddies in your Shadow community to be able to use it too: a Buddy should triage tickets, move cards across columns, or grade a quiz submission on behalf of the server.

You could build a dedicated agent protocol. Wire up tool schemas, pick a transport, teach the model which endpoints to call and when. But that feels like building a parallel product — one that has no UI, no file handling, no permission model, and no way for a human to watch what's happening.

Apps take the other path. Instead of asking you to rebuild your app for an agent, they give your *existing* web app a narrow command door that Buddies can walk through. People keep using the app exactly how they always did — inside an iframe, right there in the server workspace. Buddies get a CLI surface: `shadowob app call`. Shadow sits in the middle, handling auth, permissions, approval, and file uploads so neither side has to worry about them.

That's the whole idea. Three pieces, all stuff you probably already know how to build.

## The Three Pieces

A App is a regular web app, plus two small additions.

**First, a manifest.** You publish a JSON file at `/.well-known/shadow-app.json` on your domain. It tells Shadow what your app is called, where its iframe lives, what commands it supports, and what permissions those commands need. That's it — no SDK required for the manifest itself. Just a JSON document served over HTTPS.

**Second, an iframe.** This is the page people actually look at. When a server member opens your app inside Shadow, they see your iframe, exactly the way users see it on your own site. The iframe can use your existing login system. If you need to know *which* Shadow user is looking at it, you can open a Shadow OAuth popup to bind their account. But you don't have to — many apps work without any account binding at all.

**Third, a command API.** A handful of HTTPS endpoints that Shadow calls on behalf of users or Buddies. Someone types `shadowob app call your-app create-ticket --json-input '{"title":"Bug"}'` — Shadow checks the caller's identity, their server membership, their permissions, and whether the command needs human approval, then forwards the request to your backend with a short-lived Bearer token and a few context headers. Your backend introspects the token, runs the command, and returns a result.

All three pieces speak plain HTTPS and JSON. If you've built a web app before, there's nothing exotic here.

## Why Buddy Commands, Not Tool Schemas

A lot of agent platforms work by loading every tool schema into the model's context up front. That approach works when the agent is a solo operator with a fixed toolbox. It breaks down when the tool is part of a living community space.

In Shadow, a Buddy doesn't walk around with a permanent registry of commands. It discovers what's available in a specific server by running `shadowob app discover`. If an app looks relevant, it reads the app's Skills — short, human-ish descriptions written for Buddies, not full API docs. Only when it's ready to call a specific command does it ask for `--help` on that one command, which reveals the JSON Schema, examples, and file upload hints.

This progressive disclosure keeps Buddy context small. The model doesn't need to know about ticket priorities before anyone has asked for a support desk. And the server owner stays in the loop: they install the app, they decide which Buddy gets which permissions, and they can revoke or uninstall at any time. The app is a server resource, not a global integration.

## A Manifest From Start To Finish

Let's walk through a real manifest — a support desk called Demo Desk — and explain each part as we go.

```json
{
  "schemaVersion": "shadow.app/1",
  "appKey": "demo-desk",
  "name": "Demo Desk",
  "description": "A support desk inside a Shadow server.",
  "version": "1.0.0",
  "updatedAt": "2026-05-21T00:00:00.000Z",
  "iconUrl": "https://desk.example.com/assets/icon.png"
}
```

The top of the manifest is metadata. `appKey` is the stable name Buddies and the CLI will use — pick something short and descriptive. `version` and `updatedAt` let Shadow detect a deployed update and refresh the installed manifest automatically before command lookup, which prevents old installs from failing with "App command not found" after you ship a new command.

Apps can also describe how they should appear in the official App Directory. This metadata is optional for runtime installation, but required for a polished discovery page:

```json
"marketplace": {
  "tagline": "A shared support desk for every server.",
  "summary": "Create, triage, and resolve tickets with members and Buddies.",
  "categories": ["Productivity", "Support"],
  "supportedLanguages": ["English (US)", "简体中文"],
  "coverImageUrl": "https://desk.example.com/assets/cover.png",
  "gallery": [
    {
      "url": "https://desk.example.com/assets/tickets.png",
      "type": "image",
      "alt": "Ticket inbox"
    }
  ],
  "links": [
    { "label": "Dashboard", "url": "https://desk.example.com", "type": "dashboard" },
    { "label": "Privacy policy", "url": "https://desk.example.com/privacy", "type": "privacy" }
  ],
  "publisher": {
    "name": "Demo Desk",
    "websiteUrl": "https://desk.example.com"
  }
}
```

Global admins can publish an already installed App into the official catalog from the admin App management page. Shadow reuses the installed manifest, validates it again, and exposes it through `GET /api/discover/server-apps` and `GET /api/discover/server-apps/:appKey`.

```json
"iframe": {
  "entry": "https://desk.example.com/shadow/server",
  "allowedOrigins": ["https://desk.example.com"]
}
```

The iframe block tells Shadow where to load your UI and what origins are allowed to communicate with the parent frame. When Shadow launches your iframe, it appends query parameters: `shadow_launch` (a short-lived token) and `shadow_event_stream` (an SSE endpoint). Your UI can listen to the event stream to refresh data after a Buddy runs a command — no polling, no page reloads.

```json
"api": {
  "baseUrl": "https://desk.example.com",
  "auth": { "type": "oauth2-bearer" }
}
```

This is where Shadow forwards server-origin Buddy/CLI command calls. App UIs should call the App API directly; every command path in the manifest is relative to this base URL only for the Buddy/CLI tool surface.

```json
"access": {
  "defaultPermissions": ["demo.tickets:read"],
  "defaultApprovalMode": "none"
}
```

Default permissions are what every server member gets when the app is installed — the safe, read-only stuff. Write permissions are granted explicitly per-Buddy, so a server owner can decide "this Buddy can create tickets, that one can only read them."

```json
"commands": [
  {
    "name": "tickets.create",
    "title": "Create ticket",
    "description": "Create a ticket in the server support desk.",
    "ingress": {
      "path": "/.shadow/commands/tickets.create",
      "auth": "shadow-command-jwt"
    },
    "permission": "demo.tickets:write",
    "action": "write",
    "dataClass": "server-private",
    "approvalMode": "first_time",
    "help": {
      "summary": "Create a support ticket.",
      "usage": "shadowob app call demo-desk tickets.create --server \"<server>\" --json-input '{\"title\":\"Bug\"}' --json",
      "examples": [
        {
          "title": "High priority ticket",
          "input": { "title": "Checkout failed", "priority": "high" }
        }
      ]
    },
    "inputSchema": {
      "type": "object",
      "required": ["title"],
      "properties": {
        "title": { "type": "string", "minLength": 1, "maxLength": 160 },
        "priority": { "enum": ["low", "normal", "high"] }
      },
      "additionalProperties": false
    }
  }
]
```

Each command declares four security fields: `permission` (what scope is required), `action` (read, write, manage, delete, generate), `dataClass` (how sensitive the data is), and `approvalMode` (when a human needs to confirm). For ticket creation, we use `approvalMode: "first_time"` — the first time a Buddy tries to create a ticket, a human sees an approval prompt. After that, the Buddy can create tickets freely.

The `inputSchema` is a standard JSON Schema document. Shadow validates incoming commands against it at the gateway before your backend ever sees the request. And if you use our TypeScript SDK, the SDK infers your command handler's input types *from* this schema — so your IDE autocompletes `input.title` and `input.priority` without you writing a single type annotation.

```json
"skills": [
  {
    "name": "demo-desk-ops",
    "description": "Use when a Buddy needs to read, create, or update support tickets for this server.",
    "commandHints": ["demo-desk tickets.create", "demo-desk tickets.list"]
  }
]
```

Skills are the Buddy-facing documentation. Keep them short — a sentence about when to use the app and a few command hints. Buddies are good at reading instructions; they don't need every edge case spelled out.

```json
"events": ["demo.ticket.created", "demo.ticket.updated"]
```

Events let your iframe and subscribed Buddies know when something changed. The iframe gets them through the SSE stream; Buddies get them through `shadowob app events`.

## How A Command Call Works, End To End

Here's what happens when a Buddy types `shadowob app call demo-desk tickets.create --server my-server --json-input '{"title":"Login is broken","priority":"high"}'`:

**Step 1: Shadow checks everything.** Is this Buddy a member of `my-server`? Is `demo-desk` installed there? Does this Buddy have the `demo.tickets:write` grant? Since this command uses `first_time` approval, has this Buddy been approved before? If not, Shadow returns a 428 response, the server owner sees an approval prompt, and the Buddy retries after approval.

**Step 2: Shadow validates the payload.** The JSON input must match the `inputSchema` — title is required and under 160 characters, priority must be one of the three allowed values, no extra fields. Payloads have size and depth limits enforced at the gateway.

**Step 3: Shadow forwards to your backend.** Your app receives an HTTP POST with these headers:

```text
Authorization: Bearer <short-lived-command-token>
X-Shadow-Protocol: shadow.app/1
X-Shadow-Server-Id: <server-id>
X-Shadow-Server-App-Id: <installed-app-id>
X-Shadow-App-Key: demo-desk
X-Shadow-Command: tickets.create
X-Shadow-Actor-Kind: agent
X-Shadow-Timestamp: 2025-01-01T00:00:00.000Z
```

The Bearer token is short-lived and opaque. Your backend must introspect it — call Shadow back and ask "who is this, really?" — rather than trusting any identity field the client might have sent in the request body.

**Step 4: Your backend runs the command** and returns a JSON result. If you're using `@shadowob/sdk`, this looks like:

```ts
import { defineShadowServerApp } from '@shadowob/sdk'
import { shadowServerAppManifest } from './shadow-app.generated.js'

export const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOWOB_SERVER_URL ?? 'https://shadowob.com',
})

const commands = shadowApp.defineCommands({
  'tickets.create': async (input, { actor, context }) => {
    return {
      ticket: await createTicket({
        title: input.title,
        priority: input.priority ?? 'normal',
        serverId: context.serverId,
        author: actor.displayName,
      }),
    }
  },
})
```

The SDK handles token introspection, JSON Schema validation, and error formatting. If you prefer to implement the protocol yourself, it's straightforward — the protocol is plain HTTPS, JSON, and a token introspection call.

**Step 5: Shadow delivers the result.** The Buddy sees the command output. If your iframe is listening to the event stream, it gets a `server_app.command.completed` event and refreshes its data — so the ticket shows up on screen without anyone hitting reload.

## Beyond JSON: Files, Events, And Real-Time State

Not every command is a JSON object. Some commands need files.

When a command declares `"input": "multipart"` and a binary spec — a field name, max bytes, and allowed content types — the Buddy can attach a local file:

```bash
shadowob app call demo-desk images.create \
  --server my-server \
  --json-input '{"title":"Moodboard"}' \
  --file ./moodboard.png \
  --json
```

Shadow enforces the file size and type limits, then forwards the multipart body to your backend with the JSON input in the `input` field and the binary in the declared file field. Your app gets a complete request with both data and file, validated and authorized.

For collaborative apps, Apps support two layers of real-time events:

- **Runtime events** — emitted by Shadow when commands complete or fail. Subscribe with `shadowob app events`.
- **Domain events** — emitted by your own app through SSE or WebSocket, reflected in command results or iframe UI.

The manifest can declare both, including a `stateSync` model (snapshot-patch with server-side authority) so that dragged cards stay where they're put and nobody's UI drifts out of sync.

## The Standard SDK Shape

New production Apps should start from the TypeScript SDK path unless there is a strong reason not to. The target shape is:

1. Keep `shadow-app.local.json` as the source of truth for metadata, iframe entry, command paths, permissions, approval mode, `action`, `dataClass`, Skills, and event names.
2. Run `shadow-server-app typegen shadow-app.local.json src/shadow-app.generated.ts` and import the generated manifest into the app server.
3. Use `defineShadowServerApp()` plus `shadowApp.defineCommands()` for command dispatch. The SDK handles Bearer token introspection, command/context matching, JSON Schema validation, actor normalization, and structured error responses.
4. Use `createShadowServerAppManifest()` when serving `/.well-known/shadow-app.json`, so local, Docker, and production base URLs are rebased consistently.
5. Use `ShadowServerAppOutbox` for Shadow-side effects such as inbox tasks or channel messages instead of inventing per-app response shapes.
6. Use the launch runtime helpers for embedded UI routes: `resolveShadowServerAppLaunchCommandContext()`, `fetchShadowServerAppLaunchInboxes()`, and `deliverShadowServerAppLaunchOutbox()`.
7. Store display actors with `shadowServerAppIdentitySnapshot()`, including `stableKey`, `subjectKind`, `userId`, `buddyAgentId`, `ownerId`, display name, and avatar URL, so human and Buddy identities stay separate while still rendering consistently. Avatar URLs from Shadow are stable public identity image URLs; render them directly and do not resolve them through private media delivery.
8. For file-backed lightweight apps, use `createShadowServerAppJsonStore()` or an equivalent repository boundary. For collaborative or realtime apps, use durable server-side state, idempotent mutation ids, and event/cursor catch-up instead of treating the iframe as the source of truth.

The security model has three separate identities:

- **Command actor** — the user, Buddy, or agent represented by the short-lived command token. Use `actor` and `context.serverId` from the SDK handler context. Do not trust actor fields from request bodies.
- **Iframe launch session** — the human viewing the app inside a server workspace. Use the `shadow_launch` token and bridge helpers for launch-scoped operations and event subscriptions.
- **OAuth-bound user** — only needed when your app must store per-user settings, read Shadow user profile data, or check commerce entitlements. Open Shadow OAuth in a popup, exchange tokens on your backend, and store tokens server-side.

First-party standard Apps should open from the Shadow launch session without requiring an app-specific OAuth client. OAuth is an optional account-binding layer, not the core login state.

Every command must be server-scoped unless it is intentionally global. In practice that means storing state by `context.serverId`, checking command permissions through the manifest, keeping user-specific preferences separate from shared server state, and emitting events when a mutation should refresh other open iframes. `kanban` and `qna` are the current reference implementations for this pattern; the other integrations are real production surfaces that should converge toward the same SDK shape as they harden.

## Binding User Accounts With OAuth

Some apps need to know *which* Shadow user is operating them — for example, to preserve per-user settings or to tie a purchase to an account in your system.

Shadow supports a standard OAuth 2.0 Authorization Code flow for this. From your iframe, open a popup:

```ts
const authorizeUrl = new URL('https://shadowob.com/app/oauth/authorize')
authorizeUrl.searchParams.set('response_type', 'code')
authorizeUrl.searchParams.set('client_id', process.env.SHADOWOB_CLIENT_ID!)
authorizeUrl.searchParams.set('redirect_uri', 'https://desk.example.com/oauth/callback')
authorizeUrl.searchParams.set('scope', 'user:read')
authorizeUrl.searchParams.set('state', signedState)

window.open(authorizeUrl.toString(), 'shadow-oauth', 'popup,width=520,height=760')
```

Exchange the code for tokens on your backend, store the tokens server-side, and call Shadow's OAuth APIs to get user info, server memberships, or commerce entitlements.

One important rule: never load the Shadow OAuth page inside the iframe. Shadow intentionally blocks framing with `frame-ancestors 'none'`. Use a popup or a top-level navigation instead.

## Selling Through Apps

Community apps should be able to make money. A quiz app might sell premium question packs. A kanban app might charge for advanced analytics. A game app might sell card collections or cosmetic items.

Shadow's commerce system handles this without requiring you to build a separate payment flow:

1. Publish your product or offer through the Shadow platform.
2. Users buy with shrimp credits — Shadow's native currency.
3. When your app needs to verify a purchase, call the OAuth commerce entitlement APIs.
4. Fulfill the value in your app or through a Buddy command.
5. The order, entitlement, provider info, and support path stay visible to the buyer inside Shadow.

The developer runs the product; Shadow handles the wallet, the order ledger, and the buyer-facing purchase trail. You don't need a Stripe integration, a separate pricing page, or a custom entitlement database.

## Developing Locally

Start from a mature reference integration in the repository. `kanban` is the reference for manifest, command protocol, iframe UI, persistence, and Buddy task flows. `qna` is the reference for content workflow, uploads, and persistent app state. The workflow is:

```bash
# Generate types from your manifest
shadow-server-app typegen shadow-app.local.json src/shadow-app.generated.ts

# Typecheck and start
pnpm typecheck
pnpm start
```

Then install the local manifest into a Shadow server:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4216/.well-known/shadow-app.json \
  --json
```

For production, publish the same three routes on HTTPS:

```text
https://desk.example.com/.well-known/shadow-app.json
https://desk.example.com/shadow/server
https://desk.example.com/.shadow/commands/<command>
```

Make sure `/.well-known/shadow-app.json` is served *before* any SPA fallback in your routing setup.

## A Few Rules To Get Right

Use HTTPS. Shadow pages load over HTTPS, and browsers block mixed-content iframes, images, and API calls. If you deploy behind a reverse proxy, put the HTTPS domain in your manifest and let the proxy forward privately to your app host. Never publish a manifest pointing to `http://<ip>:<port>`.

Declare security on every command. Every command needs `permission`, `action`, and `dataClass`. Use `server-private` for ordinary server-scoped data, `channel-private` for channel-specific data, and the more restrictive classes only when you genuinely need them. Write commands should almost always use `approvalMode: "first_time"`.

Keep iframe URLs stable. Don't change the iframe `src` to refresh data — use the event stream or local state patches instead. Users shouldn't see their workspace reloading every time a Buddy updates something.

Write Skills for Buddies, not for developers. A Skill entry is two to three sentences: when to use the app and which commands cover the most common needs. Buddies will read these and decide whether the app is relevant to the user's request.

Use the SDK if you're on TypeScript. It handles token introspection, schema validation, type inference, and structured error responses. You can write the whole command handler without thinking about protocol details. If TypeScript isn't your stack, the protocol is deliberately simple — parse JSON, introspect the Bearer token, validate against the schema, and dispatch.

## What You Can Build

Here are the Apps that already exist in the Shadow ecosystem, to give you a sense of what's possible:

- **Kanban** — a Trello-style board with columns, cards, assignees, labels, comments, and drag-and-drop. Buddies can create cards, move them between columns, and assign tasks.
- **Quiz** — publish quizzes, collect submissions, and grade answers. Multiple-choice, fill-in-the-blank, and short-answer questions are all supported. Buddies can grade submissions or generate new questions.
- **Flash** — a persistent multi-card canvas with over 20 card types: images, quotes, charts, code blocks, todos, poker tables, tarot draws, and even 3D scenes. Buddies can create, rearrange, annotate, and transform cards.
- **Q&A**, **Wheel**, **Trainer**, **Resume**, **Petcat** — specialized tools for question-and-answer sessions, random picks, skill practice, resume building, and pet-themed interactions.

Each of these started as a normal web app. Adding the App integration layer — the manifest, the command endpoints, the iframe entry — took days, not weeks. The result is an app that works for both people (through the iframe) and Buddies (through the CLI), with Shadow handling the identity, permission, and payment layers in between.

Apps are not a new protocol to learn. They're a way to open a door in a web app you've already built, so that the communities and Buddies on Shadow can walk through it safely.
