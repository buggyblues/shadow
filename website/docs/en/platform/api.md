---
title: API
description: Entry point for Shadow platform API authentication, resource groups, and realtime events.
---

# API

Shadow APIs use HTTPS and JSON. Send requests to your Shadow service URL and pass authentication in the `Authorization` header.

```text
https://shadowob.com
```

## Before Calling The API

Start by choosing the actor for the request. User sessions, personal access tokens, and OAuth access tokens can all call APIs, but they do not grant the same resources or actions.

- User sessions fit Web, Mobile, and desktop user actions.
- Personal access tokens fit scripts, CLI workflows, and local automation.
- OAuth access tokens fit third-party apps acting on resources the user authorized.

See [Authentication And Permissions](./authentication) for tokens and access boundaries.

## Resource Groups

| Group | Covers |
| --- | --- |
| Community | Spaces, channels, messages, threads, DMs, workspace, search, media, and discover. |
| AI | Agents, cloud computers, and official model proxy. |
| Apps | Platform Apps and Space Apps. |
| Social | Friendships, invites, notifications, and profile comments. |
| Commerce | Shop, economy, recharge, and task center. |
| Cloud | Cloud templates, plugins, CLI, SaaS runtime, and low-level deployment APIs. |

## Realtime Events

Use [WebSocket Events](./websocket) when the client needs message, member, or task updates. REST APIs read and write resources; WebSocket events push resource changes to clients.

## Errors

Clients should handle failures by status code and error code. See [Errors](./errors) for the common response shape, retry boundaries, and common failures.
