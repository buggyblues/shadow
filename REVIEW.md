# 虾豆 (Shadow) 安全加固审查报告

**审查日期**: 2026-04-12  
**审查分支**: `review/security-hardening`  
**审查范围**: 中间件、认证/授权 Handler、文件上传、OAuth 流程、前端安全  
**前置条件**: 第一批安全修复 PR 已合并（JWT_SECRET 强制要求等）

---

## 1. CSRF 防护

### 🔴 严重: 缺失 CSRF 防护

| 项目 | 状态 | 说明 |
|------|------|------|
| CSRF Token 机制 | ❌ 不存在 | 整个应用无任何 CSRF token 机制 |
| SameSite Cookie | ⚠️ 未设置 | 使用 Bearer Token 认证，但无 Cookie 级别的 SameSite 防护 |
| 双重提交 Cookie | ❌ 不存在 | 无此模式实现 |

**风险评估**: 应用使用 `Bearer` token 进行 API 认证（非 Cookie），这在标准场景下天然免疫 CSRF。但如果未来引入 Cookie-based session 或某些浏览器插件会自动携带认证信息，则存在风险。

**当前状态**: 可接受（纯 Bearer Token 架构），但需要防御未来架构变更。

**建议**:
- 如果保持纯 Bearer Token 架构，无需添加 CSRF 机制
- 在 API 文档中明确声明：认证仅通过 Bearer Token，不支持 Cookie
- 如果未来引入 Cookie，必须添加 CSRF token 机制（如 `double-submit-cookie` 或 `Synchronizer Token` 模式）

---

## 2. Rate Limiting

### 🔴 严重: 无任何频率限制

审查了所有关键端点，**未发现任何 rate limiting 中间件或逻辑**：

| 端点 | 风险 | 建议限制 |
|------|------|----------|
| `POST /api/auth/login` | 暴力破解密码 | 5次/15分钟/IP |
| `POST /api/auth/register` | 批量注册滥用 | 3次/小时/IP |
| `POST /api/auth/refresh` | Token 刷新生成 | 30次/分钟/IP |
| `POST /api/media/upload` | 存储/带宽滥用 | 20次/分钟/用户 |
| `POST /api/oauth/token` | Token 枚举 | 10次/分钟/客户端 |
| `POST /api/oauth/channels/:id/messages` | 消息轰炸 | 30次/分钟/用户 |

**现有防护**:
- `bodyLimit` 中间件限制请求体 50MB ✅
- 登录失败会记录 `PasswordChangeLog`（但仅限改密码，不含登录）✅ 部分
- bcrypt cost 12 减缓暴力破解 ✅

**建议**:
- 集成 `hono-rate-limiter` 或基于 Redis 实现滑动窗口限流
- 优先保护：login、register、media upload、token endpoint
- 对登录失败次数进行账户锁定（当前 `login` 没有失败计数）

---

## 3. 文件上传安全

### 🟡 中等: 有多层防护但仍存在改进空间

**已实现的安全措施** ✅:
- 文件名使用 `randomUUID()` 生成（`media.service.ts:49`），防止路径遍历
- 仅提取文件扩展名，不使用原始文件名作为存储路径
- MinIO bucket policy 设置为只读公开（`s3:GetObject`）

**缺失的安全措施** ❌:

| 检查项 | 状态 | 风险 |
|--------|------|------|
| 文件类型白名单校验 | ❌ | 可上传 `.exe`、`.php`、`.js` 等可执行文件 |
| 文件大小限制 | ⚠️ | 仅有全局 50MB bodyLimit，无按类型区分 |
| MIME 类型校验 | ❌ | 直接使用客户端提供的 `file.type`，可伪造 |
| 病毒扫描 | ❌ | 无恶意文件检测 |
| 图片维度校验 | ❌ | 可上传超大图片导致 DoS（如 10000x10000） |

**关键代码分析** (`media.handler.ts`):
```typescript
// 直接使用客户端提供的 file.type — 可被伪造
await mediaService.upload(buffer, file.name, file.type)
```

