# Code Review: Buddy Permissions System

**Review Date**: 2025-03-27  
**Reviewer**: 小炸  
**Scope**: Architecture, DRY Principles, Code Quality

---

## Executive Summary

Overall the implementation is solid with good separation of concerns. However, there are several areas where we can improve **DRY compliance**, **reduce code duplication**, and **enhance architectural consistency**.

| Aspect | Rating | Notes |
|--------|--------|-------|
| Architecture | ⭐⭐⭐⭐ | Good layering, follows project patterns |
| DRY Principles | ⭐⭐⭐ | Significant duplication in permission checks |
| Type Safety | ⭐⭐⭐⭐⭐ | Proper TypeScript usage |
| Error Handling | ⭐⭐⭐⭐ | Consistent with project patterns |
| Performance | ⭐⭐⭐ | N+1 queries in enrichment |

---

## 🔴 Critical Issues

### 1. Severe DRY Violation: Permission Check Methods

**File**: `apps/server/src/services/buddy-permission.service.ts`  
**Lines**: 35-120

**Problem**: The four permission check methods (`canView`, `canInteract`, `canMention`, `canManage`) share **90% identical code**.

```typescript
// Current - 4 nearly identical methods
async canView(buddyId, serverId, userId, channelId) {
  const settings = await this.deps.buddyPermissionDao.findServerSettings(...)
  if (!settings || !settings.isPrivate) return true
  const buddy = await this.deps.agentDao.findById(buddyId)
  if (buddy?.ownerId === userId) return true
  const permission = await this.deps.buddyPermissionDao.findEffectivePermission(...)
  return permission ? permission.canView : settings.defaultCanView
}

async canInteract(buddyId, serverId, userId, channelId) {
  // ... identical structure, only changes: canInteract vs canView
}

async canMention(...) { /* ... */ }
async canManage(...) { /* ... */ }
```

**Impact**: 
- Maintenance burden: 4x the code to update
- Bug risk: Fix in one place, miss in others
- Inconsistency risk: Logic drift over time

**Recommended Fix**:

```typescript
// Single generic method
private async checkPermission<K extends keyof PermissionFlags>(
  buddyId: string,
  serverId: string,
  userId: string,
  channelId: string | null | undefined,
  permissionKey: K,
  defaultValue: boolean = true
): Promise<boolean> {
  const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)
  
  if (!settings || !settings.isPrivate) return true
  
  const buddy = await this.deps.agentDao.findById(buddyId)
  if (buddy?.ownerId === userId) return true
  
  const permission = await this.deps.buddyPermissionDao.findEffectivePermission(
    buddyId, serverId, channelId, userId
  )
  
  return permission ? permission[permissionKey] : settings[`default${capitalize(permissionKey)}`]
}

// Public methods become one-liners
async canView(...args) { return this.checkPermission(...args, 'canView') }
async canInteract(...args) { return this.checkPermission(...args, 'canInteract') }
async canMention(...args) { return this.checkPermission(...args, 'canMention') }
async canManage(...args) { return this.checkPermission(...args, 'canManage', false) }
```

---

## 🟡 Medium Issues

### 2. N+1 Query Problem in `getPermissionsWithUsers`

**File**: `apps/server/src/services/buddy-permission.service.ts`  
**Lines**: 280-320

**Problem**: 
```typescript
const enriched = await Promise.all(
  permissions.map(async (perm) => {
    const user = await this.deps.userDao.findById(perm.userId) // N queries!
    return { ...perm, user }
  })
)
```

**Impact**: Performance degrades linearly with permission count.

**Recommended Fix**:
```typescript
// Collect unique user IDs first
const userIds = [...new Set(permissions.map(p => p.userId))]
const users = await this.deps.userDao.findByIds(userIds) // Batch query
const userMap = new Map(users.map(u => [u.id, u]))

// Then map without additional queries
return permissions.map(perm => ({
  ...perm,
  user: userMap.get(perm.userId) ?? null
}))
```

### 3. Duplicate Ownership Verification

**File**: `apps/server/src/services/buddy-permission.service.ts`  
**Lines**: 165, 195, 225, 295

**Problem**: Same ownership check pattern repeated 4 times:
```typescript
const buddy = await this.deps.agentDao.findById(buddyId)
if (!buddy) throw Object.assign(new Error('Buddy not found'), { status: 404 })
if (buddy.ownerId !== ownerId) throw Object.assign(new Error('Not the owner'), { status: 403 })
```

