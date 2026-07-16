# Shadow Cloud — Runtime Behavior Baseline

> **Spec:** 12-runtime-behavior-baseline
> **Version:** 1.1-draft
> **Date:** 2026-06-27

This document records the current runtime adapter behavior and the lightweight
smoke tests that verify it. It exists so execution-unit work can use a stable
baseline instead of re-researching every runtime on each change.

---

## 1. Runtime Adapter Contract

Every runtime registers one `RuntimeAdapter` from `apps/cloud/src/runtimes/*`.

```typescript
interface RuntimeAdapter {
  id: AgentRuntime
  name: string
  runtimeKind: 'openclaw' | 'cc-connect' | 'hermes'
  defaultImage: string
  container: RuntimeContainerSpec
  buildPackage(context: RuntimePackageBuildContext): RuntimePackageBuildResult
}
```

Current `buildPackage` input is one logical `AgentDeployment`.

Execution-unit work must not overload this single-agent contract. The shared
runner implementation should add an execution-unit builder that can call or
reuse adapter internals while preserving the existing single-agent adapter path.

Stable adapter invariants:

- `runtimeKind` selects the runtime package family and container layout.
- `container.healthPort` drives probes and Service target ports.
- `container.homeDir` is `/home/shadow` and is the state PVC mount point.
- `container.statePath` is the runtime's state subdirectory under the durable
  runner home, not the PVC mount point.
- `configData` is safe for ConfigMap storage and must not contain raw secrets.
- `plainEnv` is safe for Pod env.
- `secretData` is written to a Kubernetes Secret.
- `runtime-files.json` materializes runtime files inside the container.
- `runtime-extensions.json` is emitted only when plugin runtime extensions are
  present.

---

## 2. Runtime Matrix

| Agent runtime | Runtime kind | Native config artifact | PVC mount | Runtime state path | Shadow binding behavior | Shared runner status |
| --- | --- | --- | --- | --- | --- | --- |
| `openclaw` | `openclaw` | `config.json` | `/home/shadow` | `/home/shadow/.openclaw` | OpenClaw `channels.shadowob.accounts` plus `bindings[]` route by logical `agentId`. | Implemented for shared execution units: one config with multiple `agents.list[]` entries and distinct `agentDir` paths. |
| `claude-code` | `cc-connect` | `cc-connect-config.toml` plus Claude settings and MCP files | `/home/shadow` | `/home/shadow/.cc-connect` plus native CLI home state such as `/home/shadow/.claude` | cc-connect `projects[]` model. Each logical agent is one project; each project can carry one or more Shadow platforms. | Implemented for shared execution units through multi-project packaging. |
| `codex` | `cc-connect` | `cc-connect-config.toml` plus Codex TOML files | `/home/shadow` | `/home/shadow/.cc-connect` plus `/home/shadow/.codex` | Same cc-connect project/platform behavior. | Implemented for shared execution units through multi-project packaging. |
| `opencode` | `cc-connect` | `cc-connect-config.toml` plus `opencode.json` | `/home/shadow` | `/home/shadow/.cc-connect` plus OpenCode XDG state under `/home/shadow/.config` and `/home/shadow/.local/share` | Same cc-connect project/platform behavior. | Implemented for shared execution units through multi-project packaging. |
| `hermes` | `hermes` | `/home/shadow/.hermes/config.yaml` or `/home/shadow/.hermes/profiles/<agent>/config.yaml` | `/home/shadow` | `/home/shadow/.hermes` | One Hermes profile per logical agent in a shared unit; each profile has its own Shadow token env reference. | Implemented for shared execution units through profile/gateway launch metadata and entrypoint multi-process startup. |

Implication: first-version shared execution units must cover OpenClaw,
cc-connect-family runtimes, and Hermes. The package strategy differs by runtime
kind:

- OpenClaw: one gateway config with multiple `agents.list[]` entries.
- cc-connect: one config with multiple `[[projects]]` entries.
- Hermes: one sandbox with multiple Hermes profiles/gateways, each profile
  owning its own config, env, memory, skills, sessions, and gateway state.

