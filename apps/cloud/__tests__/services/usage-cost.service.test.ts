import { describe, expect, it } from 'vitest'
import { type DeploymentStatus, type PodStatus } from '../../src/clients/kubectl-client.js'
import { K8sService } from '../../src/services/k8s.service.js'
import { UsageCostService } from '../../src/services/usage-cost.service.js'

function makeService(options: {
  deployments: DeploymentStatus[]
  pods: PodStatus[]
  execOutputs: Array<{ stdout?: string; stderr?: string; exitCode?: number }>
  cacheTtlMs?: number
}) {
  let callIndex = 0
  const k8s = {
    getDeployments: () => options.deployments,
    getPods: () => options.pods,
    execInPod: () => {
      const output = options.execOutputs[Math.min(callIndex, options.execOutputs.length - 1)] ?? {}
      callIndex += 1
      return {
        stdout: output.stdout ?? '',
        stderr: output.stderr ?? '',
        exitCode: output.exitCode ?? 0,
      }
    },
  } as unknown as K8sService

  return {
    service: new UsageCostService(k8s, options.cacheTtlMs),
    getExecCallCount: () => callIndex,
  }
}

describe('UsageCostService', () => {
  it('collects token totals from JSON usage output', () => {
    const { service } = makeService({
      deployments: [
        {
          name: 'assistant-1',
          ready: '1/1',
          upToDate: '1',
          available: '1',
          age: new Date().toISOString(),
        },
      ],
      pods: [
        {
          name: 'assistant-1-abc123',
          ready: '1/1',
          status: 'Running',
          restarts: 0,
          age: new Date().toISOString(),
        },
      ],
      execOutputs: [
        {
          stdout: JSON.stringify({
            usage: {
              providers: [
                {
                  provider: 'anthropic',
                  cost: { input: 0.12, output: 0.08 },
                  tokens: { input: 1200, output: 300 },
                },
              ],
            },
          }),
        },
      ],
    })

    const summary = service.collectNamespace('shadow-team')

    expect(summary.totalUsd).toBe(0.2)
    expect(summary.billingAmount).toBe(0.2)
    expect(summary.billingUnit).toBe('usd')
    expect(summary.totalTokens).toBe(1500)
    expect(summary.availableAgents).toBe(1)
    expect(summary.agents[0]).toMatchObject({
      agentName: 'assistant-1',
      totalUsd: 0.2,
      billingAmount: 0.2,
      billingUnit: 'usd',
      totalTokens: 1500,
      source: 'json',
    })
    expect(summary.agents[0]?.providers[0]).toMatchObject({
      provider: 'anthropic',
      amountUsd: 0.2,
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
    })
  })

  it('falls back to text usage output and aggregates overview tokens', () => {
    const { service } = makeService({
      deployments: [
        {
          name: 'assistant-2',
          ready: '1/1',
          upToDate: '1',
          available: '1',
          age: new Date().toISOString(),
        },
      ],
      pods: [
        {
          name: 'assistant-2-def456',
          ready: '1/1',
          status: 'Running',
          restarts: 0,
          age: new Date().toISOString(),
        },
      ],
      execOutputs: [
        {
          stdout: 'OpenAI: $0.42 prompt 1200 completion 300 total tokens 1500',
        },
        {
          stdout: 'OpenAI: $0.42 prompt 1200 completion 300 total tokens 1500',
        },
      ],
    })

    const namespaceSummary = service.collectNamespace('shadow-team')
    const overview = service.collectOverview(['shadow-team'])

    expect(namespaceSummary.totalUsd).toBe(0.42)
    expect(namespaceSummary.totalTokens).toBe(1500)
    expect(namespaceSummary.agents[0]).toMatchObject({
      totalUsd: 0.42,
      totalTokens: 1500,
      source: 'text',
    })

    expect(overview.totalUsd).toBe(0.42)
    expect(overview.billingAmount).toBe(0.42)
    expect(overview.billingUnit).toBe('usd')
    expect(overview.totalTokens).toBe(1500)
    expect(overview.namespaces[0]).toMatchObject({
      namespace: 'shadow-team',
      totalUsd: 0.42,
      billingAmount: 0.42,
      billingUnit: 'usd',
      totalTokens: 1500,
    })
  })

  it('caches namespace summaries briefly to avoid repeated pod exec storms', () => {
    const { service, getExecCallCount } = makeService({
      deployments: [
        {
          name: 'assistant-3',
          ready: '1/1',
          upToDate: '1',
          available: '1',
          age: new Date().toISOString(),
        },
      ],
      pods: [
        {
          name: 'assistant-3-ghi789',
          ready: '1/1',
          status: 'Running',
          restarts: 0,
          age: new Date().toISOString(),
        },
      ],
      execOutputs: [
        {
          stdout: JSON.stringify({
            usage: {
              providers: [
                {
                  provider: 'anthropic',
                  cost: { total: 0.15 },
                  tokens: { total: 900 },
                },
              ],
            },
          }),
        },
      ],
    })

    const first = service.collectNamespace('shadow-team')
    const second = service.collectNamespace('shadow-team')

    expect(second).toBe(first)
    expect(getExecCallCount()).toBe(1)
  })
})
