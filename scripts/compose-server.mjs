#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const tailLimit = 128 * 1024

function appendTail(tail, chunk) {
  const next = tail + chunk
  if (next.length <= tailLimit) return next
  return next.slice(next.length - tailLimit)
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS || 'plain',
      },
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    let tail = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      if (!options.quiet) process.stdout.write(text)
      tail = appendTail(tail, text)
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      if (!options.quiet) process.stderr.write(text)
      tail = appendTail(tail, text)
    })

    child.on('error', (error) => {
      resolve({ code: 1, tail: `${tail}\n${error.message}` })
    })

    child.on('close', (code) => {
      resolve({ code: code ?? 1, tail })
    })
  })
}

async function runOrExit(command, args) {
  const result = await run(command, args)
  if (result.code !== 0) {
    process.exit(result.code)
  }
}

async function startServerStack() {
  return run('docker', ['compose', 'up', '-d', '--build', 'postgres', 'redis', 'minio', 'server'])
}

function isDockerNoSpace(result) {
  return /\b(?:ENOSPC|no space left on device)\b/i.test(result.tail)
}

async function pruneDockerBuildSpace() {
  console.warn(
    '[compose:server] Docker ran out of build space; pruning stopped containers and unused build cache, then retrying once.',
  )
  await runOrExit('docker', ['container', 'prune', '-f'])
  await runOrExit('docker', ['builder', 'prune', '-f'])
}

let result = await startServerStack()

if (result.code !== 0 && isDockerNoSpace(result)) {
  await pruneDockerBuildSpace()
  result = await startServerStack()
}

if (result.code !== 0) {
  process.exit(result.code)
}

await runOrExit('docker', ['compose', 'stop', 'web', 'admin'])
