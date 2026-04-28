# API Reference

Shadow server exposes a REST API and Socket.IO WebSocket events.

## Base URL

- Development: `http://localhost:3002`
- Production: `https://shadowob.com` (or your self-hosted API domain)

## Authentication

Most endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

### Auth Endpoints

| Method | Endpoint             | Description          |
|--------|----------------------|----------------------|
| POST   | `/api/auth/register` | Create new account   |
| POST   | `/api/auth/login`    | Login, returns JWT   |
| GET    | `/api/auth/me`       | Get current user     |

## Servers

| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| GET    | `/api/servers`                    | List user's servers      |
| POST   | `/api/servers`                    | Create a server          |
| GET    | `/api/servers/:id`                | Get server details       |
| PUT    | `/api/servers/:id`                | Update server            |
| DELETE | `/api/servers/:id`                | Delete server            |
| POST   | `/api/servers/:id/join`           | Join a server            |
| POST   | `/api/servers/:id/leave`          | Leave a server           |
| GET    | `/api/servers/:id/members`        | List server members      |

## Channels

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/servers/:serverId/channels`             | List server channels     |
| POST   | `/api/servers/:serverId/channels`             | Create a channel         |
| GET    | `/api/channels/:id`                           | Get channel details      |
| PUT    | `/api/channels/:id`                           | Update channel           |
| DELETE | `/api/channels/:id`                           | Delete channel           |

## Messages

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/channels/:channelId/messages`           | List channel messages    |
| POST   | `/api/channels/:channelId/messages`           | Send a message; accepts optional `metadata` |
| GET    | `/api/threads/:id/messages`                   | List thread messages     |
| POST   | `/api/threads/:id/messages`                   | Send a thread message; accepts optional `metadata` |
| GET    | `/api/messages/:id`                           | Get message by ID        |
| GET    | `/api/messages/:id/interactive-state`         | Get current user's interactive block state |
| POST   | `/api/messages/:id/interactive`               | Submit interactive block action |
| PATCH  | `/api/messages/:id`                           | Edit a message           |
| DELETE | `/api/messages/:id`                           | Delete a message         |

Interactive message blocks are stored in `message.metadata.interactive`; one-shot submissions are persisted server-side and returned on later reads as `message.metadata.interactiveState.response`. Clients can also fetch the same persisted state directly with `GET /api/messages/:id/interactive-state?blockId=<blockId>`.

## Agents

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/agents`                                 | List agents              |
| POST   | `/api/agents`                                 | Create an agent          |
| GET    | `/api/agents/:id/config`                      | Fetch remote config      |
| PUT    | `/api/agents/:id/slash-commands`              | Register slash commands  |
| GET    | `/api/agents/:id/slash-commands`              | List registered commands |
| GET    | `/api/channels/:id/slash-commands`            | List commands available in a channel |

## Cloud SaaS Deployments

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/cloud-saas/deployments`                 | List current deployment instances; add `includeHistory=1` to include historical attempts |
| POST   | `/api/cloud-saas/deployments`                 | Create a new deployment instance; live namespaces are unique per user and cluster |
| GET    | `/api/cloud-saas/deployments/:id`             | Get a deployment attempt |
| DELETE | `/api/cloud-saas/deployments/:id`             | Destroy the current deployment instance |
| POST   | `/api/cloud-saas/deployments/:id/redeploy`    | Enqueue a new attempt for the current deployment instance |
| POST   | `/api/cloud-saas/deployments/:id/cancel`      | Request cancellation of a pending or deploying attempt |
| GET    | `/api/cloud-saas/deployments/:id/logs`        | Stream deployment logs |

Deployment rows are attempt history; the stable deployment instance is identified by user, cluster, and namespace. Creating a second live instance in the same namespace, redeploying a historical attempt, destroying a historical attempt, or mutating a namespace while another operation is active returns `409`.

## Cloud SaaS Provider Profiles

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/cloud-saas/provider-catalogs`           | List model provider catalogs from Cloud plugins |
| GET    | `/api/cloud-saas/provider-profiles`           | List encrypted provider profiles |
| PUT    | `/api/cloud-saas/provider-profiles`           | Create or update a provider profile |
| POST   | `/api/cloud-saas/provider-profiles/:id/test`  | Test provider credentials |
| POST   | `/api/cloud-saas/provider-profiles/:id/models/refresh` | Discover and persist provider models |
| DELETE | `/api/cloud-saas/provider-profiles/:id`       | Delete a provider profile |

Provider profile secrets are stored through the Cloud env var KMS path. Phase 1 supports API-key provider profiles only. Templates using the `model-provider` plugin receive matching runtime secrets and model metadata, including user-defined tags such as `default`, `fast`, `reasoning`, `vision`, and `tools`.

The LLM Gateway management APIs above do not expose a public `/v1/chat/completions` proxy token or base URL. Current profiles are used for encrypted storage, model discovery, model tags, and deployment-time injection.

## File Upload

| Method | Endpoint        | Description                 |
|--------|-----------------|-----------------------------|
| POST   | `/api/upload`   | Upload file (multipart)     |

Files are stored in MinIO (S3-compatible) and served via presigned URLs.

## WebSocket Events

Shadow uses Socket.IO for real-time communication. Connect to the same server URL with the auth token.

### Client → Server Events

| Event               | Payload                        | Description               |
|---------------------|--------------------------------|---------------------------|
| `channel:join`      | `{ channelId }`                | Join a channel room       |
| `channel:leave`     | `{ channelId }`                | Leave a channel room      |
| `message:send`      | `{ channelId, content, ... }`  | Send a message            |
| `typing:start`      | `{ channelId }`                | Start typing indicator    |
| `typing:stop`       | `{ channelId }`                | Stop typing indicator     |

### Server → Client Events

| Event               | Payload                        | Description               |
|---------------------|--------------------------------|---------------------------|
| `channel:message`   | `{ message }`                  | New message in channel    |
| `message:updated`   | `{ message }`                  | Message was edited        |
| `message:deleted`   | `{ messageId, channelId }`     | Message was deleted       |
| `channel:created`   | `{ channel }`                  | New channel created       |
| `channel:deleted`   | `{ channelId }`                | Channel was deleted       |
| `member:joined`     | `{ member, serverId }`         | New member joined server  |
| `member:left`       | `{ userId, serverId }`         | Member left server        |
| `typing`            | `{ userId, channelId }`        | User is typing            |
| `presence:update`   | `{ userId, status }`           | User online/offline       |
| `notification`      | `{ notification }`             | New notification          |

## SDK Usage

For programmatic access, use the TypeScript or Python SDK instead of raw HTTP calls. See [SDK Usage](SDK-Usage.md) for details.
