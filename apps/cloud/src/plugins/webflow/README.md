# Webflow Plugin

Webflow supports site operations for CMS updates, landing pages, SEO pages, component audits, publishing checks, code components, and content workflows.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `WEBFLOW_TOKEN` | Yes | Yes | Webflow API access token. |
| `WEBFLOW_SITE_ID` | No | No | Default Webflow site ID. |

## Setup

1. Open Webflow developer settings.
2. Create or copy an API access token with the needed site and CMS scopes.
3. Paste the token into `WEBFLOW_TOKEN`.
4. Add `WEBFLOW_SITE_ID` when the Buddy should default to one site.
5. Deploy the Buddy.
6. Verify with read-only site, CMS collection, or item lookup before edits or publishing.

## Runtime Assets

- Installs `@webflow/webflow-cli`.
- Registers the hosted Webflow MCP endpoint.
- Mounts Webflow site, CLI, and code component skills under `/workspace/.agents/plugin-skills/webflow`.
- Adds verification checks for the CLI and mounted skills.

## References

- [Webflow MCP server](https://developers.webflow.com/mcp/reference/overview)
- [Webflow token authorization](https://developers.webflow.com/data/reference/token/authorized-by)
