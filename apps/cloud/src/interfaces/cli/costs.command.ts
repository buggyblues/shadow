/**
 * CLI: shadowob-cloud costs — collect runtime usage and cost summaries.
 */

import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'

type CostOptions = {
  file: string
  namespace?: string
  allNamespaces?: boolean
  json?: boolean
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

async function resolveNamespace(container: ServiceContainer, file: string, namespace?: string) {
  if (namespace) return namespace

  const filePath = resolve(file)
  if (!(await pathExists(filePath))) return 'shadowob-cloud'

  try {
    const config = await container.config.parseFile(filePath)
    return config.deployments?.namespace ?? 'shadowob-cloud'
  } catch {
    return 'shadowob-cloud'
  }
}

function printNamespace(
  summary: Awaited<ReturnType<ServiceContainer['usageCost']['collectNamespace']>>,
) {
  console.log(`Namespace: ${summary.namespace}`)
  console.log(`Total: ${summary.totalUsd === null ? 'n/a' : `$${summary.totalUsd.toFixed(4)}`}`)
  console.log(`Tokens: ${summary.totalTokens ?? 'n/a'}`)
  console.log()
  if (summary.agents.length === 0) {
    console.log('No agents found.')
    return
  }
  console.table(
    summary.agents.map((agent) => ({
      agent: agent.agentName,
      pod: agent.podName ?? '-',
      source: agent.source,
      usd: agent.totalUsd === null ? 'n/a' : agent.totalUsd.toFixed(4),
      tokens: agent.totalTokens ?? 'n/a',
      message: agent.message ?? '',
    })),
  )
}

function printOverview(
  summary: Awaited<ReturnType<ServiceContainer['usageCost']['collectOverview']>>,
) {
  console.log(`Namespaces: ${summary.namespaces.length}`)
  console.log(`Total: ${summary.totalUsd === null ? 'n/a' : `$${summary.totalUsd.toFixed(4)}`}`)
  console.log(`Tokens: ${summary.totalTokens ?? 'n/a'}`)
  console.log()
  if (summary.namespaces.length === 0) {
    console.log('No managed namespaces found.')
    return
  }
  console.table(
    summary.namespaces.map((namespace) => ({
      namespace: namespace.namespace,
      agents: namespace.agentCount,
      usd: namespace.totalUsd === null ? 'n/a' : namespace.totalUsd.toFixed(4),
      tokens: namespace.totalTokens ?? 'n/a',
    })),
  )
}

export function createCostsCommand(container: ServiceContainer) {
  return new Command('costs')
    .description('Collect runtime usage and cost summaries from deployed agents')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .option('--all-namespaces', 'Collect all namespaces managed by shadowob-cloud')
    .option('--json', 'Output as JSON')
    .action(async (options: CostOptions) => {
      if (options.allNamespaces) {
        const namespaces = await container.k8s.getManagedNamespaces()
        const summary = await container.usageCost.collectOverview(namespaces)
        if (options.json) {
          console.log(JSON.stringify(summary, null, 2))
        } else {
          printOverview(summary)
        }
        return
      }

      const namespace = await resolveNamespace(container, options.file, options.namespace)
      const summary = await container.usageCost.collectNamespace(namespace)
      if (options.json) {
        console.log(JSON.stringify(summary, null, 2))
      } else {
        printNamespace(summary)
      }
    })
}
