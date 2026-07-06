# 官方模型代理

Shadow 提供兼容 OpenAI 规范的官方模型代理，用于 Cloud 运行时和已部署的 Buddy。新用户无需先配置自己的模型供应商也能开始使用，同时官方上游 key 只保存在服务端。

## 接口

所有请求都需要 Shadow 访问令牌，或受限的 `smp_...` 模型代理令牌。

```http
GET /api/ai/v1/models
GET /api/ai/v1/billing
POST /api/ai/v1/chat/completions
```

聊天接口遵循 OpenAI chat completions 结构：

```ts
const completion = await fetch('/api/ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: 'Say hello' }],
  }),
})
```

## 计费

官方供应商由环境变量配置。默认模型是 `deepseek-v4-flash`，示例环境与 compose 默认 base URL 为
`https://api.deepseek.com`。base URL 和模型都可以不改代码直接替换。

默认采用 DeepSeek 风格计费：

| 用量类型 | 价格 |
|----------|------|
| 输入 tokens，缓存命中 | 0.02 元 / 百万 tokens = 0.4 虾币 / 百万 tokens |
| 输入 tokens，缓存未命中 | 1 元 / 百万 tokens = 20 虾币 / 百万 tokens |
| 输出 tokens | 2 元 / 百万 tokens = 40 虾币 / 百万 tokens |

Shadow 默认按 `1 元 = 20 虾币` 换算。钱包余额仍保持整数虾币，因此代理会累计 micro-虾币用量，只有达到整虾币时才体现在钱包扣费中。

## 余额不足

如果钱包余额不足以覆盖官方模型请求，Shadow 会返回兼容 OpenAI 的响应，并附带 `shadow:wallet-recharge` 标记，而不是暴露上游供应商错误。Shadow 客户端会把这个标记渲染成聊天区里的充值卡片。

## 安全边界

- 官方上游 API key 只保存在服务端环境变量中。
- Cloud 模板和 Pod 只会收到受限的模型代理 token。
- 供应商错误会先被归一化，不会把上游账户、配额等细节暴露给客户端。
- 用户自己的供应商配置属于 Cloud Provider Profile，走加密保存，与官方代理相互独立。

---

- [认证](/zh/platform/authentication) —— 令牌与会员状态
- [SDK](/zh/platform/sdks) —— SDK 示例
- [云电脑](./cloud-computers) —— 可使用官方代理的空间云端运行环境
