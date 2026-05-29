# Lark / Feishu Plugin

Lark / Feishu connects a Buddy to workspace operations across messages, Docs, Base, Sheets, Calendar, Mail, Tasks, Meetings, approvals, Meegle work items, and weekly execution workflows.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `LARKSUITE_CLI_APP_ID` | Yes | No | Feishu or Lark app ID used by `lark-cli`. |
| `LARKSUITE_CLI_APP_SECRET` | Yes | Yes | App secret from the Feishu or Lark developer console. |
| `LARKSUITE_CLI_BRAND` | No | No | Use `feishu` for China tenants or `lark` for global tenants. Defaults to `feishu`. |
| `LARKSUITE_CLI_DEFAULT_AS` | No | No | Default `lark-cli` identity: `bot`, `user`, or `auto`. Defaults to `bot`. |
| `LARKSUITE_CLI_STRICT_MODE` | No | No | Restrict `lark-cli` to `bot`, `user`, or `off`. Defaults to `bot`. |
| `MEEGLE_HOST` | No | No | Meegle site domain, such as `project.feishu.cn`, `meegle.com`, or a tenant host. |
| `MEEGLE_USER_ACCESS_TOKEN` | No | Yes | Optional Meegle user access token for direct CLI auth. |
| `MEEGLE_ACCESS_TOKEN_HEADER` | No | No | Optional custom Meegle token header. Empty uses `Authorization: Bearer <token>`. |
| `MEEGLE_USER_AGENT` | No | No | Optional caller suffix appended to the Meegle CLI User-Agent. |

## Credential Source URLs

| Environment variable | Where to get it |
| --- | --- |
| `LARKSUITE_CLI_APP_ID` | Feishu China app console: <https://open.feishu.cn/app> |
| `LARKSUITE_CLI_APP_SECRET` | Feishu China app console: <https://open.feishu.cn/app> |
| `LARKSUITE_CLI_BRAND` | Use `feishu` for apps from <https://open.feishu.cn/app>; use `lark` for global Lark tenants. |
| `MEEGLE_HOST` | The Meegle/Lark Project tenant host, for example <https://project.feishu.cn>. |
| `MEEGLE_USER_ACCESS_TOKEN` | Meegle CLI direct env-token configuration: <https://github.com/larksuite/meegle-cli#sandbox--ci-direct-environment-variable-injection> |

## Setup

1. Open the Feishu or Lark developer console.
2. Create a self-built application.
3. Grant the APIs needed by the Buddy, such as Messenger, Docs, Base, Sheets, Calendar, Mail, Tasks, Meetings, or approvals.
4. Copy the app ID into `LARKSUITE_CLI_APP_ID`.
5. Copy the app secret into `LARKSUITE_CLI_APP_SECRET`.
6. Set `LARKSUITE_CLI_BRAND` to match the tenant when the default `feishu` is not correct.
7. For Meegle workflows, set `MEEGLE_HOST` and optionally `MEEGLE_USER_ACCESS_TOKEN`.
8. Deploy the Buddy and verify with `lark-cli auth status`, then a read-only document, Base, calendar, or Meegle lookup.

## Lark CLI Credential Model

Cloud writes app credentials to `lark-cli` config files instead of exporting the raw `LARKSUITE_CLI_APP_ID` and `LARKSUITE_CLI_APP_SECRET` variables into the container. This matters because the official `lark-cli` environment credential provider treats those raw variables as an env-backed credential profile and expects pre-minted user or tenant tokens for token resolution. The generated config-file profile lets `lark-cli` mint bot tenant tokens from app ID and app secret.

Generated config files:

| Runtime path | Purpose |
| --- | --- |
| `/home/shadow/.lark-cli/config.json` | Default `lark-cli` config path. |
| `/home/shadow/.lark-cli/openclaw/config.json` | OpenClaw-specific config path. |
| `/home/shadow/.lark-cli/hermes/config.json` | Hermes-specific config path. |
| `/home/shadow/.lark-cli/lark-channel/config.json` | Lark-channel config path. |

Expected auth smoke-test output:

```bash
lark-cli auth status
```

The result should include `"identity": "bot"` and a ready bot identity. A missing user identity is expected unless `lark-cli auth login` has been run for a user profile.

## Knowledge Base Access

Knowledge Base / Wiki read checks use the `wiki` command group.

