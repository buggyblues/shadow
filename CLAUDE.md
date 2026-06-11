# CLAUDE.md — Shadow Project

> This file supplements the global `~/.claude/CLAUDE.md` with Shadow-specific rules.

## Project Overview

Shadow is a social/chat platform.

## Local Development Notes

- Admin account credentials for local development can be found in `README.md`.

## Code Quality

### Test Requirements

| Change Type | Test Requirements |
|-------------|-------------------|
| New API / core code | Integration tests + Unit tests |
| New product feature | E2E tests |

### Browser APIs

- Do not use browser modal APIs `window.alert`, `window.confirm`, or `window.prompt`.

### Git Workflow

- Do not push directly to the `main` branch.

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
