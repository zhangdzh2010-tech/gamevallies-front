# LLM 网关、多 Region 部署与异步任务管理设计

> 版本：v1.0  
> 日期：2026-03-21  
> 状态：方案确认版，暂未开始代码实施

---

## 一、目标与范围

本文档定义以下 3 项能力的详细设计，并细化到数据库字段、接口体与后台管理口径：

1. `gv-ai-engine` 内建设 LLM Gateway 子服务
2. 游戏生成错误日志下钻到最末端 LLM 调用错误
3. 游戏生成支持持久化异步任务管理，并向前端暴露标准接口

本文档只描述设计，不包含代码实现。

---

## 二、现状与问题

当前仓库的相关实现边界如下：

- `ai-engine` 仍是单一环境变量模型配置：`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`LLM_FAST_MODEL`
- `ai-engine` 异步任务仅为进程内存态，不适合多实例、重启恢复、跨 Region
- `game-service` 后台已有管理面板与 `system_configs`，但还没有 LLM 网关池、步骤路由、任务与 LLM 调用日志页面
- 失败日志当前能落到任务级摘要，但不能稳定回溯到“具体哪个 LLM、哪个 Region、哪个 endpoint、返回了什么错误”

因此本次设计的核心原则是：

- 配置中心化：LLM Provider、步骤路由、全局超时都落 MySQL
- 运行时热生效：新任务立即使用新配置，运行中任务使用创建时快照
- 多 Region：国内走上海，海外走柔佛，支持同 Region 优先、跨 Region 兜底
- 可观测：任务日志和 LLM 调用日志可在后台直接查看
- 前端友好：生成全链路统一走异步任务接口

---

## 三、术语与枚举

### 3.1 Region 枚举

| 值 | 说明 |
|------|------|
| `cn_shanghai` | 中国大陆，上海部署 |
| `ap_southeast_johor` | 海外，柔佛部署 |
| `global` | 不绑定单 Region，可被两个 Region 共用 |

### 3.2 ProviderType 枚举

一期实现支持：

| 值 | 说明 |
|------|------|
| `openai_compatible` | OpenAI 兼容协议，如 MiniMax |
| `anthropic` | Claude 原生协议 |

为后续保留但一期不落地：

| 值 | 说明 |
|------|------|
| `azure_openai` | Azure OpenAI |
| `custom_http` | 自定义 HTTP 网关 |

### 3.3 StepKey 枚举

只对真正调用 LLM 的步骤建路由，不为纯规则步骤单独建模型配置。

| StepKey | 所属阶段 | 说明 |
|------|------|------|
| `dialogue.slot_extract` | Stage 01 | 对话槽位提取 |
| `dialogue.reply` | Stage 01 | 对话回复生成 |
| `intent_parse` | Stage 02 | 文本转 `GameSpec` |
| `code_generate` | Stage 05 | 首次生成游戏代码 |
| `qa_fix` | Stage 06 | QA 自动修复 |
| `code_review` | Stage 06 | LLM 代码审查 |
| `iterate.classify` | Stage 07 | 反馈分类 |
| `iterate.rewrite` | Stage 07 | 代码迭代改写 |

### 3.4 TaskStatus 枚举

| 值 | 说明 |
|------|------|
| `queued` | 已创建，未开始执行 |
| `running` | 执行中 |
| `succeeded` | 成功完成 |
| `failed` | 失败结束 |
| `canceled` | 用户或后台取消 |
| `timed_out` | 总任务超时 |

### 3.5 TaskType 枚举

| 值 | 说明 |
|------|------|
| `pipeline_run` | 首次生成 |
| `pipeline_iterate` | 迭代修改 |

---

## 四、总体架构

### 4.1 服务分工

- `game-service`
  - 对外业务入口
  - 负责后台管理页面
  - 负责创建游戏记录与生成任务入口
  - 负责异步任务主编排、任务状态落库、失败补偿与业务结果收口
  - 负责给前端返回任务状态、事件流和错误摘要
  - 负责 WebSocket 推送
- `ai-engine`
  - 负责 LLM Gateway 运行时
  - 负责按步骤路由选择具体 LLM Provider
  - 负责执行生成流水线
  - 负责回传进度事件和最末端 LLM 调用日志
  - 负责返回最终生成结果或最终失败结果

补充说明：

- 当前现有代码里，用户侧实时进度已经是 `ai-engine -> game-service internal progress -> GameWebSocketGateway` 这条链路
- 当前现有代码里，bundle 落库、游戏状态更新、失败补偿、额度退回都在 `game-service`
- 因此一期方案保持这个中心不变，避免把任务编排和业务状态拆成两套主源

任务归属口径：

- `generation_tasks`、`generation_task_events`、`llm_call_logs` 主写服务为 `game-service`
- `game-service` 负责创建任务、调用 `ai-engine`、接收内部回调、落库任务与日志、收口业务结果
- `ai-engine` 不直接写业务数据库中的任务表，只通过内部接口把进度、路由快照和 LLM 调用日志回传给 `game-service`
- `ai-engine` 读取 LLM 网关配置时，对数据库保持“读多写少”模式，和当前 `prompt_store` 的接入方式保持一致

### 4.2 多 Region 部署

部署形态固定为 2 个 Region：

| 服务 | Region | 说明 |
|------|------|------|
| `gv-ai-engine-cn` | `cn_shanghai` | 国内主实例 |
| `gv-ai-engine-global` | `ap_southeast_johor` | 海外主实例 |

`game-service` 请求 `ai-engine` 时的 Region 选择顺序：

1. 请求体 `regionHint`
2. 请求头 `x-gv-region`
3. 用户所在站点环境
4. 服务自身 `SERVICE_REGION`

同一个任务一旦创建，`generation_tasks.region` 固定，不在运行中切 Region；如果步骤路由允许跨 Region 兜底，只允许在同一任务内部对单次 LLM 调用做 fallback，并且必须写日志。

### 4.2.1 与当前部署脚本对齐的前置改造

当前仓库的部署脚本和 `.env.deploy` 仍是单 Region 口径，因此一期实施前需要先补齐以下发布参数：

| 变量 | 说明 |
|------|------|
| `AI_ENGINE_URL_CN_SHANGHAI` | 上海 `ai-engine` 内网地址 |
| `AI_ENGINE_URL_AP_SOUTHEAST_JOHOR` | 柔佛 `ai-engine` 内网地址 |
| `AI_ENGINE_DEFAULT_REGION` | 默认执行 Region |
| `SERVICE_REGION` | 当前服务实例所属 Region |
| `VOLCENGINE_REGION_CN_SHANGHAI` | 上海发布地域 |
| `VOLCENGINE_REGION_AP_SOUTHEAST_JOHOR` | 柔佛发布地域 |
| `VOLCENGINE_REGISTRY_CN_SHANGHAI` | 上海镜像仓库 |
| `VOLCENGINE_REGISTRY_AP_SOUTHEAST_JOHOR` | 柔佛镜像仓库 |

函数命名约定：

| Region | Function Name |
|------|------|
| `cn_shanghai` | `gv-ai-engine-cn` |
| `ap_southeast_johor` | `gv-ai-engine-global` |

说明：

- `scripts/deploy.py` 当前只有一个 `VOLCENGINE_REGION` 和一个 `AI_ENGINE_URL`，实施前需要扩展成双目标发布
- 这部分属于部署能力前置项，不在业务 API 范围内，但必须在实施计划中提前完成

### 4.3 热生效原则

- Provider 配置和步骤路由保存后，立即写入 DB
- 后台保存成功后递增 `system_configs.llm.gateway.config_version`
- 后台再调用 `ai-engine` 两个 Region 的内部刷新接口
- `ai-engine` 本地缓存同时保留 10 秒 TTL 拉取兜底

热生效边界：

- 新建任务：立即使用新配置
- 单个生成请求：`ai-engine` 在请求开始时一次性解析当前路由并固定在内存中，不在该请求中途重新拉配置
- `game-service` 在接收到首个进度回调时，把本次请求实际命中的 `gatewayConfigVersion + routeSnapshot` 落到 `generation_tasks`
- 因此同一个任务在执行过程中不会因为后台保存新配置而切换模型，但后续新任务会立即使用新配置

---

## 五、数据库设计

### 5.1 复用 `system_configs` 的全局配置项

本次不新增“全局配置表”，而是复用现有 `system_configs`。

新增约定 Key 如下：

| `config_key` | `config_value` 类型 | 默认值 | 说明 |
|------|------|------|------|
| `llm.gateway.config_version` | string(int) | `1` | 每次 Provider 或步骤路由变更时递增 |
| `llm.gateway.cache_ttl_s` | string(int) | `10` | `ai-engine` 读取 DB 配置的缓存秒数 |
| `llm.gateway.default_request_timeout_s` | string(int) | `600` | 单次 LLM 调用默认超时 |
| `llm.gateway.default_connect_timeout_s` | string(int) | `15` | 单次 LLM 连接超时 |
| `generation.task.default_timeout_s` | string(int) | `600` | 生成任务总超时默认值 |
| `generation.task.max_timeout_s` | string(int) | `3600` | 前端可传的任务超时上限 |
| `generation.task.log_retention_days` | string(int) | `30` | 任务事件与 LLM 日志保留天数 |

---

### 5.2 表：`llm_gateway_providers`

用途：存储 LLM 网关池中的可选 Provider。

| 字段 | 类型 | 必填 | 索引/约束 | 说明 |
|------|------|------|------|------|
| `id` | `VARCHAR(36)` | 是 | PK | Provider 主键 UUID |
| `provider_key` | `VARCHAR(64)` | 是 | `UNIQUE` | 稳定配置键，如 `minimaxi_sh_primary` |
| `display_name` | `VARCHAR(128)` | 是 |  | 后台展示名称 |
| `provider_type` | `ENUM` | 是 | `IDX(provider_type, enabled)` | 取值见 `ProviderType` |
| `region` | `ENUM` | 是 | `IDX(region, enabled)` | 取值见 `Region` |
| `base_url` | `VARCHAR(255)` | 是 |  | Provider 基础地址 |
| `api_path` | `VARCHAR(128)` | 是 |  | 默认 `/chat/completions`，Anthropic 可为空或自定义 |
| `auth_mode` | `ENUM('bearer','x_api_key','custom_header','anthropic')` | 是 |  | 鉴权方式 |
| `auth_header_name` | `VARCHAR(64)` | 否 |  | `custom_header` 时使用 |
| `api_key_ciphertext` | `LONGTEXT` | 是 |  | 加密后的密钥，不明文落库 |
| `api_key_masked` | `VARCHAR(32)` | 是 |  | 后台展示的脱敏值，如 `sk-****abcd` |
| `model_default` | `VARCHAR(128)` | 是 |  | 主模型名 |
| `model_fast` | `VARCHAR(128)` | 否 |  | 快速模型名 |
| `request_timeout_s` | `INT` | 是 |  | 单次 LLM 调用默认超时，默认 `600` |
| `connect_timeout_s` | `INT` | 是 |  | 连接超时，默认 `15` |
| `max_retries` | `INT` | 是 |  | Provider 级额外重试次数 |
| `priority` | `INT` | 是 | `IDX(region, priority)` | 池内排序，数值越小优先级越高 |
| `enabled` | `BOOLEAN` | 是 | `IDX(region, enabled)` | 是否启用 |
| `health_status` | `ENUM('unknown','healthy','degraded','unhealthy')` | 是 |  | 最近一次测试后的健康状态 |
| `last_test_success` | `BOOLEAN` | 否 |  | 最近一次连接测试结果 |
| `last_test_latency_ms` | `INT` | 否 |  | 最近一次连接测试耗时 |
| `last_test_error` | `VARCHAR(512)` | 否 |  | 最近一次连接测试错误摘要 |
| `last_test_at` | `DATETIME(3)` | 否 |  | 最近一次连接测试时间 |
| `extra_headers_json` | `JSON` | 否 |  | 额外请求头 |
| `meta_json` | `JSON` | 否 |  | 非核心元数据 |
| `created_at` | `DATETIME(3)` | 是 |  | 创建时间 |
| `updated_at` | `DATETIME(3)` | 是 |  | 更新时间 |

约束：

- `provider_key` 全局唯一
- `enabled=false` 的 Provider 不参与步骤路由选择
- `api_key_ciphertext` 必须使用服务端配置密钥加密

---

### 5.3 表：`llm_step_routes`

用途：存储“某个步骤在某个 Region 下如何选模型”的主路由配置。

| 字段 | 类型 | 必填 | 索引/约束 | 说明 |
|------|------|------|------|------|
| `id` | `VARCHAR(36)` | 是 | PK | 路由主键 UUID |
| `step_key` | `VARCHAR(64)` | 是 | `UNIQUE(step_key, region)` | 取值见 `StepKey` |
| `region` | `ENUM` | 是 | `UNIQUE(step_key, region)` | 取值见 `Region` |
| `enabled` | `BOOLEAN` | 是 | `IDX(region, enabled)` | 该步骤路由是否启用 |
| `request_timeout_s` | `INT` | 是 |  | 单次 LLM 调用超时覆盖值，默认 `600` |
| `max_tokens` | `INT` | 是 |  | 单次调用最大输出 token |
| `temperature` | `DECIMAL(4,2)` | 否 |  | 模型温度 |
| `top_p` | `DECIMAL(4,2)` | 否 |  | 可选采样参数 |
| `allow_cross_region_fallback` | `BOOLEAN` | 是 |  | 是否允许跨 Region 兜底 |
| `cache_ttl_s` | `INT` | 是 |  | 运行时本地缓存 TTL |
| `active_version` | `INT` | 是 |  | 当前生效版本号，每次保存加 1 |
| `remark` | `VARCHAR(255)` | 否 |  | 备注 |
| `created_at` | `DATETIME(3)` | 是 |  | 创建时间 |
| `updated_at` | `DATETIME(3)` | 是 |  | 更新时间 |

说明：

- `request_timeout_s` 是“单次 LLM 调用超时”，不是整条生成任务超时
- 一期默认所有步骤该值均为 `600`

---

### 5.4 表：`llm_step_route_items`

用途：存储某个步骤路由下按顺序可用的 Provider 候选项，支持主模型与 fallback。

| 字段 | 类型 | 必填 | 索引/约束 | 说明 |
|------|------|------|------|------|
| `id` | `VARCHAR(36)` | 是 | PK | 候选项主键 UUID |
| `route_id` | `VARCHAR(36)` | 是 | `IDX(route_id, order_no)` | 对应 `llm_step_routes.id` |
| `order_no` | `INT` | 是 | `UNIQUE(route_id, order_no)` | 顺序号，`1` 为主模型 |
| `provider_id` | `VARCHAR(36)` | 是 | `IDX(provider_id)` | 对应 `llm_gateway_providers.id` |
| `model_name` | `VARCHAR(128)` | 否 |  | 覆盖主模型名，不填则使用 Provider 默认 |
| `fast_model_name` | `VARCHAR(128)` | 否 |  | 覆盖快速模型名 |
| `enabled` | `BOOLEAN` | 是 |  | 是否启用 |
| `created_at` | `DATETIME(3)` | 是 |  | 创建时间 |
| `updated_at` | `DATETIME(3)` | 是 |  | 更新时间 |

说明：

- 路由选择逻辑按 `order_no ASC` 执行
- 某个候选项失败后，若错误可重试，则依次尝试下一项
- 一次 LLM 调用切换过 fallback 后，必须记录 `is_fallback=true`

---

### 5.5 表：`llm_provider_test_logs`

用途：保存后台“在线连接测试”的结果，便于排查配置正确性。

| 字段 | 类型 | 必填 | 索引/约束 | 说明 |
|------|------|------|------|------|
| `id` | `VARCHAR(36)` | 是 | PK | 主键 UUID |
| `provider_id` | `VARCHAR(36)` | 是 | `IDX(provider_id, created_at)` | 对应 Provider |
| `region` | `ENUM` | 是 |  | 本次测试执行 Region |
| `test_type` | `ENUM('connectivity','chat_completion')` | 是 |  | 连通性或真实补全测试 |
| `step_key` | `VARCHAR(64)` | 否 |  | 绑定某个步骤时可选填写 |
| `requested_model` | `VARCHAR(128)` | 否 |  | 本次测试使用的模型 |
| `request_timeout_s` | `INT` | 是 |  | 本次测试单次调用超时 |
| `success` | `BOOLEAN` | 是 |  | 是否成功 |
| `latency_ms` | `INT` | 否 |  | 耗时 |
| `http_status` | `INT` | 否 |  | 上游 HTTP 状态码 |
| `upstream_request_id` | `VARCHAR(128)` | 否 |  | 上游 request id |
| `error_code` | `VARCHAR(64)` | 否 |  | 内部归一化错误码 |
| `error_message` | `VARCHAR(512)` | 否 |  | 错误摘要 |
| `response_excerpt` | `VARCHAR(1024)` | 否 |  | 响应摘录，禁止明文回显敏感信息 |
| `created_at` | `DATETIME(3)` | 是 |  | 测试时间 |

---

### 5.6 表：`generation_tasks`

用途：持久化生成任务，用于前端轮询、后台查询、断线恢复、多实例接续。

| 字段 | 类型 | 必填 | 索引/约束 | 说明 |
|------|------|------|------|------|
| `id` | `VARCHAR(36)` | 是 | PK | 任务 ID |
| `task_type` | `ENUM('pipeline_run','pipeline_iterate')` | 是 | `IDX(user_id, created_at)` | 任务类型 |
| `runner_service` | `ENUM('game_service')` | 是 |  | 一期固定为 `game_service` |
| `region` | `ENUM` | 是 | `IDX(region, status)` | 本任务归属 Region |
| `game_id` | `VARCHAR(36)` | 是 | `IDX(game_id, created_at)` | 对应游戏 ID |
| `user_id` | `VARCHAR(36)` | 是 | `IDX(user_id, created_at)` | 对应用户 ID |
| `status` | `ENUM('queued','running','succeeded','failed','canceled','timed_out')` | 是 | `IDX(status, updated_at)` | 任务状态 |
| `cancel_requested` | `BOOLEAN` | 是 | `IDX(status, cancel_requested)` | 是否收到取消请求 |
| `current_stage` | `VARCHAR(64)` | 否 |  | 当前流水线阶段 |
| `current_step_key` | `VARCHAR(64)` | 否 |  | 当前 LLM 步骤 |
| `progress_pct` | `INT` | 是 |  | `0-100` |
| `task_timeout_s` | `INT` | 是 |  | 整个任务总超时，默认 `600` |
| `attempt_count` | `INT` | 是 |  | 任务总执行次数 |
| `max_attempts` | `INT` | 是 |  | 任务最大执行次数 |
| `gateway_config_version` | `INT` | 否 |  | 本次请求命中的网关配置版本 |
| `route_snapshot_json` | `JSON` | 否 |  | 由 `ai-engine` 在首个进度回调中回传、`game-service` 落库的实际路由快照 |
| `request_payload_json` | `JSON` | 否 |  | 脱敏后的请求体摘要 |
| `upstream_task_id` | `VARCHAR(64)` | 否 |  | 预留给后续启用 `ai-engine` 原生 async runner 时使用 |
| `result_version` | `INT` | 否 |  | 成功后 bundle 版本 |
| `result_bundle_id` | `VARCHAR(36)` | 否 |  | 成功后 bundle ID |
| `result_preview_url` | `VARCHAR(255)` | 否 |  | 成功后预览地址 |
| `result_payload_json` | `JSON` | 否 |  | 成功后的任务结果摘要 |
| `terminal_error_code` | `VARCHAR(64)` | 否 |  | 终态错误码 |
| `terminal_error_message` | `VARCHAR(1024)` | 否 |  | 终态错误摘要 |
| `terminal_error_json` | `JSON` | 否 |  | 终态完整错误对象 |
| `started_at` | `DATETIME(3)` | 否 |  | 开始时间 |
| `completed_at` | `DATETIME(3)` | 否 |  | 结束时间 |
| `heartbeat_at` | `DATETIME(3)` | 否 |  | Worker 心跳 |
| `last_error_at` | `DATETIME(3)` | 否 |  | 最后错误时间 |
| `created_at` | `DATETIME(3)` | 是 |  | 创建时间 |
| `updated_at` | `DATETIME(3)` | 是 |  | 更新时间 |

说明：

- 该表由 `game-service` 主写，`ai-engine` 不直接写入
- `route_snapshot_json` 是保证可追溯性的关键字段，但由 `ai-engine` 回调、`game-service` 落库
- `cancel_requested=true` 表示收到取消请求；若上游调用已无法中断，则按“软取消”处理，不再提交结果
- 前端任务查询与后台任务查询都基于此表

---

### 5.7 表：`generation_task_events`

用途：存储任务时间线，既给前端轮询事件，也给后台“生成记录详情”展示。

| 字段 | 类型 | 必填 | 索引/约束 | 说明 |
|------|------|------|------|------|
| `id` | `VARCHAR(36)` | 是 | PK | 事件 ID |
| `task_id` | `VARCHAR(36)` | 是 | `IDX(task_id, seq_no)` | 所属任务 |
| `seq_no` | `INT` | 是 | `UNIQUE(task_id, seq_no)` | 单任务内递增序号 |
| `game_id` | `VARCHAR(36)` | 是 | `IDX(game_id, created_at)` | 游戏 ID |
| `user_id` | `VARCHAR(36)` | 是 | `IDX(user_id, created_at)` | 用户 ID |
| `stage` | `VARCHAR(64)` | 是 |  | 流水线阶段 |
| `step_key` | `VARCHAR(64)` | 否 |  | 对应 LLM 步骤 |
| `status` | `ENUM('queued','running','retrying','succeeded','failed','canceled','timed_out','info')` | 是 |  | 事件状态 |
| `message` | `VARCHAR(255)` | 是 |  | 前端可展示的文本 |
| `detail_json` | `JSON` | 否 |  | 附加细节 |
| `created_at` | `DATETIME(3)` | 是 | `IDX(task_id, created_at)` | 事件时间 |

---

### 5.8 表：`llm_call_logs`

用途：保存最末端 LLM 调用日志，满足“知道到底哪个模型、哪个 Region、返回了什么错误”的要求。

| 字段 | 类型 | 必填 | 索引/约束 | 说明 |
|------|------|------|------|------|
| `id` | `VARCHAR(36)` | 是 | PK | 日志 ID |
| `task_id` | `VARCHAR(36)` | 是 | `IDX(task_id, created_at)` | 对应任务 |
| `game_id` | `VARCHAR(36)` | 是 | `IDX(game_id, created_at)` | 游戏 ID |
| `user_id` | `VARCHAR(36)` | 是 | `IDX(user_id, created_at)` | 用户 ID |
| `stage` | `VARCHAR(64)` | 是 |  | 流水线阶段 |
| `step_key` | `VARCHAR(64)` | 是 | `IDX(step_key, created_at)` | LLM 步骤 |
| `provider_id` | `VARCHAR(36)` | 是 | `IDX(provider_id, created_at)` | 命中的 Provider |
| `provider_type` | `VARCHAR(32)` | 是 |  | Provider 类型 |
| `region` | `ENUM` | 是 |  | 实际执行 Region |
| `model_name` | `VARCHAR(128)` | 是 |  | 实际调用模型 |
| `request_timeout_s` | `INT` | 是 |  | 单次调用超时 |
| `max_tokens` | `INT` | 否 |  | 输出 token 上限 |
| `temperature` | `DECIMAL(4,2)` | 否 |  | 实际温度 |
| `attempt_no` | `INT` | 是 |  | 本步骤第几次尝试 |
| `is_fallback` | `BOOLEAN` | 是 |  | 是否走 fallback Provider |
| `success` | `BOOLEAN` | 是 | `IDX(success, created_at)` | 是否成功 |
| `latency_ms` | `INT` | 否 |  | 耗时 |
| `http_status` | `INT` | 否 |  | 上游 HTTP 状态码 |
| `upstream_request_id` | `VARCHAR(128)` | 否 |  | 上游 request id |
| `finish_reason` | `VARCHAR(64)` | 否 |  | 成功时的结束原因 |
| `input_tokens` | `INT` | 否 |  | 输入 token |
| `output_tokens` | `INT` | 否 |  | 输出 token |
| `error_code` | `VARCHAR(64)` | 否 |  | 归一化错误码 |
| `error_message` | `VARCHAR(1024)` | 否 |  | 错误摘要 |
| `error_body_excerpt` | `LONGTEXT` | 否 |  | 上游错误体截断摘录 |
| `created_at` | `DATETIME(3)` | 是 |  | 记录时间 |

日志要求：

- 必须脱敏，不落完整 API Key、完整 Prompt、完整成功响应
- `error_body_excerpt` 建议截断至 2048 字符
- 若上游返回 request id，必须落 `upstream_request_id`
- 该表由 `game-service` 通过内部回调落库，`ai-engine` 只负责生成并上报日志内容

---

## 六、后台管理设计

### 6.1 页面结构

在现有 admin panel 中新增 4 个页面：

| 页面 | 作用 |
|------|------|
| `LLM 网关池` | 管理 Provider 配置、启停、优先级、在线测试 |
| `步骤路由` | 配置每个 `StepKey` 在不同 Region 下的模型选择 |
| `生成任务` | 查看异步任务状态、取消、重试、详情 |
| `LLM 调用日志` | 查看最末端模型调用结果与错误 |

### 6.2 后台支持的操作

### LLM 网关池

- 新增 Provider
- 编辑 Provider
- 启用/停用 Provider
- 在线连接测试
- 查看最近测试结果

### 步骤路由

- 按 `Region + StepKey` 编辑
- 从网关池选择主模型
- 选择 0-N 个 fallback 模型
- 单独配置每步 `requestTimeoutS`
- 单独配置每步 `maxTokens`
- 单独配置每步 `temperature`
- 开启/关闭跨 Region 兜底

### 生成任务

- 按用户、游戏、状态、Region、时间筛选
- 查看任务详情、时间线、终态错误
- 管理员取消任务
- 管理员手动重试失败任务

### LLM 调用日志

- 按 `taskId`、`gameId`、`stepKey`、`providerId`、`success` 筛选
- 查看 `HTTP Status`、`upstreamRequestId`、`errorBodyExcerpt`

---

## 七、Admin API 设计

后台接口延续当前管理面板风格：

- 请求头：`x-admin-token: <token>`
- 响应格式：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

### 7.1 LLM Provider 列表

### `GET /admin/llm-providers`

Query:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `region` | string | 否 | `cn_shanghai` / `ap_southeast_johor` / `global` |
| `providerType` | string | 否 | Provider 类型 |
| `enabled` | boolean | 否 | 是否启用 |
| `page` | number | 否 | 默认 `1` |
| `limit` | number | 否 | 默认 `20` |

Response `data`：

```json
{
  "items": [
    {
      "id": "8a9f...",
      "providerKey": "minimaxi_sh_primary",
      "displayName": "MiniMax 上海主模型",
      "providerType": "openai_compatible",
      "region": "cn_shanghai",
      "baseUrl": "https://api.minimaxi.com/v1",
      "apiPath": "/chat/completions",
      "authMode": "bearer",
      "apiKeyMasked": "sk-****1a2b",
      "modelDefault": "MiniMax-M2.5",
      "modelFast": "MiniMax-M2.5",
      "requestTimeoutS": 600,
      "connectTimeoutS": 15,
      "maxRetries": 1,
      "priority": 10,
      "enabled": true,
      "healthStatus": "healthy",
      "lastTestSuccess": true,
      "lastTestLatencyMs": 1840,
      "lastTestError": null,
      "lastTestAt": "2026-03-21T20:10:22.000Z",
      "extraHeaders": {},
      "createdAt": "2026-03-21T19:00:00.000Z",
      "updatedAt": "2026-03-21T20:10:22.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

### 7.2 新增 LLM Provider

### `POST /admin/llm-providers`

Request:

```json
{
  "providerKey": "minimaxi_sh_primary",
  "displayName": "MiniMax 上海主模型",
  "providerType": "openai_compatible",
  "region": "cn_shanghai",
  "baseUrl": "https://api.minimaxi.com/v1",
  "apiPath": "/chat/completions",
  "authMode": "bearer",
  "authHeaderName": null,
  "apiKey": "sk-xxxx",
  "modelDefault": "MiniMax-M2.5",
  "modelFast": "MiniMax-M2.5",
  "requestTimeoutS": 600,
  "connectTimeoutS": 15,
  "maxRetries": 1,
  "priority": 10,
  "enabled": true,
  "extraHeaders": {}
}
```

Request 字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `providerKey` | string | 是 | 稳定唯一键 |
| `displayName` | string | 是 | 后台展示名称 |
| `providerType` | string | 是 | Provider 类型 |
| `region` | string | 是 | Provider 所属 Region |
| `baseUrl` | string | 是 | 基础地址 |
| `apiPath` | string | 否 | 默认路径 |
| `authMode` | string | 是 | 鉴权模式 |
| `authHeaderName` | string \| null | 否 | `custom_header` 时必填 |
| `apiKey` | string | 是 | 明文仅在请求体中出现，入库前加密 |
| `modelDefault` | string | 是 | 主模型 |
| `modelFast` | string \| null | 否 | 快速模型 |
| `requestTimeoutS` | number | 否 | 单次调用超时，默认 `600` |
| `connectTimeoutS` | number | 否 | 连接超时，默认 `15` |
| `maxRetries` | number | 否 | Provider 级重试次数 |
| `priority` | number | 否 | 优先级 |
| `enabled` | boolean | 否 | 是否启用 |
| `extraHeaders` | object | 否 | 额外请求头 |

### 7.3 编辑 LLM Provider

### `PUT /admin/llm-providers/:id`

规则：

- `apiKey` 不回显
- 不传 `apiKey` 表示不修改密钥
- 传 `apiKey` 表示覆盖更新

### 7.4 在线连接测试

### `POST /admin/llm-providers/:id/test`

Request:

```json
{
  "stepKey": "code_generate",
  "model": "MiniMax-M2.5",
  "requestTimeoutS": 30
}
```

Response `data`：

```json
{
  "success": true,
  "providerId": "8a9f...",
  "providerKey": "minimaxi_sh_primary",
  "region": "cn_shanghai",
  "resolvedEndpoint": "https://api.minimaxi.com/v1/chat/completions",
  "model": "MiniMax-M2.5",
  "requestTimeoutS": 30,
  "latencyMs": 1840,
  "httpStatus": 200,
  "upstreamRequestId": "req_abc123",
  "errorCode": null,
  "errorMessage": null,
  "responseExcerpt": "pong"
}
```

### 7.5 获取步骤路由

### `GET /admin/llm-step-routes`

Query:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `region` | string | 否 | 不传则返回全部 Region |
| `stepKey` | string | 否 | 不传则返回全部步骤 |

Response `data.items[*]`：

```json
{
  "id": "route_123",
  "stepKey": "code_generate",
  "region": "cn_shanghai",
  "enabled": true,
  "requestTimeoutS": 600,
  "maxTokens": 4096,
  "temperature": 0.7,
  "topP": null,
  "allowCrossRegionFallback": false,
  "cacheTtlS": 10,
  "activeVersion": 3,
  "remark": "国内代码生成主路由",
  "items": [
    {
      "id": "item_1",
      "orderNo": 1,
      "providerId": "8a9f...",
      "providerKey": "minimaxi_sh_primary",
      "displayName": "MiniMax 上海主模型",
      "modelName": "MiniMax-M2.5",
      "fastModelName": "MiniMax-M2.5",
      "enabled": true
    },
    {
      "id": "item_2",
      "orderNo": 2,
      "providerId": "claude_1",
      "providerKey": "claude_jh_fallback",
      "displayName": "Claude 柔佛兜底",
      "modelName": "claude-sonnet-4-5",
      "fastModelName": "claude-haiku-4-5-20251001",
      "enabled": true
    }
  ]
}
```

### 7.6 保存步骤路由

### `PUT /admin/llm-step-routes/:stepKey`

Request:

```json
{
  "region": "cn_shanghai",
  "enabled": true,
  "requestTimeoutS": 600,
  "maxTokens": 4096,
  "temperature": 0.7,
  "topP": null,
  "allowCrossRegionFallback": false,
  "cacheTtlS": 10,
  "remark": "国内代码生成主路由",
  "items": [
    {
      "orderNo": 1,
      "providerId": "8a9f...",
      "modelName": "MiniMax-M2.5",
      "fastModelName": "MiniMax-M2.5",
      "enabled": true
    },
    {
      "orderNo": 2,
      "providerId": "claude_1",
      "modelName": "claude-sonnet-4-5",
      "fastModelName": "claude-haiku-4-5-20251001",
      "enabled": true
    }
  ]
}
```

规则：

- 按 `stepKey + region` 做 upsert
- `items` 全量覆盖保存
- 保存成功后：
  - 路由 `activeVersion + 1`
  - `system_configs.llm.gateway.config_version + 1`
  - 自动触发运行时刷新

### 7.7 手动刷新运行时配置

### `POST /admin/llm-runtime/refresh`

Request:

```json
{
  "regions": ["cn_shanghai", "ap_southeast_johor"]
}
```

Response:

```json
{
  "results": [
    {
      "region": "cn_shanghai",
      "success": true,
      "refreshedVersion": 12
    },
    {
      "region": "ap_southeast_johor",
      "success": true,
      "refreshedVersion": 12
    }
  ]
}
```

### 7.8 后台查看生成任务

### `GET /admin/generation-tasks`

Query:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 否 | 任务状态 |
| `region` | string | 否 | 任务 Region |
| `userId` | string | 否 | 用户 ID |
| `gameId` | string | 否 | 游戏 ID |
| `page` | number | 否 | 页码 |
| `limit` | number | 否 | 每页数量 |

### `GET /admin/generation-tasks/:id`

返回任务详情，包括 `terminalError`、`routeSnapshot`、`resultPayload`。

### `GET /admin/generation-tasks/:id/events`

返回任务时间线：

```json
{
  "items": [
    {
      "seqNo": 1,
      "stage": "intent_parsing",
      "stepKey": "intent_parse",
      "status": "running",
      "message": "解析游戏意图",
      "detail": {
        "attempt": 1
      },
      "createdAt": "2026-03-21T20:30:01.000Z"
    }
  ]
}
```

### `POST /admin/generation-tasks/:id/cancel`

用途：管理员取消运行中任务。

取消语义：

- 一期为“best effort”
- 若未来启用 `upstream_task_id` 且 `ai-engine` 支持取消，则同步转发上游取消
- 若当前仍是 `game-service` 背景同步调用，则先写 `cancel_requested=true`
- 已经完成持久化的任务不允许回滚成取消态

Response：

```json
{
  "code": 0,
  "data": {
    "taskId": "task_123",
    "status": "canceled"
  }
}
```

### `POST /admin/generation-tasks/:id/retry`

用途：管理员重新触发失败任务。重试时：

- 新建一条新的 `generation_tasks` 记录
- 原任务保持原始失败记录不覆盖
- 新任务重新抓取最新配置并生成新的 `route_snapshot_json`

Response：

```json
{
  "code": 0,
  "data": {
    "previousTaskId": "task_123",
    "newTaskId": "task_456",
    "status": "queued"
  }
}
```

### 7.9 后台查看 LLM 调用日志

### `GET /admin/llm-call-logs`

Query:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `taskId` | string | 否 | 任务 ID |
| `gameId` | string | 否 | 游戏 ID |
| `stepKey` | string | 否 | 步骤键 |
| `providerId` | string | 否 | Provider ID |
| `success` | boolean | 否 | 是否成功 |
| `page` | number | 否 | 页码 |
| `limit` | number | 否 | 每页数量 |

---

## 八、前端业务 API 设计

前端继续走业务入口 `game-service`，不直接操作 `ai-engine` 的底层路由配置。

### 8.1 生成任务对象

统一对象 `GenerationTask`：

```json
{
  "taskId": "task_123",
  "taskType": "pipeline_run",
  "status": "running",
  "region": "cn_shanghai",
  "gameId": "game_123",
  "version": 1,
  "progressPct": 60,
  "cancelRequested": false,
  "currentStage": "code_generating",
  "currentStepKey": "code_generate",
  "taskTimeoutS": 600,
  "wsChannel": "game:game_123",
  "pollUrl": "/api/v1/games/tasks/task_123",
  "eventsUrl": "/api/v1/games/tasks/task_123/events",
  "cancelUrl": "/api/v1/games/tasks/task_123/cancel",
  "startedAt": "2026-03-21T20:30:00.000Z",
  "completedAt": null,
  "terminalError": null
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskId` | string | 任务 ID |
| `taskType` | string | `pipeline_run` / `pipeline_iterate` |
| `status` | string | 任务状态 |
| `region` | string | 实际执行 Region |
| `gameId` | string | 游戏 ID |
| `version` | number | 目标版本 |
| `progressPct` | number | `0-100` |
| `cancelRequested` | boolean | 是否已收到取消请求 |
| `currentStage` | string \| null | 当前流水线阶段 |
| `currentStepKey` | string \| null | 当前 LLM 步骤 |
| `taskTimeoutS` | number | 任务总超时 |
| `wsChannel` | string | WebSocket 频道 |
| `pollUrl` | string | 轮询地址 |
| `eventsUrl` | string | 事件流地址 |
| `cancelUrl` | string \| null | 取消地址 |
| `terminalError` | object \| null | 失败后返回终态错误 |

### 8.2 终态错误对象

```json
{
  "source": "llm_gateway",
  "stage": "code_generating",
  "stepKey": "code_generate",
  "providerId": "8a9f...",
  "providerType": "openai_compatible",
  "region": "cn_shanghai",
  "modelName": "MiniMax-M2.5",
  "httpStatus": 404,
  "errorCode": "upstream_http_error",
  "message": "Client error '404 Not Found' for url 'https://api.minimaxi.com/chat/completions'",
  "upstreamRequestId": "req_abc123",
  "retryCount": 1,
  "retryable": false,
  "occurredAt": "2026-03-21T20:35:20.000Z"
}
```

### 8.3 创建生成任务

### `POST /api/v1/games/generate`

Request:

```json
{
  "description": "做一个点击躲避障碍物的小游戏",
  "title": "障碍躲避",
  "taskTimeoutS": 600,
  "regionHint": "cn_shanghai"
}
```

Request 字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `description` | string | 与 `prompt` 二选一 | 生成描述 |
| `prompt` | string | 与 `description` 二选一 | 兼容字段 |
| `title` | string | 否 | 初始标题 |
| `taskTimeoutS` | number | 否 | 任务总超时，不传默认 `600` |
| `regionHint` | string | 否 | `cn_shanghai` / `ap_southeast_johor` |

Response:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "gameId": "game_123",
    "title": "障碍躲避",
    "description": "做一个点击躲避障碍物的小游戏",
    "status": "generating",
    "canPlay": true,
    "quotaRemaining": 4,
    "requireSubscription": false,
    "generationTask": {
      "taskId": "task_123",
      "taskType": "pipeline_run",
      "status": "queued",
      "region": "cn_shanghai",
      "gameId": "game_123",
      "version": 1,
      "progressPct": 0,
      "currentStage": "started",
      "currentStepKey": null,
      "taskTimeoutS": 600,
      "wsChannel": "game:game_123",
      "pollUrl": "/api/v1/games/tasks/task_123",
      "eventsUrl": "/api/v1/games/tasks/task_123/events",
      "cancelUrl": "/api/v1/games/tasks/task_123/cancel",
      "startedAt": null,
      "completedAt": null,
      "terminalError": null
    }
  }
}
```

### 8.4 创建迭代任务

### `POST /api/v1/games/:id/iterate`

Request:

```json
{
  "feedback": "把主角移动速度调快一点，并增加得分动画",
  "taskTimeoutS": 600
}
```

Response：

```json
{
  "code": 0,
  "data": {
    "gameId": "game_123",
    "version": 2,
    "status": "iterating",
    "generationTask": {
      "taskId": "task_456",
      "taskType": "pipeline_iterate",
      "status": "queued",
      "region": "cn_shanghai",
      "gameId": "game_123",
      "version": 2,
      "progressPct": 0,
      "currentStage": "started",
      "currentStepKey": null,
      "taskTimeoutS": 600,
      "wsChannel": "game:game_123",
      "pollUrl": "/api/v1/games/tasks/task_456",
      "eventsUrl": "/api/v1/games/tasks/task_456/events",
      "cancelUrl": "/api/v1/games/tasks/task_456/cancel",
      "terminalError": null
    }
  }
}
```

### 8.5 查询任务详情

### `GET /api/v1/games/tasks/:taskId`

Response:

```json
{
  "code": 0,
  "data": {
    "taskId": "task_123",
    "taskType": "pipeline_run",
    "status": "failed",
    "region": "cn_shanghai",
    "gameId": "game_123",
    "version": 1,
    "progressPct": 78,
    "currentStage": "qa_checking",
    "currentStepKey": "qa_fix",
    "taskTimeoutS": 600,
    "wsChannel": "game:game_123",
    "pollUrl": "/api/v1/games/tasks/task_123",
    "eventsUrl": "/api/v1/games/tasks/task_123/events",
    "cancelUrl": null,
    "startedAt": "2026-03-21T20:30:00.000Z",
    "completedAt": "2026-03-21T20:35:20.000Z",
    "terminalError": {
      "source": "llm_gateway",
      "stage": "qa_checking",
      "stepKey": "qa_fix",
      "providerId": "8a9f...",
      "providerType": "openai_compatible",
      "region": "cn_shanghai",
      "modelName": "MiniMax-M2.5",
      "httpStatus": 429,
      "errorCode": "rate_limit",
      "message": "Upstream provider rate limited",
      "upstreamRequestId": "req_abc123",
      "retryCount": 3,
      "retryable": true,
      "occurredAt": "2026-03-21T20:35:20.000Z"
    }
  }
}
```

### 8.6 查询任务事件流

### `GET /api/v1/games/tasks/:taskId/events`

Query:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `cursor` | number | 否 | 从某个 `seqNo` 之后继续拉取 |
| `limit` | number | 否 | 默认 `50` |

Response:

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "seqNo": 1,
        "stage": "started",
        "stepKey": null,
        "status": "queued",
        "message": "任务已创建",
        "detail": {
          "taskType": "pipeline_run"
        },
        "createdAt": "2026-03-21T20:30:00.000Z"
      },
      {
        "seqNo": 2,
        "stage": "code_generating",
        "stepKey": "code_generate",
        "status": "running",
        "message": "生成游戏代码",
        "detail": {
          "attempt": 1,
          "providerId": "8a9f..."
        },
        "createdAt": "2026-03-21T20:30:12.000Z"
      }
    ],
    "nextCursor": 2,
    "hasMore": false
  }
}
```

### 8.7 取消任务

### `POST /api/v1/games/tasks/:taskId/cancel`

Response：

```json
{
  "code": 0,
  "data": {
    "taskId": "task_123",
    "status": "canceled"
  }
}
```

### 8.8 兼容接口

### `GET /api/v1/games/:id/generation-status`

此接口继续保留，内部读取 `generation_tasks` 当前最新任务并返回兼容结构，供未升级前端继续使用。

---

## 九、WebSocket 事件约定

沿用当前 `game-service` 的实时推送方式，频道仍为 `user:{userId}`，事件名保持兼容：

| 事件 | 说明 |
|------|------|
| `gen:progress` | 任务进行中 |
| `gen:complete` | 任务完成 |
| `gen:error` | 任务失败 |

事件体中新增：

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskId` | string | 当前任务 ID |
| `taskType` | string | 任务类型 |
| `region` | string | 执行 Region |
| `stepKey` | string \| null | 当前 LLM 步骤 |
| `terminalError` | object \| null | 失败时返回 |

---

## 十、服务间内部接口

以下接口不暴露给前端，只供 `game-service` 与 `ai-engine` 之间调用。

说明：

- 一期保留当前主执行模式：`game-service` 背景 worker 调 `ai-engine` 同步流水线接口
- `ai-engine` 自带的内存态 `/pipeline/run/async` 与 `/tasks/*` 仅作为调试能力保留，不作为生产主链路的任务真源

### 10.1 `game-service -> ai-engine` 首次生成

### `POST /api/v1/ai/pipeline/run`

Request：

```json
{
  "task_id": "task_123",
  "game_id": "game_123",
  "user_id": "user_123",
  "description": "做一个点击躲避障碍物的小游戏",
  "platform": "wechat_webview",
  "region": "cn_shanghai",
  "timeout_s": 600
}
```

Response：

```json
{
  "game_id": "game_123",
  "html_code": "<!DOCTYPE html>...</html>",
  "strategy": "hybrid",
  "qa_passed": true,
  "qa_retries": 1,
  "generation_time_ms": 184000,
  "code_size_bytes": 28641,
  "quality_score": 9.2
}
```

说明：

- 最终成功结果仍通过该同步响应返回给 `game-service`
- `game-service` 收到成功响应后负责保存 bundle、更新 game 状态、补齐 previewUrl、推送 `gen:complete`
- 若响应异常，则 `game-service` 负责写任务失败终态和业务失败状态

### 10.2 `game-service -> ai-engine` 迭代生成

### `POST /api/v1/ai/pipeline/iterate`

Request：

```json
{
  "task_id": "task_456",
  "game_id": "game_123",
  "user_id": "user_123",
  "feedback": "把主角移动速度调快一点",
  "current_code": "<!DOCTYPE html>...</html>",
  "conversation": [],
  "region": "cn_shanghai",
  "timeout_s": 600
}
```

### 10.3 `ai-engine -> game-service` 进度回调

### `POST /api/v1/internal/generation/progress`

说明：

- 这是现有内部接口的扩展版，兼容当前实现
- 由 `ai-engine` 在每个阶段回调，`game-service` 收到后：
  - 更新 `generation_tasks`
  - 写入 `generation_task_events`
  - 推送 WebSocket

Request：

```json
{
  "taskId": "task_123",
  "gameId": "game_123",
  "userId": "user_123",
  "stage": "code_generating",
  "stepKey": "code_generate",
  "status": "running",
  "percentage": 60,
  "message": "生成游戏代码",
  "region": "cn_shanghai",
  "gatewayConfigVersion": 12,
  "routeSnapshot": {
    "stepKey": "code_generate",
    "region": "cn_shanghai",
    "items": [
      {
        "orderNo": 1,
        "providerId": "provider_1",
        "providerKey": "minimaxi_sh_primary",
        "modelName": "MiniMax-M2.5"
      }
    ]
  },
  "details": {
    "attempt": 1,
    "maxAttempts": 3
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `taskId` | string | 是 | 任务 ID |
| `gameId` | string | 是 | 游戏 ID |
| `userId` | string | 是 | 用户 ID |
| `stage` | string | 是 | 流水线阶段 |
| `stepKey` | string \| null | 否 | 当前 LLM 步骤 |
| `status` | string | 是 | `queued` / `running` / `retrying` / `info` |
| `percentage` | number | 是 | 进度百分比 |
| `message` | string | 是 | 进度文本 |
| `region` | string | 是 | 实际执行 Region |
| `gatewayConfigVersion` | number | 否 | 命中的配置版本 |
| `routeSnapshot` | object | 否 | 首次进入某个 LLM 步骤时回传 |
| `details` | object | 否 | 额外细节 |

### 10.4 `ai-engine -> game-service` LLM 调用日志回调

### `POST /api/v1/internal/generation/llm-call-log`

用途：

- `ai-engine` 每次实际调用 LLM 后回调一次
- `game-service` 收到后写入 `llm_call_logs`

Request：

```json
{
  "taskId": "task_123",
  "gameId": "game_123",
  "userId": "user_123",
  "stage": "qa_checking",
  "stepKey": "qa_fix",
  "providerId": "provider_1",
  "providerType": "openai_compatible",
  "region": "cn_shanghai",
  "modelName": "MiniMax-M2.5",
  "requestTimeoutS": 600,
  "maxTokens": 4096,
  "temperature": 0.2,
  "attemptNo": 1,
  "isFallback": false,
  "success": false,
  "latencyMs": 1812,
  "httpStatus": 429,
  "upstreamRequestId": "req_abc123",
  "finishReason": null,
  "inputTokens": 1840,
  "outputTokens": null,
  "errorCode": "rate_limit",
  "errorMessage": "Upstream provider rate limited",
  "errorBodyExcerpt": "{\"error\":{\"message\":\"rate limit\"}}"
}
```

### 10.5 运行时配置刷新

### `POST /internal/llm-gateway/refresh`

Request：

```json
{
  "expectedVersion": 12
}
```

Response：

```json
{
  "success": true,
  "currentVersion": 12,
  "providerCount": 6,
  "routeCount": 8
}
```

---

## 十一、运行时流程

### 11.1 新建任务流程

```text
前端 -> POST /api/v1/games/generate
  -> game-service 创建 game 记录
  -> game-service 创建 generation_tasks 记录
  -> game-service 后台 worker 调 ai-engine 同步 /pipeline/run
  -> ai-engine 在请求开始时解析 LLM 路由
  -> ai-engine 通过 /internal/generation/progress 回传 routeSnapshot 与进度
  -> game-service 更新 generation_tasks / generation_task_events 并推送 WebSocket
  -> ai-engine 执行流水线
  -> ai-engine 每次调用 LLM 通过 /internal/generation/llm-call-log 回传日志
  -> 成功后 ai-engine 把最终 HTML 通过同步响应返回给 game-service
  -> game-service 保存 bundle、更新 game 状态、更新 generation_tasks 成功终态
  -> 若失败则 game-service 写 failed 终态、failedStage/failedReason，并执行退款补偿
```

### 11.2 路由选择顺序

单次 LLM 调用选择顺序：

1. 读取任务创建时快照中的 `llm_step_routes`
2. 找到当前 `stepKey + task.region`
3. 按 `llm_step_route_items.order_no` 顺序尝试
4. 若全部失败且 `allow_cross_region_fallback=true`
5. 再尝试另一 Region 的同 `stepKey` 路由
6. 仍失败则抛出终态错误并写 `llm_call_logs`

### 11.3 任务超时与单次调用超时

两类超时必须区分：

- `requestTimeoutS`
  - 作用对象：单次 LLM 调用
  - 来源优先级：步骤路由 > Provider > `system_configs.llm.gateway.default_request_timeout_s`
  - 默认值：`600`
- `taskTimeoutS`
  - 作用对象：整条生成任务
  - 来源优先级：前端请求 > `system_configs.generation.task.default_timeout_s`
  - 默认值：`600`

---

## 十二、错误日志设计要求

### 12.1 必须记录的最末端错误字段

当 LLM 调用失败时，以下字段必须最终能在后台详情中看到：

| 字段 | 说明 |
|------|------|
| `stepKey` | 哪个步骤在调用模型 |
| `providerId` | 命中哪个 Provider |
| `providerType` | Provider 类型 |
| `region` | 实际发生在哪个 Region |
| `modelName` | 实际使用模型 |
| `httpStatus` | 上游 HTTP 状态码 |
| `errorCode` | 归一化错误码 |
| `errorMessage` | 错误摘要 |
| `errorBodyExcerpt` | 上游错误体摘录 |
| `upstreamRequestId` | 上游 request id |
| `attemptNo` | 第几次尝试 |
| `isFallback` | 是否已经切到 fallback |

### 12.2 归一化错误码建议

| 错误码 | 说明 |
|------|------|
| `invalid_provider_config` | Provider 配置不完整 |
| `upstream_http_error` | 上游返回非 2xx |
| `rate_limit` | 上游限流 |
| `network_error` | 网络连接异常 |
| `request_timeout` | 单次调用超时 |
| `response_parse_error` | 响应解析失败 |
| `task_timeout` | 整体任务超时 |

---

## 十三、实施顺序

建议按以下顺序开发：

1. 数据库表与 `system_configs` 约定 key
2. `ai-engine` 内部 `LLMGateway` 运行时与热加载
3. 后台 `LLM 网关池` 与 `步骤路由` 页面
4. `generation_tasks` 与 `generation_task_events`
5. `llm_call_logs` 与后台日志页
6. 前端异步任务接口与兼容接口适配
7. 上海 / 柔佛双 Region 部署与联调

---

## 十四、一期实施边界

为控制风险，一期实施范围明确如下：

- 支持的 Provider 类型先落地 `openai_compatible` 与 `anthropic`
- 后台先支持手动在线测试，不做定时巡检
- 热生效先保证“新建任务立即生效”，运行中任务继续使用任务快照
- 前端先走轮询 + 现有 WebSocket，暂不引入新消息中间件

不在一期实施范围：

- 自动流量分流 / AB Test
- 多租户隔离
- Prompt 全量审计存档
- 历史成功完整响应体长期保存
