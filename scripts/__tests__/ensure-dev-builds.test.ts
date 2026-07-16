import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { needsBuild } from '../ensure-dev-builds.mjs'

const tempRoots: string[] = []

const pkg = {
  name: '@shadowob/example',
  dir: 'packages/example',
  srcEntries: ['src', 'package.json'],
  outputEntries: ['dist/index.js'],
}

function createTempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'shadow-dev-builds-'))
  tempRoots.push(root)
  return root
}

function write(root: string, relativePath: string, contents = '') {
  const filePath = path.join(root, pkg.dir, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents)
  return filePath
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ensure-dev-builds', () => {
  it('rebuilds when a required runtime entry is missing from an existing dist directory', () => {
    const root = createTempRoot()
    write(root, 'src/index.ts', 'export const example = true')
    write(root, 'package.json', '{}')
    write(root, 'dist/index.d.ts', 'export declare const example: boolean')

    expect(needsBuild(pkg, root)).toEqual({
      needs: true,
      reason: 'output missing: dist/index.js',
    })
  })

  it('rebuilds when the runtime entry is older than source even if another dist file is newer', () => {
    const root = createTempRoot()
    const output = write(root, 'dist/index.js', 'export const example = true')
    const source = write(root, 'src/index.ts', 'export const example = false')
    write(root, 'package.json', '{}')
    const declaration = write(root, 'dist/index.d.ts', 'export declare const example: boolean')
    const now = Date.now() / 1000
    utimesSync(output, now - 20, now - 20)
    utimesSync(source, now - 10, now - 10)
    utimesSync(declaration, now, now)

    expect(needsBuild(pkg, root)).toEqual({ needs: true, reason: 'source newer than dist' })
  })

  it('skips rebuilding when every required runtime entry is present and current', () => {
    const root = createTempRoot()
    const source = write(root, 'src/index.ts', 'export const example = true')
    const manifest = write(root, 'package.json', '{}')
    const output = write(root, 'dist/index.js', 'export const example = true')
    const now = Date.now() / 1000
    utimesSync(source, now - 20, now - 20)
    utimesSync(manifest, now - 20, now - 20)
    utimesSync(output, now, now)

    expect(needsBuild(pkg, root)).toEqual({ needs: false, reason: 'up-to-date' })
  })
})
