# Shadow Cloud — Multi-agent Execution Units

> **Spec:** 11-execution-units
> **Version:** 1.0-draft
> **Date:** 2026-06-10

---

## 1. Problem

Hermes, OpenClaw, and cc-connect can host more than one logical agent in a single
runtime process, but Shadow Cloud currently compiles one `deployments.agents[]`
entry into one Kubernetes workload:

- one `ConfigMap`
- one `Secret`
- one `SandboxTemplate`
- one `SandboxClaim`
- one `Service`
- one state PVC

This means a six-agent Buddy team becomes six sandbox/container processes even
when the runtime could safely host the team in one process.

The naive fix is to introduce `runtimeGroups` and move agent configuration under
those groups. That is the wrong boundary. It would make the deployment topology
the source of truth and would cause a logical agent to lose its own identity,
skills, plugins, permissions, model, and Shadow Buddy binding.

The first version must therefore introduce a durable topology model, not a
one-off OpenClaw JSON merge.

---

## 2. Research Findings

Current code assumes `agent.id === workload name === sandbox name === service
name === state PVC suffix` in multiple layers:

| Layer | Current assumption |
| --- | --- |
| `apps/cloud/src/infra/index.ts` | Loops `config.deployments.agents` and creates one workload per agent. |
| `apps/cloud/src/infra/agent-sandbox.ts` | Uses `agentName` as `SandboxClaim` name and state PVC suffix. |
| `apps/cloud/src/config/openclaw-builder.ts` | Builds `openclawConfig.agents.list = [agentEntry]`. |
| `apps/cloud/src/runtimes/cc-connect-package.ts` | Emits one `projects[]` entry for one agent. |
| `apps/cloud/src/runtimes/hermes.ts` | Reads one Shadow binding with `shadowBinding(...)`. |
| `apps/cloud/src/plugins/shadowob/index.ts` | Filters bindings by `context.agent.id`. |
| `apps/cloud/src/interfaces/web-saas/api-adapter.ts` | Expands dashboard rows from `deployments.agents[]` and treats each row as a sandbox. |
| `apps/server/src/lib/cloud-deployment-processor.ts` | Auto-pause/resume scales sandbox names derived from agent IDs. |
| `apps/server/src/handlers/cloud-saas.handler.ts` | Pause/resume/backup/restore resolve a requested agent ID directly to a sandbox/PVC. |
| `apps/server/src/lib/cloud-deployment-backup-runtime.ts` | Has a duplicate PVC naming helper that does not match the current Cloud runtime PVC prefix. |

The implementation must remove that implicit equality everywhere shared runners
are observable. Otherwise pause, resume, backup, restore, logs, dashboard links,
and cost summaries can target the wrong resource.

---

## 3. Core Model

This spec depends on the runtime behavior baseline in
`apps/cloud/spec/12-runtime-behavior-baseline.md`. That baseline records the
current adapter behavior and the smoke tests that verify it.

### 3.1 Source of Truth

`deployments.agents[]` remains the business configuration source.

Each logical agent keeps its own:

- `id`
- `identity.name`
- `identity.description`
- `identity.personality`
- `identity.systemPrompt`
- `model`
- `permissions`
- `use`
- `skills`
- `source`
- `runtime`
- `networking`
- `sandbox`
- `scheduling`

Shadow Buddy identity remains in the Shadow plugin:

- `buddies[]` creates platform Buddy profiles.
- `bindings[]` routes a Buddy to a logical agent with `agentId`.

### 3.2 Deployment Intent

`deployments.placement` is an optional hint. It is not the identity model.

```typescript
interface DeploymentPlacementConfig {
  mode?: 'dedicated' | 'auto'
  defaultIsolation?: 'dedicated' | 'shared-runner'
  groups?: Array<{
    id: string
    agentIds: string[]
    isolation?: 'dedicated' | 'shared-runner'
  }>
}
```

Default behavior is `mode = "dedicated"`, preserving all existing deployments.

`groups[]` is a placement request, not a config container. The agents named in a
group are still declared fully in `deployments.agents[]`.

### 3.3 Compiled Topology

Cloud compiles logical agents into execution units:

