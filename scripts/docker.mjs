#!/usr/bin/env node

/**
 * Docker utilities for shadow project
 *
 * Usage:
 *   node scripts/docker.mjs export postgres --dist ./backups
 *   node scripts/docker.mjs export minio --dist ./backups/minio
 *   node scripts/docker.mjs import postgres --file ./backups/postgres.sql
 *   node scripts/docker.mjs import minio --dist ./backups/minio
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = path.resolve(import.meta.dirname, '..')

// Default docker-compose config
const COMPOSE_FILE = 'docker-compose.yml'

// Service configs from docker-compose.yml
const POSTGRES_CONFIG = {
  user: 'shadow',
  password: 'shadow',
  database: 'shadow',
  service: 'postgres',
  // Support custom container name for direct docker run
  container: process.env.POSTGRES_CONTAINER || null,
}

const MINIO_CONFIG = {
  user: 'minioadmin',
  password: 'minioadmin',
  service: 'minio',
  endpoint: 'http://localhost:9000',
  // Support custom container name for direct docker run
  container: process.env.MINIO_CONTAINER || null,
  // Support custom ports for direct docker run
  port: process.env.MINIO_PORT || '9000',
}

/**
 * Run a command and return stdout
 */
function run(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      cwd: ROOT,
      ...options,
    })
  } catch (error) {
    if (options.allowFail) {
      return error.stdout || ''
    }
    console.error(`\x1b[31m✖ Command failed: ${cmd}\x1b[0m`)
    throw error
  }
}

/**
 * Check if docker container is running (supports both compose and direct docker run)
 */
function isContainerRunning(service) {
  // Check custom container first (for direct docker run)
  const customContainer = service === 'postgres' ? POSTGRES_CONFIG.container : MINIO_CONFIG.container
  if (customContainer) {
    try {
      const result = execSync(`docker ps --filter "name=${customContainer}" --filter "status=running" -q`, { encoding: 'utf8' })
      return result.trim().length > 0
    } catch {
      return false
    }
  }

  // Fallback to docker compose
  try {
    const result = execSync(
      `docker compose -f ${COMPOSE_FILE} ps --services --filter "status=running"`,
      { encoding: 'utf8', cwd: ROOT }
    )
    return result.trim().split('\n').includes(service)
  } catch {
    return false
  }
}

/**
 * Get the actual container name for a service
 */
function getContainerName(service) {
  const customContainer = service === 'postgres' ? POSTGRES_CONFIG.container : MINIO_CONFIG.container
  if (customContainer) {
    return customContainer
  }
  // Return docker compose service name (will be resolved by docker compose)
  return null
}

/**
 * Export postgres database to SQL file
 */
function exportPostgres(dist) {
  const distPath = path.resolve(dist)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `postgres-${timestamp}.sql`
  const filepath = path.join(distPath, filename)

  // Ensure dist directory exists
  fs.mkdirSync(distPath, { recursive: true })

  // Check if postgres is running
  if (!isContainerRunning('postgres')) {
    console.error('\x1b[31m✖ Postgres container is not running\x1b[0m')
    console.log('  Start it with: docker compose up -d postgres')
    console.log('  Or for direct docker run:')
    console.log('  POSTGRES_CONTAINER=name node scripts/docker.mjs export postgres --dist ./backups')
    process.exit(1)
  }

  console.log(`\x1b[36m▸ Exporting postgres database to ${filepath}...\x1b[0m`)

  // Use pg_dump inside the container
  const containerName = getContainerName('postgres')
  let cmd
  if (containerName) {
    cmd = `docker exec ${containerName} pg_dump -U ${POSTGRES_CONFIG.user} -d ${POSTGRES_CONFIG.database} --clean --if-exists --no-owner --no-acl`
  } else {
    cmd = `docker compose -f ${COMPOSE_FILE} exec -T postgres pg_dump -U ${POSTGRES_CONFIG.user} -d ${POSTGRES_CONFIG.database} --clean --if-exists --no-owner --no-acl`
  }

  const output = execSync(cmd, { encoding: 'utf8', cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] })
  fs.writeFileSync(filepath, output)

  const sizeMB = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2)
  console.log(`\x1b[32m✔ Exported postgres database (${sizeMB} MB)\x1b[0m`)
  console.log(`  ${filepath}`)
}

/**
 * Export minio data and system policies
 */
