---
title: Shadow Cloud
description: Deploy Buddy-powered Shadow spaces from reusable Cloud templates.
---

# Shadow Cloud

Shadow Cloud turns a repeatable play into a deployable workspace: server, default channels, Buddy accounts, model provider wiring, tools, skills, scripts, and runtime permissions can all live in one template.

The product goal is simple: a user clicks a play, Shadow prepares the space, and the user lands in the right channel with a working Buddy.

## What Cloud Deploys

| Layer | What it does |
| --- | --- |
| Shadow resources | Provisions servers, text channels, Buddy accounts, bindings, and channel routes. |
| Agent runtime | Deploys Cloud runners to Kubernetes through agent-sandbox by default, with resource limits, runtime configuration, persistent state, pause/resume, and backup metadata. |
| Model provider | Selects an official provider, a user provider, or an OpenAI-compatible endpoint. |
| Capability packs | Mounts skills, commands, scripts, MCP snippets, and instruction files through plugins. |
| Dashboard | Shows templates, deployment status, settings, logs, and real-time deploy progress. |

## Launch Paths

| Path | Best for | User experience |
| --- | --- | --- |
| Homepage play | Consumer onboarding | A landing page explains the outcome, then starts a guided deploy animation. |
| Cloud store | Advanced users | The user chooses official coin billing or their own provider before deployment. |
| `shadowob-cloud` CLI | Developers and operators | A local config is validated and deployed to the selected Kubernetes context. |

## Deployment Flow

1. Pick a template, such as `gstack-buddy` or `bmad-method-buddy`.
2. Resolve variables, secrets, model provider settings, and plugin assets.
3. Provision Shadow servers, channels, Buddies, and bindings.
4. Deploy the agent runtime to Kubernetes.
5. Route Buddy messages back into the configured Shadow channel.
6. Open the configured default channel for the user.

## Configuration Boundaries and Runtime Placement

The source of truth for Cloud business configuration is `deployments.agents[]`. Each entry defines one logical agent's identity, responsibility, model, permissions, plugins, skills, and runtime type. The Shadow plugin's `buddies[]` creates Buddy identities, and `bindings[]` routes each Buddy identity to the matching logical agent.

Runtime placement is a deployment artifact produced by the Cloud compiler; it should not become the business configuration source. In future placement modes, Cloud may compile multiple compatible agents into one runner or sandbox to reduce cost, but templates should still declare identity, skills, and plugins per agent. The deployment layer should produce internal execution unit or runner instance mappings from those agent definitions.

A shared runner is only valid for agents in the same trust domain. It is not a security isolation boundary: if several Buddy tokens, environment variables, plugin assets, and state directories enter one process, those agents must be treated as sharing runtime trust. Different tenants, secret-isolation requirements, network policies, runtime images, resource or lifecycle requirements, or plugins that do not support multi-agent profiles must stay on dedicated sandboxes.

## Cloud vs. App Platform

The app platform API lets developers build around existing Shadow communities. Shadow Cloud packages a full operational experience so a play can become a repeatable deployment.

Use Cloud when you need any of these:

- A real Buddy runtime, not only a placeholder Buddy profile.
- A server and default channels created from a template.
- Skills, scripts, CLI tools, or MCP assets mounted into an agent.
- Kubernetes-backed deployment with logs, status, pause/resume, state backup metadata, and teardown.
- A path from homepage play to deployed workspace.

## Runtime Backend

New Cloud deployments default to the `agent-sandbox` workload backend. The product still uses the word deployment, but Kubernetes resources are generated as `SandboxTemplate` and `SandboxClaim` objects instead of a standard `Deployment`.

The backend mounts the state PVC at `/home/shadow` for each runner. Runtime state, auth dotdirs, npm/pip user installs, XDG config/cache/data/state, and Shadow-managed user-space tools live under that durable runner home. OpenClaw uses `/home/shadow/.openclaw`, cc-connect based runners use `/home/shadow/.cc-connect` plus their native CLI homes such as `/home/shadow/.codex`, and Hermes uses `/home/shadow/.hermes`. Operators can set `deployments.backend` to `deployment` as a rollback path for older clusters.

`/tmp`, `/workspace/.agents`, and runner log directories are ephemeral. Do not store login state, package installs, or long-lived user data there.

Hermes runners do not preinstall Codex. They can call a user-installed `codex` binary if the user installs it into the persistent runner home, but a Buddy whose primary process is Codex should use `runtime: codex`.

Cloud exposes pause, resume, backup, restore, pods, and logs through the existing deployment API namespace. Backup records include status and phase fields so dashboards can distinguish snapshot creation, object archive upload, PVC restore, and sandbox resume. A paused sandbox has no running Pod, but its PVC is retained for resume or restore.

When the Kubernetes cluster has CSI `VolumeSnapshot` support, the target PVC is backed by a CSI StorageClass, and a matching `VolumeSnapshotClass` exists, Cloud uses snapshot-backed backups and PVC restore with an explicit `volumeSnapshotClassName`. Clusters without the snapshot API, PVCs still using a non-CSI StorageClass, or PVCs without a matching snapshot class fall back to object archive backups. Operators can configure `CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY` to encrypt object archives and `expiresAt` retention cleanup removes expired snapshot/object artifacts.

## Security Model

Cloud templates should not contain raw API keys. Use `${env:VAR_NAME}` for local CLI deployments or managed secret groups for platform deployments.

agent-sandbox workloads run without a service account token, use a non-root security context, and default to the `gvisor` RuntimeClass. Network policy remains deny-by-default and must explicitly allow Shadow server and model provider egress.

`shadowob-cloud validate` rejects inline key-like values, validates schema references, and can fail on unresolved environment variables in strict mode.

## Next Steps

- [Cloud SaaS Runtime API](./cloud-saas) for pause, resume, backup, and restore operations.
- [Cloud CLI](./cloud-cli) for local and Kubernetes workflows.
- [Cloud Templates](./cloud-templates) for `template.json` authoring.
- [Cloud Plugins](./cloud-plugins) for model providers, Shadow provisioning, skills, scripts, CLI tools, and MCP.
- [Official Model Proxy](./model-proxy) for coin-billed model usage.