```typescript
interface CloudExecutionUnit {
  id: string
  runtime: AgentRuntime
  runtimeKind: 'openclaw' | 'cc-connect' | 'hermes'
  packageMode: 'single-agent' | 'multi-agent'
  isolation: 'dedicated' | 'shared-runner'
  agentIds: string[]
  primaryAgentId: string
  workloadName: string
  serviceName: string
  configMapName: string
  secretName: string
  statePvcName: string
  shared: boolean
  compatibility?: {
    accepted: boolean
    reason?: string
  }
}

interface CloudRuntimeTopology {
  schemaVersion: 1
  executionUnits: CloudExecutionUnit[]
  agentToExecutionUnit: Record<string, string>
}
```

The topology is produced by a single planner exported from `@shadowob/cloud` and
used by:

- CLI manifest generation
- Pulumi infra generation
- SaaS deployment snapshot preparation
- Dashboard row expansion
- pause/resume handlers
- backup/restore handlers
- auto-pause/auto-resume workers
- cost and runtime status collectors

SaaS stores the compiled topology under `__shadowobRuntime.topology` inside
`configSnapshot`. Local CLI can recompute it from config.

---

## 4. Buddy and Agent Identity Alignment

The new Cloud Buddy creation entry asks the user for a Buddy name and
description. Those fields must be treated as canonical input and written into
both the Shadow identity and the runtime identity:

```json
{
  "use": [
    {
      "plugin": "shadowob",
      "options": {
        "buddies": [
          {
            "id": "analyst-buddy",
            "name": "Market Analyst",
            "description": "Researches market signals and summarizes risks."
          }
        ],
        "bindings": [
          {
            "targetType": "buddy",
            "targetId": "analyst-buddy",
            "agentId": "market-analyst"
          }
        ]
      }
    }
  ],
  "deployments": {
    "agents": [
      {
        "id": "market-analyst",
        "runtime": "openclaw",
        "identity": {
          "name": "Market Analyst",
          "description": "Researches market signals and summarizes risks."
        },
        "description": "Researches market signals and summarizes risks."
      }
    ]
  }
}
```

Validation rules:

- `bindings[].agentId` must resolve to a logical agent.
- `bindings[].targetId` must resolve to a Buddy.
- For generated Cloud Buddy entries, Buddy name/description and agent
  identity name/description must match exactly after trim normalization.
- For existing templates, mismatches are warnings first, then can become errors
  after migration.

This prevents the public Buddy profile, inbox, marketplace listing, and runtime
agent prompt from drifting into different personas.

---

## 5. Compatibility Rules

Shared runner is a cost optimization, not a security boundary.

An execution unit may be shared only when every agent in it satisfies all rules:

1. Same deployment owner and trust domain.
2. Same workload backend.
3. Same runtime family.
4. Same runner image.
5. Same RuntimeClass.
6. Compatible resource requests/limits.
7. Compatible scheduling constraints.
8. Compatible network policy.
9. Compatible sandbox lifecycle and backup policy.
10. No per-agent replica count greater than one.
11. No secret isolation requirement that forbids co-residence.
12. Every enabled plugin declares how it behaves in shared runners.
13. Runtime adapter supports building a multi-agent package for that runtime.

The planner can always emit execution units for every runtime. The distinction is
`packageMode`:

- `single-agent`: exactly one logical agent in this unit.
- `multi-agent`: more than one logical agent can be packaged into this unit.

P0 shared runtime kinds:

- `openclaw`: multi-agent package is one OpenClaw gateway config with multiple
  `agents.list[]` entries.
- `cc-connect`: multi-agent package is one cc-connect config with multiple
  `[[projects]]` entries. `claude-code`, `codex`, and `opencode` inherit this
  path because their adapters use cc-connect.
- `hermes`: multi-agent package is one sandbox with multiple Hermes profiles
  and gateway launch metadata.

Unsupported shared requests must fail validation with a clear reason. In `auto`
mode they may compile to dedicated execution units only when the downgrade is
recorded in topology compatibility metadata. They must not silently produce an
invalid shared workload.

Runtime capability contract:

```typescript
interface RuntimeExecutionUnitSupport {
  runtimeKind: 'openclaw' | 'cc-connect' | 'hermes'
  packageModes: Array<'single-agent' | 'multi-agent'>
  canShare(options: {
    agents: AgentDeployment[]
    config: CloudConfig
  }): { ok: true } | { ok: false; reason: string }
}
```

First version capabilities:

