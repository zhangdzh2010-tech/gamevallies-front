# GameVallies 后端执行清单：账号级点赞与收藏整改

> 版本：v1.0  
> 日期：2026-03-25  
> 状态：待后端开发  
> 适用范围：账号级点赞、账号级收藏、我的点赞、我的收藏、小游戏壳页状态恢复、Feed 列表状态补齐

---

## 1. 文档目标

本文档用于把 2026-03-25 已确认的点赞/收藏整改方案，整理成一份可直接执行的后端任务单，覆盖：

1. 后端开发 checklist
2. 前后端联调顺序
3. 验收用例
4. 发布与回滚注意事项

本文档不替代既有契约文档，而是作为执行层面的总清单。正式接口契约仍以以下文档为准：

- `docs/api-schema.md`
- `docs/backend-bookmark-api-implementation.md`
- `docs/backend-engagement-api-implementation.md`
- `docs/backend-weapp-game-shell-requirements.md`

---

## 2. 背景与问题定义

2026-03-25 链路排查后，已经确认当前系统存在以下问题：

1. 收藏仍以本地缓存为主数据源，清缓存、换设备、重装后无法恢复。
2. 点赞写入后端是真实能力，但列表页和“我的-点赞”缺少统一账号级恢复链路。
3. 首页、发现页、详情页、小游戏壳页、我的页，对同一作品的点赞/收藏状态恢复逻辑并不一致。
4. “我的-点赞”仍是固定空态，“我的-收藏”仍依赖本地缓存。
5. 小程序壳页正式版如果继续依赖本地收藏状态，将无法满足跨设备恢复要求。

本轮整改目标是：

- 以后端为点赞/收藏唯一真相源
- 支持同账号跨设备恢复
- 支持清缓存后重新登录恢复
- 统一详情、Feed、我的页、壳页的状态来源

---

## 3. 完成定义

以下条件全部满足，才算本轮整改完成：

1. 收藏写接口和收藏列表接口可用。
2. 点赞列表接口可用。
3. 游戏读模型统一返回 `viewerHasLiked`、`viewerHasBookmarked`、`bookmarks`。
4. “我的-点赞”与“我的-收藏”都能读取真实后端列表。
5. 首页、发现页、详情页、小游戏壳页、我的页对同一作品展示一致。
6. 清缓存后重新登录，点赞和收藏都能恢复。

---

## 4. 契约基线

本轮后端交付需要遵守以下契约基线。

### 4.1 游戏读模型 additive 字段

```json
{
  "likes": 88,
  "bookmarks": 12,
  "viewerHasLiked": true,
  "viewerHasBookmarked": false
}
```

建议至少覆盖：

- `GET /api/v1/games/:id`
- `GET /api/v1/feed/trending`
- `GET /api/v1/feed/latest`
- `GET /api/v1/feed/following`
- `GET /api/v1/games/my`
- `GET /api/v1/feed/favorites`
- `GET /api/v1/feed/liked`

### 4.2 收藏接口基线

- `GET /api/v1/feed/favorites?page=1&limit=20`
- `POST /api/v1/feed/favorites`
- `DELETE /api/v1/feed/favorites/:gameId`

