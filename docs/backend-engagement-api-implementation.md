# 播放量 / 点赞量后端接口实施说明

## 1. 文档目标

本文档用于指导后端实现“播放量 / 点赞量”相关接口，使当前前端在以下页面上的展示和交互全部基于真实数据：

- 首页瀑布流
- 发现页 / 关注页瀑布流
- 游戏详情页
- 我的作品页

本文档只覆盖两类互动能力：

1. 点赞状态与点赞计数
2. 播放上报与播放计数

不覆盖：

- 评论
- 收藏
- 关注
- 后台运营统计页

---

## 2. 当前前端已对接和待对接情况

### 2.1 点赞链路

前端当前已经按以下方式实施：

- 首页卡片点击点赞时，调用真实点赞接口
- 发现页卡片点击点赞时，调用真实点赞接口
- 详情页进入时，会读取作品详情，并在已登录情况下额外查询当前用户是否已点赞
- 详情页点赞按钮，使用后端返回的最新 `liked` / `likes`
- 个人页作品卡点赞按钮，也会使用真实接口返回值刷新 UI

因此，后端需要保证：

1. 点赞接口是幂等可用的“切换”接口
2. 点赞接口返回最新的点赞状态和最新计数
3. 详情接口 / Feed 接口返回稳定的 `likes`
4. 最好在列表数据里直接返回 `viewerHasLiked`

### 2.2 播放链路

前端当前的事实情况是：

- 所有页面都优先展示后端返回的 `plays` / `playCount`
- 但前端仓库里目前没有一个可确认的“播放上报”接口
- 因此，前端只能展示已有播放数，不能主动写回真实播放行为

这意味着：如果后端没有独立的播放记录接口，前端无法保证“用户真实打开一次游戏后，播放数被计入”

---

## 3. 前端当前依赖的读模型

### 3.1 游戏对象最少字段

后端返回的游戏对象，无论出现在：

- `GET /api/v1/games/:id`
- `GET /api/v1/feed/trending`
- `GET /api/v1/feed/latest`
- `GET /api/v1/feed/following`
- `GET /api/v1/games/my`

都至少应包含以下字段：

```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "gameUrl": "string | null",
  "status": "draft | generating | ready | published | review | failed",
  "plays": 123,
  "likes": 45,
  "authorId": "string",
  "author": {
    "id": "string",
    "username": "string",
    "avatar": "string | null"
  }
}
```

### 3.2 强烈建议新增 viewer 视角字段

为避免前端在列表页对每个游戏再额外请求一次点赞状态，建议后端在“用户已登录”的情况下，直接在游戏对象里返回：

```json
{
  "viewerHasLiked": true
}
```

约束如下：

- 未登录时可以返回 `false`
- 已登录但未点赞时返回 `false`
- 已登录且已点赞时返回 `true`

如果后端暂时不愿意在列表对象中增加这个字段，则必须补一个批量查询接口，详见第 7 节。

---

## 4. 点赞接口实施要求

## 4.1 切换点赞接口

### 接口

`POST /api/v1/social/like`

### 用途

统一处理：

- 游戏点赞 / 取消点赞
- 评论点赞 / 取消点赞

### 请求体

```json
{
  "targetType": "game",
  "targetId": "game_123"
}
```

或：

```json
{
  "targetType": "comment",
  "targetId": "comment_123"
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "liked": true,
    "likes": 100
  }
}
```

### 字段语义

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `liked` | boolean | 是 | 当前请求用户在本次操作后的最终点赞状态 |
| `likes` | number | 是 | 当前目标对象最新的点赞总数 |

### 后端必须保证

1. 这是一个“切换”接口  
   若用户之前未点赞，则执行点赞；若之前已点赞，则执行取消点赞。

2. 返回值必须是“最终状态”，不能只是 `{ success: true }`

3. `likes` 必须为最新数据库值，不允许让前端自行推算总数

4. 必须防止重复点赞脏写  
   同一用户对同一目标的并发请求，最终状态必须一致，计数不可多加或多减。

5. 对不存在目标返回 `404`

6. 对未登录用户返回 `401`

### 推荐数据库约束

- 唯一索引：`(user_id, target_type, target_id)`
- 点赞总数字段建议异步或同步维护，但接口返回时必须是最终一致的可读值

