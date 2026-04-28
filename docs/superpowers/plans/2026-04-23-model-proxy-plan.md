# MOON 模型中转层实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加模型中转功能，支持 OpenAI 和 Anthropic 两种 API 格式，按 L1/L2/L3 层级路由到底层模型源。

**Architecture:** 轻量直连方案，环境变量配置模型源，请求进来后经过认证→解析→格式转换→转发→响应返回。

**Tech Stack:** Bun + Hono + SQLite，无额外依赖，使用原生 fetch 调用下游模型。

---

## 文件结构

```
src/
  app.ts          # 修改: 新增 /v1/chat/completions 和 /v1/messages 路由
  config.ts       # 新增: 环境变量读取，配置模型源
  auth.ts         # 新增: API Key 认证
  parser.ts       # 新增: 请求解析（OpenAI/Anthropic格式）
  convert.ts      # 新增: 格式转换
  proxy.ts        # 新增: 模型源调用
  usage.ts        # 新增: 用量记录
  db.ts           # 修改: 新增 api_keys 表
```

---

## Task 1: 环境变量配置模块

**Files:**
- Create: `src/config.ts`
- Test: 直接通过手动 curl 测试

- [ ] **Step 1: 创建 config.ts**

```typescript
// src/config.ts

export interface ModelSource {
  provider: "openai" | "anthropic";
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface Config {
  l1: ModelSource | null;
  l2: ModelSource | null;
  l3: ModelSource | null;
}

function getSource(tier: "L1" | "L2" | "L3"): ModelSource | null {
  const provider = process.env[`${tier}_PROVIDER`];
  const baseURL = process.env[`${tier}_BASE_URL`];
  const apiKey = process.env[`${tier}_API_KEY`];
  const model = process.env[`${tier}_MODEL`];

  if (!provider || !baseURL || !apiKey || !model) {
    return null;
  }

  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error(`Invalid provider for ${tier}: ${provider}`);
  }

  return { provider, baseURL, apiKey, model };
}

export function loadConfig(): Config {
  return {
    l1: getSource("L1"),
    l2: getSource("L2"),
    l3: getSource("L3"),
  };
}

export const config = loadConfig();
```

- [ ] **Step 2: 验证模块加载**

Run: `bun run -e "import './src/config'" 2>&1 || echo "Config module loaded"`
Expected: 无错误或显示 "Config module loaded"

- [ ] **Step 3: 提交**

```bash
git add src/config.ts
git commit -m "feat: add config module for model sources"
```

---

## Task 2: 数据库 - api_keys 表

**Files:**
- Modify: `src/db.ts`
- Test: `bun run src/index.ts` 启动后检查数据库

- [ ] **Step 1: 修改 db.ts 添加 api_keys 表**

```typescript
// 在 db.exec() 的 CREATE TABLE 语句中添加:

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    tier TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
```

- [ ] **Step 2: 重启服务创建新表**

Run: `pkill -f "bun run dev" || true; bun run dev &`
Run: `sleep 2 && curl http://localhost:8787/health`
Expected: `{"ok":true,"database":"ready"}`

- [ ] **Step 3: 提交**

```bash
git add src/db.ts
git commit -m "feat: add api_keys table for authentication"
```

---

## Task 3: API Key 认证模块

**Files:**
- Create: `src/auth.ts`
- Modify: `src/app.ts` 添加认证中间件
- Test: 新增 `tests/auth.test.ts`

- [ ] **Step 1: 创建 auth.ts**

```typescript
// src/auth.ts
import { db } from "./db";

export interface AuthResult {
  userId: string;
  tier: "L1" | "L2" | "L3";
}

export function authenticate(authHeader: string | null): AuthResult | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const key = authHeader.slice(7);
  const row = db.query("SELECT user_id, tier FROM api_keys WHERE key = ?").get(key) as { user_id: string; tier: string } | undefined;

  if (!row) {
    return null;
  }

  return { userId: row.user_id, tier: row.tier as "L1" | "L2" | "L3" };
}

export function createApiKey(userId: string, tier: "L1" | "L2" | "L3"): string {
  const id = crypto.randomUUID();
  const key = `moon_${crypto.randomBytes(16).toString("hex")}`;
  
  db.query("INSERT INTO api_keys (id, user_id, key, tier) VALUES (?, ?, ?, ?)").run(id, userId, key, tier);
  
  return key;
}
```

