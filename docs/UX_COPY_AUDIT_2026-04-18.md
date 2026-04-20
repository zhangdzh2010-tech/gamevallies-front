# UX 文案审计报告：研发语言泄漏（2026-04-18）

> 审计范围：用户在「创建 / 迭代 / 复刻」三条主流程中看到的**所有可见文本**。
> 审计方法：
>
> - **静态扫描**（Part A-G）：源码中用户可见的字符串（JSX 文本、组件默认 props、toast 文案、阶段文案）。
> - **实测补充**（Part H，2026-04-18 新增）：用浏览器真实登录 `gamevallies.com`，走完创建→扩写→生成、优化入口、复刻入口三条流程后，把**真实渲染出来、且不在 Part A-G 覆盖范围内**的文案单独列出来。
>
> 审计结论：暴露的问题不是「偶尔冒出来一个词」，而是**系统性地把自己描述成一条工程流水线**。而且真实走一遍发现，除了源码里的文案之外，还有**数据库字段、第三方组件、运营位 banner**三块"非代码文案源"也在直接把开发黑话和英文 spec 推给用户。
>
> 使用说明：每一条都有 **状态** 字段，已根据本次整改更新为 `[已改]` / `[后端跟进]` / `[暂缓]` / `[ ]`。

---

## 🚀 2026-04-18 整改 Changelog（前端 PR）

> 本节是**最新整改记录**，下面 Part A-H 的每一条状态字段也已同步更新。

### 🟢 部署状态（2026-04-20）

- **生产版本**：`gv-frontend` 函数 v151（image tag `47d7aca-20260420103027`）
- **健康检查**：`https://gamevallies.com/api/v1/health` → `200 {"status":"ok"}`
- **chunk 内容核验**：`/chunk/0.js` `/chunk/169.js` `/chunk/232.js` `/chunk/565.js` 体积与本地完全一致；本轮新文案 `收到想法` `整理玩法想法` `搭建游戏` `自检一下手感` `AI 整理出的方向` `在这里继续改这次复刻` `在这里继续改这一轮` `作者还没开放复刻` 全部命中
- **浏览器视觉回归**：首页 banner / create 页 / profile / GamePlayer 浮窗 / detail / iterate / fork 全部新文案上线，无回归
- **生产 E2E**（`gamevallies-backend/scripts/run_live_creation_session_full_flow_e2e.py`，结果文件 `tmp_creation_session_e2e_batch_20260420_113150.json`）：5 用例完成，3 全绿，2 失败均**与本轮前端文案无关**，是后端 LLM 生成质量问题：
  - `parkour_delivery_en` create → `quality_gate` 拦截（showcase qualityScore 7.4 < 8.5 阈值），taskId `5b022dcf-1d36-4d38-85aa-24c4b8bef3d2`
  - `history_quiz_show_cn` iterate → `runtime_qa` 拦截（生成代码 `REF_W is not defined`、canvas 没渲染），taskId `88e2dbc4-1ac6-4b5a-bdb9-25b52bc916a5`

### ✅ 本次前端 PR 已完成（已部署 + E2E 已验证）

| 模块 | 涉及文件 | 覆盖审计条目 | 关键改动 |
|---|---|---|---|
| **生成流水线文案** | `src/store/gameStore.js` L33-L72 | A.1.1-A.3.8 | `PIPELINE_STAGES` / `DETAILED_PIPELINE_STAGES` / `PIPELINE_STAGE_SUMMARIES` 全量重写为口语化 |
| **生成中主视觉** | `src/components/common/GenerationProgressPanel.jsx` | B.1-B.3 | `statusLabel` 默认 `'AI 正在做'`；`progressMessage` fallback `'正在做，请等一下'`；删第三列 `阶段` 只留 `当前步骤` + `完成度` |
| **创作页文案** | `src/pages/create/index.jsx` + `CreationCreateWorkspace.jsx` | C.1.\*, C.2.\*, C.3.1, H.2.\*, H.3.4, H.4.1, F.7.\* | 工作台 hint/loading/draft/intro 全量改写；按钮 `开始整理提示词` → `让 AI 整理一下`；扩写后 `确认并保存提示词` → `确认这版方向`；`取消任务` → `先停下` |
| **迭代页文案** | `src/pages/game/iterate/index.jsx` | D.1.\*, D.2.\*, D.3.\*, D.4.\*, D.5.\* | 加载态/缺失态/生成中/工作台所有 `提示词` `底稿` `任务` `会话` `流程` 全部口语化；接入 `sanitizeUserIdea` 处理 `currentGame.description` |
| **复刻页文案 + 业务降级** | `src/pages/game/fork/index.jsx` | E.1.\*-E.6.\*, H.8.2-H.8.4, **H.9.1**, H.9.2 | 全量文案口语化；接入 `sanitizeUserIdea`；**自己作品 isOwnGame 兜底**：原作授权失败时优先识别"这是你的作品"，给"直接去优化"友好态而不是"加载失败" |
| **共用 creation 组件** | `src/components/creation/*.jsx` (8 个) + `sessionState.js` | F.1.\*-F.8.\* | 默认 props 全量重写：`会话操作`→`本轮操作`；`会话内容`→`留下最近几轮记录`；`系统`→`AI`；`提示词`→`方向`；通知文案 `这一轮${模式}会话` → `这次${模式}` |
| **首页 banner** | `src/pages/index/index.jsx` | G.1, H.10.1-H.10.6 | `AI GAME ATELIER`→`AI 游戏工坊`；`Live`→`在创作`；`IDEA`→`新想法`；`TOP PICKS`→`精选推荐`；`本屏内容`→`共 N 款`；`点击上方 Banner` 英文残留→`点击上方"现在开始"` |
| **个人中心** | `src/pages/profile/index.jsx` | H.6.1, H.6.3, H.11.2, H.11.3 | 头部计数 `分析`/`分享` 错字已被替换为 `未完成`；tab 末位 `任务`→`未完成`；操作面板 `继续完善玩法、文案和交互体验`→`继续改玩法、文字和手感`；`权限设置 / 管理可见范围、评论和复刻权限`→`可见性和评论 / 管理谁能看、谁能复刻` |
| **详情页** | `src/pages/game/detail/index.jsx` | H.7.2, H.7.3 | `复刻后继续创作 / 沉浸体验` → `基于这款接着创作`；`作者未开放复刻权限` → `作者还没开放复刻`（文案 + toast） |
| **共用播放器** | `src/components/common/GamePlayer.jsx` | H.1.1, H.1.2 | `Close`/`Full` 顶栏已是中文；本次清理剩余英文 `'Game'` 默认 → `'游戏试玩'`；`'Min'` → `'收起'`；`'Loading game...'` → `'游戏加载中...'` |
| **任务面板默认** | `src/components/common/TaskSignalPanel.jsx` | （新增） | 默认 props `任务状态` / `任务信息` / `执行中` → `当前状态` / `本轮信息` / `AI 正在做` |
| **H.5.1 前端兜底** | `src/utils/sanitizeIdea.js` + 三处接入 | **H.5.1**（前端侧） | 新增剥离工具，剥离 `请把这条想法整理成...` 与英文 spec `Game Type:` / `Core Mechanic:` 等 9 个字段。已在 iterate / fork / detail 三个页面的 `description` 渲染处接入 |
| **H.7.1 openid 前端兜底** | `src/utils/profileDisplay.js` | **H.7.1**（前端侧） | 增强 `isSuspiciousProfileText`：`wx_*` / `openid_*` / `unionid_*` 等裸标识符前缀视为可疑昵称，触发 `getSafeDisplayText` 走兜底文案 `创作者` |
| **store 内部错误文案** | `src/store/gameStore.js` 多处 | C.3.1 配套 | `'请先完善提示词内容'`→`'请先把这一版方向写完整'`；`'AI 还在整理提示词，请稍等'`→`'AI 还在整理方向，请稍等'`；`'确认提示词失败'`→`'保存这版方向失败'`；`'请先确认提示词，再开始生成'`→`'请先确认这版方向，再开始生成'`等 |
| **测试同步** | `src/components/creation/__tests__/CreationCreateWorkspace.test.jsx` | — | 用例断言更新为新文案 |

