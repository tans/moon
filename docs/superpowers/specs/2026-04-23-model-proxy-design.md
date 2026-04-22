# MOON 模型中转层设计

**日期:** 2026-04-23
**状态:** 已批准

## 概述

为 MOON 添加模型中转层功能，支持 OpenAI 和 Anthropic 两种 API 格式，按 L1/L2/L3 层级路由到底层模型源，对客户屏蔽具体模型细节。

## 核心流程

```
客户请求
    ↓
验证 API Key，获取用户套餐
    ↓
解析 tier 参数（请求有就用请求的，没有用套餐默认）
    ↓
从环境变量获取对应 tier 的模型源
    ↓
轮询选择第一个可用的源
    ↓
格式转换（OpenAI ↔ Anthropic）
    ↓
转发请求到模型源
    ↓
流式/非流式返回响应
```

## 环境变量配置

```bash
# L1 配置
L1_PROVIDER=openai
L1_BASE_URL=https://api.openai.com/v1
L1_API_KEY=sk-xxx
L1_MODEL=gpt-4o

# L2 配置
L2_PROVIDER=anthropic
L2_BASE_URL=https://api.anthropic.com
L2_API_KEY=sk-ant-xxx
L2_MODEL=claude-opus-4

# L3 配置
L3_PROVIDER=openai
L3_BASE_URL=https://your-proxy.com/v1
L3_API_KEY=xxx
L3_MODEL=gpt-4o-mini
```

## API 端点

### OpenAI 兼容 `POST /v1/chat/completions`

请求:
```json
{
  "model": "L1",
  "messages": [{"role": "user", "content": "hello"}],
  "tier": "L1",
  "stream": false
}
```

### Anthropic 兼容 `POST /v1/messages`

请求:
```json
{
  "model": "L1",
  "messages": [{"role": "user", "content": "hello"}],
  "tier": "L1",
  "stream": false
}
```

## 格式转换规则

| 请求格式 | 目标源 | 转换 |
|---------|-------|-----|
| OpenAI | Anthropic | messages → prompt, tools → tools |
| Anthropic | OpenAI | prompt → messages, tools → functions |

## 层级路由逻辑

1. 客户请求可带 `tier` 参数指定用哪个层级
2. 不带 `tier` 则按用户套餐默认层级
3. 同一层级配置多个源时，轮询选择第一个可用的
4. L1 额度用完可降级到 L2（由额度控制模块决定）

## 数据模型

### 新增 api_keys 表

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### usage_events 记录格式

```sql
-- tier: L1 | L2 | L3
-- model_name: 实际调用的模型名
```

## 技术要点

- 使用 Bun 内置 fetch 调用下游模型
- 流式响应使用 ReadableStream
- API Key 认证通过 `Authorization: Bearer <key>` header
- 错误响应遵循对应 API 格式规范

## 待实现

- [ ] 环境变量读取模块
- [ ] API Key 认证
- [ ] OpenAI / Anthropic 请求解析
- [ ] 格式转换
- [ ] 模型源调用
- [ ] 流式响应处理
- [ ] 额度记录
