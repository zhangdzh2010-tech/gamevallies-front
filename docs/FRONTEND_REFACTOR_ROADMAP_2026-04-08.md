# Frontend 整改路线图

更新时间：2026-04-08  
状态：待执行  
适用仓库：`gamevallies-frontend`

## 1. 目标

本路线图用于解决当前前端代码里“单文件过大、单函数过大、页面职责过重、样式耦合过深”的问题，并给出一份可以按阶段落地的整改顺序。

本轮整改目标不是“顺手美化代码”，而是：

1. 降低后续改动时的回归概率。
2. 把高频变更页面拆成可维护的组件和状态边界。
3. 避免再次出现“某次小改动把旧逻辑带回来”的情况。
4. 为后续 SSE 对接、CreationSession 深化、移动端壳适配预留更清晰的结构。

## 2. 本轮体检结论

基于 2026-04-08 的静态扫描，当前前端存在以下明显热点。

### 2.1 超大文件

| 文件 | 行数 | 说明 |
| --- | ---: | --- |
| `src/pages/profile/index.scss` | 3548 | 个人页样式全集中，风险最高 |
| `src/store/gameStore.js` | 1785 | 创建会话、任务跟踪、恢复、解锁同步全部混在一起 |
| `src/components/creation/CreationSession.scss` | 1391 | create / iterate / fork 共用样式和结果态样式混在一起 |
| `src/pages/profile/index.jsx` | 1233 | 个人页主逻辑、列表、弹层、任务区全部集中 |
| `src/pages/game/detail/index.scss` | 1060 | 详情页所有区域样式全集中 |
| `src/pages/game/detail/index.jsx` | 923 | 详情页头部、评论、作者区、分享、操作区全部集中 |
| `src/pages/subscription/index.scss` | 921 | 订阅页样式已经进入高风险区 |
| `src/pages/game/iterate/index.jsx` | 821 | 优化流程页面分支过多 |
| `src/pages/game/fork/index.jsx` | 673 | 复刻流程页面分支过多 |
| `src/pages/create/index.jsx` | 616 | 创建流程页面分支和入口恢复逻辑较重 |

### 2.2 超大函数 / 超大组件

| 函数/组件 | 文件 | 约行数 | 说明 |
| --- | --- | ---: | --- |
| store 主闭包 | `src/store/gameStore.js` | 1315 | 最大风险点 |
| `GameDetail` | `src/pages/game/detail/index.jsx` | 790 | 详情页职责过重 |
| `GameIteratePage` | `src/pages/game/iterate/index.jsx` | 789 | 状态分支和动作过多 |
| `Profile` | `src/pages/profile/index.jsx` | 679 | 个人页组件过大 |
| `GameForkPage` | `src/pages/game/fork/index.jsx` | 649 | 复刻页组件过大 |
| `Create` | `src/pages/create/index.jsx` | 620 | 创建页组件过大 |
| `FollowPage` | `src/pages/discover/index.jsx` | 599 | 发现页体积偏大 |
| `Home` | `src/pages/index/index.jsx` | 548 | 首页体积偏大 |
| `GameWebShellPage` | `src/pages/game/web-shell/index.jsx` | 521 | 小程序/壳环境逻辑集中 |
| `quotaStore` 主闭包 | `src/stores/quotaStore.js` | 461 | 订阅/额度逻辑边界不清晰 |

## 3. 风险判断

当前最危险的不是“某个 util 太长”，而是下面三类问题同时存在：

1. 页面组件同时承载数据加载、流程判断、动作处理、渲染分支。
2. store 把不属于同一职责的状态和副作用放在一个闭包里。
3. 样式文件在一个文件里同时承载多个页面阶段、多个组件、多个断点。

这类结构会直接带来：

1. 小改动触发大回归。
2. 一次改动需要同时理解多个业务阶段。
3. create / iterate / fork 的统一工作容易再次改散。
4. UI 回退、旧逻辑回流、样式串扰更容易发生。

## 4. 整改原则

整改必须遵守以下原则：

