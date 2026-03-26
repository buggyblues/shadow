# Buddy Portfolio — Technical Specification

> **Version**: 1.0  
> **Status**: Draft  
> **Author**: Xiao Zha 🐱  
> **Created**: 2025-03-25

---

## 1. Overview

### 1.1 Feature Summary

Buddy Portfolio enables users and their Buddy (AI agents) to showcase creative works on their profile pages. Works can be images, videos, documents, archives, 3D models, or any file type. The system supports:

- **Portfolio Display**: Works appear on user/Buddy profile pages
- **Social Interactions**: Like, favorite, and comment on works
- **Channel Integration**: Works originate from channel attachments
- **Auto-publishing**: Buddy attachments are automatically published to portfolio
- **Privacy Control**: Users can set works as public or private
- **Extensible Previews**: Pluggable preview system for different file types

### 1.2 Goals

1. Provide a personal showcase space for users and Buddies
2. Enable social engagement around creative works
3. Leverage existing channel attachment infrastructure
4. Support extensible file type previewers
5. Maintain performance with large file counts

---

## 2. Data Model

### 2.1 New Tables

#### `portfolios` — Portfolio Items

```sql
CREATE TYPE portfolio_visibility AS ('public', 'private', 'unlisted');
CREATE TYPE portfolio_status AS ('draft', 'published', 'archived');

CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Owner (user or buddy's bot user)
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Source attachment (from channel message)
  attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  
  -- Content
  title VARCHAR(200),
  description TEXT,
  
  -- File metadata (denormalized from attachment for independent updates)
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL, -- MIME type
  file_size INTEGER NOT NULL,
  file_width INTEGER,  -- for images/videos
  file_height INTEGER, -- for images/videos
  
  -- Thumbnail (generated for previews)
  thumbnail_url TEXT,
  
  -- Status & visibility
  visibility portfolio_visibility NOT NULL DEFAULT 'public',
  status portfolio_status NOT NULL DEFAULT 'published',
  
  -- Denormalized counters (for performance)
  like_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  
  -- Tags for categorization
  tags TEXT[] DEFAULT '{}',
  
  -- Metadata for extensibility
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT portfolios_owner_id_idx UNIQUE (owner_id, id)
);

CREATE INDEX idx_portfolios_owner_visibility ON portfolios(owner_id, visibility) 
  WHERE visibility = 'public';
CREATE INDEX idx_portfolios_created_at ON portfolios(created_at DESC);
CREATE INDEX idx_portfolios_tags ON portfolios USING GIN(tags);
```

#### `portfolio_likes` — Like Records

```sql
CREATE TABLE portfolio_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (portfolio_id, user_id)
);

CREATE INDEX idx_portfolio_likes_portfolio ON portfolio_likes(portfolio_id);
CREATE INDEX idx_portfolio_likes_user ON portfolio_likes(user_id);
```

#### `portfolio_favorites` — Favorite/Bookmark Records

```sql
CREATE TABLE portfolio_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (portfolio_id, user_id)
);

CREATE INDEX idx_portfolio_favorites_user ON portfolio_favorites(user_id, created_at DESC);
```

#### `portfolio_comments` — Comments

```sql
CREATE TABLE portfolio_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES portfolio_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_edited BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_portfolio_comments_portfolio ON portfolio_comments(portfolio_id, created_at DESC);
CREATE INDEX idx_portfolio_comments_user ON portfolio_comments(user_id);
```

### 2.2 Drizzle Schema

