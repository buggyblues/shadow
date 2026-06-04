export type RuntimeSessionState =
  | 'idle'
  | 'running'
  | 'streaming'
  | 'waiting_for_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'unknown'

export type RuntimeSessionPetReaction =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'editing'
  | 'running'
  | 'testing'
  | 'waiting'
  | 'waving'
  | 'success'
  | 'error'
  | 'celebrating'

export type RuntimeSessionAnimationSignal = RuntimeSessionState | RuntimeSessionPetReaction

export type RuntimeSessionPetActivityKind =
  | 'thinking'
  | 'reading'
  | 'working'
  | 'editing'
  | 'running'
  | 'testing'
  | 'waiting'
  | 'success'
  | 'error'

export interface RuntimeSessionPetActivity {
  kind: RuntimeSessionPetActivityKind
  label?: string | null
}

export const RUNTIME_SESSION_PET_REACTION_BY_STATE: Record<
  RuntimeSessionState,
  RuntimeSessionPetReaction
> = {
  idle: 'idle',
  running: 'working',
  streaming: 'thinking',
  waiting_for_approval: 'waiting',
  blocked: 'waiting',
  completed: 'success',
  failed: 'error',
  stopped: 'idle',
  unknown: 'idle',
}

export function runtimeSessionPetReactionForState(
  state: RuntimeSessionState,
): RuntimeSessionPetReaction {
  return RUNTIME_SESSION_PET_REACTION_BY_STATE[state] ?? 'idle'
}

export function runtimeSessionSignalToPetReaction(
  signal: RuntimeSessionAnimationSignal,
): RuntimeSessionPetReaction {
  switch (signal) {
    case 'running':
      return 'working'
    case 'streaming':
      return 'thinking'
    case 'waiting_for_approval':
    case 'blocked':
      return 'waiting'
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'stopped':
    case 'unknown':
      return 'idle'
    default:
      return signal
  }
}

export function runtimeSessionStateLooksActive(state: RuntimeSessionState): boolean {
  return (
    state === 'running' ||
    state === 'streaming' ||
    state === 'waiting_for_approval' ||
    state === 'blocked'
  )
}