| Check | Command | Required app scope |
| --- | --- | --- |
| List accessible wiki spaces | `lark-cli wiki +space-list --page-size 20 --format json` | `wiki:space:retrieve` |
| List root nodes in a wiki space | `lark-cli wiki +node-list --space-id <space_id> --page-size 20 --format json` | `wiki:node:retrieve` |
| Drill into a child node | `lark-cli wiki +node-list --space-id <space_id> --parent-node-token <node_token> --page-size 20 --format json` | `wiki:node:retrieve` |

Bot access is not the same as the signed-in human user's web view. The Feishu web UI may show enterprise-public wiki spaces to a user at a tenant URL such as `https://<tenant>.feishu.cn/wiki/`, while `lark-cli` in Cloud uses the app's bot identity and a `tenant_access_token`. Feishu's wiki space-list API notes that when called with a tenant access token, the app or bot must have access to at least some wiki spaces, otherwise the returned list is empty.

`--space-id my_library` is only valid for user identity, so a bot-only Cloud deployment cannot inspect "My Library" unless a user login/token flow is added. For bot checks, add the app/bot to the target wiki space or make the space visible to the app according to Feishu permissions. If `+space-list` returns an empty `spaces` array with `"ok": true`, the CLI and app credentials are working but the bot currently has no accessible wiki spaces.

To grant the bot access to an existing wiki space:

1. Confirm the app has at least one cloud-doc API scope enabled in the Feishu app console.
2. Open the target wiki space root page, for example `https://<tenant>.feishu.cn/wiki/`.
3. Open the wiki root node or a document node inside the wiki.
4. Use the upper-right `...` / More / Share entry and choose the Feishu "add document app" flow.
5. Select this self-built application and grant at least read access. Use edit/manage only when the deployed Buddy needs write operations.
6. Publish or apply app permission changes when the Feishu console requires it.
7. Rerun `lark-cli wiki +space-list --page-size 20 --format json`.

When a scope is missing, `lark-cli` returns a `console_url`, for example:

```text
https://open.feishu.cn/page/scope-apply?clientID=<app_id>&scopes=wiki%3Aspace%3Aretrieve
```

Enable the scope in the app console, publish or apply the app permission change as required by Feishu, then rerun the read-only check.

## Local Plugin Test

Use the Cloud plugin test container to exercise the real runtime asset install flow and credential-file materialization:

```bash
LARKSUITE_CLI_APP_ID=cli_xxx \
LARKSUITE_CLI_APP_SECRET=... \
LARKSUITE_CLI_BRAND=feishu \
apps/cloud/scripts/start-plugin-test-container.sh lark \
  --runner openclaw \
  --image node:22-bookworm \
  --no-build \
  --no-shell \
  --no-prompt \
  --command 'set -eu
/opt/shadow-plugin-deps/lark/bin/lark-cli auth status
/opt/shadow-plugin-deps/lark/bin/lark-cli wiki +space-list --page-size 20 --format json
/opt/shadow-plugin-deps/lark/bin/meegle version
test -f /workspace/.agents/plugin-skills/lark/lark-im/SKILL.md
test -f /workspace/.agents/plugin-skills/lark/meegle/SKILL.md
test -f /home/shadow/.lark-cli/config.json'
```

This test confirms:

- `@larksuite/cli` and `@lark-project/meegle` install successfully.
- Official `lark-*` skills and the `meegle` skill are mounted.
- The private `lark-cli` config file is present.
- Raw `LARKSUITE_CLI_APP_ID` and `LARKSUITE_CLI_APP_SECRET` are not injected into the runtime container environment.

## Runtime Assets

- Installs the official `@larksuite/cli` package.
- Installs the official `@lark-project/meegle` package.
- Mounts official `lark-*` agent skills under `/workspace/.agents/plugin-skills/lark`.
- Mounts the official `meegle` agent skill under the same skill root.
- Writes a private `lark-cli` `config.json` into local, OpenClaw, Hermes, and Lark-channel config paths so the CLI can mint bot tenant tokens from the app secret.
- Adds verification checks for the CLIs, generated Lark CLI auth config, and mounted skills.

## References

- [Lark CLI](https://github.com/larksuite/cli)
- [Meegle CLI](https://github.com/larksuite/meegle-cli)
- [Lark custom application development](https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process)
- [Feishu app console](https://open.feishu.cn/app)
- [Feishu wiki space list API](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space/list?lang=zh-CN)
- [Grant app access to cloud document resources](https://open.feishu.cn/document/faq/trouble-shooting/how-to-add-permissions-to-app?lang=zh-CN)
