# AGENTS.md — Shadow Project

> This file supplements the global `~/.Codex/AGENTS.md` with Shadow-specific rules.

## Project Overview

Shadow is a social/chat platform.

## Code Quality

### Formatting & Linting

- Use **Biome** for linting and formatting.
- Do **not** use Prettier in this repository.
- Format changed files with `pnpm biome format --write <files...>` or the project scripts that invoke Biome.

### Test Requirements

| Change Type | Test Requirements |
|-------------|-------------------|
| New API / core code | Integration tests + Unit tests |
| New product feature | E2E tests |

### Running Tests

- All tests run via **docker-compose**
- Use project-specific config files
- **Ensure CI results match local results**

### Command Output Hygiene

Long-running infrastructure commands can flood the model context. Prefer quiet,
focused command output by default, and only expand logs when diagnosing a failure.

- For successful `pnpm build`, `docker build`, `docker compose`, `kind`, and
  `kubectl` commands, report the exit status and the few important lines only.
  Do not stream full successful build output into the conversation.
- When using Codex terminal tools, set a small `max_output_tokens` for noisy
  commands. Increase it only after a command fails and the extra output is needed.
- For Docker Compose logs, always scope by service and time/line count, for
  example `docker compose logs server --tail=120` or
  `docker compose logs server --since=5m`. Pipe through `rg` when checking for a
  known error, request id, command name, or marker.
- For Kubernetes inspection, prefer compact queries before full YAML:
  `kubectl get pod -o wide`, `kubectl get ... -o jsonpath=...`, or
  `kubectl get ... -o custom-columns=...`. Use `kubectl describe` or full
  `-o yaml` only when events/spec paths are actually needed.
- For `kubectl logs`, always pass `--tail`, `--since`, and `-c <container>` when
  the pod has multiple containers. Avoid dumping unbounded logs.
- For long builds where the raw output may matter later, redirect the full log to
  `.tmp/codex-logs/` and show only the tail or filtered failure summary in the
  conversation.
- If a command appears hung with no output, check process/container status with a
  compact command before retrying or replacing the command. Do not keep polling a
  silent process indefinitely.

### Feature Development

- **New features must be implemented on both web and mobile**
- Ensure consistent behavior across both platforms
- Consumer product surfaces must use the shared **Glass Panel** primitives for page-level sections and major panels. Child cards should reuse the relevant domain card component/variant instead of becoming separate Glass Panels by default.

### Commerce Experience Work

- Commerce work is accepted by user-story flow, not by isolated component completion. Before finishing, manually validate each affected commerce user story in the browser against the running app.
- If a browser path fails because the frontend, API, SDK contract, permissions, or data model is incomplete, complete the missing capability before reporting the story as done.
- Do not add seed code to make commerce pages look populated. Use the local/test environment through browser actions or explicit API setup, and keep any created records as ordinary test data.
- For buyer-facing commerce surfaces, use consumer language and show the concrete buying context: provider, shop, server when relevant, delivery result, validity, refund/support rule, credit, and asset-home links.
- Personal shops, server shops, Buddy cards, wallet purchases, product pages, and discovery must reuse the same commerce model: products, offers, orders, entitlements, fulfillment, settlement, and reviews.

## API Change Sync

When updating the API, **always sync**:

1. **API Documentation** — update endpoint docs
2. **TypeScript SDK** — sync types and interfaces
3. **Python SDK** — sync Python SDK

## Security Architecture Requirements

### Actor / Policy Model

- Treat authentication and authorization as separate concerns.
- Auth middleware must populate an explicit `Actor` (`user`, `pat`, `oauth`, `agent`, or `system`).
- Sensitive service methods must accept an `Actor` or call `PolicyService`; do not rely only on handler-level `if` checks.
- Every new route, websocket event, or worker job must identify:
  - actor kind
  - resource type/id
  - action (`read`, `write`, `manage`, `delete`, `deploy`, `bill`, `generate`)
  - required scope/capability
  - data class (`public`, `server-private`, `channel-private`, `financial`, `secret`, `cloud-secret`, etc.)
- Resource authorization must combine scope/capability **and** resource access. OAuth/PAT scope alone is not enough.

### Security Boundaries

- Wallet credits must not be exposed to ordinary user routes. Use verified payment webhooks, refunds, settlements, task rewards, or admin grants.
- All wallet balance mutations must flow through `LedgerService`; direct `walletDao.credit`, `walletDao.debit`, or `walletDao.updateBalance` calls outside the ledger boundary are blocked by `pnpm check:security-pr`.
- Media downloads must stay behind application authorization; never reintroduce public MinIO bucket policies or nginx `/shadow/` direct proxying.
- Cloud/AI/provider URLs must use SSRF guards and must not follow redirects into private/local networks.
- Cloud runtime env must reject reserved key collisions; never inject full user tokens such as `SHADOW_USER_TOKEN` into workloads.
- DIY/Cloud templates generated by AI or submitted by users must be revalidated server-side with the Cloud template policy allowlist before storage or deployment.
- JSON or AI-generated config inputs need explicit byte/depth/key/array limits before downstream processing.
- AI generation endpoints need capability checks, rate/budget controls, token estimates, and audit entries before model calls.
- Secrets and provision state must be redacted/scanned before logging or persistence.
- Production containers should run as non-root, and web security headers such as CSP must not be removed without an explicit security review.

### Security Tooling

- Run `pnpm check:security-pr` for security-sensitive changes.
- Security PR checks and Semgrep rules are part of CI; update them when adding new security invariants.
- Prefer mature, maintained third-party security libraries/tools for parsing, validation, scanning, cryptography, SSRF/IP classification, and static analysis. Do not hand-roll security primitives unless there is a clear reason and tests cover the edge cases.
- Before opening a security PR, run focused typechecks/tests locally, push the branch, then verify remote PR checks rather than assuming local and CI are equivalent.

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
