import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export type RuntimeSkillCopy = {
  id: string
  source: string
  destination: string
}

const CLOUD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function findRepositoryRoot(startDir = CLOUD_ROOT): string {
  let currentDir = startDir

  while (true) {
    if (
      existsSync(resolve(currentDir, 'package.json')) &&
      existsSync(resolve(currentDir, 'skills'))
    ) {
      return currentDir
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  throw new Error(`Cannot find repository skills directory from ${startDir}`)
}

export function discoverRuntimeSkills(options?: {
  repositoryRoot?: string
  cloudRoot?: string
}): RuntimeSkillCopy[] {
  const cloudRoot = options?.cloudRoot ?? CLOUD_ROOT
  const repositoryRoot = options?.repositoryRoot ?? findRepositoryRoot(cloudRoot)
  const skillsRoot = resolve(repositoryRoot, 'skills')

  if (!existsSync(skillsRoot)) {
    throw new Error(`Cannot find skills directory at ${skillsRoot}`)
  }

  const copies = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const source = resolve(skillsRoot, entry.name, 'SKILL.md')
      return {
        id: entry.name,
        source,
        destination: resolve(cloudRoot, 'dist', 'skills', entry.name, 'SKILL.md'),
      }
    })
    .filter((copy) => existsSync(copy.source))
    .sort((a, b) => a.id.localeCompare(b.id))

  if (copies.length === 0) {
    throw new Error(`No runtime skills found under ${skillsRoot}`)
  }

  return copies
}

export function copyRuntimeSkills(options?: {
  repositoryRoot?: string
  cloudRoot?: string
}): RuntimeSkillCopy[] {
  const copies = discoverRuntimeSkills(options)

  for (const copy of copies) {
    mkdirSync(dirname(copy.destination), { recursive: true })
    copyFileSync(copy.source, copy.destination)
  }

  console.log(
    `Copied ${copies.length} runtime skill(s) to ${resolve(options?.cloudRoot ?? CLOUD_ROOT, 'dist', 'skills')}`,
  )
  return copies
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  copyRuntimeSkills()
}
