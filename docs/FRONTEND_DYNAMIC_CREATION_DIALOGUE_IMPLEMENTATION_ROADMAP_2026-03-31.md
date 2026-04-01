# 前端动态创作会话实施方案

> 版本：v1.0
> 日期：2026-03-31
> 状态：实施中
> 关联文档：
> - [FRONTEND_DYNAMIC_CREATION_DIALOGUE_ADAPTATION_PLAN_2026-03-31.md](./FRONTEND_DYNAMIC_CREATION_DIALOGUE_ADAPTATION_PLAN_2026-03-31.md)

---

## 1. 文档目的

本方案用于把 `gamevallies-front` 从当前“直接生成 / 直接复刻 / 直接优化”的旧链路，迁移到统一的“动态创作会话”模型。

本方案聚焦工程实施，不重复产品愿景，重点回答以下问题：

1. 当前代码和目标方案的真实差距是什么
2. 应该按什么顺序改，才能降低返工风险
3. 每个阶段要改哪些文件、引入哪些状态、完成哪些验收
4. 哪些点可以兼容旧链路，哪些点必须切换主链

---

## 2. 当前代码现状

基于 2026-03-31 的仓库代码，当前前端现状如下：

### 2.1 create 仍是直接生成链路

文件：

- `src/pages/create/index.jsx`
- `src/store/gameStore.js`
- `src/services/game.js`

当前行为：

1. 用户填写标题、描述、横竖屏
2. 点击“开始创作”
3. 前端直接调用 `generateGame()`
4. 前端进入生成任务跟踪页
5. 生成完成后进入作品完成态

结论：

- 当前创建页尚未真正进入 `creation session`
- 当前创建页没有 `planDraft / currentQuestion / questionStrategy / confidenceSummary` 展示

### 2.2 fork 仍是直接 fork 链路

文件：

- `src/pages/game/fork/index.jsx`

当前行为：

1. 用户进入复刻页
2. 点击“立即复刻”
3. 前端直接调用 `forkGame()`
4. 跳转到 iterate 页面继续优化

结论：

- 当前复刻页未接入 `entryMode=fork`
- 当前复刻页没有基于原作品的差异化会话

### 2.3 iterate 仍是直接提交反馈链路

文件：

- `src/pages/game/iterate/index.jsx`

当前行为：

1. 页面加载作品
2. 用户在 textarea 中输入优化意见
3. 前端直接调用 `/api/v1/games/:id/iterate`
4. 进入优化任务跟踪页

结论：

- 当前迭代页未接入 `entryMode=iterate`
- 当前迭代页仍以旧 textarea 为主链路

### 2.4 服务层和状态层还没有 creation session 基础设施

文件：

- `src/services/game.js`
- `src/store/gameStore.js`

当前缺失：

1. creation session API 封装
2. creation session 数据 normalize
3. creation session store 状态
4. creation session 恢复逻辑
5. creation session 错误模型

结论：

- 这是一次“前端创作入口架构迁移”
- 不是简单页面补几个按钮

---

## 3. 目标架构

前端目标架构分为两段：

### 3.1 会话段

前端围绕 `CreationSessionSnapshot` 运转：

- `idle`
- `collecting`
- `ready`
- `expired`
- `abandoned`
- `failed`

前端只负责：

1. 创建会话
2. 渲染方案草案
3. 渲染当前问题
4. 回答 / 跳过 / 放弃 / 直接生成
5. 恢复 active session

前端不再负责：

1. 推断缺哪些槽位
2. 自己生成追问
3. 自己拼接 prompt

### 3.2 生成段

当会话进入生成时，继续复用现有生成任务跟踪能力：

- `currentTask`
- `currentTaskEvents`
- `generationProgress`
- `currentGame`

结论：

- 会话状态机和生成任务状态机并存
- 会话负责“生成前”
- 任务跟踪负责“生成后”

---

## 4. 实施原则

### 4.1 先打底层，再改页面

实施顺序必须是：

1. 服务层
2. store
3. 通用组件层
4. create
5. iterate
6. fork

原因：

- 如果先改页面，状态模型和恢复逻辑一定重复实现
- `create` 是最适合验证会话链路的入口
- `fork` 和 `iterate` 应尽量复用 create 打下来的抽象

### 4.2 旧生成任务跟踪能力尽量复用