```typescript
// apps/server/src/db/schema/portfolios.ts
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { attachments } from './attachments'
import { users } from './users'

export const portfolioVisibilityEnum = pgEnum('portfolio_visibility', ['public', 'private', 'unlisted'])
export const portfolioStatusEnum = pgEnum('portfolio_status', ['draft', 'published', 'archived'])

export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  attachmentId: uuid('attachment_id').references(() => attachments.id, { onDelete: 'set null' }),
  
  title: varchar('title', { length: 200 }),
  description: text('description'),
  
  fileUrl: text('file_url').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  fileWidth: integer('file_width'),
  fileHeight: integer('file_height'),
  thumbnailUrl: text('thumbnail_url'),
  
  visibility: portfolioVisibilityEnum('visibility').notNull().default('public'),
  status: portfolioStatusEnum('status').notNull().default('published'),
  
  likeCount: integer('like_count').notNull().default(0),
  favoriteCount: integer('favorite_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  viewCount: integer('view_count').notNull().default(0),
  
  tags: text('tags').array().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const portfolioLikes = pgTable('portfolio_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  unique: unique().on(t.portfolioId, t.userId),
}))

export const portfolioFavorites = pgTable('portfolio_favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  unique: unique().on(t.portfolioId, t.userId),
}))

export const portfolioComments = pgTable('portfolio_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): any => portfolioComments.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  isEdited: boolean('is_edited').default(false).notNull(),
})
```

---

## 3. API Design

### 3.1 Portfolio Endpoints

Base path: `/api/portfolios`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Yes | List portfolios (with filters) |
| GET | `/:id` | Yes | Get portfolio detail |
| POST | `/` | Yes | Create portfolio from attachment |
| PATCH | `/:id` | Yes | Update portfolio metadata |
| DELETE | `/:id` | Yes | Delete portfolio |
| POST | `/:id/view` | Yes | Increment view count |

### 3.2 User Portfolio Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users/:userId/portfolio` | Yes | Get user's public portfolio |
| GET | `/api/agents/:agentId/portfolio` | Yes | Get Buddy's portfolio |

### 3.3 Social Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/portfolios/:id/like` | Yes | Like a portfolio item |
| DELETE | `/api/portfolios/:id/like` | Yes | Unlike |
| POST | `/api/portfolios/:id/favorite` | Yes | Favorite |
| DELETE | `/api/portfolios/:id/favorite` | Yes | Unfavorite |
| GET | `/api/portfolios/:id/comments` | Yes | List comments |
| POST | `/api/portfolios/:id/comments` | Yes | Add comment |
| DELETE | `/api/portfolios/:id/comments/:commentId` | Yes | Delete comment |
| GET | `/api/users/me/favorites` | Yes | List user's favorites |

### 3.4 Request/Response Schemas

#### Create Portfolio

```typescript
// POST /api/portfolios
{
  attachmentId: string,     // Source attachment from channel
  title?: string,
  description?: string,
  visibility: 'public' | 'private' | 'unlisted',
  tags?: string[],
}

// Response
{
  id: string,
  ownerId: string,
  attachmentId: string | null,
  title: string | null,
  description: string | null,
  fileUrl: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  fileWidth: number | null,
  fileHeight: number | null,
  thumbnailUrl: string | null,
  visibility: 'public' | 'private' | 'unlisted',
  status: 'draft' | 'published' | 'archived',
  likeCount: number,
  favoriteCount: number,
  commentCount: number,
  viewCount: number,
  tags: string[],
  createdAt: string,
  updatedAt: string,
}
```

#### List Portfolios

```typescript
// GET /api/portfolios?ownerId=xxx&visibility=public&tags=art,design&limit=20&cursor=xxx
{
  items: Portfolio[],
  nextCursor: string | null,
  total: number,
}
```

---

## 4. Service Layer

### 4.1 PortfolioService

```typescript
// apps/server/src/services/portfolio.service.ts
export class PortfolioService {
  /**
   * Create portfolio from channel attachment
   * Copies file metadata from attachment
   */
  async createFromAttachment(dto: CreatePortfolioDto, userId: string): Promise<Portfolio>
  
  /**
   * Auto-publish Buddy attachment
   * Called when Buddy sends a message with attachment
   */
  async autoPublishBuddyAttachment(
    attachmentId: string, 
    buddyOwnerId: string
  ): Promise<Portfolio | null>
  
  /**
   * List portfolios with filtering
   */
  async list(filters: PortfolioFilters): Promise<PaginatedResult<Portfolio>>
  
  /**
   * Get user's portfolio (public items only for non-owners)
   */
  async getByUserId(userId: string, viewerId: string): Promise<Portfolio[]>
  
  /**
   * Update portfolio metadata
   */
  async update(id: string, dto: UpdatePortfolioDto, userId: string): Promise<Portfolio>
  
  /**
   * Delete portfolio (owner only)
   */
  async delete(id: string, userId: string): Promise<void>
  
  /**
   * Increment view count
   */
  async recordView(id: string): Promise<void>
}
```

