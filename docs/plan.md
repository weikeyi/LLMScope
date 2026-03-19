下面这份我按**可直接立项 + 可直接开工 + 适合开源维护**的标准来写。你可以把它当成 `ARCHITECTURE.md + ROADMAP.md + TODO.md` 的合体版本。

---

# 一、项目定义

## 1.1 项目名称

建议名称：**LLMScope**

副标题：

> Local-first LLM traffic inspector for AI clients, proxies, and OpenAI-compatible APIs.

中文描述：

> 一个本地优先的 LLM 请求观测与调试代理工具，用于拦截、识别、解析和可视化各种 AI 客户端与中转站的请求和响应。

---

## 1.2 项目目标

这个项目的核心不是“帮用户发请求”，而是：

> **拦截本地 AI 工具发出的请求，识别供应商/协议，统一解析请求与响应，并提供可视化调试能力。**

### 目标能力

1. 拦截本地 AI 客户端请求
2. 支持 OpenAI / Claude / OpenAI-compatible / 中转站
3. 统一解析 request / response / streaming
4. 提供 Web UI 查看详情
5. 支持导出、对比、重放
6. 以插件方式扩展 provider 和协议

---

## 1.3 非目标

第一阶段不要做这些：

- 不做云端 SaaS
- 不做在线团队协作
- 不做复杂权限系统
- 不做生产级分布式 observability
- 不做模型 SDK 替代品
- 不做通用浏览器抓包器

---

# 二、用户与使用场景

## 2.1 目标用户

- 使用本地 AI 客户端的人
- 调试 OpenAI / Claude / OpenRouter / 中转站接口的人
- SDK 开发者
- Prompt 工程师
- API 中转站作者
- 网关开发者

## 2.2 典型使用场景

### 场景 A：客户端请求到底发了什么

用户在 Chatbox / Cherry Studio / Continue 里提问，想知道实际发出的：

- model
- system prompt
- user messages
- tools
- temperature
- stream 参数

### 场景 B：中转站为什么不兼容

请求到某个中转站后报错，用户想知道：

- 请求路径是否正确
- header 是否缺失
- body 是否不符合预期
- 响应结构哪里不兼容

### 场景 C：两次回答为什么不同

用户想比较两次请求的差异：

- prompt 变化
- tool 定义变化
- 温度变化
- provider 返回差异

### 场景 D：流式响应到底发生了什么

用户想看 stream 过程中：

- 首 token 到达时间
- delta 内容
- tool call 参数拼接过程
- usage 出现时间
- stop reason

---

# 三、产品形态

项目建议拆成两部分：

## 3.1 CLI 进程

负责：

- 启动代理服务
- 读取配置
- 管理本地存储
- 启动 UI 服务
- 打印日志
- 管理证书（后续 MITM）

## 3.2 Web UI

负责：

- 会话列表
- 会话详情
- stream 时间线
- 原始请求/响应查看
- diff 对比
- 导出与重放

---

# 四、架构总览

```text
AI Client / SDK / Proxy User
           │
           ▼
    ┌───────────────┐
    │   LLMScope    │
    │               │
    │ Proxy Engine  │
    │ Parser Layer  │
    │ Storage Layer │
    │ Web UI API    │
    └───────┬───────┘
            │
            ▼
    OpenAI / Claude / OpenRouter / Relay
```

建议采用 4 层设计：

1. **Transport Layer**
    - 处理 HTTP/HTTPS/CONNECT/WS/SSE
    - 拦截与转发
    - 记录时序

2. **Detection Layer**
    - 检测 provider / endpoint / protocol style

3. **Normalization Layer**
    - 将不同协议转成统一 canonical model

4. **Presentation Layer**
    - UI 展示、diff、导出、重放

---

# 五、仓库结构设计

建议一开始就用 monorepo。