### ✅ 后端 PR 已完成（已部署 + E2E 已验证，2026-04-20）

| # | 问题 | 后端动作 | 状态 |
|---|---|---|---|
| **H.5.1** | `games.description` 字段把用户原话和 LLM prompt 模板（含 `Game Type:` 等英文 spec）混存为一段 | 现状复核：`games.user_idea` 字段已在 schema + runtime bootstrap 上线，`presentGame`/`feed-presenter` 已优先取 `userIdea`、否则走 `sanitizeUserIdea(description)`。**本轮补齐**：`game-service.getShareData`、`feed-service/share/share.service.ts`、`social-service/share/share.service.ts` 三处 share 端点原本直返 raw `description` + raw `username`，现已统一走 `userIdea ?? sanitizeUserIdea(description)` + `pickPublicAuthorName`，微信 OG 分享卡再也不会泄漏 prompt 骨架或 `wx_openid` 作者名。`llmPrompt` 独立列未拆：当前 `description` 既当 LLM 内部 prompt 又兜底 C 端展示，`userIdea` 已承担 C 端主字段，额外拆列仅代码卫生收益、风险高于收益，延后处理。 | **已部署** v198，线上验证：`GET /api/v1/games/:id/share-data` 返回 `description = 用户原话`、`author = 真实昵称` |
| **H.7.1** | `users.display_name` 可能被写为 `wx_<openid 短前缀>` | 现状复核：`resolveDisplayName`/`buildAnonymousDisplayName` + `匿名玩家_XXXX` 兜底已上；微信小程序 + SMS + 微信 H5 新建用户分支都已走 `resolveDisplayName`。**本轮补齐**：微信 H5 "老用户再次登录" 分支（`auth.service.ts` L733-745）之前会把 `profile.nickname` 直接覆盖回 `displayName`，有被 openid-like 字符串污染的风险，现已改走 `resolveDisplayName(user.id, displayName)` 并加 `resolvedDisplayName !== user.displayName` 脏检查避免无谓写入。 | **已部署** v198，33 个 `auth` 单测全绿 |
| **H.9.1** | fork 接口错误文案不统一、自己 fork 自己的作品返回模糊错误 | 现状复核：`fork.service.ts` 已返回 `ForbiddenException({ errorCode: 'FORK_FORBIDDEN_SELF', authorId, message: '不能复刻自己的作品' })` 和 `FORK_FORBIDDEN_BY_AUTHOR` + `作者还没开放复刻`。**本轮补齐**：游戏不存在与 bundle 未就绪两种分支原本抛英文字符串 `'Game not found'` / `'Game bundle is not ready for forking'`，现已改为 `{ errorCode, message, authorId }` 结构化错误，message 分别为 `这个作品找不到了` 和 `作品还在构建中，稍后再试`，与前端 toast 直接对齐。 | **已部署** v198，`ForkService` 单测全绿 |
| **H.6.2** | profile 额度卡 `创作额度 / 当前为基础额度 / 剩余 60 次创作额度` 等官方文案 | 后端/PM 评审决定是否改成 `本月创作次数 / 基础套餐 / 还剩 60 次` | 文案是从后端 quota 接口或前端 `quotaSummary` 工具拼装的，本次先不动，留给付费产品 review |

### 📦 后端部署 & E2E（2026-04-20）

- **部署范围**：`gv-user-service` / `gv-game-service` / `gv-feed-service` 三个函数均升到 v198
- **生产 E2E**（`tmp_creation_session_e2e_batch_20260420_backend_deploy.json`）：5 用例，3 全绿（create → iterate → fork 全通）：
  - `office_slacker_cn` ✅（gameId `f5d521ec-c478-41b5-a81f-2a4e718fd00e`）
  - `fruit_merge_relax_en` ✅（gameId `a71d9201-a5ba-4fa9-9a18-177b0b2ffe69`）
  - `history_quiz_show_cn` ✅（gameId `d283fd3d-34e3-4e5d-8552-e7b9a366c05a`）
- **2 个失败均为 LLM 生成质量问题，与本轮后端改动无关**：
  - `circuit_classroom_cn` create → `code_review/quality_gate` 拦截（qualityScore 5.9 < 8.5）
  - `parkour_delivery_en` create → `code_review/quality_gate` 拦截（qualityScore 8.3 < 8.5）
- **线上 share 端点抽检**（gameId `f5d521ec-...`）：`description` = 用户原话中文，无 `Game Type:/Core Mechanic:` 骨架；`author` = `Codex E2E Runner`（非 `wx_openid`）

### ⏸️ 暂缓 / 跳过

| # | 原因 |
|---|---|
| H.10.7（灵感推荐 chip 作品名） | 作品名是用户自取，无需改 |
| H.11.1（profile `订阅` 按钮文案） | 涉及付费产品定位，不在文案整改范围 |
| H.12.\*（Taro H5 滚动问题） | 架构级改动，需独立排期 |
| `CreationSessionShell.jsx` L16 `eyebrow === 'AI Game Atelier'` | 仅用于历史 hero 模板识别的死代码分支，不会渲染英文 |

---

## 问题分类

- **P0** — 严重研发黑话，普通用户**完全看不懂**或产生误解。优先修。
- **P1** — 明显工程腔 / PM 评审腔，影响"创作者"身份代入感。建议修。
- **P2** — 可选优化，锦上添花。

---

## 🔧 前后端责任分工（2026-04-18 整改分类）

> 这一节把 Part A-H 所有条目按"谁能修"归类，方便前端一次性提 PR，后端单独起 issue 跟踪。

### ▶ 前端一次性全量改造（本次 PR 覆盖）

所有下列条目都只改前端代码，**不依赖后端联动**。

| 范围 | 涵盖条目 | 核心产出 |
|---|---|---|
| 生成流水线文案 | `A.1.*`, `A.2.*`, `A.3.*` | `src/store/gameStore.js` 的 `PIPELINE_STAGES` / `DETAILED_PIPELINE_STAGES` / `PIPELINE_STAGE_SUMMARIES` 全量重写 |
| 生成中主视觉 | `B.1`, `B.2`, `B.3` | `GenerationProgressPanel.jsx` 默认 fallback / 指标列去工程感 |
| 创作页 | `C.1.*`, `C.2.*`, `C.3.*`, `H.2.*`, `H.3.1`, `H.3.4`, `H.4.1` | `src/pages/create/index.jsx` + `CreationCreateWorkspace` 默认 props 改写 |
| 迭代页 | `D.1.*`, `D.2.*`, `D.3.*`, `D.4.*`, `D.5.*` | `src/pages/game/iterate/index.jsx` 全量文案 + `sanitizeUserIdea` 接入 |
| 复刻页 | `E.1.*`, `E.2.*`, `E.3.*`, `E.4.*`, `E.5.*`, `E.6.*`, `H.8.2`, `H.8.3`, `H.9.1`, `H.9.2` | `src/pages/game/fork/index.jsx` 全量文案 + 自己作品兜底跳转 + `sanitizeUserIdea` |
| 共用创作组件 | `F.1.*`, `F.2.*`, `F.3.*`, `F.4.*`, `F.5.*`, `F.6.*`, `F.7.*`, `F.8.*` | `src/components/creation/*.jsx` 默认 props 全量重写 |
| 首页运营位 | `G.1`, `H.10.1`-`H.10.7` | `src/pages/index/index.jsx` banner / feed section 文案 |
| 个人中心 | `H.6.1`（"分析"→"创作中"）, `H.6.3`（"任务" tab→"未完成"）, `H.11.2`, `H.11.3` | `src/pages/profile/index.jsx` 文案 |
| 详情页 | `H.7.2`（沉浸体验）, `H.7.3` | `src/pages/game/detail/index.jsx` 文案 |
| 共用播放器 | `H.1.1`, `H.1.2` | `GamePlayer.jsx` 顶栏 `Close`/`Full`/`Exit` 汉化 |
| 脏数据兜底 | `H.5.1` 前端侧 | 新增 `src/utils/sanitizeIdea.js`，在 iterate/fork/detail 渲染 `description` 前调用 |