| Runtime kind | `single-agent` | `multi-agent` | Reason |
| --- | --- | --- | --- |
| `openclaw` | yes | yes | OpenClaw has `agents.list[]`, `agentDir`, and channel route bindings. |
| `cc-connect` | yes | yes | cc-connect config has `[[projects]]` and `[[projects.platforms]]`; shared packages emit one project per logical agent. |
| `hermes` | yes | yes | Hermes profiles isolate config, env, memory, sessions, skills, and gateway state; shared packages emit one profile and gateway launch entry per logical agent. |

---

## 6. Plugin and Skills Boundary

Agent-level `use` must remain agent-level. Shared runner support cannot flatten
all plugins into one global plugin profile.

Runtime-package-only plugins can be built once per logical agent and merged
under the runtime-native boundary (`agentDir`, cc-connect project, or Hermes
profile). Plugins that emit Pod-level Kubernetes artifacts are not shared in the
first implementation; when the plugin registry is loaded, such placement groups
downgrade to dedicated execution units with compatibility metadata instead of
creating ambiguous init container, volume, or mount-path conflicts.

Plugins need a runtime placement contract:

```typescript
type PluginRuntimePlacement =
  | { scope: 'unit' }
  | { scope: 'agent'; namespaceByAgentId: true }
  | { scope: 'exclusive'; reason?: string }
```

Rules:

- `unit`: one shared runtime asset is correct for every agent in the unit.
- `agent`: assets, env keys, runtime files, bindings, or prompts must be
  namespaced by `agent.id`.
- `exclusive`: the plugin requires a dedicated runner.
- Missing declaration defaults to `exclusive` for agent-level plugin use.

The first shared implementation must mark and test at least:

- `shadowob` as `agent` scoped: each Buddy account and route binding keeps its
  own `agentId`.
- `model-provider` as `unit` scoped when provider credentials are shared.
- global Cloud skills as `unit` scoped.

Agent-specific skill packs and source overlays can participate only when their
files are written under that agent's `agentDir`, for example:

```text
/workspace/.agents/market-analyst/IDENTITY.md
/workspace/.agents/market-analyst/SOUL.md
/workspace/.agents/market-analyst/AGENTS.md
/workspace/.agents/market-analyst/skills/...
```

OpenClaw already has `agents.list[].agentDir`, so a shared OpenClaw runner can
keep per-agent identity and files without relying on one global `SOUL.md`.

---

## 7. OpenClaw Shared Runner Build

The implementation must add a first-class group builder instead of merging
finished JSON packages by string manipulation.

Required builder shape:

```typescript
buildOpenClawExecutionUnitConfig({
  unit,
  agents,
  config,
  cwd,
  env,
  runtimeContext,
})
```

For every logical agent in the unit:

- build one `OpenClawAgentConfig`
- apply `identity`
- apply plugin prompt additions
- apply model and permissions
- set `agentDir = /workspace/.agents/<agentId>`
- emit per-agent runtime files under that directory
- preserve `bindings[].agentId`

Unit-level config:

- `agents.list` contains all logical agents.
- only one `gateway` section exists.
- model provider config is merged once.
- Shadow channel config contains all Buddy accounts for the unit.
- runtime extensions merge all agent-scoped Shadow accounts and routine
  deliveries without overwriting.
- `runtime-files.json` contains all per-agent files and shared slash commands.

No implementation should put multiple logical agents behind one global
`SOUL.md` or one global `IDENTITY.md`.

---

## 8. cc-connect Shared Runner Build

cc-connect-family runtimes (`claude-code`, `codex`, `opencode`) share the
`runtimeKind = "cc-connect"` package family. The shared execution-unit package
must emit one `cc-connect` process with multiple projects:

```toml
[[projects]]
name = "reviewer"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "/workspace/.agents/reviewer"

[[projects.platforms]]
type = "shadowob"

[projects.platforms.options]
token = "${SHADOWOB_TOKEN_REVIEWER_BUDDY}"
server_url = "${SHADOWOB_SERVER_URL}"

[[projects]]
name = "writer"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = "/workspace/.agents/writer"
```

Rules:

- one logical agent becomes one `[[projects]]` entry.
- a project may have one or more `[[projects.platforms]]` entries.
- project `name` stays equal to logical `agent.id`.
- project `work_dir` must be agent-scoped.
- agent identity files are written under `/workspace/.agents/<agentId>`.
- runtime-native config files that are currently global must become
  project/profile-scoped when the native CLI supports it, or the unit must be
  rejected for that runtime/agent combination.
