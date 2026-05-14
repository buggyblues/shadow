/**
 * Runtime loader — imports all runtime adapter modules to trigger registration.
 *
 * Call `import '../runtimes/loader.js'` or `await import('../runtimes/loader.js')`
 * once at application startup before any config parsing.
 *
 * Exports an explicit `registerAllRuntimes()` function (no-op, for documentation)
 * to make the dependency on runtime loading visible in calling code.
 */

import './openclaw.js'
import './claude-code.js'
import './codex.js'
import './gemini.js'
import './opencode.js'
import './hermes.js'

/**
 * Explicit marker function — all runtimes are registered by the time this
 * module has finished loading (ESM top-level side-effect imports).
 * Call this in your code to make the dependency visible:
 *
 * ```ts
 * import { registerAllRuntimes } from '../runtimes/loader.js'
 * registerAllRuntimes()
 * ```
 */
export function registerAllRuntimes(): void {
  // All runtime modules self-register via top-level imports above.
  // This function exists to make the registration dependency explicit.
}
