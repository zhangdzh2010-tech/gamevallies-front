---
name: gamevallies-aliyun-fc-deploy
description: 为 GameVallies 前后端规划、改造、发布和排查阿里云函数计算 FC 部署。当用户要求部署 GameVallies、配置阿里云发布流程或维护 FC 环境时使用。
---

# GameVallies 阿里云 FC 部署

## 项目决策与当前状态

用户已明确选择阿里云函数计算 FC，不使用 ECS。此决定取代此前 ACR + ECS + Docker Compose 的部署方案。产品是面向桌面 Web 的交互创意平台，覆盖物理、生物、化学和艺术；不新增移动 H5 产品要求。内部 Taro H5 构建名称和 /games API 保留兼容。

作用仓库：`zhangdzh2010-tech/gamevallies-front` 与 `zhangdzh2010-tech/gamevallies-backend`。
本 skill 是部署规范，不是已经可执行的 FC 发布实现。首次执行须检查两库真实主干、PR、工作流与云端资源状态。当前已有的 `deploy/aliyun/compose.yml`、`scripts/aliyun/deploy.sh` 和 ECS Runner 工作流属于旧方案，不得将其作为 FC 部署命令运行，也不要设置旧 `ALIYUN_DEPLOY_ENABLED=true` 来尝试 FC 发布。

不要要求用户购买 ECS、提供 ECS SSH 密钥、安装服务器 Runner，或默认要求 ALB。不重新引入火山引擎部署/维护脚本；业务模型接口及历史对象存储适配应单独盘点，不能因名称包含旧云平台就删除。

## 开始时读取

- 两库 `.github/workflows/`、Dockerfile、`deploy/`、服务启动入口与环境变量模板。
- 后端生成请求、任务队列/消费者、进度通知、文件持久化代码。
- 前端 API、作品内容域名、SSE/WebSocket 和登录回调配置。
- 两库 `docs/**/ALIYUN_DEPLOYMENT.md` 作为旧方案背景，出现 ECS 要求时以本 skill 的 FC 决策为准。

具体 FC 类型、CLI 组件版本和字段，执行时通过阿里云官方文档核实；不要把旧 FC 服务/函数层级和新 API 配置混写。不凭记忆生成声称可执行的 Serverless Devs 配置。

## 目标形态与必须完成的适配

1. Web/API 优先评估 FC Web 函数及自定义容器，复用已有镜像和健康检查。前端可用 FC 托管构建产物；OSS/CDN 静态托管是可选优化，不擅自改为用户必需购买项。不要把 Compose 的多服务编排直接塞进一个函数。
2. 自定义镜像按官方要求放在 FC 同地域、同账号的 ACR，确认目标架构；当前自定义容器文档要求 linux/amd64。每个函数明确监听地址/端口、启动命令、健康检查和资源限制。
3. 生成任务与 HTTP 请求解耦。现有常驻队列消费者不能假定在弹性实例中永久存活。评估 FC 异步调用/任务模式或明确支持的事件触发，将任务 ID、进度、结果、重试状态持久化；处理幂等、重复投递、超时、取消和实例退出。不把“返回响应后继续跑后台线程”当成可靠完成机制；若选用后台任务能力，需验证其生命周期和限制。
4. MySQL/RDS 和 Redis 使用可达的托管/现有服务；函数本地磁盘不作为作品、上传附件、任务结果的持久存储。盘点 OSS/NAS 需求及旧文件迁移、引用校验，禁止在未迁移验证时移除旧存储。
5. 审查微服务间地址、网关路由与鉴权，不再使用 Compose DNS 名称。内部函数只接受受控调用，不能为了打通路由而公开无鉴权管理/生成接口。分清部署身份、函数执行角色和用户业务鉴权。
6. 对 SSE、WebSocket、流式响应逐项核验所选函数类型、HTTP 触发器及入口支持、时限与缓冲行为。实现断线恢复和持久化进度读取，必要时使用已有轮询；不能以 Web 健康检查替代实时链路验证。
7. AI 容器中的浏览器检查需验证 Chromium 依赖、内存、临时空间与启动耗时。按模型请求和数据库连接承载能力设置实例并发、最大实例数、超时、重试；不把平台最高限制当成默认配置。
8. 应用和不可信作品内容保留独立 origin、iframe 隔离和鉴权边界。绑定域名/HTTPS 后，同步前端构建变量、CORS、服务地址与登录/支付回调。