**建议**:
1. 实现文件类型白名单（如 `image/*`, `video/*`, `audio/*`, `application/pdf`）
2. 使用 `file-type` 库通过魔数（magic bytes）验证真实文件类型
3. 按文件类型设置不同的大小上限（图片 10MB、视频 50MB、其他 5MB）
4. 对图片进行重新编码/压缩（消除 EXIF 中的敏感信息）
5. 集成 ClamAV 或类似病毒扫描

---

## 4. OAuth 安全

### 🟡 中等: 基础防护存在，但有明显漏洞

**Shadow OAuth (第三方应用对接)** ✅:
- `redirect_uri` 严格校验 — 必须完全匹配注册列表中的 URI ✅
- `state` 参数在 `authorizeApproveSchema` 中可选传递 ✅
- Token exchange 需要 `client_id` + `client_secret` ✅
- 访问令牌使用 SHA-256 哈希存储（不存明文）✅
- Token 过期检查 ✅
- Scope 权限分离 ✅

**External OAuth (Google/GitHub 登录)** 🟡:

| 检查项 | 状态 | 风险 |
|--------|------|------|
| State 参数签名 | 🔴 | State 仅是 base64 编码的 JSON，**无签名/加密**，攻击者可伪造任意 redirect 目标 |
| State 参数校验 | ❌ | `handleCallback` 接收 state 但**不校验**其完整性 |
| redirect_uri 一致性 | ✅ | token exchange 时传递了 redirect_uri |
| 移动端 token 泄漏 | 🟡 | 移动端通过 URL query params 传递 token（`?access_token=xxx`），可能被浏览器历史/日志捕获 |

**关键漏洞** (`external-oauth.service.ts:75-79`):
```typescript
// State 仅用 base64url 编码，无任何签名
const state = redirectPath
  ? Buffer.from(JSON.stringify({ redirect: redirectPath })).toString('base64url')
  : ''
```

攻击者可以构造恶意 state，在 OAuth callback 时将用户重定向到钓鱼网站。

**建议**:
1. 为 External OAuth state 参数添加 HMAC 签名（使用 JWT_SECRET）
2. 在 callback 中验证 state 签名
3. 添加 state 过期时间（防止重放攻击）
4. 移动端 OAuth token 传递改用 URL fragment（`#`）而非 query params

---

## 5. SQL 注入

### 🟢 良好: Drizzle ORM 参数化查询

**审查结果**:
- 所有数据访问使用 Drizzle ORM，默认参数化查询 ✅
- 使用 `sql\`` 模板标签的地方（wallet.dao.ts、claw-listing.dao.ts 等）均使用 Drizzle 的参数化 API，**非字符串拼接** ✅
- 唯一值得注意的地方是 `workspace-node.dao.ts:277` 的 `rewriteDescendantPaths` 使用了 raw SQL 的 `LIKE` 匹配，但参数通过 Drizzle 传递，安全 ✅

**无 SQL 注入风险** ✅

---

## 6. 敏感数据泄露

### 🟡 中等: 日志中可能包含敏感信息

**Logger 配置** (`logger.ts`):
```typescript
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty', ... } : undefined,
})
```

**发现的问题**:

| 位置 | 风险 | 级别 |
|------|------|------|
| `error.middleware.ts` — `logger.error({ err: error, ... })` | 如果 error 对象包含敏感字段（如 JWT、密码），会被完整记录 | 🟡 |
| `auth.handler.ts:277` — `logger.warn({ err: error, provider }, ...)` | OAuth 回调失败的 error 可能包含 token | 🟡 |
| `media.handler.ts:59` — `console.error(...)` | 使用 console 而非 logger，格式不一致且可能被生产日志系统遗漏 | 🟢 |
| `disconnect` 端点 | 在 try-catch 中静默忽略错误，可能掩盖安全问题 | 🟡 |

**好的做法** ✅:
- 生产环境不暴露详细错误信息（`error.middleware.ts` 仅返回通用消息）
- 改密码操作记录 IP 和 User-Agent 用于审计

**建议**:
1. 日志记录前过滤敏感字段（JWT token、密码、access_token 等）
2. 统一使用 `logger` 而非 `console.error`
3. 为 error 对象添加序列化白名单