不重做以下能力：

1. `PipelineOrbit`
2. 任务事件轮询和 WebSocket 跟踪
3. 生成完成态
4. 任务取消能力

只在“生成前入口”切换到 session 模型。

### 4.3 第一阶段不急着做复杂结构化问题 UI

第一版优先保证：

1. 数据流打通
2. 主状态机打通
3. create 能用
4. iterate / fork 有清晰迁移路径

结构化 answer type 在第一版只做扩展位，不强行一次到位。

---

## 5. 分阶段实施方案

## 5.1 第一阶段：服务层与 store 基础设施

目标：

- 在不改现有页面主链路的前提下，引入 creation session 能力

涉及文件：

- `src/services/game.js`
- `src/store/gameStore.js`

### 5.1.1 服务层改造

新增能力：

1. `normalizeCreationSessionSnapshot(raw)`
2. `createCreationSession(prompt, title, options)`
3. `getActiveCreationSession()`
4. `getCreationSession(sessionId)`
5. `appendCreationSessionMessage(sessionId, content, revision)`
6. `skipCreationSessionQuestion(sessionId, revision)`
7. `generateFromCreationSession(sessionId, options)`
8. `abandonCreationSession(sessionId)`

设计要求：

1. 允许后端字段轻微变体，normalize 时尽量兜底
2. `orientation / generationTier / sourceGameId / entryMode` 统一透传
3. `generateFromCreationSession()` 复用现有 `normalizeGenerateResponse()`
4. 所有新接口保持与现有 `gameService` 风格一致

### 5.1.2 store 改造

新增 state：

1. `creationSession`
2. `creationSessionError`
3. `creationSessionSubmitting`
4. `creationSessionRestoring`
5. `creationSessionContext`

新增 action：

1. `startCreationSession()`
2. `restoreActiveCreationSession()`
3. `refreshCreationSession()`
4. `answerCreationSessionQuestion()`
5. `skipCreationSessionQuestion()`
6. `generateFromCreationSession()`
7. `abandonCreationSession()`
8. `resetCreationSessionState()`
9. `getCreationFlowStage()`

设计要求：

1. 不破坏现有 `createGame()` / `iterateGame()` / `restorePersistedTask()` 能力
2. session 状态与 task 状态并存
3. `generateFromCreationSession()` 成功后自动接入现有任务跟踪
4. store 层统一处理 session 常见错误文案映射

### 5.1.3 第一阶段验收

验收标准：

1. `game.js` 已具备完整 creation session API
2. `gameStore.js` 已具备 creation session 状态与 actions
3. 当前页面不受影响，旧链路仍可工作
4. 后续页面改造不需要重复写 session 数据请求逻辑

---

## 5.2 第二阶段：通用 creation 组件层

目标：

- 抽出三类页面共享的会话 UI 骨架

涉及目录：

- `src/components/creation/`

建议组件：

1. `CreationSessionShell`
2. `CreationPlanDraftCard`
3. `CreationConfidenceCard`
4. `CreationConversationList`
5. `CreationQuestionCard`
6. `CreationAnswerComposer`
7. `CreationSessionActions`

设计要求：

1. 组件只依赖 props，不耦合页面路由
2. 能同时适配 `create / fork / iterate`
3. 允许后续扩展 `text / single_select / multi_select / chips`

验收标准：

1. create 页面可接入一套统一的 session UI
2. iterate / fork 可以最小改造接入

---

## 5.3 第三阶段：create 页面切换到会话主链

目标：

- create 成为第一个完整落地的 creation session 页面

涉及文件：

- `src/pages/create/index.jsx`
- `src/pages/create/index.scss`

需要完成：

1. 增加 `generationTier` 选择器
2. 表单提交改为 `startCreationSession()`
3. 会话态接入 `CreationSessionShell`
4. 支持：
   - 回答
   - 跳过
   - 调整理解
   - 直接生成
   - 放弃重来
5. 恢复逻辑改为：
   - 优先恢复 active session
   - session 为 generating 时恢复 task
   - task 完成时进入完成态

验收标准：

1. 创建页从首条创意到生成完成全流程走 session
2. `generationTier` 可见且可提交
3. 刷新 / 返回后可恢复 active session

---

## 5.4 第四阶段：iterate 页面切换到会话主链

目标：

- 继续优化从“纯反馈 textarea”升级为“差异化创作会话”

