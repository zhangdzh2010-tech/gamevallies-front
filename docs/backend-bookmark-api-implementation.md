# 收藏能力后端接口实施说明

## 1. 文档目标

本文档用于指导后端实现“收藏 / 取消收藏 / 收藏列表 / 收藏状态”相关接口，使前端当前已经补上的收藏入口可以从“本地设备级收藏”升级为“账号级、可跨设备同步的真实收藏能力”。

当前前端已经具备以下收藏交互：

- 游戏详情页有“收藏”按钮
- “我的”页中有“收藏”标签页
- 收藏列表允许展示并打开已收藏作品

但在后端接口上线前，这套能力仍然是本地存储，不具备跨设备同步能力。

---

## 2. 前端当前行为

### 2.1 已经实现的行为

1. 用户在详情页点击“收藏”后，前端会立即切换收藏状态
2. 用户进入“我的 > 收藏”时，可以看到当前设备上已收藏的作品
3. 用户在收藏列表中取消收藏后，作品会立即从列表移除

### 2.2 当前限制

1. 收藏关系只保存在当前设备
2. 换设备或清缓存后，收藏记录会丢失
3. 首页 / 发现页暂未直接展示收藏入口
4. 收藏状态还没有和后端账号体系打通

---

## 3. 后端需要提供的核心接口

## 3.1 获取收藏列表

### 接口

`GET /api/v1/feed/favorites`

### 用途

用于“我的 > 收藏”页面获取当前登录用户的收藏作品列表。

### Query 参数

`page=1&limit=10`

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "game_123",
        "title": "星际投篮",
        "description": "躲避陨石并投篮得分",
        "status": "published",
        "gameUrl": "https://cdn.example.com/games/game_123/index.html",
        "emoji": "🏀",
        "plays": 1234,
        "likes": 88,
        "viewerHasBookmarked": true,
        "authorId": "user_1",
        "author": {
          "id": "user_1",
          "username": "alice",
          "avatar": "https://cdn.example.com/avatar.png"
        }
      }
    ],
    "hasMore": false,
    "page": 1,
    "limit": 10,
    "total": 1
  }
}
```

### 实施要求

1. 只返回当前登录用户自己的收藏列表
2. 收藏列表中的作品允许是“他人作品”
3. 返回字段需满足前端游戏卡片和详情跳转所需的最小读模型
4. `viewerHasBookmarked` 在该列表中必须恒为 `true`

---

## 3.2 添加收藏

### 接口

`POST /api/v1/feed/favorites`

### 请求体

```json
{
  "gameId": "game_123"
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "bookmarked": true
  }
}
```

### 后端必须保证

1. 接口幂等  
   同一用户重复收藏同一作品，不应报错，最终状态应仍为已收藏。

2. 收藏关系唯一  
   数据库层建议建立唯一索引：`(user_id, game_id)`。

3. 对不存在作品返回 `404`
4. 对未登录用户返回 `401`

---

## 3.3 取消收藏

### 接口

`DELETE /api/v1/feed/favorites/:gameId`

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "bookmarked": false
  }
}
```

### 后端必须保证

1. 接口幂等  
   即使当前用户并未收藏该作品，也不应报错，最终状态应为未收藏。

2. 删除收藏不能影响：
   - 点赞数
   - 播放数
   - Fork 数
   - 评论数

3. 对不存在作品返回 `404`
4. 对未登录用户返回 `401`

---

## 3.4 收藏状态字段

前端强烈建议后端在以下游戏对象里直接返回：

```json
{
  "viewerHasBookmarked": true
}
```

建议覆盖：

- `GET /api/v1/games/:id`
- `GET /api/v1/feed/trending`
- `GET /api/v1/feed/latest`
- `GET /api/v1/feed/following`
- `GET /api/v1/games/my`
- `GET /api/v1/feed/favorites`

### 语义要求

- 未登录用户：返回 `false`
- 已登录但未收藏：返回 `false`
- 已登录且已收藏：返回 `true`

如果后端不愿意把该字段直接放入游戏对象，也至少需要补一个单独的收藏状态接口。

---

## 4. 可选补充接口

## 4.1 单个作品收藏状态

### 接口