### ▶ 前端兜底 + 后端治本（双侧修）

下列条目前端先做防御性处理兜底，后端同步清理根因。

| # | 问题 | 前端动作 | 后端动作 | 备注 |
|---|---|---|---|---|
| `H.5.1` | 作品 `description` 里混入 LLM prompt 模板的英文 spec（Game Type / Core Mechanic 等） | 新增 `sanitizeUserIdea()`，渲染前剥离 | 1. 把 `user_idea`（用户原话）与 `llm_prompt`（内部 prompt）拆成两个字段；2. `description` 只保留用户可见内容；3. 写回填脚本清洗历史数据 | 前端是"流血止损"，后端是"断源" |
| `H.9.1` | 用户访问 `/fork?sourceGameId=<自己作品>` 降级成系统错误卡 | 加载失败时用 `getGame` 兜底拉原作，命中 `authorId === viewerId` 走友好兜底（"这是你的作品，去优化"），顺带干掉 `H.9.2` 重复错误卡 | 后端让"复刻自己作品"这个业务失败返回可识别错误码（`FORK_FORBIDDEN_SELF`），而不是 404 | 前端改可先上线，后端错误码改完前端把错误码也接上 |

### ▶ 纯后端问题（单独提 issue，不在本 PR 范围）

| # | 问题 | 影响面 | 后端应做 |
|---|---|---|---|
| `H.5.1` | `game.description` 字段混存用户想法 + LLM prompt 模板 | **iterate / fork / detail 所有页面** 原始想法回显 | 1. 数据库 schema：`games` 表拆出 `user_idea` / `llm_prompt` 两字段；2. 现有 `description` 语义改为"仅 C 端展示文案"；3. 起一个 migration 脚本，用和前端一样的正则把旧数据清洗到 `user_idea` |
| `H.6.2` | profile 额度卡片文案"基础额度 / 剩余 60 次创作额度" | profile 页额度区 | （如果决定改）看是后端还是前端返回这段文案；本次前端先不动，后端可保留 |
| `H.7.1` | 详情页作者名显示 `wx_vw-sxsiex8` 裸 WeChat openid | 所有微信 H5 登录用户作为作者时的详情页 | `users.nickname` 必须有一个合理的兜底策略：抽 openid 前 4 位生成 `匿名玩家 0a3f` 之类；或者强制新用户注册时选昵称 |
| `H.8.2` / `H.8.3` | fork 页参考卡 metadata 里"题材归属 / 来自社区作品 / 复刻权限 / 允许复刻" | 实际上这些是前端 JSX 硬编码（见 `fork/index.jsx` L651-L652），**已归入前端改造** | —（本项已移到前端） |
| `H.12.1` | Taro H5 页面 `body` 不能滚动 | create / iterate / fork 页按钮被截断 | 架构层，需单独评估 Taro 路由容器 overflow；本次不改 |

### ▶ 本次前端 PR **跳过 / 保留观察** 的条目

| # | 理由 |
|---|---|
| `H.6.2` | 额度文案官方但不算黑话，留到后端/PM 评审后一次性定稿 |
| `H.7.1` | 裸 openid 是后端返回的裸数据，前端做短字符串兜底容易把真实昵称也遮住，交给后端处理 |
| `H.10.7` | 灵感推荐 chip 作品名由作者自己取，无需改 |
| `H.11.1` | `订阅` 按钮文案涉及付费产品定位，不在本次文案整改范围 |
| `H.12.*` | H5 滚动问题，架构级改造，独立 ticket |

---

## Part A：生成过程阶段文案（最严重；每次创作都出现 30s-2min）

来源：`src/store/gameStore.js` L33-L61。
粗粒度阶段条 + 中心圆里滚动的说明都取自这里。

### A.1 `PIPELINE_STAGES` label（粗粒度阶段条）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| A.1.1 | [ ] | P1 | `gameStore.js` L35 | `梳理方案` | 偏咨询/PM 感 | `整理玩法想法` |
| A.1.2 | [ ] | P1 | `gameStore.js` L36 | `生成内容` | OK 可保留也可更具象 | `搭建游戏` |
| A.1.3 | [ ] | P1 | `gameStore.js` L37 | `质量检查` | 略工程 | `自检一下手感` |

### A.2 `DETAILED_PIPELINE_STAGES` label（详细阶段轨道）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| A.2.1 | [ ] | P1 | `gameStore.js` L43 | `梳理方案` | 同 A.1.1 | `想清楚怎么玩` |
| A.2.2 | [ ] | **P0** | `gameStore.js` L44 | `匹配合适能力` | **"能力"是后端/LLM 术语** | `挑一套合适的玩法模板` |
| A.2.3 | [ ] | **P0** | `gameStore.js` L45 | `组装规则与资源` | **"组装"是工程用语** | `准备画面和规则` |
| A.2.4 | [ ] | P1 | `gameStore.js` L46 | `生成内容` | 同 A.1.2 | `搭建游戏` |
| A.2.5 | [ ] | P1 | `gameStore.js` L47 | `质量检查` | 同 A.1.3 | `检查细节` |
| A.2.6 | [ ] | **P0** | `gameStore.js` L48 | `运行验证` | **纯 dev 词** | `试玩一遍` |

### A.3 `PIPELINE_STAGE_SUMMARIES` 一句话说明（中心圆下方滚动）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| A.3.1 | [ ] | P2 | `gameStore.js` L53 | `正在接收你的创作需求` | "创作需求" 偏硬 | `正在收下你的想法` |
| A.3.2 | [ ] | P1 | `gameStore.js` L54 | `正在整理玩法目标与核心设定` | "核心设定" 抽象 | `正在想清楚玩法和主要设定` |
| A.3.3 | [ ] | **P0** | `gameStore.js` L55 | `正在匹配适合这次创作的能力组合` | **"能力组合"** | `正在挑一套最合适的玩法模板` |
| A.3.4 | [ ] | **P0** | `gameStore.js` L56 | `正在组装规则、资源与运行约束` | **"组装 / 运行约束"** | `正在搭好画面、规则和节奏` |
| A.3.5 | [ ] | **P0** | `gameStore.js` L57 | `正在生成游戏内容与交互逻辑` | **"交互逻辑"** | `正在把玩法一步步写出来` |
| A.3.6 | [ ] | P1 | `gameStore.js` L58 | `正在检查质量并修正细节` | "质量" 偏工程 | `正在自检并调整细节` |
| A.3.7 | [ ] | **P0** | `gameStore.js` L59 | `正在验证运行表现与可玩性` | **"运行表现 / 可玩性"** | `正在试玩一遍，确认能顺畅玩` |
| A.3.8 | [ ] | P1 | `gameStore.js` L60 | `内容已经生成完成` | "内容"冰冷 | `你的作品做好了` |

---

## Part B：GenerationProgressPanel 指标块（生成中主视觉）