## 只索取实际缺少的信息

先列出已确认值，再向用户集中索取剩余项：
- 阿里云账号 ID、地域；现有 FC 函数/应用名称及准备新建还是更新。
- ACR 实例/登录地址、命名空间；已有镜像仓库情况。
- 应用域名、独立作品内容域名、DNS 和 HTTPS 配置情况。
- RDS/MySQL、Redis 的版本、内网地址、库名，以及 VPC/vSwitch/安全组可达信息；新库还是迁移现有数据。
- 模型供应商、API 地址、模型名称；实际启用的登录、短信和支付方式。
- 现有对象存储、文件迁移需求；OSS/NAS 仅按适配结果收集。
- 发布身份与函数执行角色 ARN、GitHub 配置权限；是否已有函数日志/监控资源。

不要索取主账号密码或让用户在聊天中粘贴密钥。优先评估受信任的短期身份/OIDC；采用该方案前验证 RAM 信任条件和 CLI 支持。否则将最小权限部署凭据放入 GitHub Secrets；运行密钥通过适用的密钥服务或受保护函数配置注入，不编译进前端、不提交进 Git。不要声称当前 GitHub 连接能够写 Secrets；先确认工具权限，缺少权限则给出精确字段供用户填写。

## 改造、发布与回滚

- 在隔离分支完成 FC 描述文件、CI/CD、环境变量模板、运维文档和旧 ECS 入口替换。仅更新 skill 不代表这些改造已完成；明确报告实际变更范围。
- GitHub 托管 Runner 构建测试、推送 ACR，再用经过验证且锁定版本的 Serverless Devs/FC CLI 或 SDK 发布；不依赖 ECS 自托管 Runner。Secrets 名称以新工作流的实际定义为准。
- 镜像使用提交 SHA/不可变摘要，记录函数版本、配置版本和域名/触发器所指向的发布目标。保留上个已验证版本，回滚采用所选 FC 版本支持的版本/别名或配置切换；不承诺不存在的 API。配置、密钥、数据迁移分别管理，镜像回滚不等于数据回滚。
- 数据初始化/迁移单独核验，不能将现有生产库当成空库执行 schema push。确认代码发布与任务排空/重试兼容。
- 发布前验证配置语法、权限与目标资源，运行相关回归和容器启动检查。发布后验证登录、一次真实创作、取消/恢复、重复任务防护、实时进度、预览、发布和启用的业务回调。
- 尊重当前会话授权；用户已授权的发布继续执行，不反复索要许可。编辑 skill 本身不授权购买云资源或切换生产流量。失败时停止流量切换，保留诊断信息并按已验证方案恢复，避免无限重试或清理仍供回滚使用的资源。
- 完成时分别报告：规范更新、代码改造、CI 通过、函数发布、真实业务验证和生产流量切换。只对有证据的阶段声明完成。

## 官方资料

执行部署时读取与当前模式相关的资料，并核对更新日期：
- 函数类型选择：https://www.alibabacloud.com/help/en/functioncompute/selection-of-method-to-create-functions
- 自定义容器：https://www.alibabacloud.com/help/en/functioncompute/create-a-custom-container-function-in-a-container-runtime
- Web 函数：https://www.alibabacloud.com/help/en/functioncompute/fc/user-guide/creating-a-web-function
- 异步调用：https://www.alibabacloud.com/help/en/functioncompute/overview-34
- 异步任务实践：https://www.alibabacloud.com/help/en/functioncompute/fc/use-cases/best-practices-for-asynchronous-tasks
