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
  'opencode-runner',
  'hermes-runner',
] as const
export const DEFAULT_IMAGE_TAG =
  process.env.SHADOWOB_RUNNER_IMAGE_TAG?.trim() || '20260604-faststart'

export type ImageName = (typeof IMAGES)[number]

export interface ImageBuildOptions {
  name: string
  tag?: string
  noCache?: boolean
  intoK8s?: boolean
  push?: boolean
  skipSmoke?: boolean
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
    return process.env.SHADOWOB_REGISTRY ?? 'ghcr.io/buggyblues'
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
    const { name, tag = DEFAULT_IMAGE_TAG, noCache, intoK8s, push, skipSmoke, platform } = options
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

    if (!skipSmoke) {
      this.smoke(name, tag)
    }

    if (push) {
      await this.push(name, tag)
    }
  }

  /** Push an image to the registry. */
  async push(name: string, tag = DEFAULT_IMAGE_TAG): Promise<void> {
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
    const repoRoot = resolve(this.imagesDir, '../../..')
    const workspacePackage = resolve(repoRoot, 'package.json')
    const workspaceFile = resolve(repoRoot, 'pnpm-workspace.yaml')
    return existsSync(workspacePackage) && existsSync(workspaceFile)
      ? repoRoot
      : resolve(this.imagesDir, name)
  }

  private smoke(name: string, tag: string): void {
    const script = resolve(this.imagesDir, '../scripts/smoke-test-images.mjs')
    if (!existsSync(script)) {
      throw new Error(`Image smoke script not found: ${script}`)
    }
    this.logger.step(`Smoke testing ${name}:${tag}...`)
    try {
      execFileSync(process.execPath, [script, name, '--tag', tag], {
        stdio: 'inherit',
        timeout: 600_000,
        env: process.env,
      })
      this.logger.success(`Smoke passed: ${name}:${tag}`)
    } catch (err) {
      throw new Error(`Smoke failed: ${(err as Error).message}`)
    }
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
