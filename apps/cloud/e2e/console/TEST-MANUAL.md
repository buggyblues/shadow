# Shadow Cloud Console — Test Manual

## Overview

The Shadow Cloud Console has **three layers of test coverage**:

| Layer         | Count | Runner      | Config                 | Command                    |
|---------------|-------|-------------|------------------------|----------------------------|
| Unit Tests    | 231   | Vitest      | `vitest.config.ts`     | `pnpm vitest run`          |
| CLI E2E Tests | —     | Vitest      | `vitest.cli.config.ts` | `pnpm test:e2e:cli`        |
| Console E2E   | 52    | Playwright  | `playwright.config.ts` | `pnpm test:e2e:console`    |

---

## Quick Start

```bash
cd apps/cloud

# 1. Build (required for E2E)
pnpm build

# 2. Run unit tests
pnpm vitest run

# 3. Run console E2E tests
pnpm test:e2e:console

# 4. Run console E2E with interactive UI
pnpm test:e2e:console:ui
```

---

## E2E Test Architecture

### Global Setup (`e2e/global-setup.ts`)

The Playwright global setup automatically:

1. **Builds** the CLI (`dist/index.js`) and console (`dist/console/`) if not already built
2. **Starts** `shadowob-cloud serve` on port **4749** — serves both the API and the SPA
3. **Injects stub API keys** (ANTHROPIC, OPENAI, DEEPSEEK, etc.) so deploys don't need real credentials
4. **Sets `XCLOUD_OUTPUT_DIR`** so deploys write K8s manifests to a temp dir instead of calling `kubectl`
5. **Waits** for `/api/health` to respond before running tests
6. **Persists PIDs** to `.playwright-pids.json` for teardown

### Global Teardown (`e2e/global-teardown.ts`)

Kills the serve process and cleans up the manifest temp dir.

---

## Console E2E Test Specs

### `e2e/console.spec.ts` — Core Navigation & Pages (50 tests)

#### API Health (9 tests)
Direct HTTP checks against the serve port to verify the backend is operating correctly.

| Test | Endpoint | Validates |
|------|----------|-----------|
| GET /api/health | `GET /api/health` | Returns `{ status: "ok" }` |
| GET /api/doctor | `GET /api/doctor` | Returns checks array + summary |
| GET /api/templates | `GET /api/templates` | ≥5 templates returned |
| GET /api/runtimes | `GET /api/runtimes` | Non-empty runtime list |
| GET /api/images | `GET /api/images` | Non-empty image list |
| GET /api/settings | `GET /api/settings` | Returns truthy settings object |
| GET /api/plugins | `GET /api/plugins` | Returns truthy response |
| GET /api/deployments | `GET /api/deployments` | Returns array |
| GET /api/activity | `GET /api/activity` | Returns activity data |

#### Console → Overview (5 tests)
| Test | Validates |
|------|-----------|
| page loads without errors | h1 "Shadow Cloud Console" visible |
| shows stat cards | Deployments + Templates stat cards in main |
| shows quick action cards | Quick Actions section with 4 cards |
| quick action links navigate | Click "Agent Store" → navigates to `/store` |
| shows system health section | "System Health" section visible |

#### Console → Doctor (4 tests)
| Test | Validates |
|------|-----------|
| page loads and shows check results | h1 "System Health" + "Passing" visible |
| shows summary cards with counts | Passing, Warnings, Failed cards |
| re-check button triggers refresh | Click Re-check → results still visible |
| displays individual check items | At least node.js check appears |

#### Console → Settings (6 tests)
| Test | Validates |
|------|-----------|
| page loads with Providers tab | h1 "Settings" + Providers button |
| shows all tabs | Providers, Plugins, System, About tabs |
| Plugins tab shows plugin list | Switch to Plugins → shows plugin count |
| System tab shows status info | Switch to System → "API Status" visible |
| About tab shows app info | Switch to About → "Shadow Cloud" text |
| Add provider shows dropdown | Click "+ Add provider" → dropdown appears |

#### Console → Images (3 tests)
| Test | Validates |
|------|-----------|
| page loads and shows images | h1 "Images" + "Total images" count |
| shows image count stats | Total images + With Dockerfile stats |
| refresh button works | Click Refresh → data reloads |

#### Console → Runtimes (3 tests)
| Test | Validates |
|------|-----------|
| page loads and shows runtimes | h1 "Runtimes" + count visible |
| shows runtime cards | Cards with runtime names |
| refresh button works | Click Refresh → data reloads |

#### Console → Activity (3 tests)
| Test | Validates |
|------|-----------|
| page loads | h1 "Activity Log" visible |
| shows content | Activity list or empty state |
| search input is present | Search input with placeholder |

#### Console → Clusters (3 tests)
| Test | Validates |
|------|-----------|
| page loads | h1 "Cluster Management" visible |
| shows empty state or stats | Zero deployments or empty state |
| Deploy New links to store | Click "Deploy New" → navigates to `/store` |

