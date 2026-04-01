# GameVallies 游戏创建、迭代与 Fork 完整流程

---

## 一、创建游戏（Create）

### 入口
- 页面：`/pages/create/index.jsx`
- 底部 TabBar 第 3 个 Tab（activeIndex=2）

### 完整流程

#### 第一阶段：用户输入创意

1. 用户进入创建页面，首先检查登录状态（`ensureCreateAccess()`），未登录则跳转登录页
2. 页面展示表单：
   - **游戏名称**（可选，最多 30 字）
   - **游戏创意描述**（必填，最少 5 字，最多 2000 字）
   - **屏幕方向选择**（竖屏 portrait / 横屏 landscape）
3. 页面底部提供 6 个示例 Prompt（贪吃蛇、打地鼠、2048 等），点击可直接填入描述框

#### 第二阶段：创作会话（Creation Session）—— AI 追问补全

4. 用户点击 **"开始创作会话"** 按钮，触发 `handleSubmit()`
5. 调用 API：`POST /api/v1/games/creation-sessions`，参数包含 prompt、title、orientation
6. 后端返回 Creation Session Snapshot，状态为 `initializing`
7. 页面进入 **"AI 正在分析"** 等待界面：
   - **WebSocket 监听**：`session:updated` / `session:error` 事件
   - **轮询兜底**：每 2 秒 `GET /api/v1/games/creation-sessions/:id`，最多 15 次（30 秒）
8. 后端分析完成后，Session 状态变为 `collecting`，页面切换到 **对话追问界面**：
   - 展示 AI 生成的 **方案草案**（planDraft）：玩法定位、核心交互、目标设计、节奏结构、视觉方向、记忆点
   - 展示 **追问策略**（confidenceSummary）：整体理解把握度、已明确/待确认的维度
   - 展示 **当前对话历史**（最近 6 条 messages）
   - 展示 **当前问题**（currentQuestion）
9. 用户可以：
   - **回答问题**：输入文字后点击"提交回答"，调用 `POST /api/v1/games/creation-sessions/:id/messages`
   - **跳过问题**：点击"跳过此题"，调用 `POST /api/v1/games/creation-sessions/:id/skip`
   - **直接生成**：点击"直接生成初稿"，跳过剩余追问直接进入生成
   - **重新开始**：放弃当前会话，调用 `POST /api/v1/games/creation-sessions/:id/abandon`

#### 第三阶段：游戏生成（Generation Pipeline）

10. 用户点击"开始创作"或"直接生成初稿"，触发 `handleGenerateFromSession()`
11. 调用 `gameStore.generateFromCreationSession(sessionId, options)`
12. Store 内部调用 API：`POST /api/v1/games/creation-sessions/:id/generate`
13. 后端返回 `generatedGameId` 和 `generationTaskId`
14. 进入 **Pipeline 进度追踪**（`_beginTaskTracking`）：
    - 展示 **PipelineOrbit 动态进度组件**
    - 8 个显示阶段：
      | 阶段 Key | 标签 | 进度 |
      |---|---|---|
      | submitting | 提交创作请求 | 5% |
      | spec_build | 构建游戏规格 | 15% |
      | runtime_profile_select | 选择运行时模板 | 30% |
      | contract_compose | 组装运行时约束 | 40% |
      | logic_generate | 生成游戏逻辑 | 60% |
      | contract_qa | 合约校验与修复 | 76% |
      | runtime_simulation_qa | 运行时模拟校验 | 92% |
      | completed | 生成完成 | 100% |
    - **实时更新方式**：
      - WebSocket 监听：`gen:progress`、`gen:complete`、`gen:error`
      - 轮询 Task 状态：每 4 秒 `GET /api/v1/games/tasks/:taskId`
      - 轮询 Task 事件：每 2.5 秒 `GET /api/v1/games/tasks/:taskId/events`
    - **超时处理**：30 分钟后自动标记为 `timed_out`
    - 用户可随时点击 **"取消任务"**，调用 `POST /api/v1/games/tasks/:taskId/cancel`
    - 任务状态会持久化到本地存储，下次进入页面可自动恢复

#### 第四阶段：完成

15. Task 状态变为 `succeeded` 或 `completed` 后：
    - 通过 `loadGameWithRetry(gameId)` 加载游戏数据（最多重试 3 次）
    - 更新配额信息（`quotaStore.updateAfterCreate`）
    - 600ms 延迟后结束生成动画