```text
llmscope/
├─ apps/
│  ├─ cli/
│  └─ web/
├─ packages/
│  ├─ shared-types/
│  ├─ core/
│  ├─ proxy-engine/
│  ├─ provider-registry/
│  ├─ provider-openai/
│  ├─ provider-anthropic/
│  ├─ provider-openrouter/
│  ├─ provider-generic/
│  ├─ parser-sse/
│  ├─ storage-memory/
│  ├─ storage-sqlite/          # v0.2
│  ├─ redaction/
│  ├─ config/
│  ├─ replay/
│  └─ ui-components/
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ ROADMAP.md
│  ├─ PROVIDER_PLUGIN.md
│  ├─ SECURITY.md
│  └─ CONTRIBUTING.md
├─ examples/
├─ scripts/
├─ .changeset/
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

---

# 六、技术选型

## 后端

- Node.js 20+
- TypeScript
- Fastify
- undici（同时承担 HTTP 代理转发，不使用 node-http-proxy 以获得更精细的 body/stream 控制）
- ws
- zod
- pino
- better-sqlite3
- eventemitter3

## 前端

- React
- Vite
- Tailwind CSS
- Zustand
- TanStack Query
- Monaco Editor
- React Router 或 TanStack Router

## 工程化

- pnpm workspace
- turbo
- tsup
- eslint
- prettier
- vitest
- playwright
- changesets
- husky + lint-staged

---

# 七、代理模式设计

项目要分阶段支持 3 种模式。

## 7.1 模式 A：显式网关模式

用户把客户端 base URL 改成：

```text
http://127.0.0.1:8787/v1/chat/completions
```

LLMScope 再把请求转发到真实上游。

### 优点

- 实现简单
- 最适合 MVP
- 无需证书
- 易于跨平台

### 结论

**第一版必须先做这个。**

---

## 7.2 模式 B：系统代理模式

用户把客户端或系统代理配置到 LLMScope。

### 优点

- 接入范围更广
- 不要求客户端支持自定义 API base URL

### 缺点

- 复杂度更高
- HTTPS 默认只能看到 CONNECT 隧道元信息，除非做 MITM

### 结论

放到 v0.2。

---

## 7.3 模式 C：HTTPS MITM 模式

对 HTTPS 做中间人解密。

### 能力

- 解密 HTTPS 请求和响应
- 观察更多客户端
- 更接近 Charles/mitmproxy

### 风险

- 证书信任复杂
- 隐私敏感
- 维护成本高

### 结论

放到 v0.4 以后。

---

# 八、核心领域模型

这部分是整个项目的基础。一定要先定好。

## 8.1 Session

```ts
type Session = {
    id: string
    status: "pending" | "streaming" | "completed" | "error"
    startedAt: string
    endedAt?: string

    transport: {
        mode: "gateway" | "proxy" | "mitm"
        protocol: "http" | "https" | "sse" | "ws"
        method: string
        url: string
        host: string
        path: string
        statusCode?: number
        durationMs?: number
        firstByteAtMs?: number
    }

    routing: {
        upstreamBaseUrl?: string
        routeId?: string
        matchedProvider?: string
        matchedEndpoint?: string
        confidence?: number
    }

    request: RawHttpMessage
    response?: RawHttpMessage

    normalized?: CanonicalExchange
    streamEvents?: CanonicalStreamEvent[]

    tags?: string[]
    warnings?: string[]
    error?: InspectorError
}
```

> **`status` 字段说明**：流式请求在进行时处于 `streaming` 状态，UI 可依据此字段实时展示动态效果。

---

## 8.2 RawHttpMessage

```ts
type RawHttpMessage = {
    headers: Record<string, string | string[]>
    contentType?: string
    sizeBytes?: number

    bodyText?: string
    bodyJson?: unknown
    bodyFilePath?: string

    truncated?: boolean
    isBinary?: boolean
    sha256?: string
}
```

---

## 8.3 CanonicalExchange

```ts
type CanonicalExchange = {
    provider: string
    apiStyle: string

    model?: string
    stream?: boolean
    temperature?: number
    topP?: number
    maxTokens?: number

    instructions?: CanonicalMessage[]
    inputMessages?: CanonicalMessage[]
    tools?: CanonicalTool[]
    toolChoice?: unknown
    responseFormat?: unknown

    output?: CanonicalOutput
    usage?: CanonicalUsage
    latency?: CanonicalLatency

    warnings?: string[]
}
```

---

## 8.4 CanonicalMessage

```ts
type CanonicalMessage = {
    role: "system" | "developer" | "user" | "assistant" | "tool" | "unknown"
    parts: CanonicalPart[]
    raw?: unknown
}

type CanonicalPart =
    | { type: "text"; text: string }
    | { type: "json"; value: unknown }
    | { type: "image_url"; url?: string }
    | {
          type: "tool_call"
          id?: string
          name?: string
          arguments?: string | Record<string, unknown>
      }
    | {
          type: "tool_result"
          toolCallId?: string
          name?: string
          content?: string
      }
    | { type: "unknown"; value: unknown }
