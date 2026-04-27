import nodeOs from 'node:os'
import nodePath from 'node:path'

/**
 * Resolve the OpenClaw data directory.
 * Prefers OPENCLAW_DATA_DIR env var (set by desktop gateway), falls back to ~/.openclaw.
 */
export async function getDataDir(): Promise<string> {
  const dataDir = process.env.OPENCLAW_DATA_DIR
  return dataDir || nodePath.join(nodeOs.homedir(), '.openclaw')
}