16. 页面切换到 **完成界面**：
    - 显示游戏标题和状态
    - 操作按钮：
      - **"试玩游戏"**：打开游戏播放器（需 canPlay=true）
      - **"订阅后试玩"**：弹出付费墙（canPlay=false 时）
      - **"继续优化"**：跳转到 Iterate 页面
      - **"再创一个"**：重置所有状态，回到输入表单

#### 备选路径：直接生成（无 Session 模式）

- Store 中还保留了 `createGame(description, title, options)` 方法
- 直接调用 `POST /api/v1/games/generate`，跳过 Creation Session 的追问环节
- 后续的 Pipeline 追踪流程与上面完全一致

---

## 二、迭代游戏（Iterate）

### 入口
- 页面：`/pages/game/iterate/index.jsx`
- 来源：创建完成页点击"继续优化"、个人中心"我的作品"页面、游戏详情页（自己的作品）点击"继续优化"
- URL 参数：`gameId`（必需）、`taskId`（可选，用于恢复正在进行的迭代任务）

### 完整流程

#### 第一阶段：页面初始化

1. 检查登录状态，未登录则记录目标 URL 后跳转登录页
2. **Bootstrap 阶段**：
   - 如果 URL 带 `taskId`：调用 `restorePersistedTask` 恢复正在进行的迭代任务
   - 如果只有 `gameId`：通过 `GET /api/v1/games/:id` 加载游戏数据
3. 检查是否有可恢复的迭代会话：
   - 调用 `GET /api/v1/games/creation-sessions/active`
   - 如果存在 `entryMode=iterate` 且 `sourceGameId` 匹配的活跃会话 → 展示 **恢复确认界面**（CreationResumeScene）
   - 用户选择"继续上次"或"重新开始"

#### 第二阶段：用户描述优化方向

4. 页面展示 **"当前底稿"** 参考卡片：游戏标题、版本号、状态、类型、质量分、最近更新时间
5. 用户在输入框描述本轮想优化的方向（如"保留核心玩法但节奏更快"）
6. 页面提供 3 个建议示例，点击可快速填入
7. 点击 **"开始这轮优化对话"** 按钮，触发 `handleStartIterateSession()`

#### 第三阶段：创作会话（与创建流程类似的 AI 追问）

8. 调用 `startCreationSession(feedback, title, { entryMode: 'iterate', sourceGameId, orientation, generationTier })`
9. 内部 API：`POST /api/v1/games/creation-sessions`，带上 `entryMode: 'iterate'` 和 `sourceGameId`
10. 进入与创建流程相同的 **AI 追问对话**（CreationSessionScene 组件）：
    - 回答问题（answerCreationSessionQuestion）
    - 跳过问题（skipCreationSessionQuestion）
    - 直接开始优化（generateFromCreationSession）
    - 重新开始（abandonCreationSession + resetCreationSessionState）

#### 第四阶段：优化生成

11. 调用 `generateFromCreationSession(options)`，触发与创建相同的 Pipeline
12. 页面展示 **PipelineOrbit 优化进度**，阶段与创建完全一致
13. 用户可取消任务

#### 第五阶段：完成

14. 任务成功后加载新版本游戏数据
15. 用户可继续试玩、查看详情，或发起新一轮优化

---

## 三、Fork 游戏（复刻）

### 入口
- 页面：`/pages/game/fork/index.jsx`
- 来源：游戏详情页（他人的作品）点击"复刻后继续创作"
- URL 参数：`sourceGameId`（必需）

### 前置条件
- 用户必须已登录
- 原作品 **不能** 是自己的作品（`isOwnGame` 为 false）
- 原作者 **已开放复刻权限**（`game.allowFork !== false`）

### 完整流程

#### 第一阶段：页面初始化

1. 检查登录状态，未登录则记录目标 URL 后跳转登录页
2. 通过 `GET /api/v1/games/:sourceGameId` 加载原作品数据
3. 展示原作品信息卡片：标题、作者、描述、试玩/点赞/复刻数
4. 检查是否有可恢复的 Fork 会话：
   - 调用 `GET /api/v1/games/creation-sessions/active`
   - 如果存在 `entryMode=fork` 且 `sourceGameId` 匹配的活跃会话 → 展示 **恢复确认界面**
   - 用户选择"继续上次"或"重新开始"

#### 第二阶段：用户描述改造方向

