import chalk from 'chalk'

export interface OutputOptions {
  json?: boolean
}

export function output(data: unknown, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (data === null || data === undefined) {
    return
  }

  if (typeof data === 'string') {
    console.log(data)
    return
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log(chalk.gray('No results'))
      return
    }
    formatArray(data)
    return
  }

  if (typeof data === 'object') {
    formatObject(data as Record<string, unknown>)
    return
  }

  console.log(String(data))
}

export function outputError(message: string, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify({ error: message }, null, 2))
    return
  }
  console.error(chalk.red(`Error: ${message}`))
}

export function outputSuccess(message: string, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify({ success: true, message }, null, 2))
    return
  }
  console.log(chalk.green(message))
}

function formatArray(items: unknown[]): void {
  if (items.length === 0) return

  const first = items[0]
  if (typeof first !== 'object' || first === null) {
    items.forEach((item) => {
      console.log(String(item))
    })
    return
  }

  // Format as table-like list
  const keys = Object.keys(first as Record<string, unknown>)
  const idKey = keys.find((k) => k === 'id') || keys[0]
  const nameKey =
    keys.find((k) => k === 'name' || k === 'username' || k === 'slug') || keys[1] || idKey

  for (const item of items) {
    const obj = item as Record<string, unknown>
    const id = String(obj[idKey as string] ?? '')
    const name = String(obj[nameKey as string] ?? '')

    if (name && name !== id) {
      console.log(`${chalk.cyan(id)}  ${name}`)
    } else {
      console.log(chalk.cyan(id))
    }
  }
}

function formatObject(obj: Record<string, unknown>): void {
  const entries = Object.entries(obj)
  const maxKeyLength = Math.max(...entries.map(([k]) => k.length))

  for (const [key, value] of entries) {
    const formattedKey = key.padEnd(maxKeyLength)
    let formattedValue: string

    if (value === null || value === undefined) {
      formattedValue = chalk.gray('null')
    } else if (typeof value === 'boolean') {
      formattedValue = value ? chalk.green('true') : chalk.red('false')
    } else if (typeof value === 'object') {
      formattedValue = JSON.stringify(value)
    } else {
      formattedValue = String(value)
    }

    console.log(`${chalk.gray(formattedKey)}  ${formattedValue}`)
  }
}
