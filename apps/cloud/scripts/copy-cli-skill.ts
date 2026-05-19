import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLOUD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = resolve(CLOUD_ROOT, 'dist', 'skills', 'shadowob-cli', 'SKILL.md')

function findSkillSource(): string {
  let currentDir = CLOUD_ROOT

  while (true) {
    const candidate = resolve(currentDir, 'skills', 'shadowob-cli', 'SKILL.md')
    if (existsSync(candidate)) {
      return candidate
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  throw new Error('Cannot find skills/shadowob-cli/SKILL.md for cloud CLI packaging')
}

const source = findSkillSource()

mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source, destination)

console.log(`Copied shadowob CLI skill to ${destination}`)
