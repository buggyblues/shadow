# Lovart Plugin

Lovart connects a Buddy to the Lovart AI design agent through the official OpenClaw skill. It supports image, video, audio, project, thread, and canvas workflows.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `LOVART_ACCESS_KEY` | Yes | Yes | Lovart access key from the Lovart account settings page. |
| `LOVART_SECRET_KEY` | Yes | Yes | Lovart secret key from the Lovart account settings page. |

## Setup

1. Log in to Lovart.
2. Open account settings from the profile menu.
3. Copy the Lovart access key and secret key.
4. Store them as `LOVART_ACCESS_KEY` and `LOVART_SECRET_KEY` in the Cloud deployment environment.
5. Add the `lovart` plugin to the Buddy and deploy.

## Runtime Assets

- Mounts `lovartai/lovart-skill` from `skills/lovart-skill`.
- Registers the mounted `lovart-skill` with OpenClaw.
- Injects `LOVART_ACCESS_KEY` and `LOVART_SECRET_KEY` into the skill environment.
- Keeps Lovart operations behind the skill command surface instead of direct API calls.

## References

- [Lovart OpenClaw skill on ClawHub](https://clawhub.ai/lovart-admin/lovart-skill)
- [Lovart OpenClaw user guide](https://lovart.notion.site/Lovart-OpenClaw-User-Guide-33da46b16a0f80f6a7fff8e4896b9fca)
- [Lovart skill source](https://github.com/lovartai/lovart-skill)