---

## 7. XSS 防护

### 🔴 严重: 多处 XSS 漏洞

**7.1 MarkdownRenderer — `javascript:` URL 注入** 🔴

`apps/web/src/components/workspace/renderers/MarkdownRenderer.tsx:346-347`:
```typescript
// 未对 URL 做协议白名单检查
.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" ... />')
.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" ...>$1</a>')
```

攻击者可构造 `![x](javascript:alert(document.cookie))` 实现 XSS。

**7.2 ReactMarkdown — 缺少 rehype-sanitize** 🟡

`apps/web/src/components/chat/message-bubble.tsx` 和 `file-preview-panel.tsx`:
```typescript
<ReactMarkdown remarkPlugins={[remarkGfm]}>
```

ReactMarkdown 默认不渲染 HTML，但如果未来引入 `rehype-raw` 插件，将允许原始 HTML 注入。当前安全，但缺少防御深度。

**7.3 dangerouslySetInnerHTML — 需持续关注** 🟡

- `file-preview-panel.tsx`: shiki 语法高亮输出，可信来源 ✅
- `marketplace-detail.tsx`: 仅用于 CSS keyframe 动画 ✅
- `MarkdownRenderer.tsx`: 使用自定义 `simpleMarkdownToHtml`，已转义 `<` `>` `&`，但 **URL 未过滤** ❌

**建议**:
1. **紧急**: 为 `simpleMarkdownToHtml` 添加 URL 协议白名单（仅允许 `http:`, `https:`, `data:image/`）
2. 为 ReactMarkdown 添加 `rehype-sanitize` 作为防御层
3. 对所有 `dangerouslySetInnerHTML` 使用点进行代码审查标记

---

## 8. CSP 策略

### 🔴 严重: 缺失 Content-Security-Policy

**审查结果** (`security-headers.middleware.ts`):

已设置的安全头:
- `X-Content-Type-Options: nosniff` ✅
- `X-Frame-Options: DENY` ✅
- `X-XSS-Protection: 0` ✅（现代浏览器忽略此头，设置 0 是正确做法）
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `Strict-Transport-Security`（仅生产环境）✅

**缺失的安全头** ❌:
- **Content-Security-Policy** — 最重要的 XSS 防护层缺失
- **Permissions-Policy** — 未限制浏览器 API 权限（摄像头、麦克风等）

**建议 CSP 策略**:
```
Content-Security-Policy: default-src 'self'; 
  script-src 'self'; 
  style-src 'self' 'unsafe-inline'; 
  img-src 'self' data: https:; 
  connect-src 'self' wss: https:; 
  font-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self'
```

---

## 总结 & 优先级

| 优先级 | 问题 | 严重程度 | 修复工作量 |
|--------|------|----------|------------|
| **P0** | MarkdownRenderer `javascript:` URL XSS | 🔴 严重 | 小 (1h) |
| **P0** | External OAuth State 无签名 | 🔴 严重 | 中 (3h) |
| **P1** | 添加 Content-Security-Policy 头 | 🔴 严重 | 中 (2h) |
| **P1** | 实现 Rate Limiting | 🔴 严重 | 大 (6h) |
| **P2** | 文件上传类型白名单 + MIME 校验 | 🟡 中等 | 中 (4h) |
| **P2** | 日志敏感信息过滤 | 🟡 中等 | 小 (2h) |
| **P3** | ReactMarkdown 添加 rehype-sanitize | 🟡 中等 | 小 (1h) |
| **P3** | 登录端点失败计数与锁定 | 🟡 中等 | 中 (3h) |
| **P3** | 添加 Permissions-Policy 头 | 🟢 低 | 小 (0.5h) |

### 修复建议顺序

1. **立即修复**: MarkdownRenderer URL 白名单（P0 XSS 漏洞，可利用）
2. **本周修复**: OAuth State 签名 + CSP 头 + Rate Limiting（P0/P1）
3. **下周修复**: 文件上传安全 + 日志过滤（P2）
4. **迭代优化**: 登录保护 + rehype-sanitize + Permissions-Policy（P3）
