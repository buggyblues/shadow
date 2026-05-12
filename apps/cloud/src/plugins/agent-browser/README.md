# Agent Browser Plugin

Agent Browser gives a Buddy a browser automation CLI for QA, login flows, screenshots, scraping, visual checks, Electron apps, Slack automation, and remote browser sessions.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `AGENT_BROWSER_PROVIDER` | No | No | Optional remote browser provider. Supported values depend on Agent Browser, such as `browserless`, `browserbase`, `browseruse`, `kernel`, or `agentcore`. |
| `BROWSERLESS_API_KEY` | No | Yes | Browserless API key when using Browserless-hosted browsers. |
| `BROWSERBASE_API_KEY` | No | Yes | Browserbase API key when using Browserbase sessions. |
| `BROWSER_USE_API_KEY` | No | Yes | Browser Use Cloud API key when using Browser Use remote browsers. |
| `KERNEL_API_KEY` | No | Yes | Kernel API key when using Kernel cloud browsers. |
| `AGENT_BROWSER_STORAGE_STATE_JSON` | No | Yes | Playwright `storageState` JSON for reusing browser cookies and localStorage. |

## Setup

1. Use no keys for local-only browser automation.
2. To use a remote provider, create an account with the provider and copy its API key.
3. Set `AGENT_BROWSER_PROVIDER` to the provider name.
4. Add only the matching provider key, for example `BROWSERBASE_API_KEY` for Browserbase.
5. Optional: import a browser CookieJar into `AGENT_BROWSER_STORAGE_STATE_JSON` for sites that need an authenticated session.
6. Deploy the Buddy and run the plugin verification check to confirm `agent-browser --version` works.

## Runtime Assets

- Installs the `agent-browser` npm CLI.
- Mounts the Agent Browser skill from `vercel-labs/agent-browser`.

## References

- [Agent Browser skill](https://skills.sh/vercel-labs/agent-browser/agent-browser)
- [Agent Browser GitHub repository](https://github.com/vercel-labs/agent-browser)
- [Browserless](https://browserless.io)
- [Browserbase](https://browserbase.com)
- [Browser Use Cloud API keys](https://cloud.browser-use.com/settings?tab=api-keys)
- [Kernel dashboard](https://dashboard.onkernel.com)
