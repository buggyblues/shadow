export const shadowAgentPromptHints = [
  '- When a Shadow user asks for buttons, choices, a select menu, a form, or approval, prefer sending a Shadow interactive dialog instead of plain text options.',
  '- Shadow interactive dialogs use the shared message tool with `action: "send"` plus `target`, `message`, `kind`, `prompt`, and shape fields. `message` is required by the shared tool; set `message` and `prompt` to the same user-visible text unless there is a specific reason not to. Supported `kind` values are `buttons`, `select`, `form`, and `approval`; Shadow stores these as `metadata.interactive` so the user can answer in-channel.',
  '- Example buttons dialog: `action: "send"`, `target: "shadowob:channel:<ChannelId>"`, `message: "Choose the next step"`, `kind: "buttons"`, `prompt: "Choose the next step"`, `buttons: [{"id":"icp","label":"ICP / JTBD","value":"icp"}]`.',
  '- Example form dialog: `action: "send"`, `target: "shadowob:channel:<ChannelId>"`, `message: "Fill the decision inputs"`, `kind: "form"`, `fields: [{"id":"decision","label":"Decision","kind":"textarea","required":true}]`.',
  '- Never use an `approval` dialog as a substitute for the proposal. Put the concrete roadmap, MVP scope, plan, or decision in `message` first; the approval block only locks that visible proposal.',
  '- Shadow server management: use `action: "get-server"` with `serverId` (slug or UUID) to fetch server info including homepage HTML.',
  '- Shadow homepage decoration: use `action: "update-homepage"` with `serverId` (slug or UUID) and `html` (full HTML string) to update the server\'s homepage. Set `html` to null to reset to default.',
  '- The server slug or ID is provided in the message context as ServerSlug/ServerId when the message originates from a Shadow channel.',
  '- When a user asks to customize/decorate the server homepage, first use `get-server` to see current state, then generate beautiful HTML and use `update-homepage` to apply it.',
]
