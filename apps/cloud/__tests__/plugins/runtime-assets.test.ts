import { describe, expect, it } from 'vitest'
import { buildRuntimeAssetInstallScript } from '../../src/plugins/runtime-assets.js'

describe('runtime asset install script', () => {
  it('uses a package-manager adapter for git sources instead of Alpine-only apk commands', () => {
    const script = buildRuntimeAssetInstallScript({
      skillSources: [
        {
          id: 'demo-skills',
          kind: 'git',
          url: 'https://github.com/example/demo.git',
          from: 'skills',
          targetPath: '/workspace/.agents/plugin-skills/demo',
        },
      ],
    })

    expect(script).toContain('install_system_packages()')
    expect(script).toContain('command -v git >/dev/null 2>&1 || install_system_packages git')
    expect(script).toContain('apt-get install -y --no-install-recommends')
    expect(script).not.toContain('apk add --no-cache git >/dev/null')
  })

  it('normalizes Alpine package names when running inside Debian runner images', () => {
    const script = buildRuntimeAssetInstallScript({
      runtimeDependencies: [
        {
          id: 'python',
          kind: 'system-package',
          packages: ['python3', 'py3-pip', 'py3-virtualenv', 'github-cli'],
        },
      ],
    })

    expect(script).toContain('apt:py3-pip) pkg="python3-pip"')
    expect(script).toContain('apt:py3-virtualenv) pkg="python3-venv"')
    expect(script).toContain('apt:github-cli) pkg="gh"')
    expect(script).toContain(
      "install_system_packages 'python3' 'py3-pip' 'py3-virtualenv' 'github-cli'",
    )
  })

  it('can run source-dependent dependency commands after git skill sources are copied', () => {
    const script = buildRuntimeAssetInstallScript({
      runtimeDependencies: [
        {
          id: 'pre',
          kind: 'shell',
          command: ['echo pre'],
        },
        {
          id: 'post',
          kind: 'shell',
          phase: 'post-source',
          command: ['test -f /plugin-skills/demo/SKILL.md'],
        },
      ],
      skillSources: [
        {
          id: 'demo-skills',
          kind: 'git',
          url: 'https://github.com/example/demo.git',
          from: 'skills',
          targetPath: '/workspace/.agents/plugin-skills/demo',
          include: ['demo'],
        },
      ],
    })

    expect(script.indexOf('echo pre')).toBeLessThan(script.indexOf('git clone'))
    expect(script.indexOf('git clone')).toBeLessThan(
      script.indexOf('test -f /plugin-skills/demo/SKILL.md'),
    )
  })
})
