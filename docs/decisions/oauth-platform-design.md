# OAuth Open Platform Design Decision

> **Decision ID**: DEC-001
> **Decision Date**: 2026-03-29
> **Status**: Approved
> **Decision Maker**: Peng Mao
> **Recorder**: Xiao Zha

---

## 1. Background

Shadow (虾豆) aims to enable third-party service providers to access user accounts through OAuth authorization. Target providers include news, gaming, and creative services that need to:

- Establish connections with the community
- Create servers or invite users to join servers after authorization
- Push messages to channels and interact with users

The existing OAuth implementation supports basic Authorization Code Flow, but scope is limited to `user:read` and `user:email`. This decision document defines the expansion into a full open platform.

---

## 2. Decision Summary

| Decision Item | Decision |
|---------------|----------|
| Scope Expansion | Expand to servers, channels, messages, attachments, workspaces, and Buddy |
| Token Strategy | Keep Opaque Token (no JWT migration) |
| PKCE Support | Phase 1: Not supported (service providers are server-side apps using client_secret) |
| Developer Portal | Required; Phase 1 includes App management, authorization stats, API docs |
| Provider Onboarding | Self-registration; review mechanism can be added later |
| Enterprise Features | Phase 1: Not needed; extensibility reserved |
| Scope Validation | Middleware-based unified validation + route-declared scopes |
| Buddy Design | Buddy = Agent + User; associated with OAuth App sub-accounts |

---

## 3. Scope Design

### 3.1 Scope List

| Scope | Description | Resource |
|-------|-------------|----------|
| `user:read` | Read basic user information | User |
| `user:email` | Read user email (requires user:read) | User |
| `servers:read` | Read user's server list | Server |
| `servers:write` | Create servers, invite users to join servers | Server |
| `channels:read` | Read server channel list | Channel |
| `channels:write` | Create channels | Channel |
| `messages:read` | Read channel message history | Message |
| `messages:write` | Send messages to channels | Message |
| `attachments:read` | Read attachment information | Attachment |
| `attachments:write` | Upload attachments | Attachment |
| `workspaces:read` | Read workspace information | Workspace |
| `workspaces:write` | Create/modify workspace nodes | Workspace |
| `buddies:create` | Create Buddy Bot | Buddy (Agent + User) |
| `buddies:manage` | Manage Buddy (send messages, configure, etc.) | Buddy |

### 3.2 Scope Groups (for authorization page display)

| Group | Included Scopes | Description |
|-------|-----------------|-------------|
| **User Info** | `user:read`, `user:email` | Basic identity information |
| **Servers** | `servers:read`, `servers:write` | Server management and invitations |
| **Channels & Messages** | `channels:read`, `channels:write`, `messages:read`, `messages:write` | Content interaction |
| **Attachments** | `attachments:read`, `attachments:write` | File uploads |
| **Workspaces** | `workspaces:read`, `workspaces:write` | Project file management |
| **Buddy** | `buddies:create`, `buddies:manage` | Bot creation and management |

### 3.3 Scope Validation Mechanism

Middleware-based unified validation + route-declared scopes:

```typescript
// Middleware implementation example
export function oauthScopeMiddleware(requiredScopes: string[]) {
  return async (c: Context, next: Next) => {
    const token = c.get('oauthToken') // from authMiddleware
    const grantedScopes = token.scope.split(' ')
    
    const hasAllScopes = requiredScopes.every(s => grantedScopes.includes(s))
    if (!hasAllScopes) {
      return c.json({ error: 'insufficient_scope', required: requiredScopes }, 403)
    }
    
    await next()
  }
}

// Route definition example
oauthHandler.get('/servers', 
  oauthAuthMiddleware,           // OAuth token validation
  oauthScopeMiddleware(['servers:read']),
  async (c) => { ... }
)
```

---

## 4. Buddy Design

### 4.1 Buddy Definition

Buddy is a virtual Bot created by service providers with dual identity:
- **User Identity**: User record in `users` table with `isBot = true`, can join servers and channels
- **Agent Identity**: Agent record in `agents` table, can execute AI tasks

### 4.2 Data Model Extensions

New fields to associate Buddy with OAuth App:

```sql
-- users table extension
ALTER TABLE users ADD COLUMN oauth_app_id UUID REFERENCES oauth_apps(id);
ALTER TABLE users ADD COLUMN parent_user_id UUID REFERENCES users(id); -- parent account for sub-account

-- agents table extension
ALTER TABLE agents ADD COLUMN oauth_app_id UUID REFERENCES oauth_apps(id);
ALTER TABLE agents ADD COLUMN buddy_user_id UUID REFERENCES users(id); -- Buddy's associated User
```

### 4.3 Buddy Creation Flow

```
OAuth App (Service Provider)
    ↓ creates sub-account
Sub-account (users, isBot=true, oauth_app_id=app.id)
    ↓ creates Buddy
Buddy Agent (agents, buddy_user_id=sub-account.id, oauth_app_id=app.id)
```

### 4.4 Buddy Capabilities

- Controlled by OAuth App to send messages (via `messages:write` scope)
- Join servers and channels (as a regular user)
- Optional: Execute AI tasks (Agent capabilities)

