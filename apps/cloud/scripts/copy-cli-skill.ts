import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLOUD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(CLOUD_ROOT, '..', '..', 'skills', 'shadowob-cli', 'SKILL.md')
const destination = resolve(CLOUD_ROOT, 'dist', 'skills', 'shadowob-cli', 'SKILL.md')

mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source, destination)

console.log(`Copied shadowob CLI skill to ${destination}`)