function exportMinio(dist) {
  const distPath = path.resolve(dist)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dataDir = path.join(distPath, 'data')
  const policiesDir = path.join(distPath, 'policies')
  const usersDir = path.join(distPath, 'users')
  const metadataFile = path.join(distPath, `minio-export-${timestamp}.json`)

  // Ensure directories exist
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(policiesDir, { recursive: true })
  fs.mkdirSync(usersDir, { recursive: true })

  // Check if minio is running
  if (!isContainerRunning('minio')) {
    console.error('\x1b[31m✖ MinIO container is not running\x1b[0m')
    console.log('  Start it with: docker compose up -d minio')
    console.log('  Or for direct docker run:')
    console.log('  MINIO_CONTAINER=name MINIO_PORT=9000 node scripts/docker.mjs export minio --dist ./backups')
    process.exit(1)
  }

  // Check if mc is available
  try {
    execSync('which mc', { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    console.error('\x1b[31m✖ mc (MinIO Client) is not installed\x1b[0m')
    console.log('  Install it with:')
    console.log('    macOS: brew install minio/stable/mc')
    console.log('    Linux: curl -sL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc && chmod +x /usr/local/bin/mc')
    process.exit(1)
  }

  const alias = 'shadow-local'
  // Support custom port for direct docker run
  const endpoint = `http://localhost:${MINIO_CONFIG.port}`
  const user = MINIO_CONFIG.user
  const password = MINIO_CONFIG.password

  console.log(`\x1b[36m▸ Configuring mc alias...\x1b[0m`)

  // Configure mc alias (overwrite if exists)
  run(`mc alias set ${alias} ${endpoint} ${user} ${password}`, { silent: true })

  console.log(`\x1b[36m▸ Exporting minio data...\x1b[0m`)

  // List all buckets
  const bucketsOutput = run(`mc ls ${alias} --json`, { silent: true })
  let buckets = []
  try {
    // Each line is a JSON object
    buckets = bucketsOutput
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const parsed = JSON.parse(line)
        return parsed.key?.replace('/', '') || parsed.bucket?.name
      })
      .filter(Boolean)
  } catch {
    // Fallback: parse non-json output
    buckets = bucketsOutput
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => line.split(/\s+/).pop()?.replace('/', ''))
      .filter(Boolean)
  }

  if (buckets.length === 0) {
    console.log('\x1b[33m⚠ No buckets found\x1b[0m')
  } else {
    console.log(`\x1b[36m▸ Found ${buckets.length} bucket(s): ${buckets.join(', ')}\x1b[0m`)

    // Export each bucket
    for (const bucket of buckets) {
      const bucketPath = path.join(dataDir, bucket)
      fs.mkdirSync(bucketPath, { recursive: true })
      console.log(`  Exporting bucket: ${bucket}...`)
      run(`mc mirror ${alias}/${bucket} ${bucketPath}`, { silent: true })
    }
  }

  // Export IAM policies and users (admin operations)
  console.log(`\x1b[36m▸ Exporting IAM policies...\x1b[0m`)

  // Export policies
  try {
    const policiesOutput = run(`mc admin policy ls ${alias} --json`, { silent: true, allowFail: true })
    if (policiesOutput) {
      const policies = policiesOutput
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          try {
            const parsed = JSON.parse(line)
            return parsed.policy || parsed.name
          } catch {
            return null
          }
        })
        .filter(Boolean)

      for (const policy of policies) {
        try {
          const policyInfo = run(`mc admin policy info ${alias} ${policy} --json`, { silent: true, allowFail: true })
          if (policyInfo) {
            const policyFile = path.join(policiesDir, `${policy}.json`)
            fs.writeFileSync(policyFile, policyInfo)
            console.log(`  Saved policy: ${policy}`)
          }
        } catch {
          // Skip if can't export this policy
        }
      }
    }
  } catch {
    console.log('\x1b[33m⚠ Could not export IAM policies (may need admin access)\x1b[0m')
  }

  // Export users
  console.log(`\x1b[36m▸ Exporting IAM users...\x1b[0m`)
  try {
    const usersOutput = run(`mc admin user ls ${alias} --json`, { silent: true, allowFail: true })
    if (usersOutput) {
      const users = usersOutput
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)

      if (users.length > 0) {
        const usersFile = path.join(usersDir, 'users.json')
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2))
        console.log(`  Saved ${users.length} user(s)`)
      }
    }
  } catch {
    console.log('\x1b[33m⚠ Could not export IAM users (may need admin access)\x1b[0m')
  }

  // Export service accounts
  console.log(`\x1b[36m▸ Exporting service accounts...\x1b[0m`)
  try {
    const svcAccountsOutput = run(`mc admin user svcacct ls ${alias} --json`, { silent: true, allowFail: true })
    if (svcAccountsOutput) {
      const accounts = svcAccountsOutput
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)

      if (accounts.length > 0) {
        const accountsFile = path.join(usersDir, 'service-accounts.json')
        fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2))
        console.log(`  Saved ${accounts.length} service account(s)`)
      }
    }
  } catch {
    // Service accounts might not exist or no permission
  }

  // Write export metadata
  const metadata = {
    timestamp: new Date().toISOString(),
    endpoint,
    buckets,
    exportedBy: user,
  }
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2))

  // Calculate total size
  const totalSize = calculateDirSize(distPath)
  const sizeMB = (totalSize / 1024 / 1024).toFixed(2)

  console.log(`\x1b[32m✔ Exported minio data and policies (${sizeMB} MB)\x1b[0m`)
  console.log(`  Data: ${dataDir}`)
  console.log(`  Policies: ${policiesDir}`)
  console.log(`  Users: ${usersDir}`)
  console.log(`  Metadata: ${metadataFile}`)
}

