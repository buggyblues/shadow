# URL 应用子域名代理（Caddy + Cloudflare）

本文说明如何把 URL 类型应用通过子域名代理访问，支持 HTTP / SSE / WebSocket。

## 1. 目标域名规划

- 主站：`app.example.com`（你的现有 web）
- 应用代理子域：`a-<appId>.apps.example.com`

在 Cloudflare 添加 DNS：

- `A` 记录：`apps.example.com` -> 你的 Caddy 机器 IP（可开橙云）
- `CNAME` 记录：`*.apps.example.com` -> `apps.example.com`（可开橙云）

> 注意：如果使用 Cloudflare 代理（橙云），WebSocket 默认支持；SSE 也可透传。

## 2. 前端环境变量

在 `apps/web` 运行环境设置：

- `VITE_APP_PROXY_HOST_SUFFIX=apps.example.com`

应用开启“通过子域名代理访问”后，Viewer 将访问：

- `https://a-<appId>.apps.example.com/`

## 3. Caddyfile 示例

> 假设后端 server 在 `localhost:3002`，web 在 `localhost:3000`。

```caddyfile
{
  # 可选：全局日志
}

# 你的主站
app.example.com {
  reverse_proxy localhost:3000
}

# 应用子域名代理（关键）
*.apps.example.com {
  @appHost host_regexp apphost ^a-([0-9a-fA-F-]{36})\.apps\.example\.com$

  # 提取 appId
  map {re.apphost.1} {app_id} {
    default {re.apphost.1}
  }

  # WebSocket 代理到后端 WS 入口
  @ws {
    header Connection *Upgrade*
    header Upgrade websocket
  }
  reverse_proxy @ws localhost:3002 {
    rewrite /api/app-proxy-ws/{app_id}{uri}
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
  }

  # 其余 HTTP/SSE 代理到后端 HTTP 入口
  reverse_proxy localhost:3002 {
    rewrite /api/app-proxy/{app_id}{uri}
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}

    # SSE 友好（尽量避免缓冲）
    transport http {
      read_buffer 0
      write_buffer 0
    }
  }
}
```

## 4. 后端入口说明

当前实现新增：

- HTTP/SSE：`/api/app-proxy/:appId/*`
- WebSocket：`/api/app-proxy-ws/:appId/*`

当应用为 URL 类型且 `settings.proxyEnabled=true` 时才允许代理。

## 5. 验证方式

### HTTP

```bash
curl -i https://a-<appId>.apps.example.com/
```

### SSE

```bash
curl -N https://a-<appId>.apps.example.com/sse-endpoint
```

### WebSocket

可用浏览器控制台：

```js
new WebSocket('wss://a-<appId>.apps.example.com/ws')
```

## 6. 安全建议（强烈建议）

- 在后端增加 SSRF 防护（禁止内网 IP/localhost）
- 增加 upstream allowlist（可选）
- 对代理请求做限流
- 对超时与响应体大小做限制
- 记录代理访问审计日志
