# Lark / Feishu Plugin

Lark / Feishu connects a Buddy to workspace operations across messages, Docs, Base, Sheets, Calendar, Mail, Tasks, Meetings, approvals, and weekly execution workflows.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `LARKSUITE_CLI_APP_ID` | Yes | No | Feishu or Lark app ID used by lark-cli and Lark MCP. |
| `LARKSUITE_CLI_APP_SECRET` | Yes | Yes | App secret from the Feishu or Lark developer console. |
| `LARKSUITE_CLI_BRAND` | No | No | Use `feishu` for China tenants or `lark` for global tenants. Defaults to `feishu`. |

## Setup

1. Open the Feishu or Lark developer console.
2. Create a self-built application.
3. Grant the APIs needed by the Buddy, such as Messenger, Docs, Base, Sheets, Calendar, Mail, Tasks, Meetings, or approvals.
4. Copy the app ID into `LARKSUITE_CLI_APP_ID`.
5. Copy the app secret into `LARKSUITE_CLI_APP_SECRET`.
6. Set `LARKSUITE_CLI_BRAND` to match the tenant.
7. Deploy the Buddy and verify with a read-only document, Base, or calendar lookup.

## Runtime Assets

- Installs the official `@larksuite/cli` package.
- Registers the official `@larksuiteoapi/lark-mcp` MCP server through `npx`.
- Mounts official Lark CLI agent skills under `/workspace/.agents/plugin-skills/lark`.
- Adds verification checks for the CLI and mounted skills.

## References

- [Lark CLI](https://github.com/larksuite/cli)
- [Lark custom application development](https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process)
