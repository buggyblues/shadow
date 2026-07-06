# AGENTS.md

## Code Quality

### Formatting & Linting

- Use **Biome** for linting and formatting.
- Do **not** use Prettier in this repository.
- Do not run Biome checks on every change; run `pnpm biome format --write <files...>` (or project scripts) when you are ready to submit a PR.
- Do not use browser modal APIs `window.alert`, `window.confirm`, or `window.prompt`.

### Test Requirements

| Change Type | Test Requirements |
|-------------|-------------------|
| New API / core code | Integration tests + Unit tests |
| New product feature | E2E is optional and should be decided based on product feature stability and criticality |

### Git Workflow

- Do not push directly to the `main` branch.
- Before opening a PR, fix lint issues and typing issues in the change using:
  - `pnpm lint`
  - `pnpm typecheck`
- Write a clear PR title and detailed PR description.
- Open PRs using `gh` (for example `gh pr create`), not another method.
- Do not run lint/typing checks locally for PR validation; run remote `prchecks` only.
- Check PR checks in remote CI using `gh pr checks` and resolve failures there.

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