#### Console → Config Editor (3 tests)
| Test | Validates |
|------|-----------|
| page loads | h1 "Config Editor" visible |
| shows editor state | Editor or warning banner visible |
| action buttons are present | Load template, Validate buttons |

#### Console → Validate (3 tests)
| Test | Validates |
|------|-----------|
| page loads with textarea | h1 + textarea with placeholder |
| validate button exists | "Validate" button visible |
| validates valid JSON config | Fetches real template → pastes → validates → shows result |

#### Console → Monitoring (5 tests)
| Test | Validates |
|------|-----------|
| page loads | h1 "Monitoring" visible |
| shows stat cards | Health Score in main area |
| tabs are present | Health Checks tab button |
| health checks tab shows results | Health Score data loaded |
| deployments tab works | Switch tab → shows table or empty state |

#### Sidebar Navigation (3 tests)
| Test | Validates |
|------|-----------|
| sidebar shows all main sections | Console Home, Agent Store, Clusters, Configuration, Monitoring |
| sidebar system section expands | Click SYSTEM → Images, Runtimes, Settings, Doctor appear |
| all sidebar links navigate correctly | Each sidebar link navigates to correct URL |

---

### `e2e/templates.spec.ts` — Store Page (5 tests)

| Test | Validates |
|------|-----------|
| page loads and shows template cards | ≥7 cards visible |
| each expected template card is present | All 7 templates have cards with name substring |
| cards show agent count badge | "N agents" badge on each card |
| clicking Deploy opens the deploy modal | Deploy button → modal appears, Escape closes |
| solopreneur-pack Deploy modal shows config | Modal shows correct template config |

---

### `e2e/deploy-pipeline.spec.ts` — Full Deploy Pipeline (20 tests)

Tests the end-to-end deploy pipeline through both the API and the dashboard UI.

**solopreneur-pack (4 tests):**
| Test | Validates |
|------|-----------|
| serve GET /api/templates lists all templates | API returns ≥7 templates |
| serve GET /api/templates/solopreneur-pack returns full config | Config shape: version, deployments, registry |
| dashboard renders solopreneur-pack card | React renders card from real API data |
| clicking Deploy triggers full CLI pipeline | POST /api/deploy → SSE stream → manifests written to disk |

**Per-template API tests (6 templates × 2 tests = 12):**
For devops-team, code-review-team, customer-support-team, metrics-team, security-team, research-team:

| Test | Validates |
|------|-----------|
| POST /api/deploy generates valid manifests | Real CLI runs, K8s manifests written, expected agent present |
| dashboard shows card with correct agent count | Template card + agent count badge visible |

---

## Manual Test Procedure

For features that can't be fully automated (require real K8s):

### 1. Provider Configuration
```
1. Navigate to Settings → Providers tab
2. Click "+ Add provider"
3. Select "DeepSeek" from dropdown
4. Enter API key
5. Click "Save settings"
6. Verify key is saved (page reload still shows it, masked)
```

### 2. Deploy Wizard (with K8s)
```
1. Navigate to Agent Store
2. Click any template card (e.g., solopreneur-pack)
3. Click "Deploy Template" on detail page
4. Step through wizard:
   a. Review template → Next
   b. Configure namespace → Next
   c. Add provider API keys → Next
   d. Click Deploy
5. Verify:
   - Log lines stream in real-time
   - Progress indicator updates
   - On success: "Deployment complete" message
   - On failure: Error message with details
6. Navigate to Clusters → verify deployment appears
```

### 3. Cluster Management (with K8s)
```
1. After deploying, navigate to Clusters
2. Verify namespace card appears with deployment rows
3. Test scale controls (+/- buttons)
4. Click deployment name → verify detail page
5. Check Pods tab for pod status
6. Check Logs tab for streaming output
7. Test destroy (click trash icon → confirm)
```

### 4. Config Editor Flow
```
1. Navigate to Configuration
2. Click "Load template" → config populates
3. Edit JSON in editor
4. Click "Format" → JSON reformatted
5. Click "Validate" → validation result appears
6. Click "Save" → config written to disk
```

---

## Running Individual Tests

```bash
# Run a specific test file
npx playwright test e2e/console.spec.ts

# Run tests matching a pattern
npx playwright test -g "Doctor"

# Run with headed browser (visible)
npx playwright test --headed

# Run with debug mode
npx playwright test --debug

# Run with Playwright UI mode
pnpm test:e2e:console:ui
```

---

## CI Integration

The tests are designed for CI:
- `fullyParallel: false` — tests run sequentially for reliability
- `retries: 1` on CI — single retry for flaky tests
- Traces and screenshots captured on failure
- HTML report written to `playwright-report/`
- Test artifacts in `test-results/`

```yaml
# Example CI step
- run: cd apps/cloud && pnpm build
- run: cd apps/cloud && pnpm test:e2e:console
```
