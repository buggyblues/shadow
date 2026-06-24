import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { copyRuntimeSkills, discoverRuntimeSkills } from '../../scripts/copy-runtime-skills.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = resolve(HERE, '../../../..')
const CLOUD_ROOT = resolve(REPOSITORY_ROOT, 'apps/cloud')

describe('built-in runtime skill packaging', () => {
  it('discovers every repository skill instead of a single hard-coded skill', () => {
    const skills = discoverRuntimeSkills({
      repositoryRoot: REPOSITORY_ROOT,
      cloudRoot: CLOUD_ROOT,
    })
    const ids = skills.map((skill) => skill.id)

    expect(ids).toEqual(
      expect.arrayContaining(['shadowob-cli', 'shadow-server-app', 'shadow-oauth-app']),
    )
    expect(skills.every((skill) => skill.destination.includes('/dist/skills/'))).toBe(true)
    expect(skills.every((skill) => skill.source.endsWith(skill.id))).toBe(true)
  })

  it('copies all built-in skills into the cloud dist tree used by production runtime imports', () => {
    const tempCloudRoot = mkdtempSync(resolve(tmpdir(), 'shadow-cloud-skills-'))

    try {
      const copied = copyRuntimeSkills({
        repositoryRoot: REPOSITORY_ROOT,
        cloudRoot: tempCloudRoot,
      })

      for (const skill of copied) {
        expect(existsSync(skill.destination)).toBe(true)
        expect(readFileSync(resolve(skill.destination, 'SKILL.md'), 'utf8')).toBe(
          readFileSync(resolve(skill.source, 'SKILL.md'), 'utf8'),
        )
      }
      expect(
        readFileSync(
          resolve(tempCloudRoot, 'dist/skills/shadow-server-app/references/server-app-standard.md'),
          'utf8',
        ),
      ).toContain('Server App Standard')
      expect(
        readFileSync(
          resolve(tempCloudRoot, 'dist/skills/shadow-server-app/scripts/create-server-app.mjs'),
          'utf8',
        ),
      ).toContain("['app', 'generate'")
    } finally {
      rmSync(tempCloudRoot, { recursive: true, force: true })
    }
  })

  it('keeps the server image build context aligned with cloud dist skill packaging', () => {
    const dockerignore = readFileSync(resolve(REPOSITORY_ROOT, '.dockerignore'), 'utf8')
    const serverDockerfile = readFileSync(
      resolve(REPOSITORY_ROOT, 'apps/server/Dockerfile'),
      'utf8',
    )

    expect(dockerignore).toContain('!skills/**')
    expect(serverDockerfile.match(/COPY skills\/ skills\//g)?.length).toBe(1)
    expect(serverDockerfile).toContain('COPY --from=builder /app/apps/cloud/dist apps/cloud/dist')
    expect(serverDockerfile).not.toContain('skills/shadowob-cli/SKILL.md')
  })
})
