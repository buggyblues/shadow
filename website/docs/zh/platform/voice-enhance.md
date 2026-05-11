# 语音增强

语音增强服务使用 AI 清理和改进语音转录文本。

## 增强转录文本

```
POST /api/voice/enhance
```

使用配置的 LLM 提供商增强语音转录文本。

| 字段 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `transcript` | string | 是 | 原始转录文本 |
| `language` | string | 否 | 语言代码（默认: zh-CN） |
| `options.enableSelfCorrection` | boolean | 否 | 自动纠错 |
| `options.enableListFormatting` | boolean | 否 | 格式化列表 |
| `options.enableFillerRemoval` | boolean | 否 | 删除填充词 |
| `options.enableToneAdjustment` | boolean | 否 | 调整语气 |
| `options.targetTone` | string | 否 | formal/casual/professional |

:::code-group

```ts [TypeScript]
const result = await client.enhanceVoice({
  transcript: '嗯，我觉得我们应该明天部署...',
  language: 'zh-CN',
  options: {
    enableSelfCorrection: true,
    enableFillerRemoval: true,
  },
})
```

```bash [CLI]
shadowob voice-enhance enhance \
  --transcript "嗯，我觉得我们应该明天部署..." \
  --language zh-CN \
  --no-filler-removal \
  --json
```

:::

---

## 增强转录文本 (查询参数)

```
GET /api/voice/enhance?transcript=...&language=zh-CN
```

与 POST 版本相同，但使用查询参数。

| 参数 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `transcript` | string | 是 | 原始转录文本 |
| `language` | string | 否 | 语言代码 |
| `enableSelfCorrection` | boolean | 否 | 自动纠错 |
| `enableListFormatting` | boolean | 否 | 列表格式化 |
| `enableFillerRemoval` | boolean | 否 | 删除填充词 |
| `enableToneAdjustment` | boolean | 否 | 调整语气 |
| `targetTone` | string | 否 | formal/casual/professional |

:::code-group

```ts [TypeScript]
const result = await client.enhanceVoiceQuery({
  transcript: '你好世界',
  language: 'zh-CN',
  enableFillerRemoval: true,
})
```

:::

---

## 获取语音增强配置

```
GET /api/voice/config
```

返回当前语音增强配置（API 密钥已脱敏）。

:::code-group

```ts [TypeScript]
const config = await client.getVoiceConfig()
```

```bash [CLI]
shadowob voice-enhance config --json
```

:::

---

## 更新语音增强配置

```
POST /api/voice/config
```

仅管理员。更新语音增强的 LLM 配置。

| 字段 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `provider` | string | 是 | openai / anthropic / alibaba / custom |
| `apiKey` | string | 是 | 提供商 API 密钥 |
| `baseUrl` | string | 否 | 自定义基础 URL |
| `model` | string | 否 | 模型名称 |
| `temperature` | number | 否 | 0-2 |
| `maxTokens` | number | 否 | 最大响应令牌数 |
| `timeout` | number | 否 | 请求超时（毫秒） |
| `enabled` | boolean | 否 | 启用/禁用服务 |

:::code-group

```ts [TypeScript]
await client.updateVoiceConfig({
  provider: 'openai',
  apiKey: 'sk-...',
  model: 'gpt-4',
  enabled: true,
})
```

:::

---

## 健康检查

```
GET /api/voice/health
```

仅管理员。检查语音增强服务是否已配置并正常运行。

:::code-group

```ts [TypeScript]
const health = await client.voiceHealthCheck()
```

:::
