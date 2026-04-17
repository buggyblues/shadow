import { execFileSync, spawnSync } from 'node:child_process'
import { Command } from 'commander'

export function createCloudCommand(): Command {
  const cloud = new Command('cloud')
    .description('Shadow Cloud — deploy AI agent clusters to Kubernetes (via shadowob-cloud)')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async (_, cmd) => {
      const args = cmd.args ?? []
      ensureCloudCliInstalled()
      spawnCloudCli(args)
    })

  return cloud
}

function ensureCloudCliInstalled(): void {
  try {
    execFileSync('shadowob-cloud', ['--version'], { stdio: 'ignore' })
  } catch {
    console.error('shadowob-cloud is not installed.')
    console.error('Install it with: npm install -g @shadowob/cloud')
    process.exit(1)
  }
}

function spawnCloudCli(args: string[]): void {
  const result = spawnSync('shadowob-cloud', args, { stdio: 'inherit' })
  if (result.status !== null) {
    process.exit(result.status)
  }
}
