---
title: Cloud
description: Deploy Buddy runtimes, default channels, and runtime configuration from reusable Cloud templates.
---

# Cloud

Cloud turns a Cloud template into a running Buddy environment. A template can declare Spaces, default channels, Buddy identities, model provider wiring, plugins, skills, scripts, and runtime permissions. After deployment, Cloud owns runners, Kubernetes resources, logs, pause/resume state, and backup metadata.

Cloud computers are not the low-level Cloud infrastructure API. In the platform docs they belong under AI: Web, Mobile, the community desktop, and SDKs access files, terminal, browser, desktop, Buddies, and backups through a cloud computer object; the service maps those requests to the underlying deployment.

Use [Cloud Computer API](./cloud-computers) when integrating cloud computers in a community surface. Use this page when authoring templates, deploying runners, inspecting Pods, or operating runtime backups.

## What Cloud Deploys

| Layer | What Cloud owns |
| --- | --- |
| Shadow resources | Creates Spaces, default channels, Buddy identities, bindings, and channel routes from the template. |
| Agent runtime | Deploys runners to Kubernetes through agent-sandbox with resource limits, runtime configuration, and persistent state. |
| Model provider | Connects official providers, user-owned providers, or OpenAI-compatible endpoints. |
| Capability packs | Mounts skills, commands, scripts, MCP snippets, and instruction files through plugins. |
| Operations data | Records deployment status, logs, Pod details, pause/resume state, and backup metadata. |

## Deployment Flow

1. Pick a template, such as `gstack-buddy` or `bmad-method-buddy`.
2. Resolve variables, secrets, model provider settings, and plugin assets.
3. Provision Shadow Spaces, channels, Buddies, and bindings.
4. Deploy the agent runtime to Kubernetes.
5. Route Buddy messages back into the configured Shadow channel.
6. Open the configured default channel for the user.

## Configuration Boundaries and Runtime Placement

The source of truth for Cloud business configuration is `deployments.agents[]`. Each entry defines one logical agent's identity, responsibility, model, permissions, plugins, skills, and runtime type. The Shadow plugin's `buddies[]` creates Buddy identities, and `bindings[]` routes each Buddy identity to the matching logical agent.

Runtime placement is a deployment artifact produced by the Cloud compiler; it should not become the business configuration source. In future placement modes, Cloud may compile multiple compatible agents into one runner or sandbox to reduce cost, but templates should still declare identity, skills, and plugins per agent. The deployment layer should produce internal execution unit or runner instance mappings from those agent definitions.

A shared runner is only valid for agents in the same trust domain. It is not a security isolation boundary: if several Buddy tokens, environment variables, plugin assets, and state directories enter one process, those agents must be treated as sharing runtime trust. Different tenants, secret-isolation requirements, network policies, runtime images, resource or lifecycle requirements, or plugins that do not support multi-agent profiles must stay on dedicated sandboxes.

## Cloud And AI APIs

AI APIs operate Agents, cloud computers, and model proxy calls. Cloud deploys templates into runtime environments and operates runners, Pods, PVCs, logs, and backup metadata.

Use Cloud docs for:

- Declaring Spaces, channels, Buddies, plugins, and skills in Cloud templates.
- Deploying runners to Kubernetes.
- Pausing, resuming, backing up, restoring, and destroying deployments.
- Passing model providers, secrets, plugin assets, and runtime images into the runtime environment.

Use [Cloud Computer API](./cloud-computers) to list, create, or manage cloud computers. That API hides deployments, namespaces, PVCs, and Pods behind the AI-facing cloud computer object.

## Runtime Backend

New Cloud deployments default to the `agent-sandbox` workload backend. The product still uses the word deployment, but Kubernetes resources are generated as `SandboxTemplate` and `SandboxClaim` objects instead of a standard `Deployment`.

The backend mounts the state PVC at `/home/shadow` for each runner. Runtime state, auth dotdirs, npm/pip user installs, XDG config/cache/data/state, and Shadow-managed user-space tools live under that durable runner home. OpenClaw uses `/home/shadow/.openclaw`, cc-connect based runners use `/home/shadow/.cc-connect` plus their native CLI homes such as `/home/shadow/.codex`, and Hermes uses `/home/shadow/.hermes`. Operators can set `deployments.backend` to `deployment` as a rollback path for older clusters.

`/tmp`, `/workspace/.agents`, and runner log directories are ephemeral. Do not store login state, package installs, or long-lived user data there.

Hermes runners do not preinstall Codex. They can call a user-installed `codex` binary if the user installs it into the persistent runner home, but a Buddy whose primary process is Codex should use `runtime: codex`.

Cloud exposes pause, resume, backup, restore, pods, and logs through the existing deployment API namespace. Backup records include status and phase fields so dashboards can distinguish snapshot creation, object archive upload, PVC restore, and sandbox resume. A paused sandbox has no running Pod, but its PVC is retained for resume or restore.

When the Kubernetes cluster has CSI `VolumeSnapshot` support, the target PVC is backed by a CSI StorageClass, and a matching `VolumeSnapshotClass` exists, Cloud uses snapshot-backed backups and PVC restore with an explicit `volumeSnapshotClassName`. Clusters without the snapshot API, PVCs still using a non-CSI StorageClass, or PVCs without a matching snapshot class fall back to object archive backups. Operators can configure `CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY` to encrypt object archives and `expiresAt` retention cleanup removes expired snapshot/object artifacts.

## Security Model

Cloud templates should not contain raw API keys. Use `${env:VAR_NAME}` for local CLI deployments or managed secret groups for platform deployments.

agent-sandbox workloads run without a service account token, use a non-root security context, and default to the `gvisor` RuntimeClass. Network policy remains deny-by-default and must explicitly allow Shadow Space and model provider egress.

`shadowob-cloud validate` rejects inline key-like values, validates schema references, and can fail on unresolved environment variables in strict mode.

## Next Steps

- [Cloud SaaS Runtime API](./cloud-saas) for pause, resume, backup, and restore operations.
- [Cloud CLI](./cloud-cli) for local and Kubernetes workflows.
- [Cloud Templates](./cloud-templates) for `template.json` authoring.
- [Cloud Plugins](./cloud-plugins) for model providers, Shadow provisioning, skills, scripts, CLI tools, and MCP.
- [Cloud Computer API](./cloud-computers) for the AI-facing cloud computer object.
- [Official Model Proxy](./model-proxy) for coin-billed model usage.
