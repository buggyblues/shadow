/**
 * Mock: openclaw/plugin-sdk/plugin-entry
 *
 * Provides a test-compatible implementation of the OpenClaw SDK plugin entry.
 * At runtime, this is provided by the OpenClaw host.
 */

export function definePluginEntry(opts: {
  id: string
  name: string
  description: string
  kind?: string
  configSchema?: any
  register: (api: any) => void | Promise<void>
}) {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    register: opts.register,
  }
}