---

## 3. Shadow Binding Baseline

The Shadow plugin currently builds runtime state per logical agent:

- Config fragments filter `bindings[]` with `binding.agentId === context.agent.id`.
- Runtime extensions build `shadowob.accounts[]` for the same filtered bindings.
- `addShadowobCliAuth` can render multiple auth profiles if the merged runtime
  extension contains multiple accounts.

For shared OpenClaw, the correct approach is:

1. Run the plugin pipeline per logical agent.
2. Preserve each binding's original `agentId`.
3. Merge Shadow accounts by `buddyId`.
4. Merge route bindings without rewriting them to the execution-unit ID.

Do not build a shared runner by calling the Shadow plugin once with an execution
unit as if it were a logical agent. That would drop per-agent Buddy routing.

---

## 4. Identity and Runtime Files

Current single-agent behavior:

- OpenClaw builder collects `instructions` into ConfigMap keys such as
  `SOUL.md`, `IDENTITY.md`, and `AGENTS.md`.
- Native runners use `buildIdentityWorkspaceFiles(agent)` to write
  `/workspace/SOUL.md`, `/workspace/IDENTITY.md`, and `/workspace/AGENTS.md`.
- Common Shadow skills are mounted under `/workspace/.agents/skills/...`.
- Runtime-specific skill mirrors are mounted for Claude, Codex, OpenCode,
  OpenClaw, and Hermes.

Shared-runner rule:

- Never merge several logical identities into one global `SOUL.md`.
- Each shared logical agent must get its own directory:

```text
/workspace/.agents/<agentId>/IDENTITY.md
/workspace/.agents/<agentId>/SOUL.md
/workspace/.agents/<agentId>/AGENTS.md
```

OpenClaw supports this through `agents.list[].agentDir`.

cc-connect and Hermes have native multi-agent concepts and Cloud now packages
them through runtime-kind specific shared execution units:

- cc-connect-family runtimes compile each logical agent into one project with
  project-scoped work dirs, platform bindings, and runtime files.
- Hermes compiles each logical agent into one profile with isolated config,
  identity, skills, sessions, memory, gateway state, and launch metadata.

OpenClaw, cc-connect, and Hermes are all P0 shared-runtime targets. A future
runtime must not be marked shared-compatible until its adapter has the same
package-level tests and smoke notes.

---

## 5. Env, Secret, and Config Separation

Current package smoke verifies:

- vault/provider credentials go to `secretData`
- token-like values go to `secretData`
- public env goes to `plainEnv`
- runtime configs reference secrets by env placeholders
- serialized `configData` does not contain raw token values

Execution-unit package generation must keep the same separation after merging
multiple logical agents. Any env conflict in a shared unit must be rejected
unless the values are identical and the plugin/runtime contract says the key is
unit-scoped.

Provisioning has a separate lifecycle boundary:

- agent-scoped provisioning hooks run once per logical agent and their shared
  `secrets` are injected only into that logical agent.
- deployment-scoped provisioning hooks run once for the resolved deployment.
  They must return `agentSecrets` when credentials differ by logical agent.
- `shadowob` is deployment-scoped because it provisions shared Shadow servers,
  channels, Buddies, commerce, and Space Apps. It then emits per-agent runtime
  env through `agentSecrets`, so isolated agents do not receive unrelated Buddy
  tokens and shared execution-unit Secrets are the union of the relevant
  per-agent keys.
- A deployment-scoped plugin must not rely on being called once per agent for
  deduplication. The provision state is the deployment-level durability boundary.

---

## 6. Container and PVC Baseline

Runtime container specs are defined in `apps/cloud/src/runtimes/container.ts`.

All phase-1 runner Pods mount the state PVC at `/home/shadow`. This whole
runner home is the durable boundary. Runtime-specific `statePath` values are
subdirectories inside that mounted home.