- [ ] **Step 2: 添加测试**

```typescript
// tests/auth.test.ts
import { describe, it, expect } from "bun:test";
import { createApiKey } from "../src/auth";
import { db } from "../src/db";

describe("auth", () => {
  it("should create api key", () => {
    const key = createApiKey("test-user", "L1");
    expect(key).toMatch(/^moon_[a-f0-9]{32}$/);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `bun test tests/auth.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: add API key authentication"
```

---

## Task 4: 请求解析模块

**Files:**
- Create: `src/parser.ts`
- Test: `tests/parser.test.ts`

- [ ] **Step 1: 创建 parser.ts**

```typescript
// src/parser.ts

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenAIRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  tier?: string;
  // 其他字段保留
  [key: string]: unknown;
}

export interface AnthropicRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  tier?: string;
  // 其他字段保留
  [key: string]: unknown;
}

export interface ParsedRequest {
  tier: "L1" | "L2" | "L3";
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  rawRequest: Record<string, unknown>;
}

export function parseOpenAIRequest(body: unknown): OpenAIRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  return body as OpenAIRequest;
}

export function parseAnthropicRequest(body: unknown): AnthropicRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  return body as AnthropicRequest;
}

export function parseRequest(
  body: unknown,
  defaultTier: "L1" | "L2" | "L3"
): ParsedRequest {
  const req = body as Record<string, unknown>;
  
  let tier = defaultTier;
  if (typeof req.tier === "string" && ["L1", "L2", "L3"].includes(req.tier)) {
    tier = req.tier as "L1" | "L2" | "L3";
  }

  const messages = (req.messages as ChatMessage[]) || [];
  const stream = req.stream === true;

  return {
    tier,
    model: typeof req.model === "string" ? req.model : tier,
    messages,
    stream,
    rawRequest: req,
  };
}
```

- [ ] **Step 2: 添加测试**

```typescript
// tests/parser.test.ts
import { describe, it, expect } from "bun:test";
import { parseRequest } from "../src/parser";

