# Buddy Permissions System — Product & Technical Design Document

> **Document Version**: 1.0  
> **Status**: Draft  
> **Author**: Shadow Engineering Team  
> **Last Updated**: 2025-03-27

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Permission Model](#3-permission-model)
4. [Database Schema](#4-database-schema)
5. [API Design](#5-api-design)
6. [WebSocket & Real-time Behavior](#6-websocket--real-time-behavior)
7. [UI/UX Design](#7-uiux-design)
8. [Implementation Phases](#8-implementation-phases)
9. [Security Considerations](#9-security-considerations)
10. [Migration & Backward Compatibility](#10-migration--backward-compatibility)

---

## 1. Overview

This document describes the **Buddy Permissions System** for Shadow (虾豆), a comprehensive access control layer that allows Buddy (AI agent) owners to control how their agents interact with other users across servers and channels.

### 1.1 What is a Buddy?

A **Buddy** is an AI agent in Shadow that:
- Has its own bot user identity
- Can join servers and participate in channels
- Receives messages and can reply based on configured policies
- Is owned by a human user who controls its behavior

### 1.2 Why Permissions Matter

Currently, Buddies have limited visibility control. Once added to a server, they can see all messages in allowed channels. The Permissions System introduces:

- **Privacy controls** — Make Buddies private so they only see specific users' messages
- **Scope limitation** — Restrict which users can interact with or even see the Buddy
- **Compliance** — Support enterprise use cases where data access must be controlled

---

## 2. Goals & Non-Goals

### 2.1 Goals

| Goal | Description |
|------|-------------|
| **G1** | Allow Buddy owners to mark Buddies as "private" |
| **G2** | Private Buddies only see messages from explicitly allowed users |
| **G3** | Provide granular user-level permissions (view, interact, mention) |
| **G4** | Support server-level and channel-level permission inheritance |
| **G5** | Maintain backward compatibility with existing Buddies |
| **G6** | Provide clear UI for managing permissions |

### 2.2 Non-Goals

| Non-Goal | Reason |
|----------|--------|
| Role-based permissions for Buddies | Keep it simple; user-level is sufficient for v1 |
| Message encryption | Out of scope; transport-level TLS is sufficient |
| Cross-server permissions | Buddies are per-server; no global permission model needed |

---

## 3. Permission Model

### 3.1 Core Concepts

```
┌─────────────────────────────────────────────────────────────────┐
│                    BUDDY PERMISSION HIERARCHY                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Public    │    │   Private   │    │   Restricted        │  │
│  │   (default) │    │             │    │   (future)          │  │
│  └──────┬──────┘    └──────┬──────┘    └─────────────────────┘  │
│         │                  │                                     │
│         ▼                  ▼                                     │
│  ┌─────────────┐    ┌─────────────┐                              │
│  │ Visible to  │    │ Invisible   │                              │
│  │ everyone    │    │ by default  │                              │
│  │ in server   │    │             │                              │
│  │             │    │ Only visible│                              │
│  │ Replies to  │    │ to allowed  │                              │
│  │ all messages│    │ users       │                              │
│  │             │    │             │                              │
│  │ Mentionable │    │ Only replies│                              │
│  │ by all      │    │ to allowed  │                              │
│  └─────────────┘    │ users       │                              │
│                     └─────────────┘                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Visibility Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `public` | Buddy is visible and responds to everyone | General-purpose assistants |
| `private` | Buddy only visible to allowed users; ignores others | Personal assistants, sensitive data handlers |
| `restricted` *(future)* | Buddy visible but limited interaction | Read-only assistants, announcement bots |

### 3.3 Permission Types

For private Buddies, the following permissions can be granted per user:

| Permission | Code | Description |
|------------|------|-------------|
| **View** | `view` | User can see the Buddy in member list and messages |
| **Interact** | `interact` | Buddy will process and reply to this user's messages |
| **Mention** | `mention` | User can @mention the Buddy to trigger responses |
| **Manage** | `manage` | User can modify Buddy settings (co-owner) |

### 3.4 Permission Inheritance

```
┌────────────────────────────────────────────────────────────┐
│              PERMISSION RESOLUTION FLOW                     │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Check Buddy visibility level                           │
│     └── If public → allow all (skip to step 4)             │
│                                                             │
│  2. Check server-level user permissions                    │
│     └── If user has permissions → use those                │
│                                                             │
│  3. Check channel-level user permissions                   │
│     └── If exists → override server-level                  │
│                                                             │
│  4. Apply policy settings (listen/reply/mentionOnly)       │
│                                                             │
│  5. Final decision: ALLOW / DENY / IGNORE                  │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema

### 4.1 New Tables

#### `buddy_permissions` — User-level permission grants

```typescript
// apps/server/src/db/schema/buddy-permissions.ts
import { boolean, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { agents } from './agents'
import { servers } from './servers'
import { channels } from './channels'
import { users } from './users'

export const buddyVisibilityEnum = pgEnum('buddy_visibility', [
  'public',    // Visible to all server members
  'private',   // Only visible to allowed users
  'restricted' // Future: visible but limited interaction
])

export const buddyPermissions = pgTable('buddy_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Who is being controlled
  buddyId: uuid('buddy_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  
  // Scope: server-wide or channel-specific
  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  
  // null = server-wide permission; set = channel-specific override
  channelId: uuid('channel_id')
    .references(() => channels.id, { onDelete: 'cascade' }),
  
  // Who gets the permission
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  
  // Permission flags
  canView: boolean('can_view').default(true).notNull(),
  canInteract: boolean('can_interact').default(true).notNull(),
  canMention: boolean('can_mention').default(true).notNull(),
  canManage: boolean('can_manage').default(false).notNull(),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

#### `buddy_server_settings` — Per-server visibility configuration

```typescript
// apps/server/src/db/schema/buddy-server-settings.ts
import { boolean, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { agents } from './agents'
import { servers } from './servers'

export const buddyServerSettings = pgTable('buddy_server_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  buddyId: uuid('buddy_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  
  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  
  // Visibility level for this server
  visibility: buddyVisibilityEnum('visibility').default('public').notNull(),
  
  // If true, only allowed users can see/interact with this Buddy
  isPrivate: boolean('is_private').default(false).notNull(),
  
  // Default permissions for newly added users (when isPrivate=true)
  defaultCanView: boolean('default_can_view').default(false).notNull(),
  defaultCanInteract: boolean('default_can_interact').default(false).notNull(),
  defaultCanMention: boolean('default_can_mention').default(false).notNull(),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### 4.2 Schema Index

```typescript
// Add to apps/server/src/db/schema/index.ts
export { buddyPermissions, buddyVisibilityEnum } from './buddy-permissions'
export { buddyServerSettings } from './buddy-server-settings'
```

### 4.3 Migration

```sql
-- Migration: 0029_add_buddy_permissions.sql
-- Create enum for visibility levels
CREATE TYPE buddy_visibility AS ENUM ('public', 'private', 'restricted');

-- Buddy permissions table
CREATE TABLE buddy_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buddy_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT true,
    can_interact BOOLEAN NOT NULL DEFAULT true,
    can_mention BOOLEAN NOT NULL DEFAULT true,
    can_manage BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(buddy_id, server_id, channel_id, user_id)
);

-- Buddy server settings table
CREATE TABLE buddy_server_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buddy_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    visibility buddy_visibility NOT NULL DEFAULT 'public',
    is_private BOOLEAN NOT NULL DEFAULT false,
    default_can_view BOOLEAN NOT NULL DEFAULT false,
    default_can_interact BOOLEAN NOT NULL DEFAULT false,
    default_can_ention BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(buddy_id, server_id)
);

-- Indexes for performance
CREATE INDEX idx_buddy_permissions_buddy_id ON buddy_permissions(buddy_id);
CREATE INDEX idx_buddy_permissions_server_id ON buddy_permissions(server_id);
CREATE INDEX idx_buddy_permissions_user_id ON buddy_permissions(user_id);
CREATE INDEX idx_buddy_permissions_lookup ON buddy_permissions(buddy_id, server_id, user_id);
CREATE INDEX idx_buddy_server_settings_buddy_id ON buddy_server_settings(buddy_id);
CREATE INDEX idx_buddy_server_settings_lookup ON buddy_server_settings(buddy_id, server_id);
```

---

## 5. API Design

### 5.1 Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents/:id/permissions` | List permissions for a Buddy |
| POST | `/api/agents/:id/permissions` | Grant permission to a user |
| PATCH | `/api/agents/:id/permissions/:permissionId` | Update permission |
| DELETE | `/api/agents/:id/permissions/:permissionId` | Revoke permission |
| GET | `/api/agents/:id/server-settings` | Get server settings |
| PUT | `/api/agents/:id/server-settings` | Update server settings |
| POST | `/api/agents/:id/server-settings/batch` | Batch update settings across servers |

### 5.2 Permission Endpoints

#### GET /api/agents/:id/permissions

**Query Parameters:**
- `serverId` (optional) — Filter by server
- `channelId` (optional) — Filter by channel
- `userId` (optional) — Filter by user

**Response:**
```json
{
  "permissions": [
    {
      "id": "uuid",
      "buddyId": "uuid",
      "serverId": "uuid",
      "channelId": null,
      "userId": "uuid",
      "user": {
        "id": "uuid",
        "username": "string",
        "displayName": "string",
        "avatarUrl": "string"
      },
      "canView": true,
      "canInteract": true,
      "canMention": true,
      "canManage": false,
      "createdAt": "2025-03-27T00:00:00Z",
      "updatedAt": "2025-03-27T00:00:00Z"
    }
  ]
}
```

#### POST /api/agents/:id/permissions

**Request Body:**
```json
{
  "serverId": "uuid",
  "channelId": "uuid | null",
  "userId": "uuid",
  "canView": true,
  "canInteract": true,
  "canMention": true,
  "canManage": false
}
```

**Response:** 201 Created with the created permission object.

#### PATCH /api/agents/:id/permissions/:permissionId

**Request Body:**
```json
{
  "canView": true,
  "canInteract": false,
  "canMention": true,
  "canManage": false
}
```

#### DELETE /api/agents/:id/permissions/:permissionId

**Response:** 204 No Content

### 5.3 Server Settings Endpoints

#### GET /api/agents/:id/server-settings

**Query Parameters:**
- `serverId` (optional) — Get settings for specific server

**Response:**
```json
{
  "settings": [
    {
      "id": "uuid",
      "buddyId": "uuid",
      "serverId": "uuid",
      "server": {
        "id": "uuid",
        "name": "string",
        "iconUrl": "string"
      },
      "visibility": "private",
      "isPrivate": true,
      "defaultCanView": false,
      "defaultCanInteract": false,
      "defaultCanMention": false,
      "createdAt": "2025-03-27T00:00:00Z",
      "updatedAt": "2025-03-27T00:00:00Z"
    }
  ]
}
```

#### PUT /api/agents/:id/server-settings

**Request Body:**
```json
{
  "serverId": "uuid",
  "visibility": "private",
  "isPrivate": true,
  "defaultCanView": false,
  "defaultCanInteract": false,
  "defaultCanMention": false
}
```

### 5.4 Remote Config Update

The `/api/agents/:id/config` endpoint (used by the OpenClaw plugin) should include permission information:

```json
{
  "agentId": "uuid",
  "botUserId": "uuid",
  "servers": [
    {
      "id": "uuid",
      "name": "string",
      "slug": "string",
      "iconUrl": "string",
      "visibility": "private",
      "allowedUsers": ["uuid-1", "uuid-2"],
      "defaultPolicy": {
        "listen": true,
        "reply": true,
        "mentionOnly": false
      },
      "channels": [
        {
          "id": "uuid",
          "name": "string",
          "type": "text",
          "policy": {
            "listen": true,
            "reply": true,
            "mentionOnly": false
          },
          "allowedUsers": ["uuid-1", "uuid-2"]
        }
      ]
    }
  ]
}
```

---

## 6. WebSocket & Real-time Behavior

### 6.1 Message Filtering

When a Buddy is private, the server must filter messages before delivering them via WebSocket:

```typescript
// Pseudo-code for message delivery
async function shouldDeliverToBuddy(
  buddyId: string,
  serverId: string,
  channelId: string,
  senderId: string
): Promise<boolean> {
  // Get server settings
  const settings = await getBuddyServerSettings(buddyId, serverId)
  
  // If public, allow all
  if (!settings?.isPrivate) return true
  
  // Check if sender is the Buddy owner
  const buddy = await getBuddyById(buddyId)
  if (buddy.ownerId === senderId) return true
  
  // Check channel-level permission
  const channelPerm = await getBuddyPermission(buddyId, serverId, channelId, senderId)
  if (channelPerm) return channelPerm.canInteract
  
  // Check server-level permission
  const serverPerm = await getBuddyPermission(buddyId, serverId, null, senderId)
  if (serverPerm) return serverPerm.canInteract
  
  // No permission found, deny
  return false
}
```

### 6.2 WebSocket Events

New events for permission changes:

| Event | Direction | Description |
|-------|-----------|-------------|
| `buddy:permission:updated` | Server → Client | Notify when permissions change |
| `buddy:visibility:changed` | Server → Client | Notify when visibility changes |
| `buddy:settings:updated` | Server → Client | Notify when server settings change |

### 6.3 Client-side Handling

The web client should:
1. Filter member list to hide private Buddies from unauthorized users
2. Filter message history to hide private Buddy messages
3. Disable mention suggestions for private Buddies
4. Show permission indicators in Buddy profile

---

## 7. UI/UX Design

### 7.1 Buddy Management Page Updates

Add a new "Permissions" tab to the Buddy management page:

```
┌─────────────────────────────────────────────────────────────────┐
│  Buddy Name                              [Status: Running]      │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Token] [Permissions] [Settings]                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Visibility Level                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ○ Public  │  ● Private  │  ○ Restricted (coming soon)  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  When set to Private:                                           │
│  • Only allowed users can see this Buddy                        │
│  • Buddy will only respond to allowed users                     │
│  • Other users won't see the Buddy in member list               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Server: My Server                                      │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ Search users...                                 │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                                  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ 👤 Alice    │  │ 👤 Bob      │  │ 👤 Charlie  │    │   │
│  │  │ ✓ View      │  │ ✓ View      │  │ ✗ No access │    │   │
│  │  │ ✓ Interact  │  │ ✗ Interact  │  │             │    │   │
│  │  │ ✓ Mention   │  │ ✓ Mention   │  │             │    │   │
│  │  │ [Remove]    │  │ [Edit]      │  │ [Add]       │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Save Changes]                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Permission Grant Modal

```
┌─────────────────────────────────────────┐
│  Grant Permission              [×]      │
├─────────────────────────────────────────┤
│                                          │
│  Select User                            │
│  ┌─────────────────────────────────┐   │
│  │ 🔍 Search by username...        │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │ 👤 Alice (@alice)               │   │
│  │ 👤 Bob (@bob)                   │   │
│  │ 👤 Charlie (@charlie)           │   │
│  └─────────────────────────────────┘   │
│                                          │
│  Permissions                            │
│  [✓] Can View (see Buddy in member list)│
│  [✓] Can Interact (Buddy responds)      │
│  [✓] Can Mention (@Buddy)               │
│  [ ] Can Manage (edit settings)         │
│                                          │
│  Scope: [Server-wide ▼]                 │
│         [Channel: #general ▼]           │
│                                          │
│        [Cancel]    [Grant Access]       │
│                                          │
└─────────────────────────────────────────┘
```

### 7.3 Member List Indicators

Private Buddies should show a lock icon to authorized users:

```
Member List
─────────────
👤 Alice
👤 Bob
🔒 🤖 MyBuddy (Private)
👤 Charlie
```

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1)

- [ ] Create database migration for new tables
- [ ] Create DAOs for `buddy_permissions` and `buddy_server_settings`
- [ ] Create service layer for permission management
- [ ] Add permission checking utilities

### Phase 2: API Layer (Week 2)

- [ ] Implement `/api/agents/:id/permissions` endpoints
- [ ] Implement `/api/agents/:id/server-settings` endpoints
- [ ] Update `/api/agents/:id/config` to include permissions
- [ ] Add validation schemas
- [ ] Write unit tests for new endpoints

### Phase 3: WebSocket Integration (Week 3)

- [ ] Implement message filtering in WebSocket gateway
- [ ] Add permission change events
- [ ] Update client message handling
- [ ] Write integration tests

### Phase 4: UI Implementation (Week 4)

- [ ] Add Permissions tab to Buddy management
- [ ] Create permission grant modal
- [ ] Add member list indicators
- [ ] Add permission-related i18n strings
- [ ] Write E2E tests

### Phase 5: Documentation & Release (Week 5)

- [ ] Update API documentation
- [ ] Write user-facing documentation
- [ ] Create migration guide for existing Buddies
- [ ] Deploy to staging
- [ ] QA testing
- [ ] Production release

---

## 9. Security Considerations

### 9.1 Data Access Controls

| Risk | Mitigation |
|------|------------|
| Unauthorized permission modification | Only Buddy owner can modify permissions |
| Permission enumeration | Return 403 for private Buddies to non-allowed users |
| Message leakage | Filter at WebSocket level, not just client |
| Bypass via API | All endpoints check permissions |

### 9.2 Audit Trail

Consider adding an audit log table for permission changes:

```typescript
// Future consideration
export const buddyPermissionAudits = pgTable('buddy_permission_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  buddyId: uuid('buddy_id').notNull(),
  serverId: uuid('server_id').notNull(),
  userId: uuid('user_id'), // Who was affected
  actorId: uuid('actor_id').notNull(), // Who made the change
  action: varchar('action', { length: 50 }).notNull(), // 'grant', 'revoke', 'update'
  changes: jsonb('changes').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

---

## 10. Migration & Backward Compatibility

### 10.1 Default Behavior

All existing Buddies will be treated as **public** by default:

```sql
-- Migration sets is_private = false for all existing Buddies
UPDATE buddy_server_settings SET is_private = false WHERE is_private = true;
```

### 10.2 Graceful Degradation

- Old clients without permission support will see all Buddies as public
- New clients will respect server-side permission settings
- API returns `visibility: "public"` for Buddies without settings

### 10.3 Rollback Plan

If issues arise:
1. Revert database migration (backup tables)
2. Deploy previous API version
3. Clear Redis caches
4. Notify users of temporary feature disablement

### 10.4 Data Migration

```typescript
// One-time migration script
async function migrateExistingBuddies() {
  const allAgents = await db.select().from(agents)
  
  for (const agent of allAgents) {
    // Find all servers this Buddy has joined
    const memberships = await db
      .select()
      .from(members)
      .where(eq(members.userId, agent.userId))
    
    for (const membership of memberships) {
      // Create default public settings
      await db.insert(buddyServerSettings).values({
        buddyId: agent.id,
        serverId: membership.serverId,
        visibility: 'public',
        isPrivate: false,
        defaultCanView: true,
        defaultCanInteract: true,
        defaultCanMention: true,
      })
    }
  }
}
```

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Buddy** | An AI agent in Shadow with its own bot user identity |
| **Owner** | The human user who created and controls a Buddy |
| **Visibility** | Whether a Buddy is public, private, or restricted |
| **Permission** | A specific capability granted to a user (view, interact, mention, manage) |
| **Server Settings** | Per-server configuration for a Buddy's visibility and defaults |
| **Channel Override** | Channel-specific permission settings that override server defaults |

## Appendix B: Related Documents

- [SPEC.md](../../SPEC.md) — Shadow development specification
- [Agent Policies](../../apps/server/src/db/schema/agent-policies.ts) — Existing policy schema
- [OpenClaw Plugin](https://github.com/shadowob/openclaw-shadowob) — Buddy client implementation

---

*End of Document*