/**
 * Calculate total size of directory
 */
function calculateDirSize(dir) {
  let total = 0
  const files = fs.readdirSync(dir, { withFileTypes: true })
  for (const file of files) {
    const fullPath = path.join(dir, file.name)
    if (file.isDirectory()) {
      total += calculateDirSize(fullPath)
    } else {
      total += fs.statSync(fullPath).size
    }
  }
  return total
}

/**
 * Import postgres database from SQL file
 */
function importPostgres(file) {
  const filepath = path.resolve(file)

  if (!fs.existsSync(filepath)) {
    console.error(`\x1b[31m✖ File not found: ${filepath}\x1b[0m`)
    process.exit(1)
  }

  // Check if postgres is running
  if (!isContainerRunning('postgres')) {
    console.error('\x1b[31m✖ Postgres container is not running\x1b[0m')
    console.log('  Start it with: docker compose up -d postgres')
    console.log('  Or set POSTGRES_CONTAINER env var for direct docker run')
    process.exit(1)
  }

  console.log(`\x1b[36m▸ Importing postgres database from ${filepath}...\x1b[0m`)

  const containerName = getContainerName('postgres')
  let cmd
  if (containerName) {
    cmd = `cat "${filepath}" | docker exec -i ${containerName} psql -U ${POSTGRES_CONFIG.user} -d ${POSTGRES_CONFIG.database}`
  } else {
    cmd = `cat "${filepath}" | docker compose -f ${COMPOSE_FILE} exec -T postgres psql -U ${POSTGRES_CONFIG.user} -d ${POSTGRES_CONFIG.database}`
  }
  run(cmd)

  console.log(`\x1b[32m✔ Imported postgres database\x1b[0m`)
}

/**
 * Import minio data and policies
 */