```

---

## 8.5 CanonicalTool

```ts
type CanonicalTool = {
    name?: string
    description?: string
    inputSchema?: unknown
    raw?: unknown
}
```

---

## 8.6 CanonicalUsage

```ts
type CanonicalUsage = {
    inputTokens?: number
    outputTokens?: number
    reasoningTokens?: number
    totalTokens?: number
    estimatedCost?: number
    currency?: string
}
```

---

## 8.7 CanonicalStreamEvent

```ts
type CanonicalStreamEvent = {
    id: string
    sessionId: string
    ts: number
    eventType:
        | "message_start"
        | "delta"
        | "tool_call_start"
        | "tool_call_delta"
        | "tool_result"
        | "message_stop"
        | "usage"
        | "error"
        | "unknown"
    rawLine?: string
    rawJson?: unknown
    normalized?: unknown
}
```

---

# 九、Provider 插件系统

这是项目长期扩展性的关键。

## 9.1 插件接口

```ts
interface ProviderPlugin {
    id: string
    displayName: string

    match(ctx: MatchContext): MatchResult | null

    parseRequest(ctx: ParseRequestContext): ParsedRequestResult
    parseResponse(ctx: ParseResponseContext): ParsedResponseResult

    parseStreamEvent?(
        ctx: ParseStreamEventContext,
    ): ParsedStreamEventResult | null

    redact?(ctx: RedactContext): RedactPatch[]
}
```

---

## 9.2 MatchResult

```ts
type MatchResult = {
    provider: string
    apiStyle: string
    confidence: number
    reasons: string[]
}
```

---

## 9.3 第一批 provider

v0.1 必做：

- provider-openai
    - chat completions
    - responses

- provider-anthropic
    - messages

- provider-generic
    - OpenAI-compatible generic

v0.2 再做：

- provider-openrouter
- provider-azure-openai
- provider-gemini

---

## 9.4 匹配策略

不要只靠路径，要综合判断：

1. host
2. path
3. headers
4. body shape
5. response shape

示例：

- `/v1/chat/completions` + `messages[]` => openai-compatible
- `/v1/responses` + `input` => openai-responses
- `/v1/messages` + `anthropic-version` => anthropic

---

# 十、请求生命周期设计

一次请求从进入代理到写入数据库，建议走以下流程：

```text
Receive request
  -> create session
  -> capture request headers/body
  -> resolve route
  -> detect provider
  -> proxy to upstream
  -> capture response headers/body
  -> parse normalized request/response
  -> parse streaming events if any
  -> write session/store
  -> notify UI
```

---

# 十一、代理引擎设计

## 11.1 包职责

### `packages/proxy-engine`

负责：

- 创建 HTTP server
- 接收请求
- 记录 request metadata
- 路由转发
- 收集 response metadata
- SSE event 拦截
- WebSocket 升级支持（后续）

### 关键接口

```ts
interface ProxyEngine {
    start(): Promise<void>
    stop(): Promise<void>
    onSession(listener: (session: Session) => void): void
}
```

---

## 11.2 路由解析器

```ts
interface RouteResolver {
    resolve(req: IncomingRequestMeta): ResolvedRoute
}
```

### ResolvedRoute

```ts
type ResolvedRoute = {
    routeId: string
    targetBaseUrl: string
    rewriteHost?: boolean
    injectHeaders?: Record<string, string>
    removeHeaders?: string[]
}
```

---

## 11.3 请求体处理策略

### 小体积文本

直接缓存在内存

### 大体积文本

落盘临时文件，仅保留索引

### 二进制

保存摘要信息：

- mime type
- size
- sha256
- 可选预览片段

---

## 11.4 背压与并发管理

### 请求体大小策略

| 体积                     | 处理方式                 | 阈值（可配置）            |
| ------------------------ | ------------------------ | ------------------------- |
| 小体积文本               | 内存缓存                 | < 1 MB                    |
| 中体积文本               | 内存缓存 + 截断警告      | 1~20 MB                   |
| 大体积（如 base64 图片） | 落盘临时文件，仅保留索引 | > 20 MB                   |
| 超限                     | 拒绝存储，仅记录摘要     | > `capture.maxBodySizeMb` |

### 流式背压

- 使用 Node.js stream pipe 透传，不主动 buffer 整个 response body
- SSE 拦截层使用 `Transform` stream，在流经过时拦截解析，不阻塞主路径
- 慢存储写入使用异步队列，不阻塞代理转发

### 并发连接管理

- Session ID 使用 `crypto.randomUUID()` 生成，无锁安全
- SQLite 写入使用 WAL 模式，支持并发读写
- 事件总线使用异步发射，避免阻塞代理引擎主线程
- 可配置最大并发会话数（默认 100），超限时返回 429

---

# 十二、SSE / 流式解析设计

流式是这个项目的最大卖点之一。

## 12.1 支持内容

- `text/event-stream`
- chunked JSON line
- 标准 SSE 格式

## 12.2 SSE parser 包

`packages/parser-sse`

职责：

- 将原始 response chunk 拆成 SSE message
- 支持：
    - `event:`
    - `data:`
    - 空行分帧

- 输出结构化事件

## 12.3 流式解析流程

```text
response stream chunk
  -> sse parser
  -> provider stream parser
  -> canonical stream events
  -> store append
  -> UI live push
