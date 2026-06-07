import type { BuddyCollaborationMetadata } from '../types.js'

export function formatBuddyCollaborationContext(
  collaboration: BuddyCollaborationMetadata | undefined,
) {
  if (!collaboration) return ''
  return [
    'Shadow Buddy collaboration context:',
    `- Collaboration id: ${collaboration.id}`,
    `- Root message id: ${collaboration.rootMessageId}`,
    `- This Buddy turn: ${collaboration.turn}`,
    collaboration.target ? `- Platform delivery target: ${collaboration.target}` : '',
    collaboration.threadId ? `- Platform thread id: ${collaboration.threadId}` : '',
    collaboration.replyDensity ? `- Suggested reply density: ${collaboration.replyDensity}` : '',
    collaboration.suggestedTextLimit
      ? `- Suggested text budget: about ${collaboration.suggestedTextLimit} characters; treat this as guidance, not a hard cutoff.`
      : '',
    '- Treat the collaboration claim as permission to speak once, not permission to run tools.',
    '- The platform may route later collaboration turns into a thread. Do not announce that routing yourself.',
    '- If you only agree, prefer a structured Shadow reaction action when the runtime exposes one; otherwise stay silent instead of posting acknowledgement text.',
    '- Keep the public channel IM-friendly: one concise message, no recap unless the user asks.',
    '- Default reply budget is soft: prefer at most 120 Chinese characters or 2 short bullets, but answer fully when the user explicitly asks for depth.',
    '- For turn 2 or later, add at most one missing point in one short sentence; if you only agree, do not send a text reply.',
    '- Match the density of the triggering message. Short chat gets a short reply or no extra reply.',
    '- Add a distinct point only. If another Buddy already covered it, acknowledge briefly and stop.',
    '- Do not create memories, skills, files, demos, task cards, or tool runs unless a human explicitly asks for current action.',
    '- Runtime logs, memory updates, skill views, tool progress, and self-improvement reviews are private implementation events. Never post them as channel messages.',
    '- If the user says to stop, stay quiet, not implement, or just discuss, comply immediately and do not continue the action chain.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buddyCollaborationContextFields(
  collaboration: BuddyCollaborationMetadata | undefined,
) {
  if (!collaboration) return {}
  return {
    CollaborationId: collaboration.id,
    CollaborationRootMessageId: collaboration.rootMessageId,
    CollaborationBuddyId: collaboration.buddyId,
    CollaborationTurn: collaboration.turn,
    ...(collaboration.target ? { CollaborationTarget: collaboration.target } : {}),
    ...(collaboration.threadId ? { CollaborationThreadId: collaboration.threadId } : {}),
    ...(collaboration.replyDensity
      ? { CollaborationReplyDensity: collaboration.replyDensity }
      : {}),
    ...(collaboration.suggestedTextLimit
      ? { CollaborationSuggestedTextLimit: collaboration.suggestedTextLimit }
      : {}),
  }
}