**Recommended Fix**:
```typescript
private async verifyOwnership(buddyId: string, ownerId: string): Promise<void> {
  const buddy = await this.deps.agentDao.findById(buddyId)
  if (!buddy) throw Object.assign(new Error('Buddy not found'), { status: 404 })
  if (buddy.ownerId !== ownerId) {
    throw Object.assign(new Error('Not the owner of this Buddy'), { status: 403 })
  }
}

async grantPermission(ownerId, data) {
  await this.verifyOwnership(data.buddyId, ownerId)
  // ... rest of method
}
```

### 4. Handler Route Pattern Inconsistency

**File**: `apps/server/src/handlers/buddy-permission.handler.ts`

**Problem**: Routes are mounted at `/api/agents/:id/*` but handler also defines `/:id/*`, causing double path segment.

```typescript
// In app.ts
app.route('/api/agents', createBuddyPermissionHandler(container))

// In handler
createBuddyPermissionHandler(container) {
  handler.get('/:id/permissions', ...) // Results in /api/agents/:id/permissions
  // This is correct, but the pattern differs from other handlers
}
```

**Note**: This actually works due to Hono's route mounting, but it's inconsistent with other handlers that use absolute paths.

### 5. Missing Transaction Support

**File**: `apps/server/src/services/buddy-permission.service.ts`

**Problem**: Operations that should be atomic (e.g., updating settings + logging) are not wrapped in transactions.

**Recommended Fix**: Consider adding transaction support for multi-step operations.

---

## 🟢 Minor Issues

### 6. Type Definition Duplication

**File**: `apps/web/src/components/buddy/permissions-panel.tsx`  
**Lines**: 8-50

**Problem**: Type definitions are inline and duplicated from server types.

**Recommended Fix**: Use shared types from `@shadowob/shared` package.

```typescript
// Instead of:
interface BuddyPermission { ... }

// Use:
import type { BuddyPermission, BuddyServerSettings } from '@shadowob/shared'
```

### 7. Hardcoded Query Keys

**File**: `apps/web/src/components/buddy/permissions-panel.tsx`

**Problem**: TanStack Query keys are hardcoded strings:
```typescript
queryKey: ['buddy-server-settings', buddyId, selectedServerId]
```

**Recommended Fix**: Use a query key factory pattern:
```typescript
const buddyKeys = {
  settings: (buddyId: string, serverId: string) => ['buddy', 'settings', buddyId, serverId],
  permissions: (buddyId: string, serverId: string) => ['buddy', 'permissions', buddyId, serverId],
}
```

### 8. Magic Numbers

**File**: `apps/web/src/components/buddy/permissions-panel.tsx`

**Problem**: `searchQuery.length >= 2` is a magic number.

**Recommended Fix**: Extract to constant:
```typescript
const MIN_SEARCH_LENGTH = 2
```

### 9. Missing Loading States in UI

**File**: `apps/web/src/components/buddy/permissions-panel.tsx`

**Problem**: Some mutations don't show loading states in UI.

---

## ✅ Positive Findings

### 1. Good Separation of Concerns
- DAO handles database operations
- Service handles business logic
- Handler handles HTTP concerns

### 2. Consistent Error Handling
Uses the project's standard error pattern:
```typescript
throw Object.assign(new Error('...'), { status: XXX })
```

### 3. Proper Validation
Uses Zod schemas for input validation.

### 4. Comprehensive Documentation
Design document is thorough and well-structured.

### 5. Backward Compatibility
Default behavior maintains existing functionality.

---

## 📋 Recommended Refactoring Priority

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | DRY violation in permission checks | Medium | High |
| P1 | N+1 query in getPermissionsWithUsers | Low | Medium |
| P1 | Duplicate ownership verification | Low | Medium |
| P2 | Type definition duplication | Low | Low |
| P2 | Hardcoded query keys | Low | Low |
| P3 | Magic numbers | Very Low | Low |

---

## 🛠️ Suggested Refactoring Implementation

### Step 1: Extract Permission Check Base Method

