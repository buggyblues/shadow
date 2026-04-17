# Config Management Platform — Design Decision

**Date**: 2026-04-17  
**Status**: Proposed  
**Author**: Engineering

---

## 1. Background & Problem

Website homepage content (play cards, category metadata, topic collections) is currently hardcoded in `website/components/HomeContent.tsx`. Every copy/content change requires a code deployment. Additionally, there is no unified solution for Feature Flags across the stack. As the product scales, non-technical operators need a way to manage content and flags without code changes.

---

## 2. Goals

- Replace hardcoded website homepage content with a remote configuration system
- Provide a generic, schema-driven config management UI in `apps/admin`
- Support Feature Flags (simple on/off per environment)
- All clients (website, web app, mobile, server) consume config via HTTP API
- Support versioning and rollback per config type per environment
- Config editable by both developers and operators

---

## 3. Out of Scope (for this iteration)

- Role-based access control (all admin users have equal permissions)
- A/B testing or percentage rollout for feature flags
- Per-tenant / per-user config differentiation
- Real-time push (WebSocket); pull-based is sufficient

---

## 4. Open-Source Library Research

### JSON Schema Form Rendering

| Library | Stars | Pros | Cons |
|---|---|---|---|
| **react-jsonschema-form (RJSF)** | ~14k | Standard JSON Schema compliance, all field types supported, array reorder, nested objects, custom widgets, many UI adapters (antd/shadcn/mui) | UI customization requires widget overrides |
| **Formily** (Alibaba) | ~11k | Very powerful, reactive, great for complex forms | Proprietary DSL on top of JSON Schema, steep learning curve |
| **JSON Forms** (Eclipse) | ~3k | Framework-agnostic, good React support | Smaller community, less array UX |
| **uniforms** | ~2k | Multiple schema formats | Limited complex nested/array UX |