```

## 12.4 UI 展示内容

- 首包时间
- 每个 delta 到达时间
- tool call start
- tool call args 增量
- usage
- stop reason
- error

---

# 十三、存储设计

## 13.1 分层存储策略

采用 **内存优先、可选持久化** 的分层策略：

| 阶段     | 驱动     | 说明                                                                    |
| -------- | -------- | ----------------------------------------------------------------------- |
| **v0.1** | `memory` | `Map<sessionId, Session>` 内存存储，默认保留最近 500 条，进程退出即清空 |
| **v0.2** | `sqlite` | SQLite 持久化，解锁历史搜索、Diff 对比、导出、重放等进阶功能            |

> **设计原则**：v0.1 的核心价值是**实时拦截 + 实时查看**，不需要持久化。数据库是为 Diff / 导出 / 重放等 v0.2 功能服务的。通过 `SessionStore` 接口抽象，底层从 `MemoryStore` 切换到 `SqliteStore` 对上层完全透明。

---

## 13.2 Store 接口

```ts
interface SessionStore {
    saveSession(session: Session): Promise<void>
    updateSession(session: Session): Promise<void>
    appendStreamEvent(
        sessionId: string,
        event: CanonicalStreamEvent,
    ): Promise<void>
    listSessions(query: ListSessionsQuery): Promise<SessionSummary[]>
    getSession(sessionId: string): Promise<Session | null>
    deleteSession(sessionId: string): Promise<void>
    clearAll(): Promise<void>
}
```

---

## 13.3 v0.1 内存存储实现

`packages/storage-memory`

```ts
class MemorySessionStore implements SessionStore {
    private sessions: Map<string, Session>
    private maxSessions: number // 默认 500，可配置

    // 超出 maxSessions 时淘汰最早的会话（LRU）
}
```

特性：

- 零依赖，无需任何安装
- 默认保留最近 500 条会话
- 超限时按 FIFO 淘汰最早的会话
- 进程退出即清空，无数据残留隐患

---

## 13.4 v0.2 SQLite 持久化实现（后续）

`packages/storage-sqlite`

用户通过配置切换：`storage.driver: sqlite`

### 数据表设计

#### sessions

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  host TEXT,
  path TEXT,
  protocol TEXT,
  mode TEXT,
  status_code INTEGER,
  provider TEXT,
  api_style TEXT,
  model TEXT,
  duration_ms INTEGER,
  first_byte_at_ms INTEGER,
  route_id TEXT,
  upstream_base_url TEXT,
  error_code TEXT
);
```

#### session_request

```sql
CREATE TABLE session_request (
  session_id TEXT PRIMARY KEY,
  headers_json TEXT,
  body_text TEXT,
  body_json TEXT,
  body_file_path TEXT,
  content_type TEXT,
  size_bytes INTEGER,
  truncated INTEGER
);
```

#### session_response

```sql
CREATE TABLE session_response (
  session_id TEXT PRIMARY KEY,
  headers_json TEXT,
  body_text TEXT,
  body_json TEXT,
  body_file_path TEXT,
  content_type TEXT,
  size_bytes INTEGER,
  truncated INTEGER
);
```

#### session_stream_events

```sql
CREATE TABLE session_stream_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  raw_line TEXT,
  raw_json TEXT,
  normalized_json TEXT
);
```

#### session_usage

```sql
CREATE TABLE session_usage (
  session_id TEXT PRIMARY KEY,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost REAL,
  currency TEXT
);
```

#### app_meta

```sql
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

#### 索引策略

```sql
CREATE INDEX idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_provider ON sessions(provider);
CREATE INDEX idx_sessions_model ON sessions(model);
CREATE INDEX idx_sessions_status_code ON sessions(status_code);
CREATE INDEX idx_stream_events_session ON session_stream_events(session_id, ts);
CREATE INDEX idx_session_usage_session ON session_usage(session_id);
```

---

# 十四、配置系统设计

## 14.1 配置来源优先级

1. CLI 参数
2. 环境变量
3. 配置文件
4. 默认值

## 14.2 配置文件示例

```yaml
server:
    host: 127.0.0.1
    port: 8787

