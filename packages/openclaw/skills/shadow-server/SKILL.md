---
name: shadow-server
description: "Shadow server management via the message tool (channel=shadowob). Use when: (1) viewing or updating server homepage, (2) decorating server pages with custom HTML, (3) checking server info like name, slug, description. NOT for: sending chat messages (use standard send action), or managing channels/members."
metadata: { "openclaw": { "emoji": "🏠" } }
allowed-tools: ["message"]
---

# Shadow Server Management

Use the `message` tool with `channel: "shadowob"` for server management actions.

## Context

When receiving messages from Shadow channels, the context includes:
- `ServerSlug` — the server's URL-friendly identifier
- `ServerId` — the server's UUID
- `ServerName` — the server's display name

Use these values for the `serverId` parameter in server management actions.

## Actions

### Get Server Info

Fetch server details including name, description, homepage HTML, and slug.

```json
{
  "action": "get-server",
  "channel": "shadowob",
  "serverId": "<slug-or-uuid>"
}
```

### Update Homepage

Update or set the server's homepage HTML. The homepage is displayed when users click the Home button in the server sidebar.

```json
{
  "action": "update-homepage",
  "channel": "shadowob",
  "serverId": "<slug-or-uuid>",
  "html": "<full HTML string>"
}
```

Set `html` to `null` to reset to the default generated homepage.

## Homepage Design Guidelines

When generating homepage HTML:

- Use modern, clean CSS with gradients and subtle animations
- Include the server name and description prominently
- Use a responsive layout that works in an iframe
- Keep the design professional — use CSS variables for theming
- Support both light and dark themes via `prefers-color-scheme`
- Include navigation hints (e.g., "Explore channels" cards)
- Use emoji or SVG icons instead of external image dependencies
- The HTML renders inside an iframe, so include all styles inline or in `<style>` tags
- Add interactive elements with smooth hover effects
- For clickable elements, use `window.parent.postMessage({ type: 'navigate-channel', channelName: 'name' }, '*')` to navigate to channels

## Workflow

1. When user asks to customize the homepage:
   - Use `get-server` to fetch current server info
   - Design beautiful HTML based on the server's name and character
   - Use `update-homepage` to apply the new homepage
   - Confirm success to the user

2. When user wants to reset the homepage:
   - Use `update-homepage` with `html: null`