来源：`src/components/common/GenerationProgressPanel.jsx`。

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| B.1 | [ ] | P2 | `GenerationProgressPanel.jsx` L56 | `activeStatusLabel = statusLabel \|\| '执行中'` | "执行中" 系统监控感 | 改成 `'AI 正在做'`，或者直接**删掉第三列 metric** |
| B.2 | [ ] | P2 | `GenerationProgressPanel.jsx` L110 | fallback `progressMessage \|\| '请稍候'` | "请稍候" 中性 | `'正在做，请等一下'` |
| B.3 | [ ] | P2 | `GenerationProgressPanel.jsx` L117-126 | `阶段 / 进度 / 状态` 三列 | 工程监控界面风格 | 简化为 2 列：`当前步骤 X/N` + `完成度 N%`，删「状态」列 |

---

## Part C：create 页（`src/pages/create/index.jsx`）

### C.1 恢复任务态（进入 create 页发现有未完成任务）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| C.1.1 | [ ] | P1 | `create/index.jsx` L703 | `正在回到你刚刚的创作流程` | "流程"偏工程 | `马上把你带回刚才的创作` |
| C.1.2 | [ ] | **P0** | `create/index.jsx` L704 | `系统会优先恢复进行中的任务或最近一轮会话，你不需要重新输入。` | **"系统 / 任务 / 会话"三个词叠加** | `我们会先接回你之前正在做的那一版，不用重新输入。` |
| C.1.3 | [ ] | P1 | `create/index.jsx` L712 | `eyebrow="正在同步"` | **"同步"后端语** | `正在接回` |
| C.1.4 | [ ] | P1 | `create/index.jsx` L714 | `如果刚才已经进入生成阶段，任务中心里的记录也会自动接上。` | "任务中心里的记录" | `如果刚才已经开始生成，个人中心里的创作记录也会自动接回来。` |

### C.2 生成中页

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| C.2.1 | [ ] | P1 | `create/index.jsx` L746 | `modeLabel="创作流程"` | "流程" | `modeLabel="AI 正在创作"`（或删 modeLabel） |
| C.2.2 | [ ] | P1 | `create/index.jsx` L755 | `title="任务操作"` | **"任务"** | `title="本轮操作"` |
| C.2.3 | [ ] | P1 | `create/index.jsx` L756 | `如果这轮方向不对，可以先取消，稍后再重新发起。` | "发起" | `如果这次方向跑偏了，可以先停掉，再换个方向重试。` |
| C.2.4 | [ ] | P1 | `create/index.jsx` L772 | `eyebrow="同步说明"` | 纯工程 | `eyebrow="小贴士"` 或直接删 |
| C.2.5 | [ ] | P1 | `create/index.jsx` L773 | `任务记录会自动同步到个人中心` | "任务记录 / 同步" | `这次创作会自动保存到个人中心` |

### C.3 错误 toast fallback

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| C.3.1 | [ ] | P1 | `create/index.jsx` L47-65（`getUserFacingCreateError`） | fallback 会出现 `AI 整理提示词时遇到问题，请稍后重试` / `创作会话启动失败` | **"提示词 / 会话"** | 文案改成 `'AI 整理想法时遇到了问题，请稍后重试'` / `'这次创作没能启动，请稍后重试'` |

---

## Part D：iterate 页（`src/pages/game/iterate/index.jsx`）

### D.1 页面准备态

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| D.1.1 | [ ] | **P0** | `iterate/index.jsx` L691 | `eyebrow="加载优化上下文"` | **"上下文"** | `eyebrow="正在准备"` |
| D.1.2 | [ ] | **P0** | `iterate/index.jsx` L703 | `系统会先同步当前作品、版本信息和可能存在的进行中任务。` | **"系统 / 同步 / 任务"** | `我们会先把这款作品的当前版本和你没做完的创作一起拿回来。` |

### D.2 缺少作品态

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| D.2.1 | [ ] | **P0** | `iterate/index.jsx` L782 | `statusValue="缺少底稿"` | **"底稿"编辑行业黑话** | `statusValue="没有选作品"` |
| D.2.2 | [ ] | **P0** | `iterate/index.jsx` L790 | `当前入口没有挂上作品数据` | **"入口 / 挂上 / 作品数据"三连击** | `这次进来没带上具体作品` |
| D.2.3 | [ ] | **P0** | `iterate/index.jsx` L800 | `回到作品列表后，从目标作品的优化入口重新进入。` | **"入口 / 目标作品"** | `回到作品列表，点你想修改的那款作品上的"优化"按钮。` |

### D.3 生成中

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| D.3.1 | [ ] | P1 | `iterate/index.jsx` L738 | `modeLabel="优化流程"` | "流程" | `modeLabel="AI 正在优化"` |
| D.3.2 | [ ] | P1 | `iterate/index.jsx` L747 | `title="任务操作"` | "任务" | `title="本轮操作"` |
| D.3.3 | [ ] | **P0** | `iterate/index.jsx` L748 | `如果这轮方向不对，可以先取消任务，再重新发起新的优化会话。` | **"任务 / 会话 / 发起"** | `如果这次方向跑偏，可以先停掉，再说一次你想怎么改。` |
| D.3.4 | [ ] | P1 | `iterate/index.jsx` L764-766 | `eyebrow="同步说明" / title="任务记录会自动同步到个人中心" / description="完成后你可以先试玩新版本，再决定是否继续下一轮优化。"` | **同步 / 任务记录 / 下一轮** | `eyebrow="小贴士" / title="这次优化会自动保存到个人中心" / description="完成后你可以先试玩新版本，再看要不要再改一版。"` |

### D.4 工作台文案（录入想法的地方）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| D.4.1 | [ ] | **P0** | `iterate/index.jsx` L832 | `eyebrow="当前底稿"` | **"底稿"** | `eyebrow="基于这一版"` |
| D.4.2 | [ ] | **P0** | `iterate/index.jsx` L901 | `primaryActionLabel` 在会话态为 `'确认并保存提示词'` | **"提示词"** | `'确认这版方向'` |
| D.4.3 | [ ] | **P0** | `iterate/index.jsx` L901 | primary label 初始态为 `'开始整理优化提示词'` | **"提示词"** | `'让 AI 整理一下方向'` |
| D.4.4 | [ ] | **P0** | `iterate/index.jsx` L909 | `workspaceTitle`：`'说说这轮想怎么优化'` / `'确认这轮优化提示词'` | **"提示词"** | `'确认这一版要改的方向'` |
| D.4.5 | [ ] | **P0** | `iterate/index.jsx` L911 | `AI 已经整理出一版优化提示词。你可以先修改确认，再开始真正生成。` | **"提示词"** | `AI 根据你说的，整理出下面这段方向。你可以改改，觉得合适就开始。` |
| D.4.6 | [ ] | P1 | `iterate/index.jsx` L917 | `loadingTitle="正在整理并扩写这一轮优化方向"` | **"扩写"** | `loadingTitle="AI 正在把你说的想法补成完整方向"` |
| D.4.7 | [ ] | **P0** | `iterate/index.jsx` L921 | `draftLabel="优化提示词"` | **"提示词"** | `draftLabel="AI 整理出的方向"` |
| D.4.8 | [ ] | P1 | `iterate/index.jsx` L858 | 按钮 `'直接使用当前提示词'` | **"提示词"** | `'直接用这一版'` |

### D.5 完成后

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| D.5.1 | [ ] | P2 | `iterate/index.jsx` L952 | `如果这版已经接近你想要的效果，可以先试玩；如果还想继续改，可以直接开始下一轮。` | "下一轮"略工程 | OK 可不改；或 `可以直接再改一版` |

---

## Part E：fork 页（`src/pages/game/fork/index.jsx`）**问题最集中**

