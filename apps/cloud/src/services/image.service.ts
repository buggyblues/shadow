/**
 * ImageService — Docker image build and push operations.
 *
 * Manages building, tagging, and pushing container images
 * for agent runtimes.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Logger } from '../utils/logger.js'
import { resolveCloudPackageAssetDir } from '../utils/package-asset-path.js'

export const IMAGES = [
  'openclaw-runner',
  'claude-runner',
  'codex-runner',
  'gemini-runner',
  'opencode-runner',
] as const

export type ImageName = (typeof IMAGES)[number]

export interface ImageBuildOptions {
  name: string
  tag?: string
  noCache?: boolean
  intoK8s?: boolean
  push?: boolean
  platform?: string
}

export class ImageService {
  private imagesDir: string
  private logger: Logger

  constructor(logger: Logger, imagesDir?: string) {
    this.logger = logger
    this.imagesDir = imagesDir ?? resolveCloudPackageAssetDir('images')
  }

  /** Get the images directory path. */
  getImagesDir(): string {
    return this.imagesDir
  }

  /** Get the container registry URL. */
  getRegistry(): string {
    return process.env.SHADOWOB_REGISTRY ?? 'ghcr.io/shadowob'
  }

  /** Get all available image names. */
  getAvailableImages(): readonly string[] {
    return IMAGES
  }

  /** Get a local image tag. */
  getLocalTag(name: string, tag: string): string {
    return `shadowob/${name}:${tag}`
  }

  /** Build a Docker image with streaming output. */
  async build(options: ImageBuildOptions): Promise<void> {
    const { name, tag = 'latest', noCache, intoK8s, push, platform } = options
    const dockerfilePath = resolve(this.imagesDir, name, 'Dockerfile')
    const buildContext = this.getBuildContext(name)

    if (!existsSync(dockerfilePath)) {
      throw new Error(`Dockerfile not found: ${dockerfilePath}`)
    }

    if (!IMAGES.includes(name as ImageName)) {
      throw new Error(`Unknown image: ${name}. Available: ${IMAGES.join(', ')}`)
    }

    const registry = this.getRegistry()
    const remoteTag = `${registry}/${name}:${tag}`
    const localTag = this.getLocalTag(name, tag)

    this.logger.step(`Building ${name} (tag: ${intoK8s ? localTag : remoteTag})...`)
    await this.prepareBuildContext(name)

    const buildArgs: string[] = ['-t', intoK8s ? localTag : remoteTag]
    if (intoK8s) buildArgs.push('-t', remoteTag)
    if (noCache) buildArgs.push('--no-cache')
    if (platform) buildArgs.push('--platform', platform)
    buildArgs.push('-f', dockerfilePath, buildContext)

    await this.dockerBuild(buildArgs)

    if (intoK8s) {
      this.logger.success(`Built: ${localTag} (also tagged as ${remoteTag})`)
    } else {
      this.logger.success(`Built: ${remoteTag}`)
    }

    if (push) {
      await this.push(name, tag)
    }
  }

  /** Push an image to the registry. */
  async push(name: string, tag = 'latest'): Promise<void> {
    const registry = this.getRegistry()
    const fullTag = `${registry}/${name}:${tag}`
    this.logger.step(`Pushing ${fullTag}...`)
    try {
      execFileSync('docker', ['push', fullTag], { stdio: 'inherit', timeout: 600_000 })
      this.logger.success(`Pushed: ${fullTag}`)
    } catch (err) {
      throw new Error(`Push failed: ${(err as Error).message}`)
    }
  }

  /** List available image definitions with their status. */
  list(): Array<{ name: string; hasDockerfile: boolean }> {
    return IMAGES.map((name) => ({
      name,
      hasDockerfile: existsSync(resolve(this.imagesDir, name, 'Dockerfile')),
    }))
  }

  private getBuildContext(name: string): string {
    if (name !== 'openclaw-runner') return resolve(this.imagesDir, name)

    const repoRoot = resolve(this.imagesDir, '../../..')
    const localShadowobPlugin = resolve(repoRoot, 'packages', 'openclaw-shadowob', 'package.json')
    return existsSync(localShadowobPlugin) ? repoRoot : resolve(this.imagesDir, name)
  }

  private async prepareBuildContext(name: string): Promise<void> {
    if (name !== 'openclaw-runner') return

    const repoRoot = resolve(this.imagesDir, '../../..')
    const localShadowobPlugin = resolve(repoRoot, 'packages', 'openclaw-shadowob', 'package.json')
    if (!existsSync(localShadowobPlugin)) return

    this.logger.step('Building local @shadowob/openclaw-shadowob package for runner image...')
    await this.spawnProcess('pnpm', ['--filter', '@shadowob/openclaw-shadowob', 'build'], repoRoot)
  }

  private dockerBuild(args: string[]): Promise<void> {
    return this.spawnProcess('docker', ['build', ...args])
  }

  private spawnProcess(command: string, args: string[], cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { cwd, stdio: 'inherit' })
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      })
      proc.on('error', reject)
    })
  }
}
