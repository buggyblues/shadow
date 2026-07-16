#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

try {
  process.loadEnvFile(path.join(rootDir, '.env'))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const commands = [
  {
    name: 'server',
    command: 'pnpm',
    args: ['--filter', '@shadowob/server', 'dev:migrate'],
  },
  {
    name: 'frontend',
    command: 'node',
    args: ['scripts/dev-frontend.mjs'],
  },
  {
    name: 'admin',
    command: 'pnpm',
    args: ['--filter', '@shadowob/admin', 'dev'],
  },
]

const children = new Set()
let shuttingDown = false

for (const entry of commands) {
  start(entry)
}

process.on('SIGINT', () => shutdown(130))
process.on('SIGTERM', () => shutdown(143))

function start(entry) {
  const child = spawn(entry.command, entry.args, {
    cwd: rootDir,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  children.add(child)
  pipePrefixed(child.stdout, entry.name, process.stdout)
  pipePrefixed(child.stderr, entry.name, process.stderr)

  child.on('error', (error) => {
    console.error(`[${entry.name}] failed to start: ${error.message}`)
    shutdown(1)
  })

  child.on('exit', (code, signal) => {
    children.delete(child)
    if (shuttingDown) return
    console.error(`[${entry.name}] exited with ${signal || `code ${code ?? 0}`}`)
    shutdown(code || 1)
  })
}

function pipePrefixed(stream, name, output) {
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      output.write(`[${name}] ${line}\n`)
    }
  })
  stream.on('end', () => {
    if (buffer) output.write(`[${name}] ${buffer}\n`)
  })
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  process.exitCode = code

  for (const child of children) {
    child.kill('SIGTERM')
  }

  setTimeout(() => {
    for (const child of children) {
      child.kill('SIGKILL')
    }
    process.exit(code)
  }, 5000).unref()
}