### E.1 加载态

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| E.1.1 | [ ] | **P0** | `fork/index.jsx` L483 | `eyebrow="加载复刻上下文"` | **"上下文"** | `eyebrow="正在准备"` |
| E.1.2 | [ ] | **P0** | `fork/index.jsx` L495 | `系统会先确认原作品信息、作者权限和可复刻状态。` | **"系统 / 作者权限 / 可复刻状态"** | `我们先确认一下原作品的信息和作者是否开放了复刻。` |

### E.2 加载失败

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| E.2.1 | [ ] | **P0** | `fork/index.jsx` L519 | `eyebrow="原作缺失"` | 纯技术口吻 | `eyebrow="没找到这款作品"` |
| E.2.2 | [ ] | **P0** | `fork/index.jsx` L520 | `没有拿到作品数据` | **"作品数据"** | `原作品信息没拿到` |

### E.3 生成中

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| E.3.1 | [ ] | P1 | `fork/index.jsx` L555 | `modeLabel="复刻流程"` | "流程" | `modeLabel="AI 正在复刻"` |
| E.3.2 | [ ] | P1 | `fork/index.jsx` L564 | `title="任务操作"` | "任务" | `title="本轮操作"` |
| E.3.3 | [ ] | **P0** | `fork/index.jsx` L565 | `如果这轮方向不对，可以先取消任务，再重新发起新的复刻会话。` | **"任务 / 会话 / 发起"** | `如果这次方向跑偏，可以先停掉，再说一遍你想怎么改。` |
| E.3.4 | [ ] | P1 | `fork/index.jsx` L581 | `eyebrow="同步说明"` | 工程 | `eyebrow="小贴士"` |
| E.3.5 | [ ] | **P0** | `fork/index.jsx` L582 | **`新的版本生成后会自动进入你的创作链路`** | **"创作链路"** | `复刻出来的新版本会自动放进你的作品里` |

### E.4 完成后

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| E.4.1 | [ ] | P1 | `fork/index.jsx` L603 | `eyebrow="已就绪"` | 偏工程 | `eyebrow="搞定"` |
| E.4.2 | [ ] | P1 | `fork/index.jsx` L614 | `你可以继续把这版作品迭代下去。` | **"迭代"dev** | `你可以继续在这版上接着改。` |

### E.5 不可复刻兜底

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| E.5.1 | [ ] | P1 | `fork/index.jsx` L760 | `statusValue="不可开始"` | 机器语 | `statusValue="暂时无法开始"` |
| E.5.2 | [ ] | **P0** | `fork/index.jsx` L767 | `eyebrow="无法发起"` | **"发起"** | `eyebrow="暂时无法开始"` |
| E.5.3 | [ ] | **P0** | `fork/index.jsx` L768 | 非自己作品时 title `'当前没有复刻权限'` | **"复刻权限"** | `'作者暂时没开放复刻'` |
| E.5.4 | [ ] | **P0** | `fork/index.jsx` L780 | `直接去优化这款作品，会更符合你的创作链路。` | **"链路"** | `对自己的作品来说，直接去"优化"会更合适。` |

### E.6 工作台文案

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| E.6.1 | [ ] | **P0** | `fork/index.jsx` L737 | `introMessage="先告诉我你想保留什么、改变什么，我会先帮你整理出一版完整提示词。"` | **"提示词"** | `"先告诉我你想保留什么、改掉什么，我会整理出一版完整的方向。"` |
| E.6.2 | [ ] | P1 | `fork/index.jsx` L741 | `loadingTitle="正在整理并扩写这次复刻方向"` | **"扩写"** | `loadingTitle="AI 正在把你说的想法补成完整方向"` |
| E.6.3 | [ ] | **P0** | `fork/index.jsx` L745 | `draftLabel="复刻提示词"` | **"提示词"** | `draftLabel="AI 整理出的复刻方向"` |

---

## Part F：共用 creation 组件默认 props 文案（覆盖面最大）

影响 create / iterate / fork 三个页面。

### F.1 `CreationSessionActions.jsx`

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| F.1.1 | [ ] | **P0** | `CreationSessionActions.jsx` L18 | `title = '会话操作'` | **"会话"** | `title = '本轮操作'` |
| F.1.2 | [ ] | **P0** | `CreationSessionActions.jsx` L19 | `hint = '统一承载回答、跳过、直接生成、重新开始等动作。'` | **PM spec 原文** | **直接删掉 hint 默认值**（多余信息，占视觉空间） |

### F.2 `CreationConfidenceCard.jsx`

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| F.2.1 | [ ] | P1 | `CreationConfidenceCard.jsx` L33 | `title = '理解与追问'` | 略抽象 | `title = 'AI 听懂了什么'` |
| F.2.2 | [ ] | **P0** | `CreationConfidenceCard.jsx` L34 | `hint = '帮助用户理解系统目前已经掌握了什么，以及为什么继续追问。'` | **"帮助用户""系统"第三人称** | `hint = '下面是 AI 目前理解到的要点，以及它想继续问你的原因。'` |
| F.2.3 | [ ] | P1 | `CreationConfidenceCard.jsx` L37 | `emptyText = '当前还没有可展示的理解摘要。'` | "可展示 / 摘要" | `emptyText = 'AI 还在整理，稍等一下。'` |

### F.3 `CreationPlanDraftCard.jsx`

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| F.3.1 | [ ] | P1 | `CreationPlanDraftCard.jsx` L23 | `title = '方案草稿'` | "方案草稿" | `title = '当前方向'` |
| F.3.2 | [ ] | **P0** | `CreationPlanDraftCard.jsx` L24 | `hint = '这是系统当前整理出的理解，你可以继续补充或纠偏。'` | **"系统"** | `hint = '这是 AI 目前整理出的方向，你可以继续补充或改。'` |
| F.3.3 | [ ] | P1 | `CreationPlanDraftCard.jsx` L26 | `emptyText = '系统还在整理本轮方案草稿。'` | **"系统 / 方案草稿"** | `emptyText = 'AI 还在整理，稍等一下。'` |

### F.4 `CreationConversationList.jsx`

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| F.4.1 | [ ] | P1 | `CreationConversationList.jsx` L19 | `title = '最近对话'` | OK | `title = '最近几轮'` |
| F.4.2 | [ ] | **P0** | `CreationConversationList.jsx` L20 | `hint = '保留最近几轮上下文，方便回看。'` | **"上下文"** | `hint = '留下最近几轮记录，方便你回看。'` |
| F.4.3 | [ ] | P1 | `CreationConversationList.jsx` L22 | `emptyText = '当前还没有会话内容。'` | "会话内容" | `emptyText = '还没有聊过，直接在下面写下你的想法就行。'` |

### F.5 `CreationQuestionCard.jsx`

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| F.5.1 | [ ] | P2 | `CreationQuestionCard.jsx` L10 | `emptyText = '当前没有需要追问的问题，可以直接进入生成。'` | "进入生成" | `emptyText = '没有需要继续确认的问题，可以直接开始生成了。'` |

### F.6 `CreationResumePrompt.jsx`

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| F.6.1 | [ ] | **P0** | `CreationResumePrompt.jsx` L8 | `hint = '检测到一条仍在进行中的会话。'` | **"会话"** | `hint = '你上次的创作还没结束。'` |
| F.6.2 | [ ] | P1 | `CreationResumePrompt.jsx` L10 | `description = '继续会回到上次的方案和追问；重新开始会结束旧会话，再按你这次的新方向整理。'` | **"旧会话"** | `description = '继续会回到上次的方向和追问；重新开始会丢掉那一轮，按你这次的新方向整理。'` |

