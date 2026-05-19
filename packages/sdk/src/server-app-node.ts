import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface ShadowServerAppJsonStoreOptions<T> {
  filePath: string
  defaultValue: T | (() => T)
  validate?: (value: unknown) => value is T
  normalize?: (value: T) => T
  persistDefault?: boolean
}

export class ShadowServerAppJsonStore<T> {
  constructor(private readonly options: ShadowServerAppJsonStoreOptions<T>) {}

  read() {
    if (!existsSync(this.options.filePath)) {
      const value = this.defaultValue()
      if (this.options.persistDefault !== false) this.write(value)
      return value
    }

    try {
      const parsed = JSON.parse(readFileSync(this.options.filePath, 'utf8')) as unknown
      if (this.options.validate && !this.options.validate(parsed)) return this.defaultValue()
      return this.normalize(parsed as T)
    } catch {
      return this.defaultValue()
    }
  }

  write(value: T) {
    const normalized = this.normalize(value)
    mkdirSync(dirname(this.options.filePath), { recursive: true })
    const tempPath = `${this.options.filePath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`)
    renameSync(tempPath, this.options.filePath)
    return normalized
  }

  update(mutator: (value: T) => T | void) {
    const current = this.clone(this.read())
    const next = mutator(current) ?? current
    return this.write(next)
  }

  reset(nextValue?: T) {
    return this.write(nextValue ?? this.defaultValue())
  }

  private defaultValue() {
    const value =
      typeof this.options.defaultValue === 'function'
        ? (this.options.defaultValue as () => T)()
        : this.options.defaultValue
    return this.normalize(this.clone(value))
  }

  private normalize(value: T) {
    return this.options.normalize ? this.options.normalize(value) : value
  }

  private clone(value: T) {
    return structuredClone(value)
  }
}

export function createShadowServerAppJsonStore<T>(options: ShadowServerAppJsonStoreOptions<T>) {
  return new ShadowServerAppJsonStore(options)
}
