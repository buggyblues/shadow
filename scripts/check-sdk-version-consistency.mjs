#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

function readJson(relativePath) {
  const filePath = path.join(ROOT, relativePath)
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readPythonVersion(relativePath) {
  const filePath = path.join(ROOT, relativePath)
  const content = fs.readFileSync(filePath, 'utf8')
  const match = content.match(/^version\s*=\s*"([^"]+)"/m)
  if (!match) {
    throw new Error(`Cannot find Python SDK version in ${relativePath}`)
  }
  return match[1]
}

function fail(message) {
  console.error(`\x1b[31m✖ ${message}\x1b[0m`)
  process.exit(1)
}

function main() {
  const sdkVersion = readJson('packages/sdk/package.json').version
  const sdkPythonVersion = readPythonVersion('packages/sdk-python/pyproject.toml')

  const mismatches = []
  if (sdkVersion !== sdkPythonVersion) {
    mismatches.push(`@shadowob/sdk=${sdkVersion} != shadowob-sdk=${sdkPythonVersion}`)
  }

  if (mismatches.length > 0) {
    fail(`SDK version mismatch:\n- ${mismatches.join('\n- ')}`)
  }

  console.log(`✔ SDK versions are consistent: ${sdkVersion}`)
}

main()