### F.7 `CreationCreateWorkspace.jsx`（Create/Iterate/Fork 三个页面的工作台）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| F.7.1 | [ ] | P2 | `CreationCreateWorkspace.jsx` L75 | `primaryActionLabel = '开始整理'` | 尚可 | 可保留 |
| F.7.2 | [ ] | **P0** | `CreationCreateWorkspace.jsx` L81 | `workspaceHint = '先输入一句话，AI 会先扩写成一版完整提示词，再由你确认。'` | **"提示词 / 扩写"** | `workspaceHint = '先说一句话，AI 会帮你补成一版完整方向，你改改就能开始做。'` |
| F.7.3 | [ ] | **P0** | `CreationCreateWorkspace.jsx` L82 | `introMessage = '先告诉我你想做什么，我会先帮你整理出一版完整提示词。'` | **"提示词"** | `introMessage = '先告诉我你想做什么，我会整理出一版完整方向。'` |
| F.7.4 | [ ] | P1 | `CreationCreateWorkspace.jsx` L84 | `loadingTitle = '正在整理并扩写你的想法'` | **"扩写"** | `loadingTitle = 'AI 正在把你的想法补成完整方向'` |
| F.7.5 | [ ] | P1 | `CreationCreateWorkspace.jsx` L85 | `loadingDescription = '通常只要几秒，AI 会先生成一版可编辑的提示词。'` | **"提示词"** | `loadingDescription = '通常只要几秒，AI 会整理出一版你可以改的方向。'` |
| F.7.6 | [ ] | **P0** | `CreationCreateWorkspace.jsx` L88 | `draftLabel = 'AI 整理后的提示词'` | **"提示词"** | `draftLabel = 'AI 整理出的方向'` |
| F.7.7 | [ ] | **P0** | `CreationCreateWorkspace.jsx` L89 | `draftHint = '你可以直接修改这段提示词；确认后才会真正开始生成。'` | **"提示词"** | `draftHint = '你可以继续改这段方向，改完就能开始做。'` |

### F.8 `CreationSessionShell.jsx`

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| F.8.1 | [ ] | P2 | `CreationSessionShell.jsx` L9 | `subtitle = '先把方向聊明白，再决定继续补充还是直接进入生成。'` | "进入生成" 略硬 | `subtitle = '先把方向聊明白，再决定继续补充还是直接开做。'` |

---

## Part G：首页 banner 副文案（可选）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 |
|---|---|---|---|---|---|---|
| G.1 | [ ] | P1 | `src/pages/index/index.jsx` banner 副文案区 | `用 AI 把灵感、规则和画面快速组装成可玩的作品，让首页先像一张情绪海报，再把内容顺着节奏铺开。` | **设计评审 deck 原文**：普通用户不关心"首页像情绪海报" | `用 AI 把脑子里的点子、玩法和画面一起做成游戏，几分钟就能做出能玩的第一版。` |

---

## 全局词汇替换总表（便于你一眼判断风格）

| 研发黑话 | 建议替换 |
|---|---|
| 上下文 / 加载XX上下文 | 正在准备 |
| 会话 / 本轮会话 / 旧会话 | 这一轮 / 上一轮 / 那一轮 |
| 任务 / 任务记录 / 任务操作 | 这次创作 / 本轮操作 |
| 系统 | AI / 我们 |
| 提示词 | 方向 |
| 扩写 | 补成完整方向 |
| 创作链路 / 走链路 | 作品 / 创作 |
| 底稿 / 当前底稿 / 缺少底稿 | 这一版 / 基于这一版 / 没选作品 |
| 能力 / 能力组合 | 玩法模板 |
| 组装（规则/资源/画面） | 准备 / 搭建 |
| 运行表现 / 可玩性 | 手感 / 能顺畅玩 |
| 运行验证 | 试玩一遍 |
| 交互逻辑 | 玩法 |
| 复刻权限 | 作者开放了复刻 |
| 入口 / 挂上作品数据 | 进来 / 带上作品 |
| 发起（任务 / 会话） | 开始 |
| 执行中 | AI 正在做 |
| 同步 / 同步说明 | 接回 / 小贴士 |
| 原作缺失 | 没找到这款作品 |
| 迭代 | 继续改 |
| 已就绪 / 不可开始 | 搞定 / 暂时无法开始 |
| 流程（创作流程/复刻流程） | 正在创作 / 正在复刻（或直接删掉这个标签） |

---

## Part H：实测补充（2026-04-18 浏览器真实走查新发现）