| Runtime kind | Health port | PVC mount | Runtime state path | Log path |
| --- | --- | --- | --- | --- |
| `openclaw` | `3102` | `/home/shadow` | `/home/shadow/.openclaw` | `/var/log/openclaw` |
| `cc-connect` | `3100` | `/home/shadow` | `/home/shadow/.cc-connect` | `/var/log/shadowob` |
| `hermes` | `3100` | `/home/shadow` | `/home/shadow/.hermes` | `/var/log/shadowob` |

Persistent runner-home contract:

- `PATH` starts with `/home/shadow/.local/bin`.
- npm global prefix is `/home/shadow/.local`; npm cache is
  `/home/shadow/.cache/npm`.
- pip userbase is `/home/shadow/.local`; pip cache is
  `/home/shadow/.cache/pip`.
- XDG paths are under `/home/shadow`: `.config`, `.cache`, `.local/share`, and
  `.local/state`.
- `apt` and `apt-get` are non-root shims that unpack CLI-style Debian packages
  into `/home/shadow/.shadow-tools/apt` and create wrappers in
  `/home/shadow/.local/bin`.
- `SHADOWOB_RUNNER_PERSISTENT_DIRS`,
  `SHADOWOB_RUNNER_EPHEMERAL_DIRS`, and `SHADOWOB_RUNNER_TEMP_DIR` expose the
  boundary to users, tools, and diagnostics.

Ephemeral paths are `/tmp`, `/workspace/.agents`, and runner log directories.
They may be recreated on restart and must not hold auth state or user-installed
tools.

Because `/home/shadow` is a PVC mount, any file that must exist at startup
cannot rely only on Dockerfile writes into home. It must be materialized by the
entrypoint from ConfigMap/Secret data or copied from an immutable image path
such as `/opt/...`.

State PVC names must use:

```typescript
runtimeStatePvcName(unitId) === `shadow-runner-state-${unitId}`
```

Server-side lifecycle and backup code must use the same resolver. Historical
fallbacks may support `openclaw-data-${agentId}`, but new deployments must not
create or expect that prefix.

---

## 7. Smoke Test Baseline

Last verified locally on 2026-06-10.

### Runtime adapter package smoke

Command:

```bash
rtk pnpm --filter @shadowob/cloud exec vitest run src/infra/runtime-package.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       17 passed (17)
```

What it verifies:

- OpenClaw emits native `config.json` and Shadow channel wiring.
- Claude Code, Codex, and OpenCode emit cc-connect native packages without
  OpenClaw artifacts.
- Hermes emits native Hermes config without OpenClaw or cc-connect artifacts.
- native runners receive Shadow skills and slash command metadata.
- official model proxy config is injected for supported native runners.
- OpenClaw preserves multiple Shadow accounts and route bindings for one
  logical agent.
- cc-connect-family runtimes preserve multiple Shadow accounts as multiple
  `projects[].platforms[]` entries for one project.
- Single Hermes logical agents still use one active native Shadow platform
  account. Shared Hermes execution units use one profile per logical agent, so
  multi-agent isolation does not depend on putting multiple Shadow accounts into
  one Hermes profile.
- raw Shadow/model tokens do not appear in ConfigMap payloads.

### Runner filesystem contract smoke

Commands:

```bash
node apps/cloud/scripts/smoke/runner-image-contracts.mjs
node apps/cloud/scripts/smoke/runner-persistent-installs.mjs
```

These smoke tests do not require repository `node_modules`. They verify:

- every phase-1 runner Dockerfile exposes the same npm/pip/XDG/apt persistent
  install contract
- `container.ts` does not reintroduce tool-specific persistent mount symbols
- entrypoints do not force npm cache back into `/tmp`
- local npm, pip, and apt-shaped installs remain available after a simulated
  restart of the same persistent home

### Provisioning lifecycle smoke

Command:

```bash
rtk pnpm --filter @shadowob/cloud exec vitest run __tests__/services/deploy.service.test.ts __tests__/provisioning/provisioning.test.ts
```

