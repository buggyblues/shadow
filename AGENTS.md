# AGENTS.md — Shadow Project

> This file supplements the global `~/.Codex/AGENTS.md` with Shadow-specific rules.

## Project Overview

Shadow is a social/chat platform.

## Code Quality

### Test Requirements

| Change Type | Test Requirements |
|-------------|-------------------|
| New API / core code | Integration tests + Unit tests |
| New product feature | E2E tests |

### Running Tests

- All tests run via **docker-compose**
- Use project-specific config files
- **Ensure CI results match local results**

### Feature Development

- **New features must be implemented on both web and mobile**
- Ensure consistent behavior across both platforms

## API Change Sync

When updating the API, **always sync**:

1. **API Documentation** — update endpoint docs
2. **TypeScript SDK** — sync types and interfaces
3. **Python SDK** — sync Python SDK

## 🔤 i18n Requirements

**Any UI copy changes on web, mobile, or website must go through i18n.**

- Never hardcode user-facing text in components
- All copy must use the project's i18n system (translation keys)
- Applies to: buttons, labels, placeholders, error messages, tooltips, notifications, page titles, etc.
- If i18n keys don't exist for the target language, add them with proper translations

## Anti-Loop Rules

> Previous incident: `read` repeated 30× on same file, `exec` repeated 30×, wasting 52 minutes.

1. **Same tool + same arguments: max 2 retries**
2. Change approach after failure, don't add needless pre-checks
3. Stop immediately if you detect a loop