ui:
    enabled: true
    port: 8788

capture:
    mode: gateway
    redactLevel: balanced
    maxBodySizeMb: 20
    saveBinaryPreview: false

storage:
    driver: memory # v0.1 默认内存存储；v0.2 可切换为 sqlite
    maxSessions: 500 # 内存模式下最大保留会话数
    # driver: sqlite         # v0.2 启用持久化
    # path: ~/.llmscope/data.db

routes:
    - id: openai-default
      match:
          pathPrefix:
              - /v1/chat/completions
              - /v1/responses
      target:
          baseUrl: https://api.openai.com

    - id: anthropic-default
      match:
          pathPrefix:
              - /v1/messages
      target:
          baseUrl: https://api.anthropic.com
```

---

# 十五、Web UI 设计

## 15.1 页面结构

### 页面一：会话列表页

功能：

- 搜索
- 按 provider 筛选
- 按状态筛选
- 按 model 筛选
- 按时间排序
- 展示 stream / tool / error 标签

每条会话显示：

- provider
- model
- endpoint
- 状态码
- 耗时
- token
- 时间

---

## 15.2 页面二：会话详情页

顶部摘要：

- URL
- provider
- api style
- model
- stream
- duration
- first byte
- tokens
- route
- redaction level

### Tab 1: Overview

展示 canonical 结构：

- instructions
- messages
- tools
- output
- usage

### Tab 2: Raw

展示：

- request headers
- request body
- response headers
- response body

### Tab 3: Stream

展示时间线

### Tab 4: Diff

与上一条或指定会话对比

### Tab 5: Replay

生成 curl / fetch / SDK 代码

---

## 15.3 UI 组件拆分

`packages/ui-components`

包含：

- SessionBadge
- ProviderBadge
- StreamTimeline
- TokenUsageCard
- RawJsonViewer
- MessageList
- ToolInspector
- DiffViewer
- EmptyState
- SearchBar

---

## 15.4 UI API 接口设计

API 服务嵌入 CLI 主进程（与 proxy engine 同进程），由 Fastify 提供，端口默认 `8788`。

### REST API

| 路径                              | 方法   | 说明                                                               |
| --------------------------------- | ------ | ------------------------------------------------------------------ | ----- | ---------- | -------------- |
| `/api/sessions`                   | GET    | 会话列表，支持 `?provider=&model=&status=&q=&limit=&offset=&sort=` |
| `/api/sessions/:id`               | GET    | 会话详情（含 normalized、raw、usage）                              |
| `/api/sessions/:id/stream-events` | GET    | 该会话的全部流式事件                                               |
| `/api/sessions/:id`               | DELETE | 删除单条会话                                                       |
| `/api/sessions`                   | DELETE | 清空全部会话（需 `?confirm=true`）                                 |
| `/api/sessions/:id/replay`        | GET    | 生成重放代码，支持 `?format=curl                                   | fetch | openai-sdk | anthropic-sdk` |
| `/api/sessions/export`            | POST   | 导出选中会话 `{ ids[], format }`                                   |
| `/api/config`                     | GET    | 当前运行时配置                                                     |
| `/api/health`                     | GET    | 健康检查                                                           |

### 实时推送

使用 **WebSocket** 推送实时事件。客户端连接 `ws://127.0.0.1:8788/ws`。

推送事件格式：

```ts
type WsEvent =
    | { type: "session:created"; session: SessionSummary }
    | { type: "session:updated"; session: SessionSummary }
    | {
          type: "session:stream-event"
          sessionId: string
          event: CanonicalStreamEvent
      }
    | { type: "session:completed"; sessionId: string }
    | { type: "session:error"; sessionId: string; error: InspectorError }
```

> 选择 WebSocket 而非 SSE 推送：因为后续可能需要双向通信（如从 UI 触发 replay），且避免与业务级 SSE 解析混淆。

---

## 15.5 CORS 策略

Proxy Engine（默认 `8787`）和 UI API（默认 `8788`）是两个不同端口，前端访问 API 需要 CORS：

- 默认 `Access-Control-Allow-Origin: http://127.0.0.1:8788`（仅允许同机 UI）
- 非默认部署时读取配置中的 `ui.corsOrigin`
- 绝不开放 `*`，避免远程攻击面

---

# 十六、隐私与安全设计

这是开源项目能否被用户信任的核心。

## 16.1 默认原则