Result verified on 2026-06-10:

```text
Test Files  2 passed (2)
```

What it verifies:

- deployment-scoped provisioning hooks run once per deployment, not once per
  logical agent.
- deployment-scoped hooks can return shared `secrets` plus `agentSecrets`.
- shared `secrets` are injected into the selected agents, while `agentSecrets`
  are injected only into their matching logical agent.
- default agent-scoped provisioning hooks still run once per logical agent.
- `shadowob` env generation supports both root `use` config and
  `plugins.shadowob.config` snapshots.

### Infra runtime package smoke

Command:

```bash
rtk pnpm --filter @shadowob/cloud exec vitest run __tests__/infra/runtime-package.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       16 passed (16)
```

What it verifies:

- ConfigMap data, plain env, and Secret data are separated consistently.
- registry provider secrets are referenced by env placeholders.
- plugin runtime extensions are emitted outside OpenClaw config.
- credential-file runtime extensions are preserved.
- deployment manifest generation wires runtime config and secrets correctly.

### Combined focused runtime smoke

Command:

```bash
rtk pnpm --filter @shadowob/cloud exec vitest run src/infra/runtime-package.test.ts __tests__/infra/runtime-package.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests       33 passed (33)
```

### Runtime topology planner smoke

Command:

```bash
rtk pnpm --filter @shadowob/cloud exec vitest run __tests__/application/cloud-saas-config.test.ts __tests__/application/runtime-topology.test.ts __tests__/config/schema.test.ts src/infra/runtime-package.test.ts __tests__/infra/runtime-package.test.ts
```

Result:

```text
Test Files  5 passed (5)
Tests       58 passed (58)
```

What it verifies in addition to package behavior:

- `deployments.placement` passes schema validation.
- default topology keeps OpenClaw, cc-connect-family runtimes, and Hermes
  dedicated.
- explicit placement can plan shared OpenClaw execution units.
- explicit placement can plan shared cc-connect execution units for
  same-runtime agents.
- explicit placement can plan shared Hermes execution units.
- incompatible shared placement records a compatibility downgrade instead of
  silently co-residing agents.
- runtime target resolution maps logical agent IDs to execution-unit
  sandbox/service/PVC names.
- SaaS config snapshots persist compiled topology under
  `__shadowobRuntime.topology`.

### Kubernetes deployment apply smoke

Command shape:

1. Generate an OpenClaw shared execution-unit manifest with:
   - `deployments.backend = "deployment"`
   - placement group `editorial-team`
   - logical agents `reviewer` and `writer`
   - primary agent `replicas = 0`
   - `imagePullPolicy = "Never"`
2. Apply the generated manifests to a temporary namespace on the local
   `kind-agent-sandbox` Kubernetes context.
3. Inspect the applied resources.
4. Delete the temporary namespace.

Result verified on 2026-06-10:

```text
context       kind-agent-sandbox
namespace     shadow-shared-smoke-1781093770
resourceCount 6
kinds         Namespace, ConfigMap, Secret, Deployment, Service, NetworkPolicy

configmap/editorial-team-config
deployment.apps/editorial-team
networkpolicy.networking.k8s.io/editorial-team-netpol
secret/editorial-team-secrets
service/editorial-team-svc

replicas     0
agentLabel   editorial-team
unitLabel    true
agentIds     reviewer,writer
podAgentIds  reviewer,writer
unitEnv      SHADOWOB_EXECUTION_UNIT_ID=editorial-team
configAgents reviewer,writer
```

This verifies that the real Kubernetes API server accepts the shared execution
unit resource shape and that one logical placement group becomes one Deployment
and one runtime ConfigMap. It also verifies execution-unit annotations and pod
env are present after server-side admission. It intentionally does not pull
runner images or start containers; runtime process behavior is covered by
package tests and the Hermes entrypoint smoke below.

---

## 8. When to Re-run These Smoke Tests

Re-run both smoke commands when changing any of:

