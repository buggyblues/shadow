import { execFile } from 'node:child_process'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  applyKubernetesManifestAsync,
  createVolumeSnapshotBackupAsync,
  deleteKubernetesResourceAsync,
  execInPodAsync,
  getPvcVolumeSnapshotCapability,
  isVolumeSnapshotApiAvailable,
  listPodsAsync,
  waitForPodReadyAsync,
  waitForVolumeSnapshotReady,
} from '@shadowob/cloud'
import type { AppContainer } from '../container'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { CloudDeploymentBackupDao } from '../dao/cloud-deployment-backup.dao'
import { type RuntimeStateTarget, resolveRuntimeStateTarget } from './cloud-runtime-state'

const CLOUD_BACKUP_HELPER_IMAGE = process.env.CLOUD_BACKUP_HELPER_IMAGE ?? 'busybox:1.36'
const CLOUD_BACKUP_ENCRYPTION_MAGIC = Buffer.from('SHADOWOB-BACKUP-AESGCM-v1\n')
const execFileAsync = promisify(execFile)

type CloudBackupDriver = 'volumeSnapshot' | 'restic' | 'git'
type CloudBackupPhase = 'object-storing' | 'git-cloning' | 'git-pushing'
type CloudBackupDeployment = {
  id: string
  userId: string
  name: string
  namespace: string
  configSnapshot?: unknown
}
type CloudBackupRecord = {
  id: string
  namespace: string
  agentId: string
  pvcName: string
  objectKey: string | null
  snapshotName: string | null
}
type ObjectStoreBackupResult = {
  archiveBytes: number
  storedBytes: number
  encrypted: boolean
  source: 'running-pod' | 'helper-pod'
}
export type GitBackupTarget = {
  repository: string
  branch?: string
  pathPrefix?: string
  token: string
}
type GitHubRepositoryRef = {
  owner: string
  repo: string
  cloneUrl: string
  displayRepository: string
}
type NormalizedGitHubBackupTarget = GitHubRepositoryRef & {
  branch: string
  pathPrefix: string
  token: string
}
type RuntimeArchiveResult = {
  archive: Buffer
  source: 'running-pod' | 'helper-pod'
}

export function objectBackupKey(deploymentId: string, agentId: string, stamp: string) {
  const safeAgent = agentId
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const agentSegment =
    safeAgent || `agent-${createHash('sha256').update(agentId).digest('hex').slice(0, 12)}`
  return `backups/cloud/${deploymentId}/${agentSegment}/${stamp}.tar.gz`
}

function parseGitHubRepository(rawRepository: string): GitHubRepositoryRef {
  const raw = rawRepository.trim()
  let owner: string
  let repo: string

  const shorthand = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/)
  if (shorthand) {
    owner = shorthand[1]!
    repo = shorthand[2]!
  } else {
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      throw new Error(
        'GitHub repository must be owner/repo or an https://github.com/owner/repo URL',
      )
    }
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
      throw new Error('GitHub backup only supports https://github.com repositories')
    }
    const parts = parsed.pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean)
    if (parts.length !== 2) {
      throw new Error('GitHub repository URL must point to exactly one owner/repo')
    }
    owner = parts[0]!
    repo = parts[1]!.replace(/\.git$/i, '')
  }

  const repoId = `${owner}/${repo}`
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoId)) {
    throw new Error('GitHub repository contains unsupported characters')
  }

  return {
    owner,
    repo,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    displayRepository: `github.com/${owner}/${repo}`,
  }
}

