/**
 * ImageService — Docker image build and push operations.
 *
 * Manages building, tagging, and pushing container images
 * for agent runtimes.
 */

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
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

function envValue(key: string): string | undefined {
  const value = process.env[key]?.trim()
  return value || undefined
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

export const DEFAULT_IMAGE_TAG =
  envValue('SHADOWOB_RUNNER_IMAGE_TAG') ?? envValue('SHADOWOB_IMAGE_TAG') ?? 'latest'

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
    return (
      envValue('SHADOWOB_RUNNER_REGISTRY') ??
      envValue('SHADOWOB_REGISTRY') ??
      `${envValue('SHADOWOB_RUNNER_IMAGE_REGISTRY') ?? envValue('SHADOWOB_IMAGE_REGISTRY') ?? 'ghcr.io'}/${
        envValue('SHADOWOB_RUNNER_IMAGE_NAMESPACE') ??
        envValue('SHADOWOB_IMAGE_NAMESPACE') ??
        'buggyblues'
      }`
    )
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
    const buildContext = await this.getBuildContext(name)

    if (!(await pathExists(dockerfilePath))) {
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
      await this.smoke(name, tag)
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
      await this.spawnProcess('docker', ['push', fullTag], undefined, 600_000)
      this.logger.success(`Pushed: ${fullTag}`)
    } catch (err) {
      throw new Error(`Push failed: ${(err as Error).message}`)
    }
  }

  /** List available image definitions with their status. */
  async list(): Promise<Array<{ name: string; hasDockerfile: boolean }>> {
    return await Promise.all(
      IMAGES.map(async (name) => ({
        name,
        hasDockerfile: await pathExists(resolve(this.imagesDir, name, 'Dockerfile')),
      })),
    )
  }

  private async getBuildContext(name: string): Promise<string> {
    const repoRoot = resolve(this.imagesDir, '../../..')
    const workspacePackage = resolve(repoRoot, 'package.json')
    const workspaceFile = resolve(repoRoot, 'pnpm-workspace.yaml')
    return (await pathExists(workspacePackage)) && (await pathExists(workspaceFile))
      ? repoRoot
      : resolve(this.imagesDir, name)
  }

  private async smoke(name: string, tag: string): Promise<void> {
    const script = resolve(this.imagesDir, '../scripts/smoke-test-images.mjs')
    if (!(await pathExists(script))) {
      throw new Error(`Image smoke script not found: ${script}`)
    }
    this.logger.step(`Smoke testing ${name}:${tag}...`)
    try {
      await this.spawnProcess(process.execPath, [script, name, '--tag', tag], undefined, 600_000)
      this.logger.success(`Smoke passed: ${name}:${tag}`)
    } catch (err) {
      throw new Error(`Smoke failed: ${(err as Error).message}`)
    }
  }

  private dockerBuild(args: string[]): Promise<void> {
    return this.spawnProcess('docker', ['build', ...args])
  }

  private spawnProcess(
    command: string,
    args: string[],
    cwd?: string,
    timeoutMs?: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { cwd, stdio: 'inherit' })
      const timer = timeoutMs
        ? setTimeout(() => {
            proc.kill('SIGTERM')
            reject(new Error(`${command} timed out after ${timeoutMs}ms`))
          }, timeoutMs)
        : undefined
      proc.on('close', (code) => {
        if (timer) clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      })
      proc.on('error', (error) => {
        if (timer) clearTimeout(timer)
        reject(error)
      })
    })
  }
}