- Shadow accounts and slash commands remain per project/platform, not global.

The current smoke tests prove both multi-Shadow-account single-project packaging
and shared multi-project packaging for cc-connect-family runtimes.

---

## 9. Hermes Shared Runner Build

Hermes multi-agent packaging must use Hermes profiles as the logical-agent
boundary. A shared Hermes execution unit is one sandbox containing multiple
profile homes and one launcher that starts their gateways.

Expected runtime file shape:

```text
/home/shadow/.hermes/profiles/reviewer/config.yaml
/home/shadow/.hermes/profiles/reviewer/.env
/home/shadow/.hermes/profiles/reviewer/SOUL.md
/home/shadow/.hermes/profiles/reviewer/skills/...
/home/shadow/.hermes/profiles/writer/config.yaml
/home/shadow/.hermes/profiles/writer/.env
/home/shadow/.hermes/profiles/writer/SOUL.md
/home/shadow/.hermes/profiles/writer/skills/...
```

Rules:

- one logical agent becomes one Hermes profile.
- each profile owns its own Shadow token env reference.
- each profile owns its own config, `.env`, identity, memory, skills, sessions,
  cron jobs, and gateway state.
- the execution unit must include launch metadata for all profile gateways.
- lifecycle operations still target the execution unit sandbox/PVC; inside the
  sandbox the launcher manages profile gateway processes.

The current smoke tests prove shared Hermes packages materialize multiple
profile homes and the runner entrypoint starts one `hermes -p <profile> gateway`
process per logical agent.

---

## 10. Infra Changes

Infra generation must loop over execution units, not logical agents.

For each unit, create:

- `${unit.id}-config`
- `${unit.id}-secrets`
- `${unit.id}` `SandboxClaim`
- `${unit.id}` `SandboxTemplate`
- `${unit.id}-svc`
- `shadow-runner-state-${unit.id}`

Kubernetes metadata must distinguish execution-unit resources without putting
comma-separated logical agent IDs into labels. Labels keep low-cardinality
filter fields; annotations carry exact topology IDs:

```yaml
metadata:
  labels:
    shadowob.cloud/execution-unit: "true"
    shadowob.cloud/runtime-kind: openclaw
    shadowob.cloud/package-mode: multi-agent
    shadowob.cloud/shared-runner: "true"
  annotations:
    shadowob.cloud/execution-unit-id: openclaw-main
    shadowob.cloud/primary-agent-id: coordinator
    shadowob.cloud/agent-ids: coordinator,analyst,reviewer
```

The pod env should include:

```text
SHADOWOB_EXECUTION_UNIT_ID=<unit.id>
SHADOWOB_AGENT_IDS=<comma-separated logical agent ids>
```

For legacy dedicated units, `unit.id === agent.id`, so existing manifest names
stay stable.

---

## 11. Lifecycle and API Semantics

Lifecycle operations target execution units.

When an API receives a logical `agentId`, it must resolve:

```typescript
resolveRuntimeTarget(configSnapshot, requestedAgentId): {
  requestedAgentId: string
  executionUnitId: string
  affectedAgentIds: string[]
  sandboxName: string
  serviceName: string
  statePvcName: string
  scope: 'agent' | 'execution-unit'
}
```

If a requested agent is in a shared execution unit:

- pause pauses the whole execution unit.
- resume resumes the whole execution unit.
- backup snapshots the unit PVC.
- restore restores the unit PVC.
- the response must include `affectedAgentIds`.

Backups should add durable fields:

- `executionUnitId`
- `affectedAgentIds`

Keep existing `agentId` for backward compatibility as the requested or primary
logical agent, but never use it as the PVC or sandbox name after topology exists.

For old deployments without topology metadata, the resolver falls back to legacy
dedicated units. PVC resolution should prefer:

1. topology `statePvcName`
2. `shadow-runner-state-${unitId}`
3. legacy `openclaw-data-${unitId}` only for historical deployments

---

## 12. Dashboard Semantics

The dashboard should stop presenting every logical agent as if it were always a
separate sandbox.

Deployment list rows should show:

- logical agent name
- runtime
- execution unit id
- isolation: dedicated/shared runner
- affected agents for shared operations
- sandbox/service/PVC from the execution unit