---

## 4.2 单个对象点赞状态接口

### 接口

`GET /api/v1/social/like-status/:targetType/:targetId`

### 用途

用于详情页加载时，查询“当前登录用户是否已点赞该作品”

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "liked": true
  }
}
```

### 后端必须保证

1. 已登录用户返回真实状态
2. 未登录可以有两种策略，必须二选一并固定：
   - 返回 `401`
   - 直接返回 `{ liked: false }`

第一阶段更建议：

- 未登录返回 `401`
- 前端自动降级成未点赞态

这样权限语义更清晰。

---

## 5. 详情与列表接口的字段契约

## 5.1 游戏详情接口

### 接口

`GET /api/v1/games/:gameId`

### 当前前端最低要求

```json
{
  "code": 0,
  "data": {
    "id": "game_123",
    "title": "星际投篮",
    "description": "躲避陨石并投篮得分",
    "status": "published",
    "gameUrl": "https://cdn.example.com/games/game_123/index.html",
    "plays": 1234,
    "likes": 88,
    "forks": 9,
    "viewerHasLiked": true,
    "authorId": "user_1",
    "author": {
      "id": "user_1",
      "username": "alice",
      "avatar": "https://cdn.example.com/avatar.png"
    }
  }
}
```

### 说明

- `plays` 是详情页顶部统计展示值
- `likes` 同时用于详情页统计区和点赞按钮
- `viewerHasLiked` 强烈建议直接返回，虽然详情页也支持单独调用 like-status 接口

## 5.2 Feed 列表接口

涉及接口：

- `GET /api/v1/feed/trending`
- `GET /api/v1/feed/latest`
- `GET /api/v1/feed/following`

每个 `items[]` 中的游戏对象，建议至少包含：

```json
{
  "id": "game_123",
  "title": "星际投篮",
  "plays": 1234,
  "likes": 88,
  "viewerHasLiked": false,
  "author": {
    "id": "user_1",
    "username": "alice"
  }
}
```

### 设计原则

1. 列表页必须直接给 `plays`
2. 列表页必须直接给 `likes`
3. 列表页最好直接给 `viewerHasLiked`

如果列表页不给 `viewerHasLiked`，前端第一阶段仍可工作，但会有两个退化：

- 卡片初始心形态默认按未点赞展示
- 用户只有点击后，状态才会与后端完全对齐

## 5.3 我的作品列表接口

### 接口

`GET /api/v1/games/my`

### 前端用途

- 我的作品页展示作品点赞数
- 用户在个人页点击点赞按钮时，需要更新该卡片的点赞数

建议返回：

```json
{
  "items": [
    {
      "id": "game_123",
      "title": "星际投篮",
      "likes": 88,
      "plays": 1234,
      "viewerHasLiked": false
    }
  ]
}
```

---

## 6. 播放上报接口实施要求

当前前端仓库中，没有一个已存在且可确认的“播放上报”写接口，因此后端需要明确提供。

## 6.1 推荐接口

### 接口

`POST /api/v1/games/:gameId/play`

### 用途

当用户真正进入可玩页面时，前端调用此接口，记录一次真实播放行为。

### 请求体

第一阶段建议最简实现：

```json
{}
```

如果后端需要埋点来源，推荐扩展为：

```json
{
  "source": "feed | detail | profile | share | fork",
  "sessionId": "string"
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "recorded": true,
    "plays": 1235
  }
}
```

### 字段语义

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `recorded` | boolean | 是 | 本次请求是否成功计入播放 |
| `plays` | number | 是 | 计入后该游戏最新播放总数 |

### 后端必须先定清楚的业务规则

1. 一次打开游戏是否必定记一次播放  
   这是推荐方案，第一阶段最简单。

2. 是否需要去重  
   如果需要，建议基于 `userId + gameId + sessionId` 去重，而不是让前端猜测。

3. 未登录是否允许记录播放  
   推荐允许，并将匿名播放计入总数。

4. 如果作品当前 `canPlay = false`，前端不会发起真正试玩  
   因此后端不需要在这个接口里再重复扣权限，只需要做存在性与可见性校验。

## 6.2 调用时机建议

前端建议在以下时机调用：

1. 用户从详情页点击“试玩”，且成功进入播放页后
2. 用户从首页/发现页直接进入播放页后
3. 用户通过分享链接打开作品并成功进入播放页后

注意：

- 不能在“仅打开详情页”时就记播放
- 必须在“进入真正可玩的页面或 WebView”时再记

---

## 7. 如果后端不返回 viewerHasLiked，需要补的批量接口

若后端不希望在 Feed 列表对象中嵌入 `viewerHasLiked`，则必须提供一个批量查询接口，否则首页/发现页会出现大量单条查询请求。

### 推荐接口

`POST /api/v1/social/like-status/batch`

### 请求体

```json
{
  "targetType": "game",
  "targetIds": ["game_1", "game_2", "game_3"]
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      { "targetId": "game_1", "liked": true },
      { "targetId": "game_2", "liked": false },
      { "targetId": "game_3", "liked": true }
    ]
  }
}
```

### 第一阶段推荐

优先级排序如下：

1. 最优：在 Feed / Game 详情响应里直接返回 `viewerHasLiked`
2. 次优：补批量状态接口
3. 最弱：前端对每个游戏单独调 `like-status`

---

## 8. 权限与错误码要求

## 8.1 点赞接口

### `POST /api/v1/social/like`

- 未登录：`401`
- 目标不存在：`404`
- 参数错误：`400`

推荐错误体：

```json
{
  "code": 1002,
  "message": "game not found"
}
```

## 8.2 播放接口

### `POST /api/v1/games/:gameId/play`

- 游戏不存在：`404`
- 无访问权限：`403`
- 参数错误：`400`

如果后端允许匿名播放：

- 未登录不应返回 `401`

---

## 9. 数据一致性要求

后端实施时，请明确保证以下一致性：

1. 点赞切换后，接口返回的 `likes` 必须可立即用于覆盖前端显示值
2. 详情页的 `likes` 与点赞接口返回的 `likes` 不能长期不一致
3. 播放上报接口返回的 `plays` 与后续详情 / Feed 拉取的数据必须一致
4. 同一用户并发点击点赞，不得造成计数负数、双加、双减

---

## 10. 前端联调所需的最小 API 清单

第一阶段，前端要彻底摆脱 mock / 半 mock 状态，后端至少需要支持以下接口能力：

### 已有但必须满足契约

1. `POST /api/v1/social/like`
2. `GET /api/v1/social/like-status/:targetType/:targetId`
3. `GET /api/v1/games/:gameId`
4. `GET /api/v1/feed/trending`
5. `GET /api/v1/feed/latest`
6. `GET /api/v1/feed/following`
7. `GET /api/v1/games/my`

### 需要新增或明确落地

1. `POST /api/v1/games/:gameId/play`

### 推荐新增

1. `POST /api/v1/social/like-status/batch`

---

## 11. 验收标准

后端完成后，应满足以下联调结果：

1. 首页卡片点赞后，卡片上的点赞数立即变化，刷新后仍正确
2. 发现页卡片点赞后，卡片上的点赞数立即变化，刷新后仍正确
3. 详情页打开时，点赞按钮能正确显示用户当前是否已点赞
4. 详情页点赞后，统计区和按钮数字保持一致
5. 我的作品页点赞后，卡片数字刷新正确
6. 用户进入真实游戏播放页后，播放数能被后端记录
7. 详情页 / Feed 列表再次拉取后，播放数为最新值

---

## 12. 后端实施建议优先级

### P0

1. 保证 `POST /api/v1/social/like` 返回 `{ liked, likes }`
2. 保证 `GET /api/v1/social/like-status/:type/:id` 可用
3. 所有游戏读接口稳定返回 `likes` 和 `plays`
4. 明确并落地 `POST /api/v1/games/:gameId/play`

### P1

1. 在游戏详情和 Feed 对象里返回 `viewerHasLiked`

### P2

1. 增加 `POST /api/v1/social/like-status/batch`

---

## 13. 对前端的直接影响

如果后端只完成 P0：

- 点赞功能可以全面真实化
- 播放量可以开始真实记录
- 首页/发现页初始点赞态可能仍有轻微退化

如果后端完成到 P1：

- 前端所有游戏卡片都能在首次渲染时显示正确点赞态

如果后端完成到 P2：

- 即使部分列表接口不方便返回 `viewerHasLiked`，前端也能高效批量补齐
