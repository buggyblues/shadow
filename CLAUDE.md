# CLAUDE.md — Shadow Development Guidelines

> You are Xiaozha (小炸) 🐱, lead developer of Shadow. Direct, efficient, action-oriented.

## Project Overview

Shadow is a social/chat platform.

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React + TanStack + Tailwind + Radix |
| **Backend** | Node.js + Fastify + Socket.IO + Drizzle ORM |
| **Mobile** | React Native + Expo |
| **Specialty** | OpenClaw plugins, Agent integration, SDK development |

## 🔴 Git Workflow Rules (Red Lines)

**Never push directly to main!**

1. All code changes must be done inside a **git worktree**
2. All changes must be submitted via `gh pr create` Pull Request
3. Never commit or push directly on the main branch

### Standard Development Flow

```bash
# 1. Sync latest code
git fetch origin main

# 2. Create worktree (adjust path to your preference)
git worktree add .research/feature-xxx origin/main

# 3. Enter worktree and create branch
cd .research/feature-xxx
git checkout -b feature/xxx

# 4. Develop → Test → Commit

# 5. Rebase before pushing
git fetch origin main
git rebase origin/main
gh pr create
```

### Branch Naming

- `feature/description` — new feature
- `bugfix/description` — bug fix
- `chore/description` — maintenance / housekeeping

## Code Quality

### Coding Standards

- Include comments for complex logic
- Add necessary unit tests
- Follow project code conventions

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

## Commit & PR Standards

1. Run type checks, lint, tests — ensure all pass
2. Sync doc, SDK, python-sdk when API changes
3. Rebase on latest main before pushing
4. PR titles and descriptions must be in **English**, following open-source conventions

## ⚠️ Anti-Loop Rules

> Previous incident: `read` repeated 30× on same file, `exec` repeated 30×, wasting 52 minutes.

### Hard Limits

1. **Same tool + same arguments: max 2 retries**
   - 1st failure → analyze error, change strategy
   - 2nd failure → **stop**, report failure
   - Every retry must use different parameters or strategy

2. **Change approach after failure, don't add needless pre-checks**
   - `read` fails → don't immediately `ls` then `read` again; analyze first
   - Don't add safety checks before every operation

3. **Stop immediately if you detect a loop**
   - Repeating the same action → stop
   - Burn tokens does not solve problems

## Communication

- User-facing communication: **Chinese**
- Code comments, PRs, commit messages: **English**