For shared units, the UI can display one parent runtime row with child agents, or
logical agent rows that share the same runtime target. In either case, operation
copy must make the blast radius clear before pause, backup, or restore.

---

## 13. Rollout Plan

This is one coherent first version, not a partial runtime hack.

### Step 1: Topology model and resolver

- Add schema for `deployments.placement`.
- Add `planExecutionUnits(config)` in `@shadowob/cloud`.
- Add `resolveRuntimeTarget(configSnapshot, requestedAgentId)`.
- Store topology in SaaS `__shadowobRuntime.topology`.
- Preserve legacy dedicated behavior when no placement is configured.

### Step 2: Multi-agent runtime packages

- Add OpenClaw execution-unit builder.
- Add cc-connect execution-unit builder.
- Add Hermes profile/gateway execution-unit builder and entrypoint launch loop.
- Keep per-agent identity through runtime-native agent/project/profile
  boundaries.
- Merge Shadow accounts and route bindings by logical agent ID.
- Emit per-agent workspace/profile files under runtime-specific scoped
  directories.

### Step 3: Infra and manifest generation

- Replace loops over `deployments.agents[]` with loops over execution units.
- Keep dedicated unit names identical to legacy agent names.
- Emit execution-unit labels and env vars.

### Step 4: SaaS lifecycle

- Change pause/resume/backup/restore/auto-pause/auto-resume to use
  `resolveRuntimeTarget`.
- Deduplicate auto-pause/resume by execution unit.
- Fix PVC naming by importing or sharing one runtime PVC resolver.
- Add backup metadata for `executionUnitId` and `affectedAgentIds`.

### Step 5: Dashboard

- Expand rows from topology metadata.
- Show shared runner scope in operation surfaces.
- Stop deriving `sandboxName`, service FQDN, and state PVC directly from
  `agent.id`.

### Step 6: Cloud Buddy identity alignment

- Add generator helper that writes Buddy name/description to both Shadow Buddy
  config and logical agent identity.
- Add validation warnings for existing mismatches.
- Treat generated Cloud Buddy mismatches as errors.

---

## 14. Tests and Smoke Tests

Unit tests:

- planner returns one dedicated unit per agent by default.
- explicit OpenClaw shared placement returns one unit with multiple agents.
- explicit cc-connect shared placement returns one compatible execution unit for
  same-runtime agents.
- explicit Hermes shared placement returns one compatible execution unit for
  Hermes agents.
- incompatible shared placement records a downgrade reason.
- per-agent lifecycle/network/resource mismatch prevents sharing.
- Buddy/agent identity mismatch produces the expected validation result.
- runtime target resolver maps logical agent to unit sandbox/service/PVC.
- cc-connect multi-project package preserves one project per logical agent.
- Hermes multi-profile package preserves one profile per logical agent.

Runtime package tests:

- shared OpenClaw config has multiple `agents.list[]` entries.
- each entry has a distinct `agentDir`.
- Shadow accounts and bindings keep the original logical `agentId`.
- runtime files include per-agent `IDENTITY.md`, `SOUL.md`, and `AGENTS.md`.
- shared cc-connect config has multiple `[[projects]]` entries.
- shared Hermes runtime files include multiple profile homes and launch metadata.

Manifest smoke tests:

- dedicated legacy config produces the same resource names as before.
- shared OpenClaw config produces one `SandboxClaim`, one `SandboxTemplate`, one
  `Service`, one state PVC annotation, and labels containing all agent IDs.
- shared cc-connect and Hermes configs produce one workload per execution unit
  and labels containing all logical agent IDs.
- complex template with exclusive plugins stays dedicated.

Server smoke tests:

- pause/resume scale execution unit sandbox name, not logical agent id.
- backup uses execution unit PVC name.
- auto-pause and auto-resume deduplicate shared units.
- legacy deployments without topology still resolve.

CLI smoke test:

- `shadowob-cloud generate manifests` for shared OpenClaw, cc-connect, and
  Hermes fixtures emits valid Kubernetes YAML and valid runtime config payloads.

---

## 15. Non-goals for First Version

- Do not infer grouping from agent count alone.
- Do not let `runtimeGroups` replace `deployments.agents[]`.
- Do not silently co-reside agents with undeclared plugin placement behavior.