```typescript
// In buddy-permission.service.ts

// Add type for permission keys
type PermissionKey = 'canView' | 'canInteract' | 'canMention' | 'canManage'
type DefaultPermissionKey = 'defaultCanView' | 'defaultCanInteract' | 'defaultCanMention'

// Map permission to default
const PERMISSION_DEFAULT_MAP: Record<PermissionKey, DefaultPermissionKey> = {
  canView: 'defaultCanView',
  canInteract: 'defaultCanInteract',
  canMention: 'defaultCanMention',
  canManage: 'defaultCanMention', // Note: no defaultCanManage in schema
}

// Private generic check method
private async checkPermission(
  buddyId: string,
  serverId: string,
  userId: string,
  channelId: string | null | undefined,
  permissionKey: PermissionKey,
  defaultForPublic: boolean = true
): Promise<boolean> {
  const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)

  // Public mode: allow all
  if (!settings || !settings.isPrivate) return defaultForPublic

  // Owner has all permissions
  const buddy = await this.deps.agentDao.findById(buddyId)
  if (buddy?.ownerId === userId) return true

  // Check explicit permission
  const permission = await this.deps.buddyPermissionDao.findEffectivePermission(
    buddyId, serverId, channelId, userId
  )

  if (permission) return permission[permissionKey]

  // Fall back to defaults (manage defaults to false)
  if (permissionKey === 'canManage') return false
  
  const defaultKey = PERMISSION_DEFAULT_MAP[permissionKey]
  return settings[defaultKey] ?? defaultForPublic
}

// Public methods become simple wrappers
async canView(...args: CheckPermissionArgs) {
  return this.checkPermission(...args, 'canView')
}

async canInteract(...args: CheckPermissionArgs) {
  return this.checkPermission(...args, 'canInteract')
}

async canMention(...args: CheckPermissionArgs) {
  return this.checkPermission(...args, 'canMention')
}

async canManage(...args: CheckPermissionArgs) {
  return this.checkPermission(...args, 'canManage', false)
}
```

### Step 2: Extract Ownership Verification

```typescript
// In buddy-permission.service.ts

private async verifyOwnership(buddyId: string, ownerId: string): Promise<Agent> {
  const buddy = await this.deps.agentDao.findById(buddyId)
  
  if (!buddy) {
    throw Object.assign(new Error('Buddy not found'), { status: 404 })
  }
  
  if (buddy.ownerId !== ownerId) {
    throw Object.assign(new Error('Not the owner of this Buddy'), { status: 403 })
  }
  
  return buddy
}

// Usage in methods
async grantPermission(ownerId: string, data: GrantPermissionData) {
  await this.verifyOwnership(data.buddyId, ownerId)
  
  if (data.userId === ownerId) {
    throw Object.assign(new Error('Cannot grant permissions to yourself'), { status: 400 })
  }
  
  // ... rest of implementation
}
```

### Step 3: Fix N+1 Query

```typescript
// In buddy-permission.service.ts

async getPermissionsWithUsers(
  buddyId: string,
  filters?: PermissionFilters
): Promise<EnrichedPermission[]> {
  let permissions = await this.deps.buddyPermissionDao.findByBuddyId(buddyId)

  // Apply filters
  if (filters?.serverId) {
    permissions = permissions.filter(p => p.serverId === filters.serverId)
  }
  if (filters?.channelId !== undefined) {
    permissions = permissions.filter(p => 
      (filters.channelId === null && p.channelId === null) ||
      p.channelId === filters.channelId
    )
  }
  if (filters?.userId) {
    permissions = permissions.filter(p => p.userId === filters.userId)
  }

  // Batch fetch users
  const uniqueUserIds = [...new Set(permissions.map(p => p.userId))]
  const users = await this.deps.userDao.findByIds(uniqueUserIds)
  const userMap = new Map(users.map(u => [u.id, u]))

  // Enrich without additional queries
  return permissions.map(perm => {
    const user = userMap.get(perm.userId)
    return {
      ...perm,
      user: user ? {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      } : null,
    }
  })
}
```

---

## 📝 Final Notes

The implementation is **functionally correct** and follows the project's architectural patterns. The main areas for improvement are:

1. **DRY violations** in the service layer - these should be addressed before merging
2. **Performance** - N+1 query should be fixed for production
3. **Code organization** - minor refactoring for maintainability

The PR is **approved with suggestions** - the critical DRY violations should be fixed, but the rest can be addressed in follow-up PRs.

---

*Review completed by 小炸*