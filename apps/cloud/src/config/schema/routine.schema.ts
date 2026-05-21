/**
 * Cloud template routines — scheduled agent work. Delivery surfaces are owned
 * by plugins so template routines stay independent from any one channel system.
 */

import type { tags } from 'typia'

export interface CloudRoutineSchedule {
  /** Cron expression in the deployment timezone, e.g. "0 9 * * *". */
  cron?: string
  /** Human interval supported by runtime syncers, e.g. "15m", "1h", "1d". */
  interval?: string
  /** IANA timezone for cron evaluation. Defaults to deployment runtime context. */
  timezone?: string
  /** Maximum overlapping runs for this routine. Defaults to the runtime's behavior. */
  maxConcurrentRuns?: number & tags.Type<'uint32'>
}

export interface CloudRoutineConfig {
  /** Stable routine id. Used as the sync key in runtime cron stores. */
  id: string
  /** Agent deployment id that owns the routine. */
  agentId: string
  /** Human-readable label for dashboards/runtime UIs. */
  title?: string
  /** Optional operator-facing description. */
  description?: string
  /** Disable without removing the template definition. */
  enabled?: boolean
  /** Schedule definition. At least one of cron or interval should be set. */
  schedule: CloudRoutineSchedule
  /** Prompt/task sent to the agent when the routine fires. */
  prompt: string
  metadata?: Record<string, unknown>
}
