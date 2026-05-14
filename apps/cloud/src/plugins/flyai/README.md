# FlyAI Plugin

FlyAI provides travel workflows for real-time flight, hotel, train, attraction, event, visa, cruise, car-rental, and itinerary planning search.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `FLYAI_API_KEY` | No | Yes | Optional FlyAI API key for enhanced travel search results. |

## Setup

1. Review the FlyAI skill repository and required account setup.
2. Add `FLYAI_API_KEY` only when your account or selected inventory requires it.
3. Deploy the Buddy.
4. Verify `flyai --help` and the mounted FlyAI skill.
5. Start with search and comparison workflows. Booking should require explicit user approval.

## Runtime Assets

- Installs `@fly-ai/flyai-cli`.
- Mounts the official `alibaba-flyai/flyai-skill` skill under `/workspace/.agents/plugin-skills/flyai`.
- Adds verification checks for the CLI and mounted skill file.

## References

- [FlyAI skill](https://github.com/alibaba-flyai/flyai-skill)
- [FlyAI](https://open.fly.ai)
