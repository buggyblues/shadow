# WeChat Mini Program Skyline Plugin

WeChat Mini Program Skyline provides development skills for page structure, Skyline rendering, scroll APIs, worklets, WXSS, components, routing, migration, and performance optimization.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `WECHAT_MINIPROGRAM_APPID` | No | No | Optional Mini Program AppID for project-specific guidance. |
| `WECHAT_MINIPROGRAM_PRIVATE_KEY` | No | Yes | Optional Mini Program CI private key. |

## Setup

1. Add `WECHAT_MINIPROGRAM_APPID` when the Buddy should reason about a specific Mini Program.
2. Add `WECHAT_MINIPROGRAM_PRIVATE_KEY` only when CI workflows are needed.
3. Deploy the Buddy.
4. Verify that the official Skyline skills are mounted.
5. Use the Buddy for page architecture, rendering, WXSS, component, routing, and performance work.

## Runtime Assets

- Mounts official `wechat-miniprogram/skyline-skills` under `/workspace/.agents/plugin-skills/wechat-miniprogram-skyline`.
- Adds a verification check for the mounted Skyline overview skill.

## References

- [WeChat Skyline skills](https://github.com/wechat-miniprogram/skyline-skills)
- [Skyline runtime introduction](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/introduction.html)
