# Buddy Inbox System Design Summary

Status: design summary
Date: 2026-06-05

Full design: [Buddy Inbox System Design](./buddy-inbox-system-design.md)

## One Sentence

Buddy Inbox is a fixed communication route to one Buddy inside a server context. It is still
implemented as a special Channel, but the Buddy identity is not statically bound to one Server.
The active message, Task Card, or Space App command context injects the server context, and policy
decides whether that server can discover, route to, and dispatch work to the Buddy. Product-wise,
Inbox supports both chat and task modes. Space Apps, users, and systems dispatch work through Task
Cards; Buddies reply, update state, and submit artifacts through the same Inbox route.

## Top-Level Objects

```mermaid
flowchart LR
  User["User / Admin"]
  Space App["Space App"]
  Scheduler["Scheduler / Webhook"]
  Server["Shadow Server"]
  InboxA["Buddy A Inbox<br/>Special Channel"]
  InboxB["Buddy B Inbox<br/>Special Channel"]
  BuddyA["Buddy A"]
  BuddyB["Buddy B"]
  Issue["Space App Issue / Run<br/>Space App-owned state"]
  Artifact["Artifacts<br/>Docs / JSON / media / packages"]

  User --> Server
  Space App --> Server
  Scheduler --> Server
  Server --> InboxA
  Server --> InboxB
  InboxA <--> BuddyA
  InboxB <--> BuddyB
  Space App --> Issue
  Issue --> Server
  BuddyA --> Artifact
  BuddyB --> Artifact
  Artifact --> Issue
```

Core boundaries:

- Shadow core owns Inboxes, Task Cards, delivery, authorization, audit, and artifact access.
- Space Apps own their issue, board, run, step, prompt, material, and domain state.
- Buddies receive work and return results only through their own Inbox.

## What An Inbox Is

```mermaid
flowchart TB
  Inbox["Buddy Inbox<br/>One Buddy route<br/>per server context"]
  Channel["Special Channel<br/>topic = shadow:buddy-inbox:&lt;agentId&gt;"]
  ChatMode["Chat mode<br/>Full conversation / composer / attachments / follow-up"]
  TaskMode["Task mode<br/>Task Cards / queue / status / approval / artifacts"]
  TaskCard["Task Card<br/>queued / claimed / running / done / failed"]

  Inbox --> Channel
  Inbox --> ChatMode
  Inbox --> TaskMode
  TaskMode --> TaskCard
  ChatMode --> TaskCard
```

Inbox UI is not only a task queue and is not just a skin over a normal channel:

- Chat mode is for natural conversation, context review, and follow-up with the Buddy.
- Task mode is for queues, state, approvals, reruns, and deliverables.
- Both modes share the same underlying Channel and message stream.
- Space Apps must not enter an Inbox to send ordinary messages. Space App collaboration goes through Task
  Cards or structured output.

## Three Dispatch Paths

```mermaid
flowchart LR
  Bridge["Bridge<br/>User action inside iframe"]
  CommandOutbox["Command Outbox<br/>Tasks returned by Space App command"]
  ServerOrigin["Server-origin<br/>Webhook / Cron / background job"]
  Policy["Shadow Policy<br/>Space App grant / token / admission"]
  Delivery["Inbox Delivery"]
  Task["Task Card"]
  Inbox["Target Buddy Inbox"]

  Bridge --> Policy
  CommandOutbox --> Policy
  ServerOrigin --> Policy
  Policy --> Delivery
  Delivery --> Task
  Task --> Inbox
```

The paths have different meanings:

- Bridge: the current user triggers the action inside the Space App UI. This is suitable for
  admin-confirmed dispatch.
- Command outbox: a user or Buddy calls a Space App command, and the Space App returns follow-up tasks.
  The target Buddy grant must include `buddy_inbox:deliver` or `*`.
- Server-origin: a Space App backend, webhook, cron, or batch process triggers delivery. This needs a
  separate delivery token and a Space App grant that includes `buddy_inbox:deliver`.

## Generic Kanban Flow

Kanban is a generic task-management Space App. It must not hard-code video, marketing, support,
engineering, or other business flows. A user gives a request to one coordinator Buddy. The
coordinator discovers routable Buddies in the current Server, uses atomic card/link commands to
maintain the task graph, and dispatches real work through Buddy Inboxes.

