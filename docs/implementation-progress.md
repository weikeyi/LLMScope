# LLMScope 项目实现与进度跟踪

> 最后更新：2026-03-22
>
> 用途：作为当前仓库实现状态的快照文档，持续跟踪“已经做了什么、还缺什么、下一步做什么”。

## 1. 当前结论

- 项目目前处于**可运行本地代理 MVP + 只读观测面已成型，正在进入运行时与产品硬化阶段**。
- 已有真实实现的重点在 `packages/shared-types`、`packages/core`、`packages/config`、`packages/storage-memory`、`packages/storage-sqlite`、`packages/proxy-engine`、`apps/cli`、`apps/web`。
- `apps/cli` 已具备完整的最小控制面：`start`、`doctor`、`list`、`show`、`clear`，并持续暴露 observation API。
- `apps/web` 已具备**可运行的只读 observation UI**：支持会话列表、筛选、详情、标准化结果、错误态和流事件展示。
- `packages/config` 已从“类型与默认值”升级为**默认配置文件发现、配置文件加载、环境变量覆盖、CLI override、运行时校验和 `ResolvedConfig` 组装链路**。
- Provider 识别、请求/响应/流标准化、基础隐私脱敏和 SQLite 持久化都已经进入可运行状态，但相关能力仍主要内嵌在现有包内，尚未按最初架构拆分为独立包。

## 2. 校验快照

以下命令已在 **2026-03-22** 本地执行：

- `pnpm test`
- `pnpm typecheck`

当前结论：

- `pnpm test`：**通过**
- `pnpm typecheck`：**通过**

当前自动化校验覆盖情况：

- 有测试的模块：`packages/shared-types`、`packages/core`、`packages/config`、`packages/storage-memory`、`packages/storage-sqlite`、`packages/proxy-engine`、`apps/cli`、`apps/web`
- 当前测试重点已覆盖：Provider 匹配与标准化、代理引擎请求/响应/SSE、隐私模式脱敏、CLI observation API、CLI `list/show/clear`、Web observation UI、内存存储与 SQLite 存储
- 当前测试基线：`pnpm test` 与 `pnpm typecheck` 均已通过，可作为后续开发基线

## 3. 当前实现清单

