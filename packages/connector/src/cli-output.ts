import chalk from 'chalk'

export interface OutputOptions {
  json?: boolean
}

export function output(data: unknown, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (data === null || data === undefined) return
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

function formatArray(items: unknown[]): void {
  const first = items[0]
  if (typeof first !== 'object' || first === null) {
    items.forEach((item) => console.log(String(item)))
    return
  }

  const keys = Object.keys(first as Record<string, unknown>)
  const idKey = keys.find((key) => key === 'id') || keys[0]
  const nameKey =
    keys.find((key) => key === 'name' || key === 'username' || key === 'slug') || keys[1] || idKey

  for (const item of items) {
    const value = item as Record<string, unknown>
    const id = String(value[idKey as string] ?? '')
    const name = String(value[nameKey as string] ?? '')
    console.log(name && name !== id ? `${chalk.cyan(id)}  ${name}` : chalk.cyan(id))
  }
}

function formatObject(value: Record<string, unknown>): void {
  const entries = Object.entries(value)
  const maxKeyLength = Math.max(...entries.map(([key]) => key.length))

  for (const [key, item] of entries) {
    const formattedKey = key.padEnd(maxKeyLength)
    let formattedValue: string
    if (item === null || item === undefined) formattedValue = chalk.gray('null')
    else if (typeof item === 'boolean') {
      formattedValue = item ? chalk.green('true') : chalk.red('false')
    } else if (Array.isArray(item)) {
      if (item.length > 0 && typeof item[0] === 'object' && item[0] !== null) {
        console.log(chalk.gray(formattedKey))
        formatArray(item)
        continue
      }
      formattedValue = JSON.stringify(item)
    } else if (typeof item === 'object') {
      formattedValue = formatNestedValue(item as Record<string, unknown>)
    } else formattedValue = String(item)
    console.log(`${chalk.gray(formattedKey)}  ${formattedValue}`)
  }
}

function formatNestedValue(value: Record<string, unknown>): string {
  const name = (value.username as string) || (value.name as string) || (value.displayName as string)
  return name || JSON.stringify(value)
}
