import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const repoRoot = process.cwd()
const websiteDir = path.resolve(repoRoot, 'website')
const siteDir = path.resolve(websiteDir, 'doc_build')
const host = '127.0.0.1'
const port = Number(process.env.README_CAPTURE_PORT ?? '4173')
const baseUrl = `http://${host}:${port}`

function run(command, args, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
    })
  })
}

function getMimeType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.png')) return 'image/png'
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg'
  if (filePath.endsWith('.woff2')) return 'font/woff2'
  return 'application/octet-stream'
}

function createStaticServer(rootDir) {
  return http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? '/', baseUrl)
      const pathname = decodeURIComponent(reqUrl.pathname)
      const filePath = path.join(rootDir, pathname)

      const tryPaths = [filePath, path.join(filePath, 'index.html'), `${filePath}.html`]

      const matched = tryPaths.find((candidate) => existsSync(candidate))
      if (!matched) {
        res.statusCode = 404
        res.end('Not found')
        return
      }

      const stat = await fs.stat(matched)
      if (stat.isDirectory()) {
        const indexPath = path.join(matched, 'index.html')
        if (!existsSync(indexPath)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        createReadStream(indexPath).pipe(res)
        return
      }

      res.setHeader('Content-Type', getMimeType(matched))
      createReadStream(matched).pipe(res)
    } catch (error) {
      res.statusCode = 500
      res.end(error instanceof Error ? error.message : 'Internal server error')
    }
  })
}

async function main() {
  await run('pnpm', ['build'], websiteDir)

  const server = createStaticServer(siteDir)
  await new Promise((resolve) => server.listen(port, host, () => resolve()))

  try {
    await run(
      'pnpm',
      [
        '--filter',
        '@shadowob/desktop',
        'exec',
        'playwright',
        'test',
        'e2e/04_visual/01_readme_gallery.spec.ts',
      ],
      repoRoot,
      { README_CAPTURE_BASE_URL: baseUrl },
    )
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