1. 先拆边界，再调逻辑，不做“边改业务边大重构”。
2. 每次只处理一个热点域，不跨多个页面同时大范围改。
3. 对运行中的关键链路，优先补最小保护测试，再做结构提取。
4. 删除旧逻辑时必须做“物理删除”，不保留整段注释历史代码。
5. 样式拆分必须跟着组件边界走，不能只做文件搬运。
6. 所有阶段都必须通过：
   - 定向测试
   - `npm.cmd run build:app:web`
   - 必要时生产烟测

## 5. 优先级排序

### P0：先拆状态层

目标文件：

- `src/store/gameStore.js`
- `src/stores/quotaStore.js`

原因：

1. 这是 create / iterate / fork / 详情页 / 订阅链路的共同依赖。
2. 如果状态层不先收口，页面拆分后仍会继续耦合。

建议拆分结果：

- `gameStore.creationSession.js`
- `gameStore.taskTracking.js`
- `gameStore.persistedTask.js`
- `gameStore.unlockSync.js`
- `quotaStore.subscription.js`
- `quotaStore.paywall.js`

验收标准：

1. `gameStore.js` 只保留组装入口。
2. 单个 slice 文件控制在 `400` 行以内。
3. `generateFromCreationSession`、`startCreationSession`、`bindCreationSessionRuntime` 等关键路径有独立测试覆盖。

### P1：拆个人页

目标文件：

- `src/pages/profile/index.jsx`
- `src/pages/profile/index.scss`

原因：

1. 这是当前最大的页面文件和最大的样式文件。
2. 个人页是频繁改动区域，已经多次承载作品、草稿、任务、会员额度等需求。

建议拆分结果：

- `components/ProfileSummaryCard.jsx`
- `components/ProfileMembershipCard.jsx`
- `components/ProfileGameTabs.jsx`
- `components/ProfileTaskPanel.jsx`
- `components/ProfileMoreMenu.jsx`
- `components/ProfileVisibilityModal.jsx`
- `components/EditProfileModal.jsx`

样式拆分建议：

- `profile-summary.scss`
- `profile-membership.scss`
- `profile-games.scss`
- `profile-tasks.scss`
- `profile-modals.scss`

验收标准：

1. `Profile` 主组件压到 `350` 行以内。
2. `index.scss` 只保留页面壳和布局，不再承载全部细节样式。
3. 草稿、作品、任务、会员额度在 H5 下视觉不回退。

### P2：拆详情页

目标文件：

- `src/pages/game/detail/index.jsx`
- `src/pages/game/detail/index.scss`

原因：

1. 详情页同时承载了作品头部、试玩、分享、关注、评论、继续创作等多个域。
2. 当前对评论区、试玩区、作者区的任何改动，都可能互相影响。

建议拆分结果：

- `components/GameDetailHero.jsx`
- `components/GameDetailStats.jsx`
- `components/GameDetailAuthorCard.jsx`
- `components/GameDetailActions.jsx`
- `components/GameCommentSection.jsx`
- `components/CommentComposer.jsx`

验收标准：

1. `GameDetail` 主组件压到 `400` 行以内。
2. 评论区动作和详情页头部动作不再写在同一渲染块里。
3. 详情页 H5 手机宽度适配不回退。

### P3：统一 create / iterate / fork 页面逻辑

目标文件：

- `src/pages/create/index.jsx`
- `src/pages/game/iterate/index.jsx`
- `src/pages/game/fork/index.jsx`
- `src/components/creation/CreationCreateWorkspace.jsx`
- `src/components/creation/CreationSession.scss`

原因：

1. 三条流程界面已经趋同，但页内动作和恢复逻辑仍然各写一套。
2. 这是最容易再次出现“某页修了、另一页没修”的区域。

建议拆分结果：

- `hooks/useCreationWorkspaceFlow.js`
- `hooks/useCreationResumeGate.js`
- `hooks/useCreationPreview.js`
- `creation-view-models/createViewModel.js`
- `creation-view-models/iterateViewModel.js`
- `creation-view-models/forkViewModel.js`

建议统一的动作接口：

1. `send`
2. `skip`
3. `preview`
4. `generate`
5. `restart`
6. `resume`

验收标准：

1. `Create / GameIteratePage / GameForkPage` 单页组件都压到 `400` 行以内。
2. 三页不再重复启动会话、预览、直接生成的核心逻辑。
3. create / iterate / fork 至少各有一条页面级回归测试。