- 默认只监听 `127.0.0.1`
- 默认不开远程访问
- 默认脱敏
- 默认不上传任何数据
- 默认不开遥测
- 默认不启用 MITM

## 16.2 Redaction 模块

`packages/redaction`

负责：

- header 脱敏
- body 脱敏
- URL query 参数脱敏

### 默认脱敏字段

- authorization
- proxy-authorization
- x-api-key
- api-key
- cookie
- set-cookie
- bearer token
- signed url 参数
- 邮箱
- 手机号
- 常见 secret pattern

## 16.3 三档隐私模式

### strict

- 不保存 body 原文
- 只保留结构和长度

### balanced

- 保留文本
- 隐藏敏感字段

### off

- 原始保存

---

# 十七、导出与重放设计

## 17.1 导出格式

- JSON
- NDJSON
- Markdown summary

## 17.2 Replay 能力

从会话生成：

- curl
- fetch
- Node OpenAI SDK 代码
- Anthropic SDK 代码

## 17.3 Replay 安全策略

默认：

- 不导出原始 token
- 不导出敏感 header
- 用户手动勾选后才包含

---

# 十八、错误分类设计

统一错误模型：

```ts
type InspectorError = {
    code: string
    phase: "request" | "routing" | "upstream" | "stream" | "storage" | "ui"
    message: string
    details?: unknown
}
```

### 常见分类

- `AUTH_ERROR`
- `RATE_LIMIT`
- `BAD_REQUEST`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_5XX`
- `STREAM_PARSE_ERROR`
- `ROUTE_NOT_FOUND`
- `UNSUPPORTED_PROTOCOL`
- `SQLITE_WRITE_FAILED`

---

# 十九、CLI 设计

## 命令

```bash
llmscope start
llmscope start --port 8787
llmscope start --config ./llmscope.yaml
llmscope export --format json --output ./dump.json
llmscope clear
llmscope doctor
llmscope ca install
llmscope ca remove
```

## `doctor` 检查项

- Node 版本
- 端口占用
- 数据目录权限
- SQLite 是否可写
- UI 服务是否正常
- 证书状态（后续）

---

# 二十、开源工程文档清单

仓库首发时建议至少包含：

- `README.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `PROVIDER_PLUGIN.md`
- `LICENSE`

---

# 二十一、测试方案

## 21.1 单元测试

覆盖：

- provider matcher
- provider parser
- redaction
- sse parser
- route resolver
- config loader
- replay generator

## 21.2 集成测试

模拟：

- openai chat 非流式
- openai chat 流式
- openai responses
- anthropic messages
- generic relay
- 上游 401/429/500
- 断流 / malformed SSE

## 21.3 E2E

Playwright：

- 启动 CLI
- 打开 Web UI
- 发测试请求
- 验证 UI 是否出现会话
- 验证详情页内容
- 验证筛选、diff、导出

---

# 二十二、版本路线图

## v0.1

- gateway 模式
- OpenAI chat
- OpenAI responses
- Anthropic messages
- generic openai-compatible
- **内存存储**（进程级，默认 500 条）
- Web UI（实时查看）
- SSE 基础解析
- 脱敏

## v0.2

- **SQLite 持久化存储**（解锁历史搜索、导出、Diff、Replay）
- 系统代理模式
- OpenRouter parser
- Diff
- Replay
- 导出 JSON / NDJSON
- 错误分类
- 高级过滤

## v0.3

- WebSocket 支持
- token/cost estimator
- provider plugin SDK
- 更丰富的 stream timeline

## v0.4

- MITM
- 本地 CA 管理
- 更完整的 HTTPS 解密
- 企业级隐私选项

---

# 二十三、开发清单

下面是你最需要的部分：**按阶段可执行的开发清单**。

原方案的 Phase 0~14 过于碎片化，合并为 **5 个里程碑阶段**，每阶段有明确的可交付成果。

---

## Phase A：基础骨架（原 Phase 0 + 1 + 2）

### 里程碑目标

> 工程骨架搭好 + 核心类型定稳 + 配置可读取

### 清单

#### 仓库初始化

- [ ] 初始化 Git 仓库
- [ ] 创建 monorepo 结构
- [ ] 配置 `pnpm-workspace.yaml`
- [ ] 配置 `turbo.json`
- [ ] 配置 TypeScript base config
- [ ] 配置 ESLint / Prettier
- [ ] 配置 Vitest
- [ ] 配置 Playwright
- [ ] 配置 Changesets
- [ ] 配置 GitHub Actions
- [ ] 写基础 README
- [ ] 写 LICENSE

