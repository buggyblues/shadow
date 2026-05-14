# Yuque Plugin

Yuque supports knowledge-base workflows for searching team knowledge, writing SOPs, syncing FAQ, summarizing documents, maintaining product documentation, and preparing knowledge reports.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `YUQUE_PERSONAL_TOKEN` | Yes | Yes | Yuque personal access token. |

## Setup

1. Open Yuque token settings.
2. Create a personal token with access to the target books and docs.
3. Paste the token into `YUQUE_PERSONAL_TOKEN`.
4. Deploy the Buddy.
5. Verify with read-only knowledge search before creating or updating docs.
6. Require confirmation before writing books, docs, notes, or FAQ content.

## Runtime Assets

- Registers `yuque-mcp` through `npx`.
- Mounts Yuque agent skills from `yuque/yuque-ecosystem`.
- Adds a verification check for the mounted smart-search skill.

## References

- [Yuque AI Ecosystem](https://github.com/yuque/yuque-ecosystem)
- [Yuque personal tokens](https://www.yuque.com/settings/tokens)