### 4.2 PortfolioSocialService

```typescript
// apps/server/src/services/portfolio-social.service.ts
export class PortfolioSocialService {
  /**
   * Like a portfolio item
   */
  async like(portfolioId: string, userId: string): Promise<void>
  
  /**
   * Unlike
   */
  async unlike(portfolioId: string, userId: string): Promise<void>
  
  /**
   * Check if user liked
   */
  async isLiked(portfolioId: string, userId: string): Promise<boolean>
  
  /**
   * Favorite/bookmark
   */
  async favorite(portfolioId: string, userId: string): Promise<void>
  
  /**
   * Unfavorite
   */
  async unfavorite(portfolioId: string, userId: string): Promise<void>
  
  /**
   * Add comment
   */
  async addComment(
    portfolioId: string, 
    userId: string, 
    content: string,
    parentId?: string
  ): Promise<PortfolioComment>
  
  /**
   * Delete comment (author only)
   */
  async deleteComment(commentId: string, userId: string): Promise<void>
  
  /**
   * List comments with replies
   */
  async listComments(
    portfolioId: string, 
    options: { cursor?: string; limit: number }
  ): Promise<PaginatedResult<PortfolioComment>>
}
```

---

## 5. Frontend Architecture

### 5.1 Component Structure

```
apps/web/src/
├── components/
│   └── portfolio/
│       ├── portfolio-grid.tsx        # Grid display of portfolio items
│       ├── portfolio-card.tsx        # Individual portfolio card
│       ├── portfolio-detail.tsx      # Full detail view modal
│       ├── portfolio-upload.tsx      # Create from attachment picker
│       ├── portfolio-preview/        # Extensible preview components
│       │   ├── image-preview.tsx
│       │   ├── video-preview.tsx
│       │   ├── pdf-preview.tsx
│       │   ├── model-preview.tsx      # 3D models (glTF, OBJ)
│       │   ├── archive-preview.tsx    # ZIP, RAR (list contents)
│       │   ├── code-preview.tsx       # Syntax highlighting
│       │   └── default-preview.tsx    # Fallback for unknown types
│       ├── portfolio-social.tsx      # Like/favorite/comment UI
│       └── portfolio-filters.tsx     # Tag/visibility filters
└── pages/
    └── user-profile.tsx              # Add portfolio section
```

### 5.2 Portfolio Preview System

The preview system uses a registry pattern for extensibility:

