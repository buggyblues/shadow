/**
 * CLI: shadowob-cloud build — build Docker images for agents with build-image strategy.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import type { AgentDeployment } from '../../config/schema.js'
import { collectPluginDockerfileStages } from '../../infra/plugin-k8s.js'
import type { ServiceContainer } from '../../services/container.js'

export function createBuildCommand(container: ServiceContainer) {
  return new Command('build')
    .description('Build Docker images for agents using build-image git source strategy')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-a, --agent <id>', 'Build a specific agent (default: all build-image agents)')
    .option('--push', 'Push image(s) after building')
    .option('--no-cache', 'Pass --no-cache to docker build')
    .option('--platform <platform>', 'Target platform(s) e.g. linux/amd64,linux/arm64')
    .option('--tag <tag>', 'Override image tag (only valid with --agent)')
    .option('--output-dockerfile', 'Print generated Dockerfile(s) to stdout, skip building')
    .action(
      async (options: {
        file: string
        agent?: string
        push?: boolean
        noCache?: boolean
        platform?: string
        tag?: string
        outputDockerfile?: boolean
      }) => {
        const filePath = resolve(options.file)

        if (!existsSync(filePath)) {
          container.logger.error(`Config file not found: ${filePath}`)
          process.exit(1)
        }

        container.logger.step('Parsing config...')
        let config: ReturnType<typeof container.config.parseFile>
        try {
          config = container.config.parseFile(filePath)
        } catch (err) {
          container.logger.error((err as Error).message)
          process.exit(1)
        }

        const resolved = container.config.resolve(config)
        const allAgents: AgentDeployment[] = resolved.deployments?.agents ?? []

        let targets = allAgents.filter((a) => a.source?.strategy === 'build-image' && a.source.git)

        if (options.agent) {
          targets = targets.filter((a) => a.id === options.agent)
          if (targets.length === 0) {
            container.logger.error(
              `Agent "${options.agent}" not found or does not have strategy: build-image`,
            )
            process.exit(1)
          }
        }

        if (targets.length === 0) {
          container.logger.warn('No agents with strategy: build-image found. Nothing to build.')
          return
        }

        container.logger.info(`Found ${targets.length} agent(s) to build`)

        for (const agent of targets) {
          const stages = collectPluginDockerfileStages(agent, resolved, 'build')
          const dockerfile = stages[0] ?? ''
          const imageTag =
            (options.agent ? options.tag : undefined) ??
            agent.image ??
            `shadowob-cloud/${agent.id}:latest`

          if (options.outputDockerfile) {
            console.log(`# --- Dockerfile for ${agent.id} ---`)
            console.log(dockerfile)
            console.log()
            continue
          }

          container.logger.step(`Building image for ${agent.id}: ${imageTag}`)

          const tmpDir = mkdtempSync(join(tmpdir(), `shadowob-cloud-build-${agent.id}-`))
          const dockerfilePath = join(tmpDir, 'Dockerfile')
          writeFileSync(dockerfilePath, dockerfile, 'utf-8')

          try {
            const buildArgs = ['build', '-t', imageTag, '-f', dockerfilePath, tmpDir]
            if (options.noCache) buildArgs.push('--no-cache')
            if (options.platform) buildArgs.push('--platform', options.platform)

            await new Promise<void>((resolve, reject) => {
              const proc = spawn('docker', buildArgs, { stdio: 'inherit' })
              proc.on('close', (code) => {
                if (code === 0) resolve()
                else reject(new Error(`docker build exited with code ${code}`))
              })
              proc.on('error', reject)
            })

            container.logger.success(`Built: ${imageTag}`)

            if (options.push) {
              container.logger.step(`Pushing ${imageTag}...`)
              await new Promise<void>((resolve, reject) => {
                const proc = spawn('docker', ['push', imageTag], { stdio: 'inherit' })
                proc.on('close', (code) => {
                  if (code === 0) resolve()
                  else reject(new Error(`docker push exited with code ${code}`))
                })
                proc.on('error', reject)
              })
              container.logger.success(`Pushed: ${imageTag}`)
            }
          } finally {
            rmSync(tmpDir, { recursive: true, force: true })
          }
        }
      },
    )
}
