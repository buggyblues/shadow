import * as chalkModule from 'chalk'

type ChalkFormatter = {
  blue(text: string): string
  green(text: string): string
  yellow(text: string): string
  red(text: string): string
  cyan(text: string): string
  dim(text: string): string
  bold(text: string): string
}

function identity(text: string): string {
  return text
}

const passthroughChalk: ChalkFormatter = {
  blue: identity,
  green: identity,
  yellow: identity,
  red: identity,
  cyan: identity,
  dim: identity,
  bold: identity,
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

function isChalkFormatter(value: unknown): value is ChalkFormatter {
  if (!isObjectLike(value)) return false

  return (
    typeof value.blue === 'function' &&
    typeof value.green === 'function' &&
    typeof value.yellow === 'function' &&
    typeof value.red === 'function' &&
    typeof value.cyan === 'function' &&
    typeof value.dim === 'function' &&
    typeof value.bold === 'function'
  )
}

export function resolveChalkFormatter(moduleLike: unknown): ChalkFormatter {
  const queue: unknown[] = [moduleLike]
  const seen = new Set<unknown>()

  while (queue.length > 0) {
    const candidate = queue.shift()
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)

    if (isChalkFormatter(candidate)) {
      return candidate
    }

    if (isObjectLike(candidate) && 'default' in candidate) {
      queue.push(candidate.default)
    }
  }

  return passthroughChalk
}

const chalk = resolveChalkFormatter(chalkModule)

/**
 * Logger interface — used by service layer for dependency injection.
 * Services depend on this interface, not the concrete implementation.
 */
export interface Logger {
  info(msg: string): void
  success(msg: string): void
  warn(msg: string): void
  error(msg: string): void
  step(msg: string): void
  dim(msg: string): void
  table(rows: Array<Record<string, string>>): void
}

export const log: Logger = {
  info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string) => console.log(chalk.green('✓'), msg),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
  error: (msg: string) => console.error(chalk.red('✗'), msg),
  step: (msg: string) => console.log(chalk.cyan('▸'), msg),
  dim: (msg: string) => console.log(chalk.dim(msg)),
  table: (rows: Array<Record<string, string>>) => {
    if (rows.length === 0) return
    const keys = Object.keys(rows[0]!)
    const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => (r[k] ?? '').length)))
    const header = keys.map((k, i) => k.padEnd(widths[i]!)).join('  ')
    const separator = widths.map((w) => '─'.repeat(w)).join('──')
    console.log(chalk.bold(header))
    console.log(chalk.dim(separator))
    for (const row of rows) {
      console.log(keys.map((k, i) => (row[k] ?? '').padEnd(widths[i]!)).join('  '))
    }
  },
}