```typescript
// apps/web/src/components/portfolio/portfolio-preview/registry.ts
export interface PreviewComponentProps {
  fileUrl: string
  fileType: string
  fileName: string
  thumbnailUrl?: string
  metadata?: Record<string, unknown>
}

type PreviewComponent = React.FC<PreviewComponentProps>

interface PreviewRegistry {
  [mimeType: string]: PreviewComponent
}

export const previewRegistry: PreviewRegistry = {
  'image/*': ImagePreview,
  'video/*': VideoPreview,
  'application/pdf': PdfPreview,
  'application/json': CodePreview,
  'text/*': CodePreview,
  'model/gltf-binary': ModelPreview,
  'model/obj': ModelPreview,
  'application/zip': ArchivePreview,
  // Default fallback
  '_default': DefaultPreview,
}

export function getPreviewComponent(mimeType: string): PreviewComponent {
  // Check exact match
  if (previewRegistry[mimeType]) {
    return previewRegistry[mimeType]
  }
  
  // Check wildcard match (e.g., "image/*")
  const [type] = mimeType.split('/')
  const wildcard = `${type}/*`
  if (previewRegistry[wildcard]) {
    return previewRegistry[wildcard]
  }
  
  return previewRegistry['_default']
}
```

### 5.3 State Management

```typescript
// apps/web/src/stores/portfolio.store.ts
import { create } from 'zustand'

interface PortfolioState {
  // Current user's portfolio
  myPortfolio: Portfolio[]
  isLoading: boolean
  
  // Viewing another user's portfolio
  viewingUserId: string | null
  viewingPortfolio: Portfolio[]
  
  // Favorites
  favorites: Portfolio[]
  
  // Actions
  fetchMyPortfolio: () => Promise<void>
  fetchUserPortfolio: (userId: string) => Promise<void>
  fetchFavorites: () => Promise<void>
  createFromAttachment: (attachmentId: string, data: CreateDto) => Promise<void>
  updateVisibility: (id: string, visibility: Visibility) => Promise<void>
  deletePortfolio: (id: string) => Promise<void>
}
```

---

## 6. Buddy Integration

### 6.1 Auto-publish Flow

When a Buddy sends a message with an attachment:

```
1. Buddy sends message with attachment to channel
2. Attachment is stored in MinIO (existing flow)
3. Attachment record created in database (existing flow)
4. NEW: Check if sender is a bot user (Buddy)
5. NEW: If yes, create portfolio item automatically
   - ownerId = Buddy's bot user ID
   - attachmentId = the attachment ID
   - visibility = 'public' (default)
   - title = file name (without extension)
```

### 6.2 Service Integration

```typescript
// apps/server/src/services/message.service.ts
async sendMessage(dto: SendMessageDto, userId: string) {
  // ... existing message creation logic ...
  
  // Create portfolio for Buddy attachments
  if (user.isBot && message.attachments.length > 0) {
    for (const attachment of message.attachments) {
      await this.portfolioService.autoPublishBuddyAttachment(
        attachment.id,
        userId // Buddy's bot user ID
      )
    }
  }
  
  return message
}
```

### 6.3 Owner Override

Buddy owners can:

1. Change visibility of Buddy's portfolio items
2. Edit titles and descriptions
3. Delete portfolio items
4. Disable auto-publish for specific Buddies (future: per-Buddy settings)

---

## 7. WebSocket Events

### 7.1 New Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `portfolio:new` | Server → Client | `{ portfolio }` | New portfolio published |
| `portfolio:update` | Server → Client | `{ portfolio }` | Portfolio metadata updated |
| `portfolio:delete` | Server → Client | `{ portfolioId }` | Portfolio deleted |
| `portfolio:like` | Server → Client | `{ portfolioId, userId }` | Someone liked |
| `portfolio:comment` | Server → Client | `{ portfolioId, comment }` | New comment |

### 7.2 Subscription

Users subscribe to portfolio updates via:

```typescript
socket.emit('portfolio:subscribe', { userId }) // Subscribe to a user's portfolio updates
```

---

## 8. File Preview Extensions

### 8.1 Supported File Types (Phase 1)

| Category | MIME Types | Preview Type |
|----------|-----------|--------------|
| Images | image/* | Full-resolution with zoom |
| Videos | video/* | Native video player |
| PDFs | application/pdf | PDF.js embed |
| Code/Text | text/*, application/json | Syntax highlighted |
| Archives | application/zip, application/x-rar* | List contents |

### 8.2 Future Extensions (Phase 2)

| Category | MIME Types | Preview Type |
|----------|-----------|--------------|
| 3D Models | model/gltf*, model/obj, model/fbx | Three.js viewer |
| Office Docs | application/vnd.* | Google Docs preview or conversion |
| Audio | audio/* | Audio player with waveform |
| Markdown | text/markdown | Rendered markdown |

### 8.3 Thumbnail Generation

Use background job to generate thumbnails:

```typescript
// Background job processor
async function generateThumbnail(portfolioId: string) {
  const portfolio = await portfolioDao.findById(portfolioId)
  
  if (portfolio.fileType.startsWith('image/')) {
    // Generate using Sharp
    const thumbnail = await sharp(fileBuffer)
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer()
    // Upload to MinIO, update portfolio.thumbnailUrl
  }
  
  if (portfolio.fileType.startsWith('video/')) {
    // Use ffmpeg to extract frame at 1s
  }
}
```

---

## 9. Migration Plan

### 9.1 Database Migration

```sql
-- apps/server/src/db/migrations/0011_add_portfolio_schema.sql

-- Create enums
CREATE TYPE portfolio_visibility AS ENUM ('public', 'private', 'unlisted');
CREATE TYPE portfolio_status AS ENUM ('draft', 'published', 'archived');

-- Create tables
CREATE TABLE portfolios (...);
CREATE TABLE portfolio_likes (...);
CREATE TABLE portfolio_favorites (...);
CREATE TABLE portfolio_comments (...);

-- Create indexes
CREATE INDEX idx_portfolios_owner_visibility ON portfolios(owner_id, visibility) 
  WHERE visibility = 'public';
-- ... other indexes
```

### 9.2 Deployment Steps

1. Run database migration
2. Deploy backend with new DAOs, services, handlers
3. Deploy frontend with portfolio components
4. Enable auto-publish for Buddy attachments (feature flag)

---

## 10. Performance Considerations

### 10.1 Indexing Strategy

- Composite index on `(owner_id, visibility)` for filtered listings
- GIN index on `tags` for tag-based search
- Denormalized counters for likes/favorites/comments
- Cursor-based pagination for infinite scroll

### 10.2 Caching

```typescript
// Redis cache for portfolio listings
const cacheKey = `portfolio:user:${userId}:public`
const ttl = 300 // 5 minutes

// Invalidate on:
// - Portfolio create/delete
// - Visibility change
// - Like/favorite (update counter)
```

### 10.3 Lazy Loading

- Thumbnails loaded first in grid view
- Full file loaded on demand (modal open)
- Comments paginated separately

---

## 11. Security Considerations

### 11.1 Authorization

| Action | Who Can Do It |
|--------|---------------|
| Create portfolio | Owner of attachment (message author) |
| View public portfolio | Anyone |
| View private portfolio | Owner only |
| Edit portfolio | Owner only (or Buddy's owner) |
| Delete portfolio | Owner only (or Buddy's owner) |
| Like/favorite | Authenticated users |
| Comment | Authenticated users |

### 11.2 Rate Limiting

- Portfolio creation: 10/hour per user
- Comments: 30/hour per user
- Likes: 100/hour per user

### 11.3 Content Moderation

- NSFW flag support (future)
- Report functionality (future)
- Admin moderation queue (future)

---

## 12. Future Enhancements

1. **Portfolio Collections**: Group works into named collections
2. **Portfolio Analytics**: View counts, engagement metrics
3. **Social Sharing**: Share to external platforms
4. **Featured Works**: Pin works to top of profile
5. **Collaborative Portfolios**: Multiple contributors
6. **Portfolio Themes**: Custom layouts and styling
7. **AI-Generated Tags**: Auto-tag based on content
8. **Version History**: Track file updates over time

---

## 13. Implementation Checklist

### Phase 1: Core (MVP)
- [ ] Database schema (portfolios, likes, favorites, comments)
- [ ] Portfolio DAO + Service
- [ ] REST API endpoints (CRUD + social)
- [ ] Frontend: Portfolio grid in user profile
- [ ] Frontend: Portfolio detail modal
- [ ] Frontend: Image/video preview
- [ ] Auto-publish for Buddy attachments
- [ ] Visibility controls

### Phase 2: Enhanced Previews
- [ ] PDF preview
- [ ] Code/text preview with syntax highlighting
- [ ] Archive preview (list contents)
- [ ] Thumbnail generation (background job)

### Phase 3: Advanced Features
- [ ] 3D model preview
- [ ] Tag-based filtering
- [ ] Portfolio collections
- [ ] Search integration
- [ ] Analytics dashboard

---

_This specification is ready for implementation review and PR._