`GET /api/v1/feed/favorites/status/:gameId`

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "bookmarked": true
  }
}
```

### 说明

如果后端已经在 `GET /api/v1/games/:id` 中直接返回 `viewerHasBookmarked`，则该接口不是必须。

## 4.2 批量收藏状态

### 接口

`POST /api/v1/feed/favorites/status/batch`

### 请求体

```json
{
  "gameIds": ["game_1", "game_2", "game_3"]
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      { "gameId": "game_1", "bookmarked": true },
      { "gameId": "game_2", "bookmarked": false },
      { "gameId": "game_3", "bookmarked": true }
    ]
  }
}
```

### 说明

如果后端无法在 Feed 列表中直接返回 `viewerHasBookmarked`，批量接口会比单条状态接口更适合首页/发现页做状态补齐。

---

## 5. 数据模型建议

建议新增表：

`user_bookmarks`

建议字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | bigint / uuid | 主键 |
| `user_id` | string | 收藏用户 |
| `game_id` | string | 被收藏作品 |
| `created_at` | datetime | 收藏时间 |

建议约束：

- 唯一索引：`(user_id, game_id)`
- 普通索引：`user_id, created_at desc`
- 普通索引：`game_id`

---

## 6. 业务规则

后端需要固定以下规则：

1. 收藏允许针对“他人作品”和“自己的作品”
2. 收藏不影响作品的可见性规则  
   若作品后续变为私密，收藏用户再次访问时仍应走可见性校验
3. 收藏不等于点赞  
   两者数据、接口、业务语义必须完全独立
4. 收藏不应计入公开的社交计数  
   第一阶段不建议把收藏数公开展示给其他用户

---

## 7. 前端联调验收标准

后端完成后，应满足以下联调结果：

1. 用户在详情页点击“收藏”，刷新后仍保持已收藏
2. 用户在详情页点击“取消收藏”，刷新后仍保持未收藏
3. “我的 > 收藏”页面能正确返回该账号收藏的作品
4. 同一账号换设备登录后，仍能看到相同收藏列表
5. 收藏列表中的非本人作品可以正常进入详情页
6. 收藏与点赞互不影响

---

## 8. 实施优先级建议

### P0

1. `POST /api/v1/feed/favorites`
2. `DELETE /api/v1/feed/favorites/:gameId`
3. `GET /api/v1/feed/favorites`

### P1

1. 在游戏详情与 Feed 对象中直接返回 `viewerHasBookmarked`

### P2

1. 增加收藏状态批量接口

---

## 9. 对前端的直接影响

后端完成 P0 后，前端就可以把当前的本地收藏能力切换为账号级收藏，用户跨设备也能保持一致。

后端完成到 P1 后，前端还能进一步把首页、发现页等列表页的收藏状态做成首屏即准确的真实状态。

---

## 10. 2026-03-25 口径同步附录

### 10.1 同步背景

本附录用于与 `docs/api-schema.md` 中“2026-03-25 账号级点赞/收藏整改附录”保持一致口径。

本次同步重点是明确以下事实：

- 收藏必须从“设备本地缓存能力”升级为“账号级、可跨设备恢复能力”。
- 收藏接口本轮不仅要返回 `bookmarked`，还建议直接返回最新 `bookmarks` 总数，避免前端自行推算。
- 游戏读模型除 `viewerHasBookmarked` 外，也建议统一包含 `bookmarks` 字段，便于首页、发现页、详情页、我的页和未来的收藏/点赞列表共享同一读模型。

### 10.2 与 api-schema 对齐的补充要求

#### 收藏写接口响应补充

`POST /api/v1/feed/favorites` 与 `DELETE /api/v1/feed/favorites/:gameId` 建议统一返回：

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

其中：

- `bookmarked` 表示当前请求用户在操作后的最终收藏状态
- `bookmarks` 表示该作品最新收藏总数

#### 读模型字段补充

除本文已有的 `viewerHasBookmarked` 外，建议以下接口返回的游戏对象统一补齐：

```json
{
  "bookmarks": 12,
  "viewerHasBookmarked": true
}
```

建议覆盖：

- `GET /api/v1/games/:id`
- `GET /api/v1/feed/trending`
- `GET /api/v1/feed/latest`
- `GET /api/v1/feed/following`
- `GET /api/v1/games/my`
- `GET /api/v1/feed/favorites`
- `GET /api/v1/feed/liked`

### 10.3 规划状态说明

本附录属于 2026-03-25 版规划性增补：

- 不表示所有新增字段和返回体已在线上全部落地
- 推荐以后端 additive 方式逐步上线
- 前端切换前，允许短期兼容旧的本地收藏逻辑，但不得继续将其作为最终真相源

### 10.4 联调补充验收

除本文已有验收项外，建议新增以下检查：

1. 收藏写接口返回的 `bookmarks` 可直接用于覆盖前端数字显示。
2. 首页、发现页、详情页、我的页对同一作品展示的收藏状态保持一致。
3. 清缓存后重新登录，`GET /api/v1/feed/favorites` 仍能恢复同账号收藏列表。
4. “我的-收藏”页面不再以本地缓存作为唯一数据源。