function normalizeGitHubBackupTarget(target: GitBackupTarget): NormalizedGitHubBackupTarget {
  const repository = parseGitHubRepository(target.repository)
  const branch = (target.branch?.trim() || 'main').replace(/^refs\/heads\//, '')
  if (!/^[A-Za-z0-9._/-]{1,128}$/.test(branch) || branch.includes('..')) {
    throw new Error('GitHub backup branch contains unsupported characters')
  }

  const pathPrefix = (target.pathPrefix?.trim() || 'shadow-backups')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
  if (
    !/^[A-Za-z0-9._/-]{1,200}$/.test(pathPrefix) ||
    pathPrefix.split('/').some((part) => part === '..' || part === '.' || part === '.git')
  ) {
    throw new Error('GitHub backup path contains unsupported characters')
  }

  const token = target.token.trim()
  if (!token) throw new Error('GitHub token is required')

  return {
    ...repository,
    branch,
    pathPrefix,
    token,
  }
}

function githubBackupArtifactUri(target: NormalizedGitHubBackupTarget, relativePath: string) {
  return `github://${target.displayRepository}/${encodeURIComponent(target.branch)}/${relativePath}`
}

function safeGitBackupFilePath(
  target: NormalizedGitHubBackupTarget,
  options: {
    namespace: string
    agentId: string
    stamp: string
  },
) {
  const cleanNamespace = options.namespace
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const cleanAgent = options.agentId
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${target.pathPrefix}/${cleanNamespace || 'namespace'}/${cleanAgent || 'agent'}/${options.stamp}.tar.gz`
}

function expiresAtFromRetentionDays(retentionDays?: number): Date | null {
  if (!retentionDays) return null
  return new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
}

function backupHelperPodName(backupId: string, purpose: 'backup' | 'restore') {
  const suffix = backupId
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, 10)
  return `shadow-${purpose}-${suffix}`
}

function resolveObjectBackupEncryptionKey(): Buffer | null {
  const raw = process.env.CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY?.trim()
  if (!raw) {
    if (process.env.CLOUD_BACKUP_OBJECT_ENCRYPTION_REQUIRED === 'true') {
      throw new Error('CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY is required for object backups')
    }
    return null
  }

  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.byteLength !== 32) {
    throw new Error('CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY must be 32 bytes encoded as base64 or hex')
  }
  return key
}

function startsWithBuffer(value: Buffer, prefix: Buffer): boolean {
  return (
    value.byteLength >= prefix.byteLength && value.subarray(0, prefix.byteLength).equals(prefix)
  )
}

export function encryptObjectBackupArchive(archive: Buffer): Buffer {
  const key = resolveObjectBackupEncryptionKey()
  if (!key) return archive

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()])
  const tag = cipher.getAuthTag()
  const metadata = Buffer.from(
    JSON.stringify({
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    }),
  )
  return Buffer.concat([CLOUD_BACKUP_ENCRYPTION_MAGIC, metadata, Buffer.from('\n'), ciphertext])
}

function encryptGitHubBackupArchive(archive: Buffer): Buffer {
  const storedArchive = encryptObjectBackupArchive(archive)
  if (storedArchive === archive && process.env.CLOUD_GITHUB_BACKUP_ALLOW_PLAINTEXT !== 'true') {
    throw new Error(
      'CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY is required for GitHub backups; set CLOUD_GITHUB_BACKUP_ALLOW_PLAINTEXT=true only for non-sensitive test data',
    )
  }
  return storedArchive
}

export function decryptObjectBackupArchiveIfNeeded(archive: Buffer): Buffer {
  if (!startsWithBuffer(archive, CLOUD_BACKUP_ENCRYPTION_MAGIC)) return archive
  const metaStart = CLOUD_BACKUP_ENCRYPTION_MAGIC.byteLength
  const metaEnd = archive.indexOf('\n', metaStart)
  if (metaEnd <= metaStart) throw new Error('Encrypted backup archive metadata is malformed')

  const metadata = JSON.parse(archive.subarray(metaStart, metaEnd).toString('utf8')) as {
    alg?: string
    iv?: string
    tag?: string
  }
  if (metadata.alg !== 'aes-256-gcm' || !metadata.iv || !metadata.tag) {
    throw new Error('Encrypted backup archive metadata is unsupported')
  }
  const key = resolveObjectBackupEncryptionKey()
  if (!key) throw new Error('Object backup is encrypted but no decryption key is configured')

  const iv = Buffer.from(metadata.iv, 'base64')
  const tag = Buffer.from(metadata.tag, 'base64')
  if (iv.byteLength !== 12 || tag.byteLength !== 16) {
    throw new Error('Encrypted backup archive metadata has invalid key material')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const ciphertext = archive.subarray(metaEnd + 1)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

async function createStatePvcHelperPod(options: {
  namespace: string
  podName: string
  pvcName: string
  kubeconfig?: string
}) {
  await deleteStatePvcHelperPod(options)
  await applyKubernetesManifestAsync(
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: options.podName,
        namespace: options.namespace,
        labels: {
          app: 'shadowob-cloud',
          'shadowob.cloud/backup-helper': 'true',
        },
      },
      spec: {
        restartPolicy: 'Never',
        automountServiceAccountToken: false,
        securityContext: {
          runAsUser: 1000,
          runAsGroup: 1000,
          fsGroup: 1000,
          seccompProfile: { type: 'RuntimeDefault' },
        },
        containers: [
          {
            name: 'archive',
            image: CLOUD_BACKUP_HELPER_IMAGE,
            imagePullPolicy: 'IfNotPresent',
            command: ['sh', '-c', 'trap : TERM INT; sleep 3600 & wait'],
            securityContext: {
              allowPrivilegeEscalation: false,
              capabilities: { drop: ['ALL'] },
            },
            volumeMounts: [{ name: 'state', mountPath: '/state' }],
          },
        ],
        volumes: [
          {
            name: 'state',
            persistentVolumeClaim: { claimName: options.pvcName },
          },
        ],
      },
    },
    options.kubeconfig,
    30_000,
  )
  await waitForPodReadyAsync({
    namespace: options.namespace,
    pod: options.podName,
    kubeconfig: options.kubeconfig,
    timeoutMs: 90_000,
  })
}

async function deleteStatePvcHelperPod(options: {
  namespace: string
  podName: string
  kubeconfig?: string
}) {
  await deleteKubernetesResourceAsync({
    namespace: options.namespace,
    kind: 'pod',
    name: options.podName,
    kubeconfig: options.kubeconfig,
    timeoutMs: 30_000,
  }).catch(() => {})
}

async function findRunningAgentPod(options: {
  namespace: string
  agentId: string
  kubeconfig?: string
}) {
  const pods = await listPodsAsync(options.namespace, options.kubeconfig).catch(() => [])
  return (
    pods.find((pod) => pod.name === options.agentId && pod.status === 'Running') ??
    pods.find((pod) => pod.name.includes(options.agentId) && pod.status === 'Running') ??
    null
  )
}

async function readStateArchiveFromPod(options: {
  namespace: string
  podName: string
  path: string
  container?: string
  kubeconfig?: string
}) {
  const result = await execInPodAsync({
    namespace: options.namespace,
    pod: options.podName,
    container: options.container,
    kubeconfig: options.kubeconfig,
    timeout: 180_000,
    command: [
      'sh',
      '-lc',
      `mkdir -p ${options.path} && cd ${options.path} && tar -czf - . | base64 | tr -d '\\n'`,
    ],
  })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || 'Failed to archive state PVC')
  }
  const encoded = result.stdout.trim()
  if (!encoded) throw new Error('State archive was empty')
  return Buffer.from(encoded, 'base64')
}

async function putObjectArchive(options: {
  container: AppContainer
  objectKey: string
  archive: Buffer
}): Promise<{ storedBytes: number; encrypted: boolean }> {
  const object = encryptObjectBackupArchive(options.archive)
  await options.container
    .resolve('mediaService')
    .putPrivateObject(
      options.objectKey,
      object,
      object === options.archive ? 'application/gzip' : 'application/octet-stream',
    )
  return { storedBytes: object.byteLength, encrypted: object !== options.archive }
}

async function createRuntimeStateArchive(options: {
  container: AppContainer
  deployment: CloudBackupDeployment
  backup: CloudBackupRecord
  target: RuntimeStateTarget
  kubeconfig?: string
}): Promise<RuntimeArchiveResult> {
  const runningPod = await findRunningAgentPod({
    namespace: options.deployment.namespace,
    agentId: options.backup.agentId,
    kubeconfig: options.kubeconfig,
  })
  if (runningPod) {
    try {
      const archive = await readStateArchiveFromPod({
        namespace: options.deployment.namespace,
        podName: runningPod.name,
        path: options.target.statePath,
        container: options.target.containerName,
        kubeconfig: options.kubeconfig,
      })
      return { archive, source: 'running-pod' }
    } catch (err) {
      options.container.resolve('logger').warn(
        {
          err,
          namespace: options.deployment.namespace,
          backupId: options.backup.id,
          agentId: options.backup.agentId,
          podName: runningPod.name,
        },
        'Falling back to backup helper pod after running pod archive failed',
      )
    }
  }

  if (!options.target.persistentState) {
    throw new Error(
      `Runtime state for agent "${options.target.agentId}" is not backed by a PVC; cannot fall back to helper-pod backup`,
    )
  }

  const helperPod = backupHelperPodName(options.backup.id, 'backup')
  await createStatePvcHelperPod({
    namespace: options.deployment.namespace,
    podName: helperPod,
    pvcName: options.backup.pvcName,
    kubeconfig: options.kubeconfig,
  })

  try {
    const archive = await readStateArchiveFromPod({
      namespace: options.deployment.namespace,
      podName: helperPod,
      path: '/state',
      kubeconfig: options.kubeconfig,
    })
    return { archive, source: 'helper-pod' }
  } finally {
    await deleteStatePvcHelperPod({
      namespace: options.deployment.namespace,
      podName: helperPod,
      kubeconfig: options.kubeconfig,
    })
  }
}

async function createObjectStoreBackup(options: {
  container: AppContainer
  deployment: CloudBackupDeployment
  backup: CloudBackupRecord
  target: RuntimeStateTarget
  kubeconfig?: string
  onPhase?: (phase: CloudBackupPhase) => Promise<void>
}): Promise<ObjectStoreBackupResult> {
  if (!options.backup.objectKey) throw new Error('Object backup key is missing')
  const runtimeArchive = await createRuntimeStateArchive(options)
  await options.onPhase?.('object-storing')
  const stored = await putObjectArchive({
    container: options.container,
    objectKey: options.backup.objectKey,
    archive: runtimeArchive.archive,
  })
  return {
    archiveBytes: runtimeArchive.archive.byteLength,
    ...stored,
    source: runtimeArchive.source,
  }
}

async function runGit(
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {},
) {
  try {
    return await execFileAsync('git', args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      timeout: options.timeoutMs ?? 180_000,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch (err) {
    const error = err as Error & { stderr?: string; stdout?: string; code?: string | number }
    let detail = (error.stderr || error.stdout || error.message || 'git command failed')
      .replace(/https:\/\/[^@\s]+@github\.com/gi, 'https://***@github.com')
      .slice(0, 600)
    for (const value of Object.values(options.env ?? {})) {
      if (value.length >= 8) detail = detail.split(value).join('***')
    }
    throw new Error(detail)
  }
}

async function createGitAskpassScript(dir: string) {
  const script = join(dir, 'git-askpass.sh')
  const body = [
    '#!/bin/sh',
    'case "$1" in',
    '  *Username*) printf "%s\\n" "x-access-token" ;;',
    '  *) printf "%s\\n" "$SHADOWOB_GITHUB_TOKEN" ;;',
    'esac',
    '',
  ].join('\n')
  await writeFile(script, body, { encoding: 'utf8', mode: 0o700 })
  await chmod(script, 0o700).catch(() => {})
  return script
}

async function createGitHubBackup(options: {
  target: NormalizedGitHubBackupTarget
  archive: Buffer
  namespace: string
  agentId: string
  stamp: string
  onPhase?: (phase: CloudBackupPhase) => Promise<void>
}): Promise<{ artifact: string; commitSha: string; repository: string; branch: string }> {
  const target = options.target
  const root = await mkdtemp(join(tmpdir(), 'shadow-github-backup-'))
  try {
    const askpass = await createGitAskpassScript(root)
    const env = {
      GIT_ASKPASS: askpass,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      SHADOWOB_GITHUB_TOKEN: target.token,
    }
    const repoDir = join(root, 'repo')
    await options.onPhase?.('git-cloning')
    await runGit(['clone', '--depth', '1', '--branch', target.branch, target.cloneUrl, repoDir], {
      env,
      timeoutMs: 240_000,
    })
    await runGit(['config', 'user.name', 'Shadow Backup'], { cwd: repoDir, env })
    await runGit(['config', 'user.email', 'shadow-backup@shadowob.local'], { cwd: repoDir, env })

    const relativePath = safeGitBackupFilePath(target, {
      namespace: options.namespace,
      agentId: options.agentId,
      stamp: options.stamp,
    })
    const absolutePath = join(repoDir, ...relativePath.split('/'))
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, options.archive, { mode: 0o600 })

    await runGit(['add', '--', relativePath], { cwd: repoDir, env })
    await runGit(
      [
        'commit',
        '-m',
        `chore(shadow): backup ${options.namespace}/${options.agentId} ${options.stamp}`,
      ],
      { cwd: repoDir, env },
    )
    const { stdout } = await runGit(['rev-parse', 'HEAD'], { cwd: repoDir, env })
    const commitSha = stdout.trim()
    await options.onPhase?.('git-pushing')
    await runGit(['push', 'origin', `HEAD:${target.branch}`], {
      cwd: repoDir,
      env,
      timeoutMs: 240_000,
    })
    return {
      artifact: githubBackupArtifactUri(target, relativePath),
      commitSha,
      repository: target.displayRepository,
      branch: target.branch,
    }
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {})
  }
}

async function resolveBackupDriver(options: {
  namespace: string
  pvcName: string
  kubeconfig?: string
}): Promise<{
  driver: CloudBackupDriver
  volumeSnapshotClassName: string | null
  fallbackReason: string | null
}> {
  const snapshotApiAvailable = await isVolumeSnapshotApiAvailable({
    kubeconfig: options.kubeconfig,
  }).catch(() => false)
  if (!snapshotApiAvailable) {
    return {
      driver: 'restic',
      volumeSnapshotClassName: null,
      fallbackReason: 'VolumeSnapshot API is unavailable',
    }
  }

  const snapshotCapability = await getPvcVolumeSnapshotCapability(options).catch(() => null)
  if (!snapshotCapability?.isCsi) {
    return {
      driver: 'restic',
      volumeSnapshotClassName: null,
      fallbackReason: `PVC "${options.pvcName}" is not backed by a CSI StorageClass`,
    }
  }
  if (!snapshotCapability.volumeSnapshotClassName) {
    return {
      driver: 'restic',
      volumeSnapshotClassName: null,
      fallbackReason: `PVC "${options.pvcName}" does not have a matching VolumeSnapshotClass for provisioner "${snapshotCapability.provisioner}"`,
    }
  }

  return {
    driver: 'volumeSnapshot',
    volumeSnapshotClassName: snapshotCapability.volumeSnapshotClassName,
    fallbackReason: null,
  }
}

export async function runCloudDeploymentBackup(options: {
  appContainer: AppContainer
  deploymentDao: CloudDeploymentDao
  backupDao: CloudDeploymentBackupDao
  deployment: CloudBackupDeployment
  agentId: string
  kubeconfig?: string
  retentionDays?: number
  reason?: string
  gitHubTarget?: GitBackupTarget
}) {
  const target = resolveRuntimeStateTarget(options.deployment, options.agentId)
  const pvcName = target.pvcName
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const gitHubTarget = options.gitHubTarget
    ? normalizeGitHubBackupTarget(options.gitHubTarget)
    : null
  const { driver, volumeSnapshotClassName, fallbackReason } = gitHubTarget
    ? {
        driver: 'git' as CloudBackupDriver,
        volumeSnapshotClassName: null,
        fallbackReason: null,
      }
    : target.persistentState
      ? await resolveBackupDriver({
          namespace: options.deployment.namespace,
          pvcName,
          kubeconfig: options.kubeconfig,
        })
      : {
          driver: 'restic' as CloudBackupDriver,
          volumeSnapshotClassName: null,
          fallbackReason: 'runtime state is not backed by a PVC',
        }
  const artifactBase = `${options.deployment.namespace}-${options.agentId}-${stamp}`
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
  const backup = await options.backupDao.create({
    userId: options.deployment.userId,
    deploymentId: options.deployment.id,
    namespace: options.deployment.namespace,
    agentId: options.agentId,
    sandboxName: options.agentId,
    pvcName,
    driver,
    snapshotName: driver === 'volumeSnapshot' ? artifactBase : null,
    objectKey:
      driver === 'restic'
        ? objectBackupKey(options.deployment.id, options.agentId, stamp)
        : driver === 'git' && gitHubTarget
          ? githubBackupArtifactUri(
              gitHubTarget,
              safeGitBackupFilePath(gitHubTarget, {
                namespace: options.deployment.namespace,
                agentId: options.agentId,
                stamp,
              }),
            )
          : null,
    status: 'running',
    phase: 'queued',
    expiresAt: expiresAtFromRetentionDays(options.retentionDays),
  })
  if (!backup) {
    throw new Error('Failed to create backup record')
  }

  await options.deploymentDao.appendLog(
    options.deployment.id,
    `[backup] Queued ${driver} backup ${backup.id} for agent "${options.agentId}"${
      options.reason ? ` (${options.reason})` : ''
    }${driver === 'restic' && fallbackReason ? ` because ${fallbackReason}` : ''}`,
    'info',
  )

  try {
    if (driver === 'volumeSnapshot') {
      if (!backup.snapshotName) throw new Error('VolumeSnapshot name is missing')
      await options.backupDao.updatePhase(backup.id, 'snapshot-creating')
      await createVolumeSnapshotBackupAsync({
        namespace: options.deployment.namespace,
        snapshotName: backup.snapshotName,
        pvcName: backup.pvcName,
        volumeSnapshotClassName: volumeSnapshotClassName ?? undefined,
        kubeconfig: options.kubeconfig,
      })
      await options.backupDao.updatePhase(backup.id, 'snapshot-waiting')
      await waitForVolumeSnapshotReady({
        namespace: options.deployment.namespace,
        snapshotName: backup.snapshotName,
        kubeconfig: options.kubeconfig,
        timeoutMs: 180_000,
      })
      await options.deploymentDao.appendLog(
        options.deployment.id,
        `[backup] VolumeSnapshot ${backup.snapshotName} is ready for agent "${options.agentId}"`,
        'info',
      )
    } else if (driver === 'git' && gitHubTarget) {
      await options.backupDao.updatePhase(backup.id, 'object-archiving')
      const runtimeArchive = await createRuntimeStateArchive({
        container: options.appContainer,
        deployment: options.deployment,
        backup,
        target,
        kubeconfig: options.kubeconfig,
      })
      const result = await createGitHubBackup({
        target: gitHubTarget,
        archive: encryptGitHubBackupArchive(runtimeArchive.archive),
        namespace: options.deployment.namespace,
        agentId: options.agentId,
        stamp,
        onPhase: async (phase) => {
          await options.backupDao.updatePhase(backup.id, phase)
        },
      })
      await options.deploymentDao.appendLog(
        options.deployment.id,
        `[backup] GitHub archive ${result.artifact} is ready for agent "${options.agentId}" (commit=${result.commitSha}, source=${runtimeArchive.source})`,
        'info',
      )
    } else {
      await options.backupDao.updatePhase(backup.id, 'object-archiving')
      const result = await createObjectStoreBackup({
        container: options.appContainer,
        deployment: options.deployment,
        backup,
        target,
        kubeconfig: options.kubeconfig,
        onPhase: async (phase) => {
          await options.backupDao.updatePhase(backup.id, phase)
        },
      })
      await options.deploymentDao.appendLog(
        options.deployment.id,
        `[backup] Archived ${result.archiveBytes} bytes from ${result.source} for agent "${options.agentId}" (stored=${result.storedBytes} bytes, encrypted=${result.encrypted ? 'yes' : 'no'})`,
        'info',
      )
      await options.deploymentDao.appendLog(
        options.deployment.id,
        `[backup] Object archive ${backup.objectKey} is ready for agent "${options.agentId}"`,
        'info',
      )
    }
    return await options.backupDao.updateStatus(backup.id, 'succeeded')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await options.backupDao.updateStatus(backup.id, 'failed', message).catch(() => null)
    await options.deploymentDao
      .appendLog(options.deployment.id, `[backup] Failed: ${message}`, 'error')
      .catch(() => null)
    throw err
  }
}