### P4：拆 creation 样式和订阅样式

目标文件：

- `src/components/creation/CreationSession.scss`
- `src/pages/subscription/index.scss`

原因：

1. 这两份样式文件都已经进入“一个文件覆盖多个页面阶段”的状态。
2. 后续再改聊天工作台、结果卡、订阅卡，很容易互相串样式。

建议拆分结果：

- `CreationShell.scss`
- `CreationWorkspace.scss`
- `CreationReferenceCard.scss`
- `CreationResult.scss`
- `CreationResponsive.scss`
- `SubscriptionShell.scss`
- `SubscriptionQuota.scss`
- `SubscriptionPlans.scss`
- `SubscriptionPayment.scss`

验收标准：

1. 单个样式文件尽量控制在 `500` 行以内。
2. 公共 creation 样式和页面专属样式分离。
3. H5 断点规则不再散落在多个不相关区块里。

## 6. 明确不在本轮一起处理的事项

为避免整改范围失控，以下事项不应和本路线图混做一个大改动：

1. SSE 流式输出前端适配。
2. 后端 creation session 初始化性能问题。
3. App 打包、Capacitor、iOS/Android 壳问题。
4. 订阅支付链路协议调整。
5. 视觉重设计。

这些事项可以依赖本次结构整改的成果，但不应在同一轮结构改造里混改。

## 7. 推荐执行顺序

推荐分 5 个阶段执行：

### 阶段 1：建立护栏

1. 梳理 create / iterate / fork / detail / profile 当前关键测试。
2. 删除已经失效的旧测试。
3. 为新的共享工作台补最小回归测试。

完成标志：

1. 旧测试不再引用已删除 UI。
2. 关键页面至少有最小 smoke 测试可保护。

### 阶段 2：拆状态层

1. 先拆 `gameStore.js`
2. 再拆 `quotaStore.js`

完成标志：

1. 页面层不再直接依赖超大的 store 闭包实现细节。
2. 关键 action 具备独立模块边界。

### 阶段 3：拆个人页和详情页

1. 先拆 `profile`
2. 再拆 `game detail`

完成标志：

1. 两个高频改动页各自具备清晰组件边界。
2. 样式能按区域维护。

### 阶段 4：收口 create / iterate / fork

1. 把三页动作流程统一到共享 hook。
2. 把 resume / preview / generate 逻辑单点收口。

完成标志：

1. 三页行为一致。
2. 后续改动不再需要三处同步复制。

### 阶段 5：样式文件分仓

1. 拆 `CreationSession.scss`
2. 拆 `subscription/index.scss`

完成标志：

1. 大型样式文件消失。
2. 组件样式和页面样式分层清晰。

## 8. 每阶段的提交与发布要求

每一阶段必须遵守：

1. 一个阶段一组提交，不要把多个热点域混在一次 commit。
2. 每次提交前必须输出受影响文件清单。
3. 每次提交后必须至少执行：
   - `npm.cmd run build:app:web`
   - 对应模块的定向测试
4. 每次发布后必须做最小线上烟测。

## 9. 完成判定

以下条件全部满足，才算本轮整改完成：

1. `gameStore.js` 不再是超大单闭包。
2. `profile/index.jsx`、`game/detail/index.jsx`、`create/index.jsx`、`game/iterate/index.jsx`、`game/fork/index.jsx` 都降到可维护规模。
3. `CreationSession.scss` 和 `profile/index.scss` 不再是超大样式仓库。
4. create / iterate / fork 的共享流程逻辑收口到统一入口。
5. 旧 UI、旧测试、旧注释历史块被物理删除。

## 10. 建议的第一刀

如果只允许先开一刀，建议从 `src/store/gameStore.js` 开始。

原因：

1. 它是 create / iterate / fork / detail / profile 的共同根依赖。
2. 状态层不拆，页面层拆完仍然会继续被大闭包反向耦合。
3. 这是后续 SSE 接入、任务追踪稳定化、恢复逻辑收口的前置条件。

建议第一刀只做：

1. 提取 `creationSession` slice
2. 提取 `taskTracking` slice
3. 保持外部 API 不变
4. 不顺手改 UI

这样风险最可控，收益也最大。