涉及文件：

- `src/pages/game/iterate/index.jsx`
- `src/pages/game/iterate/index.scss`

需要完成：

1. 页面加载时创建或恢复 `entryMode=iterate`
2. 透传 `sourceGameId`
3. 页面主体从旧 textarea 主链切换到会话主链
4. 旧 textarea 降级为兜底方案

验收标准：

1. 迭代页面不再直接调用老式 iterate 接口作为主入口
2. 会话结束后通过 `generateFromCreationSession()` 发起优化

---

## 5.5 第五阶段：fork 页面切换到会话主链

目标：

- 复刻页不再直接 fork 后跳 iterate，而是先进入 fork 会话

涉及文件：

- `src/pages/game/fork/index.jsx`
- `src/pages/game/fork/index.scss`

需要完成：

1. 点击主按钮时创建 `entryMode=fork`
2. 透传 `sourceGameId`
3. 显示针对原作品的会话草案和追问
4. 生成成功后进入新作品

验收标准：

1. 复刻主链路不再直接调用 `forkGame()`
2. fork 页与 create / iterate 复用同一套会话组件

---

## 5.6 第六阶段：错误态、埋点、恢复逻辑完善

目标：

- 让动态创作会话达到可上线质量

需要完成：

1. 细化错误态：
   - revision conflict
   - session expired
   - session abandoned
   - generate failed
   - restore failed
2. 统一埋点事件
3. 清理重复恢复逻辑
4. 统一状态机入口

验收标准：

1. 错误文案可区分
2. 页面刷新和返回恢复稳定
3. 埋点字段完整

---

## 6. 状态模型设计

建议在 store 中显式区分两个层次：

### 6.1 creation session 层

核心字段：

1. `creationSession`
2. `creationSession.status`
3. `creationSession.entryMode`
4. `creationSession.planDraft`
5. `creationSession.currentQuestion`
6. `creationSession.confidenceSummary`
7. `creationSession.questionStrategy`
8. `creationSession.missingRequired`
9. `creationSession.revision`

### 6.2 generation task 层

复用现有字段：

1. `currentTask`
2. `currentTaskEvents`
3. `generationProgress`
4. `currentGame`

### 6.3 页面最终渲染态

页面层不再自己拼很多布尔值，建议通过 selector 导出统一 flow stage：

1. `idle`
2. `collecting`
3. `ready_to_generate`
4. `generating`
5. `completed`
6. `failed`
7. `expired`
8. `abandoned`

---

## 7. 风险与控制策略

### 7.1 文档与代码现状不一致

风险：

- 原始适配文档高估了当前已完成度

控制策略：

- 以仓库代码为准推进
- 每阶段完成后补充文档回写

### 7.2 create 页面恢复逻辑已经较分散

风险：

- 直接接入 session 后可能出现多个恢复入口互相覆盖

控制策略：

- 优先把恢复逻辑收口到 store action
- 页面只发起一次恢复，不自己拼流程

### 7.3 后端字段可能存在命名变体

风险：

- 后端 snapshot 字段名与文档略有差异

控制策略：

- normalize 层尽量做兼容
- 页面和 store 只消费 normalize 后的稳定结构

---

## 8. 第一阶段实施清单

本轮立即实施以下内容：

1. 新增 creation session API 封装
2. 新增 creation session normalize
3. 在 store 中新增 creation session 状态和 actions
4. 保持现有页面链路不变

本轮明确不做：

1. create 页面 UI 切换
2. iterate 页面 UI 切换
3. fork 页面 UI 切换
4. creation 通用组件层

---

## 9. 第一阶段完成定义

满足以下条件即可视为第一阶段完成：

1. 前端代码已具备创建 / 获取 / 回答 / 跳过 / 放弃 / 生成 creation session 的能力
2. session 生成成功后能无缝进入现有任务跟踪链路
3. 当前页面行为保持稳定，不因新状态接入而退化
4. 第二阶段开始时不需要再改服务层契约和 store 主模型

---

## 10. 后续协作建议

建议后续按如下方式推进：

1. 第一阶段完成后，先只改 create 页面
2. create 页面验收通过后，再迁移 iterate
3. fork 最后迁移，因为业务链路改动最大

这样可以把风险集中在一条主链上逐步收敛，而不是三条入口同时重构。