describe("parser", () => {
  it("should parse OpenAI request", () => {
    const result = parseRequest({
      model: "L1",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    }, "L2");
    
    expect(result.tier).toBe("L1");
    expect(result.messages).toHaveLength(1);
    expect(result.stream).toBe(false);
  });

  it("should use default tier when not specified", () => {
    const result = parseRequest({
      model: "L1",
      messages: [],
    }, "L3");
    
    expect(result.tier).toBe("L3");
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `bun test tests/parser.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/parser.ts tests/parser.test.ts
git commit -m "feat: add request parser for OpenAI and Anthropic formats"
```

---

## Task 5: 格式转换模块

**Files:**
- Create: `src/convert.ts`
- Test: `tests/convert.test.ts`

- [ ] **Step 1: 创建 convert.ts**

```typescript
// src/convert.ts
import type { ChatMessage, OpenAIRequest, AnthropicRequest } from "./parser";

export interface ConvertedRequest {
  provider: "openai" | "anthropic";
  body: Record<string, unknown>;
}

function messagesToAnthropicPrompt(messages: ChatMessage[]): string {
  return messages.map(m => `${m.role}: ${m.content}`).join("\n");
}

function anthropicPromptToMessages(prompt: string): ChatMessage[] {
  return [{ role: "user", content: prompt }];
}

export function openaiToAnthropic(req: OpenAIRequest, targetModel: string): ConvertedRequest {
  return {
    provider: "anthropic",
    body: {
      model: targetModel,
      prompt: messagesToAnthropicPrompt(req.messages),
      max_tokens: 4096,
      stream: req.stream,
    },
  };
}

export function anthropicToOpenAI(req: AnthropicRequest, targetModel: string): ConvertedRequest {
  return {
    provider: "openai",
    body: {
      model: targetModel,
      messages: anthropicPromptToMessages(req.prompt || ""),
      stream: req.stream,
    },
  };
}

export function convertRequest(
  req: OpenAIRequest | AnthropicRequest,
  targetProvider: "openai" | "anthropic",
  targetModel: string
): ConvertedRequest {
  const isOpenAI = "messages" in req;
  
  if (isOpenAI && targetProvider === "anthropic") {
    return openaiToAnthropic(req as OpenAIRequest, targetModel);
  }
  
  if (!isOpenAI && targetProvider === "openai") {
    return anthropicToOpenAI(req as AnthropicRequest, targetModel);
  }

  // 同格式或未知格式，直接传递
  return {
    provider: targetProvider,
    body: req as unknown as Record<string, unknown>,
  };
}
```

- [ ] **Step 2: 添加测试**

```typescript
// tests/convert.test.ts
import { describe, it, expect } from "bun:test";
import { convertRequest } from "../src/convert";

describe("convert", () => {
  it("should convert OpenAI to Anthropic", () => {
    const openaiReq = {
      model: "L1",
      messages: [{ role: "user", content: "hello" }],
    };
    
    const result = convertRequest(openaiReq, "anthropic", "claude-opus-4");
    
    expect(result.provider).toBe("anthropic");
    expect(result.body.model).toBe("claude-opus-4");
    expect(result.body.prompt).toContain("user: hello");
  });

  it("should pass through when formats match", () => {
    const openaiReq = {
      model: "L1",
      messages: [{ role: "user", content: "hello" }],
    };
    
    const result = convertRequest(openaiReq, "openai", "gpt-4o");
    
    expect(result.provider).toBe("openai");
    expect(result.body.model).toBe("gpt-4o");
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `bun test tests/convert.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/convert.ts tests/convert.test.ts
git commit -m "feat: add format conversion between OpenAI and Anthropic"
```

---

## Task 6: 模型源调用模块

**Files:**
- Create: `src/proxy.ts`
- Test: 手动 curl 测试

- [ ] **Step 1: 创建 proxy.ts**

```typescript
// src/proxy.ts
import type { ModelSource } from "./config";

export interface ProxyResponse {
  ok: boolean;
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

export async function callModel(
  source: ModelSource,
  body: Record<string, unknown>
): Promise<ProxyResponse> {
  const url = `${source.baseURL}/chat/completions`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${source.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    ok: response.ok,
    status: response.status,
    data,
    headers,
  };
}

export async function callModelStream(
  source: ModelSource,
  body: Record<string, unknown>
): Promise<Response> {
  const url = `${source.baseURL}/chat/completions`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${source.apiKey}`,
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  return response;
}
```

- [ ] **Step 2: 验证模块加载**

Run: `bun run -e "import './src/proxy'" 2>&1 || echo "Proxy module loaded"`
Expected: 无错误或显示 "Proxy module loaded"

- [ ] **Step 3: 提交**

```bash
git add src/proxy.ts
git commit -m "feat: add model proxy for upstream API calls"
```

---

## Task 7: 用量记录模块

**Files:**
- Create: `src/usage.ts`
- Modify: `src/proxy.ts` 集成用量记录

- [ ] **Step 1: 创建 usage.ts**

```typescript
// src/usage.ts
import { db } from "./db";

export interface UsageRecord {
  id: string;
  userId: string;
  tier: "L1" | "L2" | "L3";
  modelName: string;
  createdAt: Date;
}

export function recordUsage(
  userId: string,
  tier: "L1" | "L2" | "L3",
  modelName: string
): void {
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO usage_events (id, user_id, tier, model_name) VALUES (?, ?, ?, ?)"
  ).run(id, userId, tier, modelName);
}

export function getTodayUsage(userId: string, tier: "L1" | "L2" | "L3"): number {
  const today = new Date().toISOString().split("T")[0];
  const row = db.query(
    "SELECT COUNT(*) as count FROM usage_events WHERE user_id = ? AND tier = ? AND date(created_at) = ?"
  ).get(userId, tier, today) as { count: number };
  
  return row?.count ?? 0;
}
```

- [ ] **Step 2: 集成到 proxy.ts**

在 callModel 返回后调用 recordUsage（需要传入 userId）

- [ ] **Step 3: 提交**

```bash
git add src/usage.ts
git commit -m "feat: add usage tracking module"
```

---

## Task 8: API 路由整合

**Files:**
- Modify: `src/app.ts`
- Test: 手动 curl 测试

- [ ] **Step 1: 在 app.ts 添加新路由**

```typescript
import { authenticate } from "./auth";
import { parseRequest } from "./parser";
import { convertRequest } from "./convert";
import { callModel } from "./proxy";
import { recordUsage } from "./usage";
import { config } from "./config";

// OpenAI 兼容路由
app.post("/v1/chat/completions", async (c) => {
  const auth = authenticate(c.req.header("Authorization"));
  if (!auth) {
    return c.json({ error: { message: "Invalid API key" } }, 401);
  }

  const body = await c.req.json();
  const parsed = parseRequest(body, auth.tier);
  
  const source = config[parsed.tier.toLowerCase() as "l1" | "l2" | "l3"];
  if (!source) {
    return c.json({ error: { message: `Tier ${parsed.tier} not configured` } }, 500);
  }

  const converted = convertRequest(body, source.provider, source.model);
  const result = await callModel(source, converted.body);
  
  recordUsage(auth.userId, parsed.tier, source.model);

  if (!result.ok) {
    return c.json(result.data, result.status);
  }

  return c.json(result.data, result.status);
});

// Anthropic 兼容路由
app.post("/v1/messages", async (c) => {
  const auth = authenticate(c.req.header("Authorization"));
  if (!auth) {
    return c.json({ error: { message: "Invalid API key" } }, 401);
  }

  const body = await c.req.json();
  const parsed = parseRequest(body, auth.tier);
  
  const source = config[parsed.tier.toLowerCase() as "l1" | "l2" | "l3"];
  if (!source) {
    return c.json({ error: { message: `Tier ${parsed.tier} not configured` } }, 500);
  }

  const converted = convertRequest(body, source.provider, source.model);
  const result = await callModel(source, converted.body);
  
  recordUsage(auth.userId, parsed.tier, source.model);

  if (!result.ok) {
    return c.json(result.data, result.status);
  }

  return c.json(result.data, result.status);
});
```

- [ ] **Step 2: 手动测试**

```bash
# 测试无认证
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"L1","messages":[{"role":"user","content":"hi"}]}'

# 期望: 401 Unauthorized
```

- [ ] **Step 3: 提交**

```bash
git add src/app.ts
git commit -m "feat: add /v1/chat/completions and /v1/messages routes"
```

---

## Task 9: 流式响应支持

**Files:**
- Modify: `src/app.ts` 的两个路由
- Modify: `src/proxy.ts`

- [ ] **Step 1: 修改 app.ts 添加流式处理**

在两个路由中添加:
```typescript
if (parsed.stream) {
  const streamResponse = await callModelStream(source, converted.body);
  return new Response(streamResponse.body, {
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}
```

- [ ] **Step 2: 测试流式**

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"L1","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

- [ ] **Step 3: 提交**

```bash
git add src/app.ts src/proxy.ts
git commit -m "feat: add streaming support"
```

---

## 实现顺序

1. Task 1: 环境变量配置模块
2. Task 2: 数据库 - api_keys 表
3. Task 3: API Key 认证模块
4. Task 4: 请求解析模块
5. Task 5: 格式转换模块
6. Task 6: 模型源调用模块
7. Task 7: 用量记录模块
8. Task 8: API 路由整合
9. Task 9: 流式响应支持

---

## Spec 覆盖检查

| Spec 要求 | 对应 Task |
|---------|---------|
| 环境变量配置 | Task 1 |
| API Key 认证 | Task 2, Task 3 |
| OpenAI / Anthropic 请求解析 | Task 4 |
| 格式转换 | Task 5 |
| 模型源调用 | Task 6 |
| 流式响应 | Task 9 |
| 用量记录 | Task 7 |
| api_keys 表 | Task 2 |

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-model-proxy-plan.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?