| 模块                      | 状态                   | 当前实现                                                                                                                     | 说明                                                             |
| ------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/shared-types`   | 已实现                 | 统一领域模型、Session 结构、流事件、错误模型、标准化消息与输出结构                                                           | 作为全项目的类型基线，已被各层广泛复用                           |
| `packages/core`           | 已实现（契约层）       | Provider 插件接口、路由解析接口、存储接口、代理引擎接口                                                                      | 契约边界清晰，适合继续承载拆包后的抽象能力                       |
| `packages/config`         | 已实现（运行时配置层） | 配置类型、默认配置、JSON/YAML 文件加载、环境变量解析、CLI override 合并、`zod` 校验、`ResolvedConfig` 输出和单元测试        | 已成为运行时统一配置入口                                         |
| `packages/storage-memory` | 已实现                 | 内存 Session Store、增删改查、流事件追加、列表筛选、LRU 淘汰                                                                 | 具备 MVP 运行所需能力                                            |
| `packages/storage-sqlite` | 已实现                 | SQLite Session Store、会话持久化、流事件追加、筛选查询、LRU 淘汰                                                             | 已落地，不再只是规划项                                           |
| `packages/proxy-engine`   | 已实现（MVP 核心）     | Node HTTP 代理、静态路由、请求/响应抓取、Session 持久化、SSE 透传与事件累积、Provider 匹配、请求/响应/流标准化、基础隐私脱敏 | 目前是项目最成熟的核心包                                         |
| `apps/cli`                | 已实现（MVP 控制面）   | CLI 参数解析、代理启动/停止、Session 摘要输出、observation API、启动失败回滚、优雅退出、`doctor`、`list`、`show`、`clear`   | 已经是当前主入口，不再是 scaffold                                |
| `apps/web`                | 已实现（只读观察面）   | observation UI 数据加载、筛选参数归一化、会话列表、详情页、原始请求/响应展示、normalized exchange、stream events 展示        | 已可作为只读观察页，但还不是完整交互式 Web 应用                  |

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
- [x] 配置文件加载
- [x] 环境变量覆盖
- [x] CLI 参数覆盖到统一配置系统
- [x] 输出完整 resolved config 组装流程

**未完成**

- [ ] Playwright
- [ ] Changesets
- [ ] GitHub Actions
- [ ] LICENSE

### Phase B：核心管道

**已完成**

- [x] `packages/storage-memory`
- [x] `packages/storage-sqlite`
- [x] `saveSession` / `updateSession`
- [x] `appendStreamEvent`
- [x] `listSessions` / `getSession` / `deleteSession` / `clearAll`
- [x] LRU 淘汰逻辑
- [x] 存储层测试
- [x] HTTP 代理基础转发
- [x] 请求/响应抓取与 Session 持久化
- [x] JSON 请求链路测试
- [x] SSE 响应透传与流事件落库测试
- [x] 基于插件的 Provider 匹配
- [x] OpenAI Chat Completions 标准化解析
- [x] OpenAI Responses 标准化解析
- [x] Anthropic Messages 标准化解析
- [x] 低置信度与无匹配标准化 warning

**部分完成**

- [~] SSE 解析：当前能力内嵌在 `packages/proxy-engine`，还没有独立的 `packages/parser-sse`
- [~] Provider registry：插件机制已存在，但还没有拆出独立 `packages/provider-registry`
- [~] 代理引擎控制面：已具备基础能力，但还没有超时、背压、最大并发等更完整可配置项

**未完成**

- [ ] `packages/parser-sse`
- [ ] `packages/provider-registry`
- [ ] `packages/provider-generic`
- [ ] 更高层的 provider fallback / 最高置信度治理策略抽象
- [ ] 超时处理配置化
- [ ] 并发管理与背压控制

### Phase C：Provider 与安全

**已完成**

- [x] OpenAI Chat Completions provider plugin
- [x] OpenAI Responses provider plugin
- [x] Anthropic Messages provider plugin
- [x] Provider 级测试矩阵（当前覆盖以上三类协议主路径）
- [x] `strict` / `balanced` / `off` 隐私模式的基础行为模型
- [x] strict 模式下对敏感 header、文本字段、图像 URL、流事件内容的基础脱敏
- [x] observation API 明确暴露脱敏后的 session detail

**部分完成**

- [~] 安全与脱敏能力当前内嵌在 `packages/proxy-engine`，还没有独立 `packages/redaction`
- [~] Provider 覆盖还集中于 OpenAI / Anthropic 主路径，尚未扩展到 OpenAI-compatible 泛化生态

**未完成**

- [ ] `packages/provider-openai`
- [ ] `packages/provider-anthropic`
- [ ] `packages/redaction`
- [ ] `packages/provider-generic`
- [ ] 更完整的 OpenAI-compatible / relay provider 识别策略

### Phase D：应用层

**已完成**

- [x] `apps/cli` 可启动代理服务
- [x] `apps/cli` 输出实时 session 摘要
- [x] `apps/cli` 暴露 `health` / `sessions` / `session detail` observation API
- [x] `apps/cli` 暴露 session delete / clear all write API
- [x] `apps/cli` 提供 `doctor`
- [x] `apps/cli` 提供 `list` / `show` / `clear`
- [x] `apps/web` 只读 observation UI
- [x] 会话列表 / 详情页 / 筛选的最小只读形态

**部分完成**

- [~] `apps/cli` 具备最小多命令能力，但仍缺 `export` 等更完整管理命令
- [~] `apps/web` 目前为服务端渲染 HTML 的只读观察页，尚未进入完整前端应用形态

**未完成**

- [ ] `apps/web` 完整页面与状态管理
- [ ] WebSocket / SSE 实时推送到 UI
- [ ] 更完整的空状态 / 错误状态 / 交互式刷新与导航
- [ ] `apps/cli` 导出与更完整管理命令

### Phase E：增强与发布

**未完成**

- [ ] `packages/replay`
- [ ] Diff 能力
- [ ] 导出 JSON / NDJSON / Markdown
- [ ] CI/CD 流程
- [ ] Quick Start / 配置说明 / 发布文档

## 5. 当前最关键的缺口

按影响优先级排序，当前最值得优先补齐的是：

1. **配置与运行时硬化仍需继续推进**  
   统一配置链路、默认配置发现和命令级测试已经打通，但仍缺更高层的 smoke verification、导出命令和发布前运行文档，离“开箱即用”还有最后一段距离。

2. **应用层仍缺真正的“可操作产品表面”**  
   用户已经能看数据和清理数据，但还不能方便地导出、对比、实时刷新、长期管理或通过更完整 Web 应用交互使用。

3. **架构拆分还没有完成**  
   `provider-registry`、`parser-sse`、`redaction` 等能力虽然“事实上存在”，但还没有按最初设计独立成包，不利于后续扩展与维护。

## 6. 建议的下一阶段开发顺序

当前建议**优先推进“产品可用性”而不是“架构拆分”**。

原因：

- 当前项目最缺的不是“能不能识别 OpenAI / Anthropic”，而是“用户能不能顺畅启动、查看、管理和后续扩展使用”
- 现有架构虽然还没拆净，但已经足够支撑继续做 CLI / Web / 配置层
- 如果过早投入大量时间拆 `provider-registry`、`parser-sse`、`redaction`，会提升内部整洁度，但对 MVP 可用性的提升有限
- 当 CLI 配置链路、更多命令、Web 交互面稳定之后，再做拆包更容易看清真实边界，避免“为架构而架构”

### 第一优先级：产品可用性

- 收紧 `ResolvedConfig` 到各命令的落地路径
- 为配置驱动启动、检查和观测命令补充更强测试
- 为 dist 产物补充更直接的 smoke verification
- 继续为 `apps/cli` 增加 `export` 等更完整的管理命令
- 让 `apps/web` 从只读观察页继续演进到最小可用交互界面

### 第二优先级：应用层增强

- 增加会话刷新、筛选增强、选中状态同步
- 增加导出能力
- 视需要增加实时推送
- 明确 SQLite 持久化作为默认可选运行模式

### 第三优先级：架构拆分

- 抽离 `packages/provider-registry`
- 抽离 `packages/parser-sse`
- 抽离 `packages/redaction`
- 视实际收益决定是否拆分 `provider-openai`、`provider-anthropic`

## 7. 文档维护规则

后续建议把这个文件作为项目进度的单一追踪入口，每次开发完成后至少更新以下内容：

- “最后更新”日期
- “当前结论”中的阶段判断
- “当前实现清单”中的模块状态
- “与路线图对照”中的勾选项
- “校验快照”中的命令结果
- “当前最关键的缺口”与“下一阶段开发顺序”

## 8. 下一次更新时的完成标准

当下面 4 件事完成后，可以把项目状态从“后端 MVP + 最小观察面”升级为“最小可用产品”：

- [x] 配置驱动的启动、检查和观测命令具备稳定默认路径与说明文档
- [ ] CLI 至少具备 `start` + `doctor` + `export` 或同等可用命令面（`list` / `show` / `clear` 已完成）
- [ ] Web 从只读观察页升级为最小可交互应用
- [ ] 至少一种持久化运行模式（如 SQLite）能顺畅用于日常本地使用