#### `packages/shared-types`

- [ ] 定义 `Session`（含 `status` 状态字段）
- [ ] 定义 `RawHttpMessage`
- [ ] 定义 `CanonicalExchange`
- [ ] 定义 `CanonicalMessage`（含 `CanonicalPart`）
- [ ] 定义 `CanonicalTool`
- [ ] 定义 `CanonicalUsage`
- [ ] 定义 `CanonicalStreamEvent`
- [ ] 定义 `InspectorError`
- [ ] 定义 `WsEvent`（UI 实时推送事件）

#### `packages/core`

- [ ] 定义事件总线
- [ ] 定义 session 生命周期接口
- [ ] 定义 store 接口
- [ ] 定义 provider registry 接口
- [ ] 定义 route resolver 接口

#### `packages/config`

- [ ] 定义配置 schema
- [ ] 使用 zod 校验
- [ ] 支持默认配置
- [ ] 支持环境变量覆盖
- [ ] 支持配置文件加载
- [ ] 支持 CLI 参数覆盖
- [ ] 输出最终 resolved config

### 产出

- 可安装依赖，可分别启动 CLI 和 Web 空壳
- CI 能跑 lint/test/build
- `llmscope start --config ./llmscope.yaml` 可读取配置
- 整个项目后续开发可基于稳定类型

---

## Phase B：核心管道（原 Phase 3 + 4 + 5 + 8）

### 里程碑目标

> 内存存储 + 代理引擎 + Provider Registry + SSE 解析全部打通

SSE 解析与代理引擎同步实现——没有 SSE 解析能力，流式代理只是"透传"，无法体现核心价值。

### 清单

#### `packages/storage-memory`

- [ ] 实现 `MemorySessionStore`（基于 `Map`）
- [ ] 实现 `saveSession` / `updateSession`
- [ ] 实现 `appendStreamEvent`
- [ ] 实现 `listSessions`（支持基础筛选）
- [ ] 实现 `getSession` / `deleteSession` / `clearAll`
- [ ] 实现 LRU 淘汰逻辑（超出 `maxSessions` 时淘汰最早会话）
- [ ] 编写存储层测试

#### `packages/proxy-engine`

- [ ] 启动 HTTP server（使用 undici 原生转发）
- [ ] 接收任意路径请求
- [ ] 捕获 request headers / body
- [ ] 创建 session（状态设为 `pending`）
- [ ] route resolver 解析上游
- [ ] 转发请求到 upstream
- [ ] 捕获 response headers / body
- [ ] 写入 store、发事件给 UI 层
- [ ] 支持 GET/POST、JSON/text body
- [ ] 支持 chunked response
- [ ] 支持超时处理 / 错误处理
- [ ] 背压与并发管理（最大并发会话数可配置）

#### `packages/parser-sse`

- [ ] chunk buffer
- [ ] 行级解析
- [ ] 支持 `event:` / `data:` / 空行分帧
- [ ] 支持 `[DONE]`
- [ ] 输出标准 SSE message
- [ ] provider stream adapter

#### `packages/provider-registry`

- [ ] provider 注册机制
- [ ] 批量 matcher 执行
- [ ] 取最高置信度匹配
- [ ] 返回 reasons

#### `packages/provider-generic`

- [ ] 匹配 openai-compatible 风格
- [ ] 解析 `messages` / response / `choices`

### 产出

- 从客户端到上游的完整代理链路打通
- 流式事件可被拦截解析
- 请求可被识别成 "generic / openai-compatible"
- 会话可在内存中查询和浏览

---

## Phase C：Provider 实现与安全（原 Phase 6 + 7 + 9）

### 里程碑目标

> OpenAI + Anthropic 完整可视化 + 默认安全

### 清单

#### `packages/provider-openai`

- [ ] matcher: `/v1/chat/completions`
- [ ] matcher: `/v1/responses`
- [ ] 解析 chat request / response
- [ ] 解析 responses request / response
- [ ] 提取 model / instructions / messages / input / tools / usage / output text
- [ ] 解析 stream event

#### OpenAI 测试

- [ ] chat 非流式测试
- [ ] chat 流式测试
- [ ] responses 非流式测试
- [ ] responses 流式测试

#### `packages/provider-anthropic`

- [ ] matcher: `/v1/messages`
- [ ] 检测 `anthropic-version`
- [ ] 解析 request `messages` / content blocks
- [ ] 解析 response content / usage
- [ ] 解析 stream event
- [ ] 解析 tool use / tool result

#### Anthropic 测试