```mermaid
sequenceDiagram
  participant U as User
  participant K as Kanban Space App
  participant S as Shadow Server
  participant C as Coordinator Inbox
  participant B1 as Buddy A Inbox
  participant B2 as Buddy B Inbox
  participant B3 as Buddy C Inbox

  U->>K: Enter request<br/>choose coordinator Buddy
  K->>S: Bridge creates Coordinator Task Card
  S->>C: Coordinator task
  C->>S: Discover routable Buddies in current Server
  C->>K: cards.create / cards.link<br/>create task graph
  C->>S: Dispatch Task Cards to Buddy A/B
  S->>B1: Step 1
  S->>B2: Step 2
  B1-->>K: cards.update / artifacts.add<br/>summary / artifact ref
  B2-->>K: cards.update / artifacts.add<br/>summary / artifact ref
  C->>S: Dispatch downstream ready steps
  S->>B3: Step 3
  B3-->>K: Final artifact ref / QA result
  K-->>U: Issue completed<br/>cards and artifacts are traceable
```

Business meaning lives in the user input, coordinator plan, and Buddy runtime skills. Kanban only
sees generic issues, cards, status, comments, and artifact references.

## Ownership Split

```mermaid
flowchart TB
  AppLayer["Kanban Space App<br/>Issue / Card / Step / Artifact refs"]
  ShadowLayer["Shadow layer<br/>Inbox / Task Card / Delivery / Auth / Audit"]
  BuddyLayer["Buddy layer<br/>Plan / Execute / Runtime / Output"]

  AppLayer --> ShadowLayer
  ShadowLayer --> BuddyLayer
  BuddyLayer --> ShadowLayer
  ShadowLayer --> AppLayer
```

Key principles:

- Kanban does not choose a default Buddy, hard-code role names, or embed business scenarios.
- The coordinator Buddy uses the current server context, Buddy/Inboxes list, and policy result to
  decide how to assign work.
- Task Card is the Buddy Inbox collaboration unit; Kanban card is the state/result tracking unit.
- Private input, long source material, and runtime content must not be copied directly into cards.
  Cards should store summaries, state, and authorized artifact references.

## Task Lifecycle

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> claimed
  claimed --> running
  running --> completed
  running --> failed
  failed --> queued: rerun creates new attempt
  queued --> canceled
  claimed --> canceled
  running --> canceled
  completed --> [*]
  canceled --> [*]
```

Important rules:

- Task Card is the Inbox work unit.
- A Buddy may call Space App commands with task context only after claiming the task.
- `failed` does not overwrite history; rerun creates a new attempt.
- Completed artifacts return to the Space App issue/card and remain traceable from the Inbox.

## Authorization Overview

```mermaid
flowchart LR
  Request["Dispatch request"]
  AppAuth["Space App install and command permission"]
  Token["Delivery token<br/>server-origin only"]
  Role["Role binding<br/>role to Buddy"]
  Admission["Inbox admission<br/>allow / deny / review"]
  Create["Create Task Card"]

  Request --> AppAuth
  AppAuth --> Token
  Token --> Role
  Role --> Admission
  Admission --> Create
```

Most important security principles:

- Space App backends must not hold user JWTs or Buddy tokens.
- A server-origin token must not inherit the creating admin's privileges.
- Command outbox and server-origin dispatch must pass the target Buddy's Space App grant before they
  can create an Inbox task.
- Role binding allows a Space App to dispatch to a Buddy; it does not grant access to read the Buddy
  Inbox.
- `assigneeLabel` is a fallback only. Production paths should use `agentId` or role binding.
- External URLs, user reviews, page content, assets, and prompts are untrusted input. They need
  SSRF guards, size limits, audit, and artifact authorization.

## Final Shape

```mermaid
flowchart LR
  Issue["Issue-first Kanban<br/>Generic Board / Cards / Artifacts"]
  Plan["Coordinator Plan<br/>Generated by Buddy"]
  Dispatch["Shadow Delivery"]
  Inboxes["Buddy Inboxes"]
  Outputs["Outputs / Artifacts"]
  Board["Issue / Board UI"]

  Issue --> Plan
  Plan --> Dispatch
  Dispatch --> Inboxes
  Inboxes --> Outputs
  Outputs --> Board
  Board --> Issue
```

The goal is to make arbitrary multi-step collaboration visible, reviewable, rerunnable, and
reusable like an engineering issue, without baking any specific industry workflow into Shadow
core or the Kanban Space App.