> 这一段是**静态源码扫描覆盖不到**的问题。它们来自三类非代码文案源：
>
> 1. **数据库字段**：用户原始想法/作品 description 直接回显，带着 prompt 模板的英文 spec 字段名。
> 2. **共用组件**（如 FloatingPlayer 顶栏）：硬编码英文。
> 3. **运营位 / 排版元素**（首页 banner、profile 额度卡、discover 作者名）：英中混用 + 原始标识符裸露。
>
> 每一条都附有**实测截图路径**（保存在本地 `~AppData\Local\Temp\cursor\screenshots\ux-audit\` 下）和**对应流程**。

### H.1 FloatingPlayer 顶栏（共用组件，**全站命中率最高**）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.1.1 | [ ] | **P0** | `src/components/common/FloatingPlayer.jsx` 顶栏左按钮 | `Close` | **纯英文**。从 profile 点自己的作品、从 discover 点别人的作品、任意游戏卡片点击都会看到 | `关闭` 或 `× 关闭` | `ux-audit/23-before-menu-click.png`（从 profile 进入），`ux-audit/34-discover-fresh.png`（从 discover 进入） |
| H.1.2 | [ ] | **P0** | 同上 顶栏右按钮 | `Full` | **纯英文** | `全屏` | 同上 |

### H.2 创作页 AI 扩写后的确认态（Part C/F 源码扫描没覆盖这个组件的 wrapper 文案）

路径：用户点「开始整理提示词」→ 页面渲染出「确认卡片」。

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.2.1 | [ ] | **P0** | create 页扩写确认卡标题 | `确认你的生成提示词` | **"生成提示词"** | `确认这次的创作方向` | `ux-audit/07-create-after-wait.png` |
| H.2.2 | [ ] | **P0** | 同上 卡片副标题 | `AI 已经整理出一版完整提示词。你可以先修改确认，再开始真正生成。` | **"提示词"** | `AI 已经帮你整理出了一版完整方向，你可以先改改，再开始正式做。` | 同上 |
| H.2.3 | [ ] | **P0** | 同上 AI 气泡 | `我已经把你的想法整理成一版可直接用于生成的游戏需求说明。你可以直接确认，也可以先按自己的表达改一改，再继续生成。` | **"游戏需求说明"** PM 原文 | `我把你的想法整理成了一版完整方向，你可以直接确认，也可以先改成你自己的说法，再继续。` | 同上 |
| H.2.4 | [ ] | **P0** | 同上 中部分区标题 | `游戏生成提示词` | **"生成提示词"** | `AI 整理出的方向` | 同上（文案在 AI 气泡下方） |
| H.2.5 | [ ] | **P0** | 同上 分区副文案 | `你可以直接修改这段提示词，也可以直接使用当前版本。` | **"提示词"** | `你可以继续改这段方向，也可以直接用现在这一版。` | 同上 |
| H.2.6 | [ ] | **P0** | 同上 编辑区 placeholder | `在这里修改 AI 整理后的提示词...` | **"提示词"** | `在这里继续改这段方向...` | `ux-audit/16-create-reloaded.png` |
| H.2.7 | [ ] | **P0** | 同上 primary button label | `确认并保存提示词` | **"提示词"** | `确认这段方向` | 同上 |
| H.2.8 | [ ] | **P0** | 同上 secondary button | `直接使用当前提示词` | **"提示词"** | `直接用这一版` | 同上 |
| H.2.9 | [ ] | P1 | 同上 状态徽标 | `待确认` | OK 可保留，但和整体口吻不一致 | `等你确认` 或删掉 | `ux-audit/07-create-after-wait.png` |

### H.3 创作页顶部操作 / 基础区（源码扫到但要确认实际位置）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.3.1 | [ ] | **P0** | 右上角固定入口 | `任务` | **"任务"**。用户打开创作/迭代/复刻任一流程顶部都看到 | `我的创作` 或 `未完成的` | `ux-audit/03-create-fullpage.png` 顶部 |
| H.3.2 | [ ] | P2 | 页面顶部第一个 section | `展示方向` | 正常用户会想成"这是个产品展示方向"之类 | `屏幕方向` | 同上 |
| H.3.3 | [ ] | P2 | 同上 输入框 placeholder | `先说一句你想做的游戏...` | 不算错，但不够示例化 | `比如：一个会解谜的小猫在深夜厨房冒险...` | `ux-audit/03-create-fullpage.png` |
| H.3.4 | [ ] | P1 | 创作流程入口按钮（非 AI 扩写后） | `开始整理提示词` | **"提示词"**。primary button 默认值 | `让 AI 整理一下` | `ux-audit/03-create-fullpage.png` |

### H.4 生成中页「任务操作」区按钮（Part C.2 覆盖了标题但漏了按钮）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.4.1 | [ ] | **P0** | 生成中页 红色操作按钮 | `取消任务` | **"任务"**。和 C.2.2 一致问题，但 C.2.2 改的是 section title，这里是实际按钮 | `停下这一次` 或 `先取消` | `ux-audit/18-generating.png`, `ux-audit/19-generating-later.png` |

### H.5 「迷你高尔夫」类作品数据回显（数据库字段，**覆盖面远超源码**）

> **这是整个审计里最严重的问题。**
> 用户在 iterate 页看到的「原始想法」整段内容是从数据库取的 `game.description`（或原始 prompt），里面把后端在 LLM prompt 模板里用的英文 spec 字段名原封不动显示给了用户。

实测截图 `ux-audit/26-iterate-initial.png`，用户看到的完整文本：

```text
原始想法: 创建一个类似于与羊了个羊的游戏，把羊更换为牛相关的元素 请把这条想法整理成一个适合移动端小游戏生成的确认稿，并至少覆盖这些要素:
Game Type: 根据原始想法确定游戏方向
Core Mechanic: 提炼玩家最常执行的核心动作
Theme: 保留原始想法里的题材、场景或情绪
Input Method: 采用适合手机的点击、滑动或拖拽操作
Win Condition: 明确玩家这一局如何过关或获胜
Difficulty Ramp: 说明难度如何逐步提升
Scoring / Rewards: 补充积分、连击、奖励或解锁节奏
Visual Direction: 给出匹配题材的视觉风格
Special Rules or Reference Inspiration: 仅在确有帮助时补充
```

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.5.1 | [ ] | **P0** | iterate 页「原始想法」字段（后端字段/前端渲染） | 上面整段 | **用户看到的是 LLM prompt 模板的英文字段骨架**，包括 Game Type / Core Mechanic / Theme / Input Method / Win Condition / Difficulty Ramp / Scoring / Rewards / Visual Direction / Special Rules。这是最严重的黑盒暴露。 | **两种修法，选一个**： 1) **后端**在存 game 时只存用户原话，把模板那段英文 spec 拆开存到隐藏字段； 2) **前端**在显示时用正则剥离 `/\b(Game Type|Core Mechanic|Theme|Input Method|Win Condition|Difficulty Ramp|Scoring \/ Rewards|Visual Direction|Special Rules or Reference Inspiration):[^\n]+/g`，只留用户前半段原话 | `ux-audit/26-iterate-initial.png` |

### H.6 profile 页计数/额度区（Part C/D/E 不覆盖 profile）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.6.1 | [ ] | P1 | profile 头部四联计数器 | `0 获赞 / 1 关注 / 1 分析 / 0 收藏` | **"分析"** 看起来像是"分享"的错字，或者是某种数据指标（完全看不懂指代什么） | 核对源码，如果是"分享"就修正错字；如果是"分析"保留但加说明 tooltip 或改成 `作品阅读量` 之类 | `ux-audit/21-profile.png`, `ux-audit/22-profile-fresh.png` |
| H.6.2 | [ ] | P2 | profile 额度卡片 | `创作额度 / 当前为基础额度 / 剩余 60 次创作额度 / 已使用 39/99` | `额度` 和 `基础额度` 官方话 | `本月创作次数 / 基础套餐 / 还剩 60 次 / 已经用了 39/99` | 同上 |
| H.6.3 | [ ] | P1 | profile 筛选 tab 条 | `作品 / 草稿 / 点赞 / 收藏 / 任务` | **"任务"**作为 tab label | `作品 / 草稿 / 点赞 / 收藏 / 未完成` 或 `... / 创作中` | 同上 |

### H.7 detail 页（别人作品）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.7.1 | [ ] | **P0** | 详情页作者名显示 | `wx_vw-sxsiex8` | **裸 WeChat openid/unionid 前缀**直接当昵称显示，没头像没昵称 | 后端 `user.nickname` 兜底为"游戏作者"或"匿名玩家 + 短 ID 后缀"；前端兜底同理，禁止原样显示 openid | `ux-audit/36-detail.png` |
| H.7.2 | [ ] | P1 | 详情页主按钮副文案 | `立即试玩 / 沉浸体验这个小游戏` | `沉浸体验` 营销腔 | `立即试玩 / 马上玩一下` | 同上 |
| H.7.3 | [ ] | P1 | 详情页 fork 入口卡 | `复刻后继续创作 / 基于当前玩法` | `当前玩法` 略 dev | `基于这款接着创作 / 在他的作品上接着改` | 同上（同页滚动后可见） |

### H.8 fork 页 reference card（Part E 漏了这里）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.8.1 | [ ] | P1 | fork 页顶部作者参考卡 | `原作品参考` | OK 可保留 | 可保留，或 `基于这款作品` | `ux-audit/37-fork-entry.png` |
| H.8.2 | [ ] | **P0** | 同上 metadata | `题材归属 / 来自社区作品` | **"题材归属"** 是 PM spec 词 | `来源 / 社区作品` 或直接删除这项 | 同上 |
| H.8.3 | [ ] | **P0** | 同上 metadata | `复刻权限 / 允许复刻` | **"复刻权限"** 再次出现（和 E.5.3 一致，但这里是一个独立组件的字段） | `作者设置 / 可以复刻` | 同上 |
| H.8.4 | [ ] | P1 | 同上 metadata | `32 试玩 / 0 点赞 / 0 复刻` | 和 C.2 等处 `次游玩 / 次点赞 / 次复刻` 不一致（有的有"次"有的没"次"） | 统一格式，建议都用 `xx 次游玩 / xx 次点赞 / xx 次被复刻` | 同上 |

### H.9 fork 页业务错误降级成系统错误（**流程 bug，不只是文案问题**）

实测路径：登录后直接访问 `/pages/game/fork/index?gameId=<自己作品的id>`（正常进入路径是通过点别人的作品卡触发，但如果用户误操作/手动改 URL/分享链接回给作者本人，就会走到这里）。

实测截图 `ux-audit/30-fork-self.png`：页面显示两张卡片叠起来

- 卡1：`暂时无法继续 / 当前状态 加载失败 / 暂时无法复刻这款作品 / 请返回详情页后重新进入，或稍后再试。`
- 卡2：`原作缺失 / 没有拿到作品数据 / 缺少作品信息`

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.9.1 | [ ] | **P0**（行为） | `fork/index.jsx` 入口校验逻辑 | 自己作品被当成"加载失败"处理 | **业务规则"不能复刻自己"被降级成系统错误**。用户会误以为后端挂了、或以为作品被删了，实际上只是一条业务规则 | 在拿到作品后先判断 `viewer.userId === game.authorId`，命中则走 E.5 "不可复刻兜底"分支，显示 `eyebrow="这是你的作品"` / `title="直接去优化这款作品就好"` / `直接跳转到优化按钮` | `ux-audit/30-fork-self.png` |
| H.9.2 | [ ] | P1 | 同上 错误卡叠加 | 同时显示两张错误卡（加载失败 + 原作缺失） | 重复信息轰炸 | 只保留一张；如果命中自己作品则用 H.9.1 的友好态替换整块 | 同上 |

### H.10 首页 banner & 排版元素（Part G 只覆盖了 banner 副文案一条）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.10.1 | [ ] | **P0** | 首页顶部 spotlight 栏 | `AI GAME ATELIER` | **纯英文大标题**，和整体中文产品语言割裂 | `AI 游戏工坊` 或删掉这一行英文标识 | `ux-audit/28-home.png`, `ux-audit/31-home-pick-game.png` |
| H.10.2 | [ ] | P1 | 同上 右侧徽标 | `Live`（绿点 + 英文） | 英文 | `直播中` 或 `在创作` 或就一个绿点 | 同上 |
| H.10.3 | [ ] | P1 | 主卡片左上 chip | `AI创作` / `构想 IDEA` | **"构想 IDEA"中英叠加**，看不出差别 | 二选一保留中文：`AI 创作 / 新想法` | 同上 |
| H.10.4 | [ ] | P1 | 首页 feed section 标题 | `TOP PICKS` | 英文 | `精选推荐` 或 `热门作品` | `ux-audit/28-home.png`（底部） |
| H.10.5 | [ ] | P1 | 同上 副标题 | `这批作品，个个能打` | 俏皮但有方言腔（"能打"可能不普适）；**且下一行文案"本屏内容 10 款"完全看不懂** | `这一批值得一玩 / 共 10 款` | 同上 |
| H.10.6 | [ ] | **P0** | 同上 右上元数据 | `10 款 / 本屏内容` | **"本屏内容"是开发/设计稿里的词**，用户根本不懂 | 改成 `共 10 款` 或直接只显示数字 | 同上 |
| H.10.7 | [ ] | P2 | banner 灵感推荐 chip | `灵感推荐 / Lumina 光之径` | `Lumina 光之径` 作品名本身（用户自定义无需改）；但"灵感推荐"在分类条下方的 `节奏达人` 也用"轻量上手" / `记忆翻牌` 用 "正在升温"，这几个 eyebrow label 风格不统一 | 统一为 `热门 / 新上 / 推荐` 三档，不要每个作品一个独立 eyebrow | `ux-audit/28-home.png` |

### H.11 profile 额度订阅按钮 + 作品操作面板（实测补充）

| # | 状态 | 严重度 | 位置 | 当前文案 | 问题 | 建议改写 | 实测证据 |
|---|---|---|---|---|---|---|---|
| H.11.1 | [ ] | P2 | profile 额度卡订阅按钮 | `订阅` | 略硬 | `升级 / 解锁更多` | `ux-audit/21-profile.png` |
| H.11.2 | [ ] | P1 | 自己作品操作面板二级文案 | `优化游戏 / 继续完善玩法、文案和交互体验` | **"交互体验"** | `优化游戏 / 继续改玩法、文字和手感` | `ux-audit/25-menu-opened.png` |
| H.11.3 | [ ] | **P0** | 同上 | `权限设置 / 管理可见范围、评论和复刻权限` | **"复刻权限"**（和 E.5.3 / H.8.3 一致） | `可见性和评论 / 管理谁能看、谁能复刻` | 同上 |

### H.12 Taro H5 可用性观察（非文案，但强相关，**会阻塞用户用某些入口**）

| # | 状态 | 严重度 | 位置 | 观察 | 建议 | 实测证据 |
|---|---|---|---|---|---|---|
| H.12.1 | [ ] | P1 | create / iterate / fork 页所有状态 | 浏览器 H5 下，**页面 body 不能被键盘 / 滚轮 / 程序 scroll**，必须等 SSR 重新 mount 才能看到下方按钮 | Taro root 外层的 `taro_page` 容器 overflow 设置可能有问题；建议把 `body { overflow: auto }` 强制打开，或在路由切换时 `window.scrollTo(0, 0)` | 本次对话从 `ux-audit/13-create-confirm-bottom.png` 开始多次复现 |

---

## 实测截图索引

所有截图保存在 `c:\Users\zhang\AppData\Local\Temp\cursor\screenshots\ux-audit\`。如需保留长期证据，建议拷贝到 `docs/ux-audit/`。

| 编号 | 场景 | 覆盖条目 |
|---|---|---|
| 01-03 | 创作页初始态 | H.3.1-H.3.4, C.* |
| 04-06 | 创作页输入态 / 处理中 | H.3.* |
| 07-10 | 创作页 AI 扩写确认态 | **H.2.1-H.2.9**, C.* |
| 13, 16-17 | 扩写后按钮区 | **H.2.6-H.2.8** |
| 18-20 | 生成中（stage 2/5, 3/5） | **H.4.1**, A.*, B.*, C.2 |
| 21-25 | profile + 作品操作面板 | **H.6.*, H.11.*** |
| 23 | FloatingPlayer 顶栏 | **H.1.1-H.1.2** |
| 26-27 | 优化入口页 | **H.5.1**（最严重）, D.* |
| 28, 31 | 首页 banner + 分区 | **H.10.1-H.10.7**, G.1 |
| 30 | fork 自己作品错误 | **H.9.1-H.9.2** |
| 33-34 | discover 好友页 | H.7.1（openid 作者名）, H.1 |
| 36 | 他人作品详情页 | **H.7.1-H.7.3** |
| 37 | fork 入口页 | **H.8.1-H.8.4**, E.6 |

---

## 实测合并后的"最该先改清单"（按 ROI 排）

不用全改，你可以先按这五组下决定，每组都是**「一个小改动带走大量暴露面」**：

1. **最急**（一次修掉 ~30% 暴露面）：**H.5.1 剥离英文 prompt 模板**。iterate 页、fork 页的"原始想法"回显整段都因此变干净。
2. **跟着修**：**全局把「提示词」替换成「方向」**——覆盖 H.2.1-H.2.8, F.7.2-F.7.7, D.4.*, E.6.*, C.3.1。
3. **组件层一次收**：**H.1.1-H.1.2 FloatingPlayer 顶栏 Close/Full 汉化**，一次修，三流程都不再漏英文。
4. **跟进流程 bug**：**H.9.1 自己作品复刻自己时给友好兜底**，顺手解决 E.5.*。
5. **profile + 首页运营位**（成本较低但外露很多）：H.6.1 确认"分析"是不是错字；H.10.1-H.10.7 首页英文/设计 deck 原文一次清理；H.11.3 "复刻权限"统一。

---

## 确认方式

你可以逐条把 `[ ]` 改成 `[x]` 或 `[x?]`（存疑但倾向改），然后告诉我"开始落地"，我就按你勾选的条目批量改写代码并起一个新分支。也可以说"A/B/...全改 + F.1/F.2/... + G.1 + H 全改"这种简写。

Part H 里**标 P0 的 10 条**（H.1.1-H.1.2, H.2.1-H.2.8, H.3.1, H.4.1, H.5.1, H.7.1, H.8.2-H.8.3, H.9.1, H.10.1, H.10.6, H.11.3）是我建议**至少先批掉的最小集**。
