import {
  type AgentCostSummary,
  type CostOverviewSummary,
  collectNamespaceCost,
  type NamespaceCostSummary,
  type ProviderUsageSummary,
  summarizeCostOverview,
  type UsageCostRuntime,
} from '../application/usage-cost.js'
import type { DeploymentStatus, PodStatus } from '../clients/kubectl-client.js'
import { K8sService } from './k8s.service.js'

const DEFAULT_NAMESPACE_CACHE_TTL_MS = 30_000

export class UsageCostService {
  private readonly namespaceCache = new Map<
    string,
    { expiresAt: number; summary: NamespaceCostSummary }
  >()

  constructor(
    private k8s: K8sService,
    private readonly cacheTtlMs = DEFAULT_NAMESPACE_CACHE_TTL_MS,
  ) {}

  async collectNamespace(namespace: string): Promise<NamespaceCostSummary> {
    const cached = this.namespaceCache.get(namespace)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      return cached.summary
    }

    const deployments = await this.k8s.getDeployments(namespace)
    const summary = await collectNamespaceCost({
      namespace,
      agentNames: deployments.map((deployment) => deployment.name),
      billingAmount: null,
      billingUnit: 'usd',
      runtime: this.getRuntime(),
    })

    const agents = summary.agents.map((agent) => ({
      ...agent,
      billingAmount: agent.totalUsd,
      billingUnit: 'usd' as const,
    }))

    const result: NamespaceCostSummary = {
      ...summary,
      billingAmount: summary.totalUsd,
      billingUnit: 'usd',
      agents,
    }

    if (this.cacheTtlMs > 0) {
      this.namespaceCache.set(namespace, {
        expiresAt: now + this.cacheTtlMs,
        summary: result,
      })
    }

    return result
  }

  async collectOverview(namespaces: string[]): Promise<CostOverviewSummary> {
    return summarizeCostOverview(
      await Promise.all(namespaces.map((namespace) => this.collectNamespace(namespace))),
      'usd',
    )
  }

  private getRuntime(): UsageCostRuntime {
    return {
      listPods: (namespaceName: string) => this.k8s.getPods(namespaceName) as Promise<PodStatus[]>,
      execInPod: ({ namespace: namespaceName, pod, command }) =>
        this.k8s.execInPod(namespaceName, pod, command),
    }
  }
}

export type {
  AgentCostSummary,
  CostOverviewSummary,
  NamespaceCostSummary,
  ProviderUsageSummary,
} from '../application/usage-cost.js'