收藏写接口建议统一返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "bookmarked": true,
    "bookmarks": 12
  }
}
```

### 4.3 点赞接口基线

保留现有：

- `POST /api/v1/social/like`
- `GET /api/v1/social/like-status/:targetType/:targetId`

新增：

- `GET /api/v1/feed/liked?page=1&limit=20`

可选推荐：

- `POST /api/v1/social/like-status/batch`
- `POST /api/v1/feed/favorites/status/batch`

---

## 5. 后端开发 Checklist

### 5.1 数据模型

- 新增 `user_bookmarks` 表，至少包含：
  - `id`
  - `user_id`
  - `game_id`
  - `created_at`
- 为 `user_bookmarks` 建立唯一索引：
  - `(user_id, game_id)`
- 为 `user_bookmarks` 建立查询索引：
  - `(user_id, created_at desc)`
  - `(game_id)`
- 确认点赞关系表已具备唯一约束：
  - `(user_id, target_type, target_id)`
- 明确 `bookmarks` 总数字段的来源：
  - 优先：持久化计数并保持一致
  - 次选：查询时聚合，但需要评估性能

### 5.2 Presenter / DTO / 读模型

- 在游戏详情 Presenter 中补齐：
  - `likes`
  - `bookmarks`
  - `viewerHasLiked`
  - `viewerHasBookmarked`
- 在 Feed 列表读模型中补齐同样字段。
- 在 `GET /games/my` 的游戏对象中补齐同样字段。
- 在 `GET /feed/favorites` 和 `GET /feed/liked` 中直接返回可渲染卡片的最小 `GameSummary`。
- 未登录时统一返回：
  - `viewerHasLiked = false`
  - `viewerHasBookmarked = false`

### 5.3 收藏接口开发

- 实现 `GET /api/v1/feed/favorites?page=1&limit=20`
- 实现 `POST /api/v1/feed/favorites`
- 实现 `DELETE /api/v1/feed/favorites/:gameId`
- 确保收藏写接口幂等：
  - 重复收藏同一作品不报错
  - 重复取消收藏同一作品不报错
- 收藏写接口返回操作后的最终状态与最新总数：
  - `bookmarked`
  - `bookmarks`
- 收藏列表允许出现“他人作品”，但必须遵守作品可见性规则。

### 5.4 点赞接口开发

- 确认 `POST /api/v1/social/like` 继续返回：
  - `liked`
  - `likes`
- 确认 `GET /api/v1/social/like-status/:targetType/:targetId` 继续可用。
- 新增 `GET /api/v1/feed/liked?page=1&limit=20`
- 该接口返回的每个作品对象应直接带：
  - `viewerHasLiked = true`
  - `likes`
  - `bookmarks`
  - `viewerHasBookmarked`

### 5.5 批量状态接口

- 若 Feed 列表短期无法直接稳定带回 `viewerHasLiked`，则补 `POST /api/v1/social/like-status/batch`
- 若 Feed 列表短期无法直接稳定带回 `viewerHasBookmarked`，则补 `POST /api/v1/feed/favorites/status/batch`
- 批量接口应支持单次查询多个游戏 ID，避免前端逐条请求。

### 5.6 鉴权与权限

- 收藏与点赞写接口未登录统一返回 `401`
- 收藏列表与点赞列表未登录统一返回 `401`
- 对不存在作品统一返回 `404`
- 对无权访问的私有作品统一返回 `403` 或按现有可见性策略返回 `404`
- 收藏/点赞状态判断必须基于当前登录用户，而不是设备缓存

### 5.7 并发与幂等

- 并发点赞同一作品后，最终 `likes` 不得出现双加、双减、负数
- 并发收藏同一作品后，最终 `bookmarks` 不得出现双加、双减、负数
- 写接口返回值必须是数据库最终态，不允许前端自行猜测最终数值

### 5.8 监控与日志

- 记录收藏创建成功日志
- 记录收藏取消成功日志
- 记录收藏拒绝日志
- 记录点赞切换成功日志
- 记录点赞列表查询失败日志
- 对以下指标加监控：
  - 收藏写接口 4xx/5xx 比例
  - 点赞写接口 4xx/5xx 比例
  - 收藏列表接口耗时
  - 点赞列表接口耗时
  - 批量状态接口耗时

---

## 6. 推荐开发顺序

建议按以下顺序开发，避免前端状态源切换时出现中间态混乱。

### Phase 0：加字段不切前端

1. 在详情和 Feed 读模型中补齐：
   - `bookmarks`
   - `viewerHasLiked`
   - `viewerHasBookmarked`
2. 保证新增字段为 additive，不破坏老前端。

### Phase 1：先落收藏主链路

1. 上线 `POST /feed/favorites`
2. 上线 `DELETE /feed/favorites/:gameId`
3. 上线 `GET /feed/favorites`
4. 验证账号级收藏已经可跨设备恢复

### Phase 2：补齐点赞列表主链路

1. 上线 `GET /feed/liked`
2. 验证“我的-点赞”不再依赖固定空态

### Phase 3：补批量状态接口

1. 上线 `POST /social/like-status/batch`
2. 如有需要，上线 `POST /feed/favorites/status/batch`
3. 用于首页、发现页、关注页登录后批量补齐状态

### Phase 4：前端双读切换

1. 前端优先使用服务端返回的 viewer 字段
2. 前端保留旧本地收藏迁移逻辑
3. 观察一版稳定后，再下掉“本地收藏为主”的旧逻辑

---

## 7. 前后端联调顺序

### 7.1 联调准备

- 后端在测试环境提供可登录账号
- 准备至少 3 个作品：
  - 公开作品 A
  - 公开作品 B
  - 私有或草稿作品 C
- 准备至少 2 个账号：
  - 用户甲
  - 用户乙

### 7.2 联调顺序建议

1. 先测 `GET /games/:id` 是否返回新字段。
2. 再测 `GET /feed/trending` / `GET /feed/latest` 是否返回新字段。
3. 再测收藏写接口的增减行为。
4. 再测收藏列表 `GET /feed/favorites`。
5. 再测点赞列表 `GET /feed/liked`。
6. 最后测批量状态接口。

### 7.3 小程序壳页联调顺序

1. 先验证壳页能正确读取游戏详情中的 `viewerHasLiked` 与 `viewerHasBookmarked`
2. 再验证壳页内的点赞写操作
3. 再验证壳页内的收藏写操作
4. 最后验证壳页在清缓存后重新登录仍能恢复状态

---

## 8. 验收用例

### 8.1 收藏恢复

1. 用户甲收藏公开作品 A
2. 清掉设备缓存
3. 重新登录用户甲
4. 进入详情页、首页、发现页、我的-收藏
5. 预期：
   - 详情页显示已收藏
   - 首页/发现页状态一致
   - 我的-收藏能看到作品 A

### 8.2 跨设备收藏恢复

1. 设备 1 登录用户甲并收藏作品 A
2. 设备 2 登录用户甲
3. 进入我的-收藏与详情页
4. 预期：
   - 状态一致
   - 作品 A 出现在收藏列表

### 8.3 取消收藏

1. 用户甲已收藏作品 A
2. 在详情页取消收藏
3. 刷新页面并重新进入我的-收藏
4. 预期：
   - 收藏状态取消
   - 收藏总数正确减少
   - 我的-收藏中移除作品 A

### 8.4 点赞恢复

1. 用户甲点赞公开作品 B
2. 清缓存
3. 重新登录用户甲
4. 进入详情页、首页、发现页、我的-点赞
5. 预期：
   - 详情页显示已点赞
   - 首页/发现页状态一致
   - 我的-点赞出现作品 B

### 8.5 点赞取消

1. 用户甲已点赞作品 B
2. 再次点击点赞取消
3. 刷新并重新进入详情页和我的-点赞
4. 预期：
   - 状态取消
   - 点赞总数正确减少
   - 我的-点赞不再显示作品 B

### 8.6 切账号隔离

1. 用户甲收藏并点赞作品 A
2. 退出登录
3. 登录用户乙
4. 查看同一作品详情页与列表页
5. 预期：
   - 用户乙看不到用户甲的点赞/收藏态
   - 状态隔离正确

### 8.7 私有作品可见性

1. 用户甲收藏自己私有作品 C
2. 用户乙登录并访问相关列表
3. 预期：
   - 用户乙无法通过收藏/点赞列表越权看到私有作品 C

### 8.8 并发写入

1. 对同一作品并发触发多次点赞或收藏
2. 检查最终计数与最终状态
3. 预期：
   - 无双加、双减、负数
   - 返回值与数据库最终态一致

---

## 9. 发布顺序

### 9.1 推荐发布顺序

1. 先发后端 additive 字段
2. 再发收藏写接口与收藏列表
3. 再发点赞列表
4. 再发批量状态接口
5. 最后发前端双读切换与迁移逻辑

### 9.2 不推荐做法

- 不要先删除前端本地收藏逻辑，再补后端接口
- 不要先发“我的-点赞”前端，再等后端补列表接口
- 不要让前端继续把缓存当最终真相源

---

## 10. 回滚策略

### 10.1 后端回滚要求

- 新增字段回滚时，前端不应因字段缺失直接崩溃
- 新接口失败时，应保留现有详情页/列表页基本浏览能力

### 10.2 前端回滚要求

- 若服务端列表接口出现异常，前端应退回空列表或旧兜底，不影响页面基本可打开
- 但最终上线目标仍是去掉“本地缓存为真相”的旧模型

---

## 11. 交付清单

后端本轮最终应至少交付：

1. `GET /api/v1/feed/favorites`
2. `POST /api/v1/feed/favorites`
3. `DELETE /api/v1/feed/favorites/:gameId`
4. `GET /api/v1/feed/liked`
5. 详情/Feed/我的作品统一返回：
   - `bookmarks`
   - `viewerHasLiked`
   - `viewerHasBookmarked`
6. 可选：
   - `POST /api/v1/social/like-status/batch`
   - `POST /api/v1/feed/favorites/status/batch`

---

## 12. 对前端的直接意义

后端完成以上交付后，前端可以稳定完成以下切换：

1. “我的-收藏”改读服务端收藏列表
2. “我的-点赞”改读服务端点赞列表
3. 首页、发现页和壳页统一使用服务端 viewer 字段
4. 本地收藏缓存降级为迁移工具，而不是主数据源

