# Product Positioning Decision Document

> This document records the current product positioning and documentation vocabulary. Older directions around Space migration, super individuals as the only storyline, and Agent assets as the primary narrative are deprecated.

---

## Q1: What is Shadow?

**Decision:** Shadow is an AI interactive community platform.

Members gather in servers around shared interests or goals. After entering a server, members first see the community desktop: announcements, interactive widgets, shared content, community apps, channel shortcuts, workspace shortcuts, and Buddy entry points can be placed there. Members start from the community desktop, then join the community through channels, workspaces, community apps, and Buddy services.

A Buddy is a 24/7 AI companion serving the community. It understands the current server context and helps members answer questions, organize information, run tasks, and maintain community services.

---

## Q2: What are the core objects?

| Object | Product definition |
| --- | --- |
| Server | The product object that hosts a community. A server usually corresponds to a community formed around an interest or goal. |
| Community desktop | The official entry surface members see after entering a server. Admins can place announcements, interactive widgets, shared content, community apps, channel shortcuts, workspace shortcuts, and Buddy entry points. |
| Channel | The main place for members to talk, discuss, and collaborate. |
| Workspace | Stores files, documents, images, code, research summaries, Buddy results, and other collaborative outputs. |
| Community app | A shared app installed in a server. It can provide tools, interactive widgets, content displays, workflows, and future transaction entry points. |
| Shared content | A documentation-level umbrella term for things members share with the community, such as guides, tutorials, files, apps, creative work, and other formats. It is not a standalone data model. Use concrete names such as work, file, app, or product in specific contexts. |
| Buddy | A 24/7 AI companion serving community members. It can be reached from channels, the community desktop, community apps, or dedicated Buddy entry points. |
| Cloud computer | A cloud runtime for Buddies. It helps public community services stay online 24/7 with better isolation. Local Buddy runtimes can still exist, but are not the default fit for public services. |

---

## Q3: How does the community desktop work?

**Decision:** The community desktop is the server's shared entry surface, not a private personal desktop.

Newcomers can see announcements, interactive widgets, shared content, community apps, channel shortcuts, workspace shortcuts, and Buddy entry points immediately after entering a server. Each community can decide what matters most on its desktop.

First-phase rules:

- The desktop layout is shared across the whole server.
- Server admins place desktop content.
- Later, admins may appoint other members to help manage the desktop.
- Server admins may allow visitors to view the community desktop. Visitors who have not joined can only view it; Buddy services require joining the server first.
- The desktop is for display, orientation, and reminders. Members continue participating through channels, workspaces, community apps, and Buddy services.

---

## Q4: Where do newcomers start?

**Decision:** Newcomers default to the official community desktop.

The official server can be configured with environment variables:

- Web default entry: `VITE_SHADOW_OFFICIAL_OS_SERVER`
- Server-side default join: `SHADOWOB_OFFICIAL_OS_SERVER`

When both values point to the same server slug or id, logged-in visitors/members are joined to that server by default and redirected to `/app/os?server=<server>`. `/os` is the current implementation route, not product vocabulary.

In the first phase, visitor status means a visitor account, not fully anonymous browsing. If a server admin allows visitor access, visitors can view the community desktop and understand the community. Buddy services require joining the server first. Higher-permission actions still follow the existing membership and invite rules.

---

## Q5: What is the default Buddy strategy?

**Decision:** The first phase does not create a separate default guide Buddy for every server.

Later, Shadow may provide one official Buddy named "Shadow" or "虾豆". It can join every community by default and answer based on the current server context, such as community introductions, channel recommendations, shared content explanations, app usage, and basic questions. Special permissions for the official Buddy are not part of the current positioning.

Until then, servers can add their own Buddies. The product wording for Buddy is: a 24/7 AI companion serving the community.

---

## Q6: How should Inbox be treated?

**Decision:** Inbox remains an implementation and technical design concept. It should not be part of the main product narrative.

Product copy should prefer concrete actions such as "contact a Buddy", "assign a task to a Buddy", and "check Buddy service status". Technically, a Buddy may have a dedicated entry point so members can communicate and submit tasks without finding that Buddy across fragmented channels.

---

## Q7: Where does the economy fit?

**Decision:** The economy is not the current core positioning.

Members first talk, share, and collaborate inside servers. As shared content, community apps, and Buddy services grow, Shrimp Coins, transactions, purchases, tips, rentals, and settlement can unlock more community value.

Current copy should not describe Shadow first as AI commerce infrastructure, an Agent asset platform, or a Buddy rental platform. Those are later-stage capabilities.

---

## Q8: How is Shadow different from Discord?

Discord centers on channel chat. Shadow puts servers, the community desktop, channels, workspaces, community apps, shared content, and Buddy services into one community experience.

Differences:

- A server has a community desktop where admins can place announcements, interactive widgets, shared content, apps, and Buddy entry points on the first screen.
- Shared content is only an umbrella term, not a new standalone data model.
- The workspace is a core object for files, collaborative outputs, and Buddy results.
- Community apps are shared objects that can be placed on the community desktop and work with channels, workspaces, and Buddies.
- A Buddy is a 24/7 AI companion serving the community, and public services fit cloud computers better.

---

## Q9: What should be cleaned up?

Deprecated:

- Renaming Server to Space in public product vocabulary.
- Treating super individuals as the only target user.
- Making Agent assets, AI commerce infrastructure, or Buddy rental the first-screen narrative.
- Newcomers first creating or renting a Buddy.
- Emphasizing OS mode, community operating system, or Inbox in product docs.

Kept but downgraded:

- Buddy rental, shops, Shrimp Coins, and transactions as economic capabilities after community shared content and services mature.
- Cloud computers as Buddy cloud runtimes and the recommended runtime for public community services.
- Open source, self-hosting, SDK, CLI, and OAuth as developer and ecosystem capabilities.

---

## Q10: Near-term product priorities

1. Official community desktop: configure the default server through environment variables and join visitors to the official server by default.
2. Shared community desktop layout: admins manage desktop content and members see the same entry surface.
3. Desktop object model: announcements, interactive widgets, shared content, community apps, channel shortcuts, workspace shortcuts, and Buddy entry points can all become desktop objects.
4. Buddy service paths: members can contact Buddies, ask questions, and assign tasks from channels, the community desktop, community apps, or dedicated entry points.
5. Copy convergence: README, website introduction, and product docs should use "AI interactive community platform" as the main positioning.

---

## Open Questions

- Role name and permission boundary for members appointed to help manage the community desktop.
- Launch timing and default prompt surface for the official Buddy.