**Decision: Use `@rjsf/core` + `@rjsf/antd` (or project's existing UI lib adapter).**  
Rationale: RJSF is the most battle-tested, has native `ui:orderable` for array reordering, supports all required field types, and is fully JSON Schema standard compliant — which aligns with the schema-in-DB approach.

For missing widgets (Rich Text, Image Upload), RJSF supports custom widget injection cleanly.

---

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    apps/admin                           │
│  ┌─────────────────┐  ┌──────────────────────────────┐ │
│  │  Schema Manager  │  │   Config Value Editor        │ │
│  │  (upload/edit    │  │   (RJSF form generated from  │ │
│  │   JSON Schema)   │  │    schema, multi-lang tabs,  │ │
│  └─────────────────┘  │    image upload, versioning) │ │
│                        └──────────────────────────────┘ │
│  ┌──────────────────────────────┐                       │
│  │    Feature Flag Manager      │                       │
│  │    (key/desc + env toggles)  │                       │
│  └──────────────────────────────┘                       │
└─────────────────────────────────────────────────────────┘
                         │ REST API
┌─────────────────────────────────────────────────────────┐
│                    apps/server                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Config API (admin routes + public routes)          ││
│  │  Redis TTL cache (5 min default, flush on publish)  ││
│  └─────────────────────────────────────────────────────┘│
│                         │                               │
│              PostgreSQL (Drizzle ORM)                   │
└─────────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    website           web app          mobile
  (HTTP GET)        (HTTP GET)       (HTTP GET)
```

---

## 6. Data Model

### `config_schemas`

```sql
CREATE TABLE config_schemas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,          -- e.g. "homepage-plays"
  display_name TEXT NOT NULL,
  description TEXT,
  json_schema JSONB NOT NULL,               -- JSON Schema definition
  ui_schema   JSONB NOT NULL DEFAULT '{}',  -- RJSF UISchema (widget overrides)
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

### `config_values`

```sql
CREATE TABLE config_values (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id    UUID REFERENCES config_schemas(id) ON DELETE CASCADE,
  environment  TEXT NOT NULL CHECK (environment IN ('dev', 'staging', 'prod')),
  version      INTEGER NOT NULL,                     -- auto-increment per schema+env
  data         JSONB NOT NULL,                        -- actual config payload
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),

  UNIQUE (schema_id, environment, version)
);
```

### `feature_flags`

```sql
CREATE TABLE feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,                  -- e.g. "enable-new-onboarding"
  description TEXT,
  envs        JSONB NOT NULL DEFAULT '{"dev":false,"staging":false,"prod":false}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## 7. API Design

### Admin APIs (authenticated)

```
# Schema CRUD
GET     /admin/api/config/schemas
POST    /admin/api/config/schemas
GET     /admin/api/config/schemas/:id
PUT     /admin/api/config/schemas/:id
DELETE  /admin/api/config/schemas/:id

# Config value management
GET     /admin/api/config/values/:schemaName?env=prod        → latest draft + published version
POST    /admin/api/config/values/:schemaName?env=prod        → save new draft (auto-increment version)
POST    /admin/api/config/values/:schemaName/publish?env=prod → publish latest version
GET     /admin/api/config/values/:schemaName/history?env=prod → list all versions
POST    /admin/api/config/values/:schemaName/rollback?env=prod&version=3 → re-publish old version

# Feature flags
GET     /admin/api/config/flags
POST    /admin/api/config/flags
PUT     /admin/api/config/flags/:id
DELETE  /admin/api/config/flags/:id
```

### Public APIs (no auth required, cached)

```
GET  /api/v1/config/:schemaName?env=prod   → returns published config data (JSON)
GET  /api/v1/config/flags?env=prod         → returns { flagKey: boolean, ... }
```

Cache: Redis with 5-minute TTL. On publish, the corresponding cache key is invalidated immediately.

---

## 8. Admin UI — Feature Breakdown

### 8.1 Schema Manager
- List all registered schemas (name, display_name, last updated)
- Create: upload or paste JSON Schema + optional UISchema
- Edit schema (with warning if live config exists)
- Preview: live RJSF form preview in split panel

### 8.2 Config Value Editor
- Tabs for environments (dev / staging / prod)
- RJSF form generated from the schema
- **i18n**: tabs inside the editor for language variants (e.g. zh-CN / en) — the schema defines locale fields as an optional wrapper object or via RJSF `ui:field` convention
- Version badge (e.g. "v5 — draft" / "v4 — live")
- Save Draft → Publish buttons
- Version history drawer: list all versions, diff view (JSON diff), one-click rollback

### 8.3 Feature Flag Manager
- Table: key | description | dev | staging | prod
- Toggle switches per environment
- Inline create/edit
- Bulk export as JSON (for SDK bootstrapping)

### 8.4 Custom RJSF Widgets
| Widget | Field type |
|---|---|
| `ImageUploadWidget` | `"format": "image-url"` — uploads to internal image service, stores URL |
| `RichTextWidget` | `"format": "markdown"` — TipTap or @uiw/react-md-editor |
| `SortableArrayField` | Override default array field — drag-and-drop via @dnd-kit |
| `MapField` | `"type": "object", "additionalProperties": true` — dynamic key-value pairs |

---

## 9. Client Integration

### Website / Web / Desktop

```ts
// packages/sdk (TypeScript SDK)
import { getConfig, getFlags } from '@shadow/sdk'

const plays = await getConfig<Play[]>('homepage-plays', { env: 'prod' })
const flags = await getFlags({ env: 'prod' })
```

SDK caches the response in memory for the session. The server already caches in Redis.

### Server-side

Same SDK, or direct HTTP call with `env` from process environment.

---

## 10. Migration Plan

1. Export existing hardcoded data in `HomeContent.tsx` as JSON → `homepage-plays.json`, `homepage-topics.json`
2. Write JSON Schema files for each → `homepage-plays.schema.json`
3. Register schemas in admin
4. Import JSON data as initial config value via admin's JSON import feature
5. Replace `HomeContent.tsx` hardcoded arrays with `getConfig()` calls
6. Remove hardcoded data

---

## 11. Implementation Phases

### Phase 1 — Foundation (DB + API)
- DB tables: `config_schemas`, `config_values`, `feature_flags`
- REST endpoints for admin CRUD and public GET
- Redis caching with invalidation on publish

### Phase 2 — Admin UI
- Schema manager (list, create, edit, preview)
- Config value editor (RJSF form, env tabs, save/publish)
- Feature flag manager table

### Phase 3 — Custom Widgets & i18n
- `ImageUploadWidget`, `RichTextWidget`, `SortableArrayField`, `MapField`
- i18n tab switcher in config editor

### Phase 4 — Version History & Migration
- Version history drawer with JSON diff
- Rollback
- Migrate `HomeContent.tsx` content

### Phase 5 — SDK Integration
- `getConfig()` / `getFlags()` in TypeScript SDK
- Website + web app wired up

---

## 12. Key Dependencies to Add

```
apps/admin:
  @rjsf/core
  @rjsf/utils
  @rjsf/validator-ajv8
  @rjsf/antd (or equivalent for project UI lib)
  @dnd-kit/core @dnd-kit/sortable      ← array drag-and-drop
  @uiw/react-md-editor                  ← markdown widget
  react-diff-viewer-continued           ← version diff

apps/server:
  (no new deps — uses existing drizzle + redis)
```

---

## 13. Rejected Alternatives

| Alternative | Reason rejected |
|---|---|
| **Flagsmith / Unleash** (managed feature flag SaaS) | External dependency, doesn't cover content config, overkill for simple on/off |
| **Contentful / Sanity** (headless CMS) | External SaaS, cost, not integrated with internal image service, no schema-first approach |
| **Formily** | Proprietary schema DSL diverges from standard JSON Schema; harder to onboard new devs |
| **MongoDB** for config storage | Project already on PostgreSQL; JSONB is sufficient for config payloads |