5. 页面引导用户说明想保留什么、改变什么
6. 提供 3 个建议示例（如"保留核心玩法但换赛博风"）
7. 点击 **"开始这轮新版本对话"** 按钮，触发 `handleStartForkSession()`

#### 第三阶段：创作会话（AI 追问）

8. 调用 `startCreationSession(answer, sourceTitle, { entryMode: 'fork', sourceGameId, orientation, generationTier })`
9. 内部 API：`POST /api/v1/games/creation-sessions`，带上 `entryMode: 'fork'` 和 `sourceGameId`
10. 进入与创建/迭代相同的 **AI 追问对话**

#### 第四阶段：生成复刻作品

11. 调用 `generateFromCreationSession(options)`，触发 Pipeline
12. 页面展示 **PipelineOrbit 复刻进度**
13. 用户可取消任务

#### 第五阶段：完成

14. 任务成功后，新作品归属当前用户
15. 页面展示完成界面，显示新作品信息
16. 操作按钮：**"继续优化这版作品"** → 跳转到 Iterate 页面

---

## 四、三种模式对比

| 维度 | 创建（Create） | 迭代（Iterate） | 复刻（Fork） |
|---|---|---|---|
| **entryMode** | `create` | `iterate` | `fork` |
| **sourceGameId** | 无 | 当前游戏 ID | 原作品 ID |
| **页面入口** | TabBar"创作" | 完成页/我的作品/详情页 | 他人作品详情页 |
| **权限要求** | 登录 | 登录 + 拥有该游戏 | 登录 + 作者开放复刻 |
| **API 起点** | creation-sessions | creation-sessions | creation-sessions |
| **生成 Pipeline** | 完全相同 | 完全相同 | 完全相同 |
| **结果归属** | 新作品，属于当前用户 | 更新现有作品版本 | 新作品，属于当前用户 |
| **完成后操作** | 试玩/优化/再创一个 | 试玩/查看详情/再优化 | 继续优化新版本 |

---

## 五、核心 API 总览

| API | 方法 | 用途 |
|---|---|---|
| `/api/v1/games/generate` | POST | 直接生成游戏（无 Session 模式） |
| `/api/v1/games/creation-sessions` | POST | 创建创作会话（create/iterate/fork 共用） |
| `/api/v1/games/creation-sessions/active` | GET | 获取当前活跃的创作会话 |
| `/api/v1/games/creation-sessions/:id` | GET | 获取指定创作会话详情 |
| `/api/v1/games/creation-sessions/:id/messages` | POST | 向会话追加用户回答 |
| `/api/v1/games/creation-sessions/:id/skip` | POST | 跳过当前问题 |
| `/api/v1/games/creation-sessions/:id/generate` | POST | 从会话开始生成游戏 |
| `/api/v1/games/creation-sessions/:id/abandon` | POST | 放弃会话 |
| `/api/v1/games/:id` | GET | 获取单个游戏详情 |
| `/api/v1/games/:id/iterate` | POST | 直接迭代游戏（旧接口，无 Session） |
| `/api/v1/games/:id/fork` | POST | 直接 Fork 游戏（旧接口，无 Session） |
| `/api/v1/games/:id/generation-status` | GET | 获取游戏的生成任务状态 |
| `/api/v1/games/tasks/:taskId` | GET | 查询任务详情 |
| `/api/v1/games/tasks/:taskId/events` | GET | 查询任务事件流 |
| `/api/v1/games/tasks/:taskId/cancel` | POST | 取消任务 |

---

## 六、关键技术实现

### 状态管理
- 使用 **Zustand** (`useGameStore`) 统一管理创建/迭代/Fork 的全局状态
- 关键状态字段：`isGenerating`、`generationProgress`、`currentGame`、`currentTask`、`creationSession`

### 任务追踪
- **WebSocket**（Socket.IO）实时推送 + **HTTP 轮询**双保险
- 本地存储持久化（`gamevallies_active_generation_task`），支持页面刷新后恢复
- 跟踪列表（`gamevallies_tracked_generation_tasks`），最多保留 20 条

### 进度展示
- 后端原始阶段通过 `DISPLAY_STAGE_KEY_ALIASES` 映射到 8 个展示阶段
- `buildProgressFromTask()` 统一计算当前阶段索引、百分比和标签

### Creation Session 生命周期
```
创建(POST) → initializing → [WS/轮询等待] → collecting → [多轮追问] → ready → generate → generating → completed
                                                  ↓                       ↓
                                              abandoned              failed/expired
```
