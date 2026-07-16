---
title: API
description: 虾豆开放平台 API 的入口、认证方式和主要资源分组。
---

# API

虾豆 API 使用 HTTPS 和 JSON。请求发送到虾豆服务地址，认证信息放在 `Authorization` header 中。

```text
https://shadowob.com
```

## 调用前准备

先确认你的调用方身份。用户会话、个人访问令牌和 OAuth access token 都可以调用 API，但可访问的资源和动作不同。

- 用户会话适合 Web、Mobile 和桌面端里的用户操作。
- 个人访问令牌适合脚本、CLI 和本地自动化。
- OAuth access token 适合第三方应用代表用户访问已授权资源。

认证、令牌和权限边界见 [认证与权限](./authentication)。

## 主要资源

| 分组 | 说明 |
| --- | --- |
| Space | Space、频道、消息、线程、私信、工作区、搜索、媒体和发现。 |
| AI | Agent、云电脑和官方模型代理。 |
| 应用 | Platform Apps 和 Space Apps。 |
| 社交 | 好友、邀请码、通知和主页留言。 |
| 商业 | 商店、经济、充值和任务中心。 |
| 云 | Cloud 模版、插件、CLI、SaaS 运行时和底层部署接口。 |

## 实时事件

需要监听消息、成员状态或任务变化时，使用 [WebSocket 事件](./websocket)。REST API 负责读取和写入资源，WebSocket 负责把资源变化推给客户端。

## 错误处理

所有接口都应按状态码和错误码处理失败。通用错误结构、重试边界和常见错误见 [错误处理](./errors)。