- [ ] 非流式测试
- [ ] 流式测试
- [ ] tool use 测试

#### `packages/redaction`

- [ ] header redaction
- [ ] json body redaction
- [ ] query param redaction
- [ ] token pattern 掩码
- [ ] 邮箱/手机号模式处理
- [ ] strict/balanced/off 三档

### 产出

- OpenAI 系列请求能被正确展示
- Claude 请求完整可视化
- 默认安全，可开源公开展示

---

## Phase D：应用层（原 Phase 10 + 11）

### 里程碑目标

> 用户可通过 CLI 启动服务 + 通过 Web UI 查看会话

### 清单

#### `apps/cli`

- [ ] `llmscope start`
- [ ] `--port` / `--config` / `--ui-port`
- [ ] `doctor`
- [ ] `export`
- [ ] `clear`
- [ ] 控制台日志输出
- [ ] 友好启动提示

#### `apps/web`

- [ ] 项目初始化
- [ ] 布局框架
- [ ] 列表页（搜索、按 provider/model/status 筛选）
- [ ] 详情页（overview / raw / stream tab）
- [ ] WebSocket 实时推送连接
- [ ] 自动刷新
- [ ] 空状态页 / 错误状态页
- [ ] CORS 策略配置

### 产出

- 用户可用 npm 或 npx 启动
- 用户能通过浏览器看到完整请求和响应

---

## Phase E：增强与发布（原 Phase 12 + 13 + 14）

### 里程碑目标

> Diff/Replay + 导出 + CI/CD + 文档完善，准备开源首发

### 清单

#### `packages/replay`

- [ ] 生成 curl / fetch
- [ ] 生成 OpenAI SDK 代码
- [ ] 生成 Anthropic SDK 代码
- [ ] 默认不导出敏感 header

#### UI 增强

- [ ] Diff 选择器
- [ ] Request diff / 参数 diff / Tool diff

#### 导出

- [ ] 导出 JSON / NDJSON / Markdown summary
- [ ] 导出前脱敏确认
- [ ] 选中会话导出 / 时间范围导出

#### CI/CD

- [ ] lint / test / build / release workflow

#### 文档

- [ ] README 首页示例
- [ ] Quick Start
- [ ] 配置说明
- [ ] Provider 支持列表
- [ ] FAQ / 故障排查 / 贡献指南

#### 发布

- [ ] npm 发布 CLI
- [ ] GitHub Release
- [ ] Dockerfile / docker-compose 示例

### 产出

- 能快速比较与复现请求
- 方便用户提交 issue 或复盘
- 项目完成开源首发准备

---

# 二十四、v0.1 首发验收标准

到首发时，至少应该满足：

- [ ] 用户可通过一条命令启动服务
- [ ] 用户可把客户端 base URL 指到本地代理
- [ ] 可正常转发 OpenAI chat 请求
- [ ] 可正常转发 OpenAI responses 请求
- [ ] 可正常转发 Anthropic messages 请求
- [ ] 可识别 generic openai-compatible 请求
- [ ] 可实时查看 request headers/body
- [ ] 可实时查看 response headers/body
- [ ] 可查看 stream timeline
- [ ] 默认脱敏生效
- [ ] 内存存储正常工作（默认 500 条，LRU 淘汰）
- [ ] 有 README 和 Quick Start
- [ ] 有 70% 以上核心模块测试覆盖率

---

# 二十五、首发 README 应该怎么写

README 首页建议只突出 4 点：

1. **Inspect**
    - 查看请求、响应、headers、body

2. **Normalize**
    - 把 OpenAI / Claude / 中转站统一展示

3. **Stream-aware**
    - 可视化流式 delta / tool call / usage

4. **Local-first**
    - 数据默认留在本地，支持脱敏

示例 tagline：

> Inspect, normalize, and debug LLM API traffic locally.

---

# 二十六、你现在最该先做的 5 件事

如果今天就开工，我建议先做：

1. 把 monorepo 初始化好
2. 把 `Session / CanonicalExchange / CanonicalStreamEvent` 类型定下来
3. 先做 gateway 模式代理 + SSE 解析
4. 先支持 OpenAI chat + response 两条链路
5. 先把 UI 做到"能看列表 + 看详情 + 看 raw"

只要这 5 件事做完，这个项目就已经有雏形了。

---

# 二十七、最终建议

你的项目真正的护城河，不是"能代理请求"，而是：

- **统一 canonical model**
- **stream 可视化**
- **provider 插件机制**
- **默认安全的本地调试体验**

只要这四点做好，这个开源项目会很有吸引力。
