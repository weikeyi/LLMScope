# LLMScope 项目实现与进度跟踪

> 最后更新：2026-03-08
> 
> 用途：作为当前仓库实现状态的快照文档，持续跟踪“已经做了什么、还缺什么、下一步做什么”。

## 1. 当前结论

- 项目目前处于**基础骨架已搭好、核心链路已有原型、应用层尚未开始**的阶段。
- 已有真实实现的重点在 `packages/shared-types`、`packages/core`、`packages/storage-memory`、`packages/proxy-engine`。
- `apps/cli` 与 `apps/web` 仍然只是占位 scaffold，尚未进入可用产品形态。
- `packages/config` 目前只有**配置类型与默认值**，还没有配置加载、校验、合并覆盖等完整能力。

## 2. 校验快照

以下命令已在 **2026-03-08** 本地执行通过：

- `pnpm test`
- `pnpm typecheck`

当前自动化校验覆盖情况：

- 有测试的包：`packages/shared-types`、`packages/core`、`packages/storage-memory`、`packages/proxy-engine`
- 当前通过测试数：**9**
- `apps/cli`、`apps/web`、`packages/config` 目前没有实际测试用例

## 3. 当前实现清单

| 模块 | 状态 | 当前实现 | 说明 |
| --- | --- | --- | --- |
| `packages/shared-types` | 已实现 | 统一领域模型、会话结构、流事件、错误模型、UI 推送事件 | 作为全项目的类型基线，适合继续复用和扩展 |
| `packages/core` | 已实现（契约层） | Provider 插件接口、路由解析接口、存储接口、代理引擎接口 | 已有抽象，但仍缺事件总线与更高层编排实现 |
| `packages/config` | 部分实现 | 配置类型定义、默认配置 `defaultConfig` | 缺 zod 校验、环境变量覆盖、配置文件加载、CLI 参数覆盖、resolved config 组装逻辑 |
| `packages/storage-memory` | 已实现 | 内存 Session Store、增删改查、流事件追加、列表筛选、LRU 淘汰 | 已具备 Phase B 的基础能力 |
| `packages/proxy-engine` | 部分实现（可运行原型） | Node HTTP 代理、静态路由、请求/响应捕获、Session 持久化、SSE 流事件累积 | 已打通基础链路，但仍缺 provider registry、独立 SSE 解析包、超时/并发配置等 |
| `apps/cli` | 脚手架 | 仅导出 scaffold message | 尚未实现 `start`、`doctor`、`export`、`clear` 等命令 |
| `apps/web` | 脚手架 | 仅导出 scaffold message | 尚未实现列表页、详情页、实时推送等功能 |

## 4. 与路线图对照

### Phase A：基础工程

**已完成**

- [x] Monorepo 基础结构
- [x] TypeScript 基础配置
- [x] ESLint / Prettier 基础配置
- [x] Vitest 基础配置
- [x] 基础 README
- [x] `packages/shared-types` 关键领域类型
- [x] `packages/core` 核心契约接口

**部分完成**

- [~] `packages/config`：仅完成类型与默认值，未完成校验与加载链路

**未完成**

- [ ] Playwright
- [ ] Changesets
- [ ] GitHub Actions
- [ ] LICENSE
- [ ] 配置文件加载
- [ ] 环境变量覆盖
- [ ] CLI 参数覆盖
- [ ] 输出完整 resolved config

### Phase B：核心管道

**已完成**

- [x] `packages/storage-memory`
- [x] `saveSession` / `updateSession`
- [x] `appendStreamEvent`
- [x] `listSessions` / `getSession` / `deleteSession` / `clearAll`
- [x] LRU 淘汰逻辑
- [x] 存储层测试
- [x] HTTP 代理基础转发
- [x] 请求/响应抓取与 Session 持久化
- [x] JSON 请求链路测试
- [x] SSE 响应透传与流事件落库测试

**部分完成**

- [~] SSE 解析：当前能力内嵌在 `packages/proxy-engine`，但还没有独立的 `packages/parser-sse`
- [~] 代理引擎：具备基础能力，但还没有超时、背压、最大并发等更完整控制项

**未完成**

- [ ] `packages/parser-sse`
- [ ] `packages/provider-registry`
- [ ] `packages/provider-generic`
- [ ] 最高置信度 provider 匹配
- [ ] 标准化 request / response / stream 解析
- [ ] 超时处理配置化
- [ ] 并发管理与背压控制

### Phase C：Provider 与安全

- [ ] `packages/provider-openai`
- [ ] `packages/provider-anthropic`
- [ ] `packages/redaction`
- [ ] OpenAI / Anthropic 测试矩阵
- [ ] strict / balanced / off 安全策略落地

### Phase D：应用层

- [ ] `apps/cli` 命令能力
- [ ] `apps/web` 页面与状态管理
- [ ] WebSocket 实时推送
- [ ] 会话列表 / 详情页 / 筛选 / 空状态 / 错误状态

### Phase E：增强与发布

- [ ] `packages/replay`
- [ ] Diff 能力
- [ ] 导出 JSON / NDJSON / Markdown
- [ ] CI/CD 流程
- [ ] Quick Start / 配置说明 / 发布文档

## 5. 当前最关键的缺口

按影响优先级排序，当前最值得优先补齐的是：

1. **Provider 识别与标准化解析缺失**  
   现在代理层能转发和记录数据，但还不能把请求稳定识别为 OpenAI / Anthropic / OpenAI-compatible，并统一抽取 model、messages、tools、usage、stream delta。

2. **配置系统还不是可用状态**  
   当前只有类型和默认值，用户还不能通过配置文件、环境变量或 CLI 参数驱动项目启动。

3. **CLI / Web 应用层尚未承接底层能力**  
   核心包已有一定基础，但用户还无法直接启动服务和浏览会话。

4. **安全与脱敏未开始**  
   在项目准备对外演示或开源前，header / body / query 的脱敏必须补齐。

## 6. 建议的下一阶段开发顺序

建议按下面顺序推进，性价比最高：

### 第一优先级

- 完成 `packages/provider-registry`
- 抽离 `packages/parser-sse`
- 实现 `packages/provider-generic`
- 让代理链路输出基础 `normalized` 结果

### 第二优先级

- 为 `packages/config` 增加 zod 校验
- 支持配置文件加载
- 支持环境变量与 CLI 参数覆盖
- 产出统一的 `ResolvedConfig`

### 第三优先级

- 落地 `apps/cli` 的 `start` 命令
- 启动代理引擎 + store + Web 服务
- 让 `apps/web` 先做最小可用版本：会话列表 + 详情页

### 第四优先级

- 增加 `packages/redaction`
- 增加 provider 级测试矩阵
- 再推进 replay、diff、导出、发布相关工作

## 7. 文档维护规则

后续建议把这个文件作为项目进度的单一追踪入口，每次开发完成后至少更新以下内容：

- “最后更新”日期
- “当前结论”中的阶段判断
- “当前实现清单”中的模块状态
- “与路线图对照”中的勾选项
- “校验快照”中的命令结果
- “下一阶段开发顺序”中的优先级

## 8. 下一次更新时的完成标准

当下面 4 件事完成后，可以把项目状态从“核心链路原型”升级为“最小可用版本筹备中”：

- [ ] Provider registry 可识别至少一种 provider
- [ ] 至少一种 provider 可输出 `normalized` 结构
- [ ] CLI 可以真正启动代理服务
- [ ] Web 可以查看 Session 列表与单条详情