---

## 5. Token Strategy

### 5.1 Decision: Keep Opaque Token

Phase 1 maintains the current Opaque Token strategy, no JWT migration.

| Token Type | Format | Storage | Expiration |
|------------|--------|----------|------------|
| Access Token | `oat_xxx` | SHA-256 hash in database | 1 hour |
| Refresh Token | `ort_xxx` | SHA-256 hash in database | 30 days |

### 5.2 Future Extensions

If stateless validation or high-volume API calls are needed later:
- JWT Access Token (15min) + Opaque Refresh Token
- Redis blacklist for instant revocation

---

## 6. Developer Portal

### 6.1 Phase 1 Feature Scope

| Module | Content |
|--------|---------|
| **OAuth App Management** | Create, edit, delete App; view Client ID; reset Secret (shown once at creation) |
| **Authorization Stats** | Authorized user list; authorization stats by date |
| **API Docs** | OAuth integration guide; Scope descriptions; SDK usage examples; Error codes |

### 6.2 Portal Location

Under API docs page in `website`:
- `/docs/api/oauth` - API documentation
- `/docs/api/oauth/apps` - App management (requires login)

### 6.3 Reserved Extensions

- App review entry (disabled initially)
- Advanced stats (API call volume, error rate, response time)
- Webhook configuration

---

## 7. Service Provider Onboarding

### 7.1 Phase 1: Self-Registration

```
1. Service provider developer registers Shadow account
2. Access developer portal, create OAuth App
3. Configure redirect_uri, select scopes
4. Immediately obtain Client ID/Secret, start integration
```

### 7.2 Future Extension: Sensitive Scope Review

For sensitive scopes (e.g., large-scale `servers:write` invitations):
- Application review process
- Usage monitoring
- Violation penalty mechanism

---

## 8. API Endpoint Design

### 8.1 OAuth Provider Endpoints (existing + extensions)

| Endpoint | Method | Description | Scope |
|----------|--------|-------------|-------|
| `/api/oauth/apps` | POST | Create OAuth App | Login required |
| `/api/oauth/apps` | GET | List my Apps | Login required |
| `/api/oauth/apps/:id` | PATCH | Update App | Login required |
| `/api/oauth/apps/:id` | DELETE | Delete App | Login required |
| `/api/oauth/apps/:id/reset-secret` | POST | Reset Secret | Login required |
| `/oauth/authorize` | GET | Authorization page | Login required |
| `/api/oauth/authorize` | POST | User approves authorization | Login required |
| `/api/oauth/token` | POST | Exchange Token | Public |
| `/api/oauth/userinfo` | GET | User information | `user:read` |

### 8.2 OAuth API Endpoints (new)

| Endpoint | Method | Description | Scope |
|----------|--------|-------------|-------|
| `/api/oauth/servers` | GET | User's server list | `servers:read` |
| `/api/oauth/servers` | POST | Create server | `servers:write` |
| `/api/oauth/servers/:id/invite` | POST | Invite user to join | `servers:write` |
| `/api/oauth/servers/:id/channels` | GET | Channel list | `channels:read` |
| `/api/oauth/channels` | POST | Create channel | `channels:write` |
| `/api/oauth/channels/:id/messages` | GET | Message history | `messages:read` |
| `/api/oauth/channels/:id/messages` | POST | Send message | `messages:write` |
| `/api/oauth/attachments` | POST | Upload attachment | `attachments:write` |
| `/api/oauth/workspaces/:id` | GET | Workspace info | `workspaces:read` |
| `/api/oauth/buddies` | POST | Create Buddy | `buddies:create` |
| `/api/oauth/buddies/:id/messages` | POST | Buddy send message | `buddies:manage` |

---

## 9. Implementation Plan

### 9.1 Phase 1: Scope Expansion

- Expand scope definitions and validation
- Add OAuth API endpoints (servers, channels, messages)
- Update `@shadowob/oauth` SDK

### 9.2 Phase 2: Buddy Support

- Data model extensions (users, agents tables)
- Buddy creation API
- Buddy message sending API

### 9.3 Phase 3: Developer Portal

- OAuth App management page
- Authorization stats page
- API documentation page

---

## 10. Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider abuses invitation feature | Mass spam invitations | Monitor invitation volume, set thresholds, anomaly alerts |
| Buddy abuses message push | Channel flooded with spam | Message rate limits, users can block Buddy |
| OAuth App Secret leaked | Security risk | Secret shown only once, reset supported, IP whitelist (reserved) |

---

## 11. Appendix

### 11.1 Existing OAuth Implementation

See `docs/oauth.md` and:
- `packages/oauth/` - OAuth SDK
- `apps/server/src/services/oauth.service.ts` - OAuth service
- `apps/server/src/handlers/oauth.handler.ts` - OAuth handler
- `apps/server/src/db/schema/oauth.ts` - Data models

### 11.2 References

- OAuth 2.0 Specification: https://oauth.net/2/
- Discord OAuth Design: https://discord.com/developers/docs/topics/oauth2
- Slack OAuth Design: https://api.slack.com/docs/oauth

---

_Document recorded by Xiao Zha, confirmed by Peng Mao._