- `apps/cloud/src/runtimes/*`
- `apps/cloud/src/runtimes/package-common.ts`
- `apps/cloud/src/infra/runtime-package.ts`
- `apps/cloud/src/infra/agent-pod.ts`
- `apps/cloud/src/infra/config-resources.ts`
- `apps/cloud/src/config/openclaw-builder.ts`
- `apps/cloud/src/plugins/shadowob/index.ts`
- plugin runtime extension merge behavior
- execution-unit planning or shared runtime packaging

Re-run the Kubernetes apply smoke when changing:

- `apps/cloud/src/infra/index.ts`
- `apps/cloud/src/infra/agent-deployment.ts`
- `apps/cloud/src/infra/agent-pod.ts`
- `apps/cloud/src/infra/networking.ts`
- `apps/cloud/src/infra/security.ts`
- runtime topology fields that affect K8s object names, labels, selectors, or
  service names

Docs-only changes do not need these smoke tests.

---

## 9. Shared-runner Regression Coverage

- planner keeps all runtimes dedicated by default.
- planner accepts shared OpenClaw only when compatibility rules pass.
- planner accepts shared cc-connect-family execution units for compatible
  same-runtime agents.
- planner accepts shared Hermes execution units for compatible Hermes agents.
- explicit incompatible shared placement records a clear downgrade reason.
- shared OpenClaw package emits multiple `agents.list[]` entries.
- each shared OpenClaw agent has a distinct `agentDir`.
- shared cc-connect package emits multiple `[[projects]]` entries.
- each shared cc-connect project has project-scoped identity, work dir,
  platforms, and runtime files.
- shared Hermes package emits multiple profile directories and gateway
  launch metadata.
- each shared Hermes profile has isolated config, `.env`, identity, skills,
  sessions, memory, and gateway state.
- Shadow accounts and `bindings[].agentId` remain logical-agent scoped.
- shared OpenClaw manifest emits one workload and annotates all logical agent
  IDs.
- lifecycle resolver maps logical agent ID to execution-unit sandbox/PVC.
- Hermes entrypoint smoke with stub binaries materializes two profile homes and
  starts `hermes -p reviewer gateway` plus `hermes -p writer gateway` from one
  execution-unit package.

### Focused execution-unit regression suite

Command:

```bash
rtk pnpm --filter @shadowob/cloud exec vitest run \
  __tests__/application/cloud-saas-config.test.ts \
  __tests__/application/runtime-topology.test.ts \
  __tests__/config/schema.test.ts \
  src/infra/runtime-package.test.ts \
  __tests__/infra/runtime-package.test.ts
```

Result:

```text
Test Files  5 passed (5)
Tests       58 passed (58)
```

### Hermes shared entrypoint smoke

Command shape:

1. Generate a shared Hermes execution-unit package with two logical agents.
2. Rewrite `/home/shadow`, `/workspace`, and `/etc/shadowob` paths into a temp
   directory for local execution.
3. Start `apps/cloud/images/hermes-runner/entrypoint.mjs` with stub
   `hermes`, `shadowob`, and `shadowob-connector` binaries.
4. Assert profile files exist and stub logs contain both gateway starts.

Result:

```text
Hermes shared profile entrypoint smoke passed
```

---

## 10. External Source Checks

These are used only to validate runtime capability boundaries; local smoke tests
remain the source of truth for Shadow Cloud adapter behavior.

- Hermes official profiles docs describe profiles as separate Hermes home
  directories with their own config, API keys, memory, sessions, skills, cron
  jobs, and state database:
  <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md>
- Hermes official multi-profile gateway docs describe operating multiple
  profiles with separate bot tokens, sessions, and memory on one machine:
  <https://hermes-agent.nousresearch.com/docs/user-guide/multi-profile-gateways>
- cc-connect config and issues confirm `[[projects]]` and
  `[[projects.platforms]]` are first-class config structures:
  <https://github.com/chenhg5/cc-connect/blob/main/config.example.toml> and
  <https://github.com/chenhg5/cc-connect/issues/1139>
