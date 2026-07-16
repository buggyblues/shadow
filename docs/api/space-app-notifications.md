# Space App Notifications

Space App notifications are a Shadow platform capability. Space Apps declare domain-neutral notification topics and publish events; Shadow owns Space membership checks, user preferences, idempotency, delivery, and audit. No Space App-specific model belongs in the Shadow SDK or server.

## Manifest declaration

An Space App declares stable topics in `shadow.space-app/1`:

```json
{
  "notifications": [
    {
      "key": "task.changed",
      "title": "Task changes",
      "description": "Updates to tasks you follow.",
      "defaultEnabled": true,
      "defaultChannels": ["in_app", "mobile_push"]
    }
  ]
}
```

Supported user-configurable channels are `in_app`, `mobile_push`, `web_push`, and `email`. Space Apps cannot declare platform-only channels such as SMS or system chat delivery. Topic keys are local to one installed Space App instance, and every installation is isolated by `spaceAppId`.

## Publish an event

Use a short-lived, user-bound Space App launch token. The SDK helper is `publishShadowSpaceAppNotification`.

```ts
await publishShadowSpaceAppNotification({
  launchToken,
  shadowApiBaseUrl,
  notification: {
    topicKey: 'task.changed',
    recipientUserIds: [userId],
    title: 'A task changed',
    body: 'Review the latest assignment.',
    idempotencyKey: 'task:42:version:3',
    actionPath: '/tasks/42',
  },
})
```

Equivalent HTTP endpoint: `POST /api/servers/:serverId/space-apps/:appKey/notifications`.

Shadow rejects undeclared topics, tokens bound to another Space or Space App, recipients who are not members of the Space, absolute action URLs, oversized payloads, and recipient lists larger than 100. `idempotencyKey` is scoped to the installed Space App and recipient. Repeating a publish does not create another notification.

## User preferences

- `GET /api/notifications/space-app-preferences?serverId=:serverId`
- `PATCH /api/notifications/space-app-preferences`

The PATCH body contains `serverId`, `appKey`, `topicKey`, and at least one of `enabled` or `channels`. Users may only read or update preferences for Spaces they belong to. Web and mobile settings expose the same topic and channel controls.

## Ownership boundary

- Space App: topic declaration, event content, recipients, Space App-relative action path.
- Shadow: installation scope, membership authorization, preferences, deduplication, audit, in-app storage, socket delivery, push, browser push, and email.
- Domain Space Apps: may consume this contract but must not add their domain types or commands to the generic SDK.