function importMinio(dist) {
  const distPath = path.resolve(dist)
  const dataDir = path.join(distPath, 'data')
  const policiesDir = path.join(distPath, 'policies')

  if (!fs.existsSync(distPath)) {
    console.error(`\x1b[31m✖ Directory not found: ${distPath}\x1b[0m`)
    process.exit(1)
  }

  // Check if minio is running
  if (!isContainerRunning('minio')) {
    console.error('\x1b[31m✖ MinIO container is not running\x1b[0m')
    console.log('  Start it with: docker compose up -d minio')
    console.log('  Or set MINIO_CONTAINER and MINIO_PORT env vars for direct docker run')
    process.exit(1)
  }

  // Check if mc is available
  try {
    execSync('which mc', { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    console.error('\x1b[31m✖ mc (MinIO Client) is not installed\x1b[0m')
    console.log('  Install it with:')
    console.log('    macOS: brew install minio/stable/mc')
    console.log('    Linux: curl -sL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc && chmod +x /usr/local/bin/mc')
    process.exit(1)
  }

  const alias = 'shadow-local'
  // Support custom port for direct docker run
  const endpoint = `http://localhost:${MINIO_CONFIG.port}`
  const user = MINIO_CONFIG.user
  const password = MINIO_CONFIG.password

  console.log(`\x1b[36m▸ Configuring mc alias...\x1b[0m`)
  run(`mc alias set ${alias} ${endpoint} ${user} ${password}`, { silent: true })

  // Import data
  if (fs.existsSync(dataDir)) {
    const buckets = fs.readdirSync(dataDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)

    console.log(`\x1b[36m▸ Importing minio data...\x1b[0m`)

    for (const bucket of buckets) {
      const bucketPath = path.join(dataDir, bucket)
      console.log(`  Importing bucket: ${bucket}...`)

      // Create bucket if not exists
      try {
        run(`mc mb ${alias}/${bucket} --ignore-existing`, { silent: true })
      } catch {
        // Ignore if bucket exists
      }

      // Mirror data to bucket
      run(`mc mirror ${bucketPath} ${alias}/${bucket}`)
    }
  }

  // Import policies
  if (fs.existsSync(policiesDir)) {
    const policyFiles = fs.readdirSync(policiesDir)
      .filter(f => f.endsWith('.json'))

    console.log(`\x1b[36m▸ Importing IAM policies...\x1b[0m`)

    for (const policyFile of policyFiles) {
      const policyName = policyFile.replace('.json', '')
      const policyPath = path.join(policiesDir, policyFile)
      console.log(`  Importing policy: ${policyName}...`)

      try {
        // Create or update policy
        run(`mc admin policy create ${alias} ${policyName} ${policyPath}`, { silent: true, allowFail: true })
        run(`mc admin policy attach ${alias} ${policyName}`, { silent: true, allowFail: true })
      } catch {
        // Policy might already exist
      }
    }
  }

  console.log(`\x1b[32m✔ Imported minio data and policies\x1b[0m`)
}

function printHelp() {
  console.log(`
\x1b[1mDocker utilities for shadow project\x1b[0m

\x1b[1mUsage:\x1b[0m
  node scripts/docker.mjs <command> [options]

\x1b[1mCommands:\x1b[0m
  export postgres --dist <path>   Export postgres database to SQL file
  export minio --dist <path>      Export minio data and IAM policies
  import postgres --file <path>   Import postgres database from SQL file
  import minio --dist <path>      Import minio data and policies

\x1b[1mOptions:\x1b[0m
  --dist, -d <path>    Destination path for export/import
  --file, -f <path>    SQL file path for postgres import
  --help, -h           Show this help message

\x1b[1mEnvironment Variables:\x1b[0m
  POSTGRES_CONTAINER   Custom postgres container name (for direct docker run)
  MINIO_CONTAINER      Custom minio container name (for direct docker run)
  MINIO_PORT           Custom minio port (default: 9000)

\x1b[1mExamples:\x1b[0m
  # Export postgres to ./backups
  node scripts/docker.mjs export postgres --dist ./backups

  # Export minio to ./backups/minio
  node scripts/docker.mjs export minio --dist ./backups/minio

  # Export with custom container (direct docker run)
  POSTGRES_CONTAINER=my_postgres node scripts/docker.mjs export postgres --dist ./backups

  # Import postgres from SQL file
  node scripts/docker.mjs import postgres --file ./backups/postgres-2024-01-01.sql

  # Import minio from backup directory
  node scripts/docker.mjs import minio --dist ./backups/minio

\x1b[1mRequirements:\x1b[0m
  - Docker containers must be running (docker compose up -d)
  - mc (MinIO Client) for minio operations:
    macOS: brew install minio/stable/mc
    Linux: curl -sL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc && chmod +x /usr/local/bin/mc
`)
}

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      dist: {
        type: 'string',
        short: 'd',
      },
      file: {
        type: 'string',
        short: 'f',
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
  })

  if (values.help || positionals.length === 0) {
    printHelp()
    process.exit(0)
  }

  const [command, service] = positionals

  if (command === 'export') {
    if (!values.dist) {
      console.error('\x1b[31m✖ --dist option is required\x1b[0m')
      process.exit(1)
    }

    if (service === 'postgres') {
      exportPostgres(values.dist)
    } else if (service === 'minio') {
      exportMinio(values.dist)
    } else {
      console.error(`\x1b[31m✖ Unknown service: ${service}\x1b[0m`)
      console.log('  Supported services: postgres, minio')
      process.exit(1)
    }
  } else if (command === 'import') {
    if (service === 'postgres') {
      if (!values.file) {
        console.error('\x1b[31m✖ --file option is required for postgres import\x1b[0m')
        process.exit(1)
      }
      importPostgres(values.file)
    } else if (service === 'minio') {
      if (!values.dist) {
        console.error('\x1b[31m✖ --dist option is required for minio import\x1b[0m')
        process.exit(1)
      }
      importMinio(values.dist)
    } else {
      console.error(`\x1b[31m✖ Unknown service: ${service}\x1b[0m`)
      console.log('  Supported services: postgres, minio')
      process.exit(1)
    }
  } else {
    console.error(`\x1b[31m✖ Unknown command: ${command}\x1b[0m`)
    console.log('  Supported commands: export, import')
    process.exit(1)
  }
}

main()