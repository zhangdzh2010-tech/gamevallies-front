# GameVallies 后端实现方案：创建、继续优化、Fork 授权与恢复

> 版本：v1.1  
> 日期：2026-03-22  
> 状态：待后端开发  
> 适用范围：微信小程序 Taro 前端当前已落地的创建、继续优化、Fork、权限设置、登录恢复、额度联动流程

---

## 1. 文档目标

本文档用于指导后端实现以下能力，并确保与当前前端行为完全对齐：

1. 用户点击底部 Tab「创建」时，默认进入全新创建流程。
2. 用户从「我的作品 / 草稿 / 详情页」点击“继续优化”时，恢复同一个作品并继续迭代。
3. 用户可以 Fork 他人作品，但前提是作者已显式授权。
4. 作者可以配置作品是否允许被 Fork。
5. 未登录用户点击“Fork 后继续创作”后，登录后即使发生小程序冷启动，也必须回到同一个源作品并继续该意图。
6. Fork 会计入一次“创建额度消耗”。
7. 作者后续关闭 Fork 权限或删除源作品时，已经 Fork 出来的副本仍然永久独立保留，不受追溯限制。
8. 创建、继续优化、Fork、副本恢复、试玩按钮状态，均依赖稳定的作品状态、权限字段和额度字段，后端必须提供一致语义。

本文档不仅描述接口列表，还会明确：

- 用户业务旅程
- 接口路径、请求体、响应体
- 权限与鉴权规则
- 状态机约束
- 数据模型与迁移建议
- 错误码与错误语义
- 并发与幂等策略
- 联调验收清单

---

## 2. 用户业务旅程

本节从用户视角审视完整业务流程，后端实现必须支撑这些旅程闭环。

### 2.1 旅程 A：全新创建

#### 用户路径

1. 用户点击底部 Tab「创建」。
2. 前端进入全新创建模式，清空上一次本地创建会话。
3. 用户填写 prompt，发起创建。
4. 前端调用 `POST /api/v1/games/generate`。
5. 后端返回 `gameId`。
6. 前端轮询 `GET /api/v1/games/:id`。
7. 当状态变为可完成态时，前端展示创建完成页。
8. 若 `canPlay = false`，前端展示“订阅后试玩”。

#### 后端必须满足

- `generate` 只创建新作品，不复用旧作品 ID。
- 轮询使用同一个 `gameId`。
- 后端必须稳定返回以下状态语义：
  - 完成态：`ready` / `draft` / `review` / `published`
  - 失败态：`failed`
- 作品详情中必须包含：
  - `status`
  - `gameUrl`
  - `canPlay`
  - `allowFork`

### 2.2 旅程 B：继续优化自己的作品

#### 用户路径

1. 用户从草稿页、作品详情页点击“继续优化”。
2. 前端进入创建页 `resume` 模式。
3. 若本地没有完整作品对象，前端调用 `GET /api/v1/games/:id` 获取作品详情。
4. 前端展示“创作完成 / 再次优化”视图。
5. 用户提交优化意见。
6. 前端调用 `POST /api/v1/games/:id/iterate`。
7. 前端继续轮询 `GET /api/v1/games/:id`。

#### 后端必须满足

- `iterate` 必须作用于原作品 ID，不得生成新 `gameId`。
- 继续优化后仍然通过同一 `gameId` 查询最新状态与内容。
- 非作者调用 `iterate` 必须被拒绝。

### 2.3 旅程 C：Fork 他人作品并继续创作

#### 用户路径

1. 用户进入他人作品详情页。
2. 前端读取 `allowFork` 决定是否允许 Fork。
3. 若 `allowFork = true`，用户点击“Fork 后继续创作”。
4. 前端调用 `POST /api/v1/games/:id/fork`。
5. 后端返回新副本的 `gameId`。
6. 前端立即调用 `GET /api/v1/games/:newId`。
7. 前端跳入创建页 `resume` 模式，继续优化这个新副本。

#### 后端必须满足

- `fork` 必须生成新的作品 ID。
- 新副本必须属于当前登录用户。
- `POST /fork` 返回成功时，新副本必须已经达到“可恢复、可继续优化”的状态。
- 前端当前不支持 `202 + taskId` 异步 Fork 协议，因此第一阶段不能返回异步中间态成功。

### 2.4 旅程 D：未登录用户点击“Fork 后继续创作”

#### 产品规则

未登录用户点击“Fork 后继续创作”时，登录后无论是否发生冷启动，都必须回到同一个源作品并继续原意图。

#### 第一阶段实现约束

前端会持久化最小必要意图：

- `action = fork_then_resume`
- `sourceGameId`

后端必须满足：

1. 不依赖临时页面会话、服务端进程内状态或一次性 session 上下文完成 Fork。
2. 登录恢复后，客户端必须能够仅基于 `sourceGameId` 再次执行：
   - `GET /api/v1/games/:sourceGameId`
   - `POST /api/v1/games/:sourceGameId/fork`
3. Fork 权限判定必须完全基于：
   - 当前登录用户
   - 源作品当前状态
   - 源作品当前权限

#### 结论

第一阶段不要求后端新增 `intent token` 接口；但后端必须支持“无状态重试”。

### 2.5 旅程 E：作者开启 Fork 权限

#### 产品规则

当作者开启 `allowFork` 时，前端必须提示作者如下语义：

> 开启后，其他用户可以复制并修改你的作品。  
> 即使你后续关闭 Fork 权限，已经创建出来的副本也不会被回收或限制。

#### 对后端的约束

- `allowFork` 的变更仅影响未来的 Fork 请求。
- 对已经成功 Fork 出去的副本，不做追溯限制。
- 即使源作品后续关闭 Fork 权限或被删除，既有副本仍是独立资产。

### 2.6 旅程 F：源作品后续关闭 Fork 权限或被删除

#### 产品规则

1. 已经 Fork 成功的副本永久独立保留。
2. 关闭 Fork 权限只影响未来新发起的 Fork。
3. 删除源作品也不影响已存在副本的继续优化、试玩、发布和查看。

#### 对后端的约束

- 不能对既有副本做追溯禁用。
- `source_game_id` / `root_game_id` 建议保留为血缘信息，不作为运行时强依赖。
- 不建议使用 `ON DELETE CASCADE` 删除已存在的副本。

---

## 3. 前端当前依赖的接口清单

| 能力 | 方法 | 路径 | 是否必须 |
|------|------|------|------|
| 获取作品详情 | `GET` | `/api/v1/games/:gameId` | 是 |
| 获取我的作品列表 | `GET` | `/api/v1/games/my?page=1&limit=10` | 是 |
| 新建作品 | `POST` | `/api/v1/games/generate` | 是 |
| 继续优化作品 | `POST` | `/api/v1/games/:gameId/iterate` | 是 |
| Fork 他人作品 | `POST` | `/api/v1/games/:gameId/fork` | 是 |
| 修改作品权限 | `PATCH` | `/api/v1/games/:gameId/settings` | 是 |
| 查询用户额度 | `GET` | `/api/v1/users/quota` | 建议保持兼容 |
| 解锁作品试玩 | `POST` | `/api/v1/games/:gameId/unlock` | 建议保持兼容 |

---

## 4. 统一响应协议要求

前端当前请求封装对响应协议有明确要求，后端必须兼容。

### 4.1 成功响应

推荐统一返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

兼容行为：

- `code = 0` 视为成功
- `code = 200` 也会被前端视为成功
- 前端实际消费的是 `data`

### 4.2 失败响应

HTTP 状态码必须正确设置，且返回可读 `message`：

```json
{
  "code": "GAME_FORK_FORBIDDEN",
  "message": "作者未开放 Fork 权限"
}
```

要求：

- `4xx/5xx` 必须带 `message`
- `message` 必须可直接展示给用户
- 推荐带业务 `code`

### 4.3 鉴权

- 公开作品详情可匿名访问
- 其余写操作均要求 `Authorization: Bearer <token>`
- 无权限时：
  - `401 Unauthorized`：未登录或 token 无效
  - `403 Forbidden`：已登录但无权操作

---

## 5. Game 对象契约

## 5.1 公共字段

以下字段应作为公共作品详情字段稳定返回：

```json
{
  "id": "game_123",
  "title": "消灭方块",
  "description": "一款休闲益智小游戏",
  "status": "draft",
  "gameUrl": "https://cdn.example.com/games/game_123/index.html",
  "canPlay": true,
  "visibility": "public",
  "allowComments": true,
  "allowFork": false,
  "emoji": "🎮",
  "color": "#6e56ff",
  "tags": ["益智", "休闲"],
  "plays": 123,
  "likes": 45,
  "forks": 6,
  "avgPlayTime": "3m",
  "createdAt": "2026-03-22T09:30:00.000Z",
  "updatedAt": "2026-03-22T10:00:00.000Z",
  "authorId": "user_001",
  "author": {
    "id": "user_001",
    "username": "微信用户",
    "avatar": "https://cdn.example.com/avatar/u1.png",
    "bio": "专注休闲小游戏创作"
  }
}
```

### 字段说明

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 作品 ID |
| `title` | string | 是 | 作品标题 |
| `description` | string | 是 | 作品简介 |
| `status` | string | 是 | 作品状态 |
| `gameUrl` | string \| null | 是 | 可访问地址；详情、试玩、恢复、Fork 副本都会依赖 |
| `canPlay` | boolean | 是 | 当前请求用户视角下是否可试玩 |
| `visibility` | enum | 是 | `public / friends / private` |
| `allowComments` | boolean | 是 | 是否允许评论 |
| `allowFork` | boolean | 是 | 是否允许 Fork |
| `emoji` | string \| null | 建议 | 列表和详情展示 |
| `color` | string \| null | 建议 | 详情页头图与分享展示 |
| `tags` | string[] | 建议 | 标签展示 |
| `plays` | number | 建议 | 播放量 |
| `likes` | number | 建议 | 点赞数 |
| `forks` | number | 建议 | Fork 数 |
| `avgPlayTime` | string \| number \| null | 建议 | 平均游玩时长 |
| `authorId` | string | 是 | 作者 ID |
| `author.id` | string | 是 | 作者 ID，和 `authorId` 一致 |
| `author.username` | string | 是 | 作者昵称 |
| `author.avatar` | string \| null | 建议 | 作者头像 |
| `author.bio` | string \| null | 建议 | 作者简介 |

## 5.2 仅作者视角返回的扩展字段

以下字段属于 viewer-specific 字段，不应对所有访客无差别暴露：

| 字段 | 类型 | 返回条件 | 说明 |
|------|------|------|------|
| `quotaRemaining` | number \| null | 仅请求用户为作品作者本人时返回 | 当前作者剩余免费额度 |

后端要求：

1. 匿名访问公开作品时，不返回 `quotaRemaining`。
2. 非作者访问公开作品时，不返回 `quotaRemaining`。
3. 作者本人访问时，可以在 `GET /games/:id` 详情中返回该字段。
4. 若后端更倾向完全隔离，也可仅通过 `GET /api/v1/users/quota` 提供额度信息；但第一阶段为兼容现有前端，建议保留作者视角追加字段能力。

## 5.3 `allowFork` 的兼容性要求

前端当前判断逻辑为：

```js
game.allowFork !== false
```

这意味着：

- 若后端不返回 `allowFork`，前端会默认“允许 Fork”
- 因此后端必须显式返回 `allowFork`
- 历史数据必须回填明确值，避免误开放

第一阶段强约束：

- 数据库默认值：`allow_fork = false`
- 历史数据回填：`allow_fork = false`
- 新作品默认值：`allowFork = false`
- Fork 新副本默认值：`allowFork = false`

---

## 6. 作品状态机约定

### 6.1 状态集合

| 状态 | 含义 | 前端行为 |
|------|------|------|
| `generating` | 正在生成或正在迭代 | 创建页显示“AI 创作中” |
| `draft` | 可查看、可继续优化、未正式发布 | 创建完成页可展示；个人页归为草稿 |
| `ready` | 已生成完成，可查看，可继续优化 | 创建完成页可展示 |
| `review` | 处理中但已可展示 | 创建完成页可展示 |
| `published` | 已发布作品 | 创建完成页可展示；已发布列表归档 |
| `failed` | 生成或迭代失败 | 前端停止轮询并提示失败 |

### 6.2 前端当前完成态判断

前端轮询逻辑等价于：

```js
if (['ready', 'draft', 'published', 'review'].includes(status)) {
  // 视为完成
}

if (status === 'failed') {
  // 视为失败
}
```

结论：

- 后端若使用其他状态名，前端无法正确结束轮询
- 第一阶段必须兼容上述状态值

---

## 7. 接口设计

## 7.1 获取作品详情

### 接口

```http
GET /api/v1/games/:gameId
```

### 用途

- 详情页展示
- 分享打开作品
- 创建页 `resume` 恢复作品
- Fork 成功后拉取新副本
- 生成与迭代轮询状态

### 可见性规则

| 场景 | 建议返回 |
|------|------|
| 作品不存在 | `404` |
| 匿名访问私密作品 | `404` 或 `403` |
| 非作者访问草稿 | `404` |
| 好友关系不满足 | `403` |

### 成功响应示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "game_123",
    "title": "消灭方块",
    "description": "一款休闲益智小游戏",
    "status": "draft",
    "gameUrl": "https://cdn.example.com/games/game_123/index.html",
    "canPlay": true,
    "visibility": "public",
    "allowComments": true,
    "allowFork": false,
    "emoji": "🎮",
    "color": "#6e56ff",
    "tags": ["益智", "休闲"],
    "plays": 123,
    "likes": 45,
    "forks": 6,
    "avgPlayTime": "3m",
    "authorId": "user_001",
    "author": {
      "id": "user_001",
      "username": "微信用户",
      "avatar": "https://cdn.example.com/avatar/u1.png",
      "bio": "专注休闲小游戏创作"
    },
    "createdAt": "2026-03-22T09:30:00.000Z",
    "updatedAt": "2026-03-22T10:00:00.000Z"
  }
}
```

### 作者本人访问时可追加字段

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "game_123",
    "quotaRemaining": 2
  }
}
```

### 后端实现要求

1. 返回内容必须是该作品当前最新版本。
2. `canPlay` 必须是“当前请求用户视角”的结果，不建议前端自行推导。
3. `quotaRemaining` 只允许在作者视角下返回。
4. Fork 副本也必须返回完整可迭代上下文。
5. 建议额外返回血缘信息：
   - `sourceGameId`
   - `rootGameId`
   - `forkedFromAuthorId`

## 7.2 获取我的作品列表

### 接口

```http
GET /api/v1/games/my?page=1&limit=10
Authorization: Bearer <token>
```

### 用途

- 个人页展示作品与草稿
- “继续优化”“权限设置”“删除”等操作依赖该列表对象

### 成功响应示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": "game_123",
        "title": "消灭方块",
        "description": "一款休闲益智小游戏",
        "status": "draft",
        "gameUrl": "https://cdn.example.com/games/game_123/index.html",
        "canPlay": true,
        "visibility": "public",
        "allowComments": true,
        "allowFork": false,
        "likes": 12,
        "plays": 98,
        "forks": 3,
        "emoji": "🎮",
        "coverUrl": "https://cdn.example.com/covers/123.png",
        "updatedAt": "2026-03-22T10:00:00.000Z"
      }
    ],
    "page": 1,
    "limit": 10,
    "hasMore": true,
    "total": 58
  }
}
```

### 后端实现要求

1. 仅返回当前登录用户拥有的作品。
2. 排序建议按 `updatedAt DESC`。
3. 列表项必须带上：
   - `status`
   - `allowFork`
   - `allowComments`
   - `visibility`

## 7.3 新建作品

### 接口

```http
POST /api/v1/games/generate
Authorization: Bearer <token>
Content-Type: application/json
```

### 请求体

```json
{
  "prompt": "做一个左右躲避陨石的小游戏",
  "title": "陨石闪避"
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "gameId": "game_123"
  }
}
```

### 后端实现要求

1. 创建新作品记录，初始状态建议为 `generating`。
2. 作品所有者为当前登录用户。
3. 默认权限建议：
   - `visibility = public`
   - `allowComments = true`
   - `allowFork = false`
4. 必须给出新作品的 `canPlay` 语义。
5. 创建额度规则：
   - 有订阅：`canPlay = true`
   - 无订阅但有免费额度：扣减一次额度，`canPlay = true`
   - 无订阅且额度已耗尽：仍允许创建，但 `canPlay = false`

## 7.4 继续优化作品

### 接口

```http
POST /api/v1/games/:gameId/iterate
Authorization: Bearer <token>
Content-Type: application/json
```

### 请求体

```json
{
  "feedback": "把角色移动速度调快一些，并增加失败后的重试按钮"
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "iterationId": "iter_456"
  }
}
```

### 权限要求

- 仅作品作者本人可调用
- 非作者返回 `403`

### 后端实现要求

1. `iterate` 必须作用于原作品 ID。
2. 不允许生成新的 `gameId`。
3. 处理完成后，仍通过原 `gameId` 返回新内容。
4. 若失败，必须将作品状态置为 `failed`。

## 7.5 Fork 他人作品

### 接口

```http
POST /api/v1/games/:gameId/fork
Authorization: Bearer <token>
Content-Type: application/json
```

### 请求体

当前前端发送空对象：

```json
{}
```

### 成功响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "gameId": "game_999"
  }
}
```

### 权限校验顺序

1. 用户已登录，否则 `401`
2. 源作品存在，否则 `404`
3. 调用人不是源作品作者，否则 `409` 或 `403`
4. 源作品对当前用户可见，否则 `403` 或 `404`
5. 源作品 `allowFork = true`，否则 `403`
6. 若业务限定只有已发布作品可 Fork，则状态不满足返回 `409`

### 推荐错误语义

| 场景 | HTTP | code | message |
|------|------|------|------|
| 未登录 | `401` | `UNAUTHORIZED` | `请先登录后再 Fork` |
| Fork 自己的作品 | `409` | `GAME_FORK_SELF_FORBIDDEN` | `不能 Fork 自己的作品` |
| 作者未授权 | `403` | `GAME_FORK_FORBIDDEN` | `作者未开放 Fork 权限` |
| 源作品不可见 | `403` | `GAME_NOT_VISIBLE` | `你无权访问该作品` |
| 源作品不存在 | `404` | `GAME_NOT_FOUND` | `作品不存在` |

### 后端实现要求

1. 生成一个新的 `gameId`
2. 新副本 `ownerId` 必须为当前登录用户
3. 新副本建议默认状态为 `draft`
4. 新副本必须能被 `GET /api/v1/games/:newId` 立即读取
5. 新副本必须可继续调用 `POST /api/v1/games/:newId/iterate`
6. 必须记录血缘关系：
   - `sourceGameId`
   - `rootGameId`
7. 应同步增加源作品 `forks` 计数，或异步可靠更新

### Fork 成功语义：第一阶段必须同步成功

当前前端在 `POST /fork` 成功后会立刻：

1. `GET /api/v1/games/:newId`
2. 跳转创建页 `resume`

因此第一阶段必须满足：

1. `POST /api/v1/games/:id/fork` 返回 `200` 时，表示新副本已经达到“可恢复、可继续优化”的状态。
2. `GET /api/v1/games/:newId` 必须稳定返回 `200`。
3. 新副本状态必须属于前端识别的完成态之一：
   - `draft`
   - `ready`
   - `review`
   - `published`
4. 新副本必须已具备继续迭代所需的完整上下文，例如：
   - `prompt`
   - `design_context`
   - 可继续生成或迭代所需的资源引用
5. 若源作品在 Fork 前已有可用 `gameUrl`，新副本在成功返回时也应具备可用 `gameUrl`，或具备稳定可解析的继承引用。
6. 当前前端不支持 `202 + taskId` 异步 Fork 协议，第一阶段不要返回异步成功。

### Fork 的额度与试玩规则

这是本次业务决策中的硬约束。

Fork 按一次“创建额度消耗”处理，规则与 `generate` 保持一致：

1. 有订阅：
   - 允许 Fork
   - 不扣免费额度
   - 新副本 `canPlay = true`
2. 无订阅但有免费额度：
   - 允许 Fork
   - 扣减一次免费额度
   - 新副本 `canPlay = true`
3. 无订阅且免费额度耗尽：
   - 仍允许 Fork
   - 不再有可用免费额度可扣
   - 但新副本 `canPlay = false`

说明：

- 之所以采用该规则，是为了与“全新创建”的额度模型保持一致。
- 若未来产品决定“额度不足时直接禁止 Fork”，则需要前后端同时改动；第一阶段不要按该模式实现。

### 复制内容建议

Fork 至少应复制以下内容：

- 标题
- 描述
- 游戏资源或构建产物引用
- Prompt
- 继续迭代所需的设计上下文
- 标签、颜色、封面、emoji 等展示属性

建议不要直接复制以下内容：

- 点赞数
- 评论数
- 播放数
- 分享数
- 作者信息

### 新副本的推荐默认值

| 字段 | 推荐值 |
|------|------|
| `status` | `draft` |
| `visibility` | `private` |
| `allowComments` | `true` |
| `allowFork` | `false` |
| `sourceGameId` | 原作品 ID |
| `rootGameId` | 原始祖先作品 ID |

说明：

- `visibility = private`：避免用户 Fork 后未经确认就自动公开。
- `allowFork = false`：保持“是否允许被 Fork 需要作者显式授权”的产品语义。

### 非追溯性规则

这是本次产品确认的硬约束。

1. 一旦某个副本已成功 Fork 出来，它就是当前 Fork 用户名下的独立作品。
2. 源作者后续关闭 `allowFork`，不影响既有副本。
3. 源作者后续删除源作品，不影响既有副本。
4. 已存在副本仍然可以：
   - 查看
   - 继续优化
   - 试玩
   - 发布
   - 修改自己的权限设置

## 7.6 修改作品权限

### 接口

```http
PATCH /api/v1/games/:gameId/settings
Authorization: Bearer <token>
Content-Type: application/json
```

### 请求体

```json
{
  "visibility": "public",
  "allowComments": true,
  "allowFork": false
}
```

### 权限要求

- 仅作品作者本人可调用
- 非作者返回 `403`

### 成功响应

建议返回更新后的作品设置：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "game_123",
    "visibility": "public",
    "allowComments": true,
    "allowFork": false,
    "updatedAt": "2026-03-22T11:30:00.000Z"
  }
}
```

### 后端实现要求

1. 支持部分字段更新，不要求全量提交。
2. 只更新请求中出现的字段。
3. 建议返回最新设置结果。
4. 建议写入审计日志。

### 开启 Fork 时的产品提示与后端约束

当作者将 `allowFork` 从 `false` 改为 `true` 时，前端需弹出确认提示：

> 开启后，其他用户可以复制并修改你的作品。  
> 即使你后续关闭 Fork 权限，已经创建出来的副本也不会被限制。

对后端而言：

1. 不要求单独实现弹窗接口。
2. 但必须按该提示语义实施，即权限变更只影响未来请求，不追溯既有副本。
3. 建议在审计日志中记录本次 `allowFork` 开启行为。

## 7.7 用户额度接口

### 接口

```http
GET /api/v1/users/quota
Authorization: Bearer <token>
```

### 用途

- 创建或 Fork 后刷新剩余额度
- 个人页展示免费额度与订阅状态

### 成功响应示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "freeQuota": 3,
    "totalFreeQuota": 5,
    "subscription": {
      "active": false,
      "planId": null,
      "planName": null,
      "expiresAt": null,
      "usedThisPeriod": 0,
      "quotaThisPeriod": 0
    }
  }
}
```

---

## 8. 权限矩阵

| 接口 | 匿名 | 登录非作者 | 作者本人 |
|------|------|------|------|
| `GET /games/:id` 公开作品 | 可访问 | 可访问 | 可访问 |
| `GET /games/:id` 私密/草稿 | 不可访问 | 不可访问 | 可访问 |
| `GET /games/my` | 不可访问 | 仅可访问自己 | 仅可访问自己 |
| `POST /games/generate` | 不可访问 | 可访问 | 可访问 |
| `POST /games/:id/iterate` | 不可访问 | 不可访问 | 可访问 |
| `POST /games/:id/fork` | 不可访问 | 满足授权规则时可访问 | 不可访问 |
| `PATCH /games/:id/settings` | 不可访问 | 不可访问 | 可访问 |

### 可见性与 Fork 的关系

| visibility | allowFork | 是否允许他人 Fork |
|------|------|------|
| `public` | `true` | 允许 |
| `public` | `false` | 不允许 |
| `friends` | `true` | 仅有查看权限的好友允许 |
| `friends` | `false` | 不允许 |
| `private` | 任意 | 实际上不允许他人 Fork |

---

## 9. 数据模型建议

## 9.1 `games` 表字段建议

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string / uuid | 主键 |
| `owner_id` | string | 作品作者 |
| `title` | varchar | 标题 |
| `description` | text | 描述 |
| `status` | varchar | 状态 |
| `game_url` | text | 当前可访问地址 |
| `visibility` | varchar | `public / friends / private` |
| `allow_comments` | boolean | 是否允许评论 |
| `allow_fork` | boolean | 是否允许 Fork |
| `source_game_id` | string \| null | 直接 Fork 来源 |
| `root_game_id` | string \| null | 最初祖先作品 ID |
| `prompt` | text | 原始 Prompt |
| `design_context` | jsonb | 继续迭代所需上下文 |
| `thumbnail_url` | text \| null | 缩略图 |
| `cover_url` | text \| null | 封面图 |
| `emoji` | varchar \| null | 表情图标 |
| `color` | varchar \| null | 主题色 |
| `plays_count` | int | 播放量 |
| `likes_count` | int | 点赞量 |
| `forks_count` | int | Fork 数 |
| `shares_count` | int | 分享数 |
| `avg_play_time` | int \| null | 平均时长，建议秒 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

## 9.2 血缘关系建议

### `source_game_id`

- 表示该副本直接 Fork 自哪个作品

### `root_game_id`

- 表示该作品血缘链的最初祖先

建议：

- 将血缘信息作为“统计、追踪、审计”用途保存
- 不要让既有副本在运行时强依赖源作品仍然存在

## 9.3 可选扩展表

### `game_iterations`

用于记录每次迭代任务：

| 字段 | 说明 |
|------|------|
| `id` | 迭代任务 ID |
| `game_id` | 作品 ID |
| `feedback` | 优化意见 |
| `status` | 任务状态 |
| `created_by` | 发起人 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

### `game_forks`

用于记录 Fork 行为日志：

| 字段 | 说明 |
|------|------|
| `id` | 主键 |
| `source_game_id` | 源作品 |
| `forked_game_id` | 新副本 |
| `forked_by` | Fork 用户 |
| `created_at` | Fork 时间 |

---

## 10. 数据迁移要求

### 10.1 必做迁移

1. 为 `games` 表新增：
   - `visibility`
   - `allow_comments`
   - `allow_fork`
   - `source_game_id`
   - `root_game_id`
2. 默认值：
   - `allow_comments = true`
   - `allow_fork = false`
   - `visibility = public`
3. 对历史数据回填：
   - `allow_fork = false`
   - 避免历史作品因空值被误判为允许 Fork

### 10.2 删除策略

若存在源作品删除需求：

- 不要对已 Fork 副本做级联删除
- 不要使用会导致副本消失的强删除外键策略

### 10.3 索引建议

- `(owner_id, updated_at DESC)`
- `(status, updated_at DESC)`
- `(source_game_id)`
- `(root_game_id)`

---

## 11. 关键实现细节

### 11.1 `iterate` 必须保持原作品 ID

这是当前前端链路的硬约束。

如果 `iterate` 生成新的 `gameId`，前端会继续轮询旧作品，导致流程失效。

### 11.2 `fork` 必须生成新作品 ID

Fork 与 iterate 相反，Fork 必须是独立副本，否则无法归属到 Fork 用户。

### 11.3 Fork 成功时必须可立即读取

`POST /fork` 成功后，前端马上会请求 `GET /games/:newId`。

因此后端必须保证：

- 新副本已落库
- 状态属于可恢复态
- 可继续优化

### 11.4 登录恢复时不得依赖一次性会话

由于产品要求“登录后即使冷启动也能回到同一作品”，后端不得将 Fork 能力依赖于一次性 session。

---

## 12. 并发与幂等建议

### 12.1 Fork 并发

同一用户短时间内重复点击 Fork，建议：

- 第一阶段允许多次 Fork，产生多个副本
- 但必须记录完整日志

### 12.2 iterate 并发

同一作品在一次迭代未完成时，建议拒绝新的 iterate：

- 返回 `409 Conflict`
- `message = "当前作品正在处理中，请稍后再试"`

### 12.3 settings 并发

建议采用“最后写入生效”，同时保留审计日志。

---

## 13. 错误码建议

| code | HTTP | 说明 |
|------|------|------|
| `GAME_NOT_FOUND` | `404` | 作品不存在 |
| `GAME_NOT_VISIBLE` | `403` | 当前用户无权查看 |
| `GAME_ITERATE_FORBIDDEN` | `403` | 当前用户无权继续优化该作品 |
| `GAME_FORK_FORBIDDEN` | `403` | 作者未开放 Fork 权限 |
| `GAME_FORK_SELF_FORBIDDEN` | `409` | 不能 Fork 自己的作品 |
| `GAME_STATUS_INVALID` | `409` | 当前状态不允许操作 |
| `GAME_PROCESSING` | `409` | 当前作品正在处理中 |
| `GAME_SETTINGS_FORBIDDEN` | `403` | 无权修改作品设置 |
| `QUOTA_INSUFFICIENT` | `409` | 免费额度不足；第一阶段建议不用于阻断 Fork/创建，只用于日志与监控 |

---

## 14. 联调验收清单

## 14.1 创建与恢复

1. 用户点击底部“创建”，进入全新创建。
2. 创建完成后再次点击底部“创建”，不再显示上次作品，确认是全新会话。
3. 从草稿页点击“优化”，能恢复同一作品并继续优化。
4. 从自己的作品详情页点击“继续创作”，能恢复同一作品。

## 14.2 Fork 成功场景

1. 作者将 `allowFork` 设为 `true`。
2. 其他已登录用户进入详情页，Fork 成功。
3. 后端返回新 `gameId`。
4. 前端可立即 `GET /games/:newId`。
5. 进入创建页后，可对副本继续优化。
6. 源作品 `forks` 计数增加。
7. 若 Fork 用户无订阅但仍有免费额度，则扣减一次额度。
8. 若 Fork 用户额度已耗尽，则仍允许 Fork，但新副本 `canPlay = false`。

## 14.3 未登录恢复场景

1. 未登录用户在详情页点击“Fork 后继续创作”。
2. 跳转登录页。
3. 登录后即使小程序冷启动，也能回到同一个 `sourceGameId` 的意图。
4. 恢复后重新执行 Fork，并进入副本创建页。

## 14.4 Fork 拒绝场景

1. 未登录直接调用 Fork API，返回 `401`。
2. 用户 Fork 自己作品，返回 `409` 或 `403`。
3. 作者关闭 `allowFork` 后，其他用户新发起 Fork 返回 `403`。
4. 非可见作品 Fork 返回 `403` 或 `404`。

## 14.5 iterate

1. 作者对自己的作品调用 iterate 成功。
2. 同作品处理完成后，`GET /games/:id` 返回新内容。
3. 非作者 iterate 返回 `403`。
4. 处理中重复 iterate 返回 `409`。

## 14.6 既有副本的非追溯性

1. 用户已成功 Fork 某作品。
2. 源作者后续关闭 `allowFork`。
3. 该已有副本仍能继续优化和试玩。
4. 源作者后续删除源作品。
5. 该已有副本仍然存在，不被回收，不受限制。

## 14.7 权限设置

1. 作者修改 `allowFork` 成功。
2. 修改后再次 `GET /games/:id` 返回最新值。
3. 非作者修改设置返回 `403`。
4. 作者开启 Fork 时，前端能展示非追溯性的确认提示。

---

## 15. 监控与日志建议

建议记录以下结构化事件：

- `game_generate_requested`
- `game_generate_completed`
- `game_generate_failed`
- `game_iterate_requested`
- `game_iterate_completed`
- `game_iterate_failed`
- `game_fork_requested`
- `game_fork_completed`
- `game_fork_denied`
- `game_settings_updated`

每条日志建议包含：

- `requestId`
- `userId`
- `gameId`
- `sourceGameId`
- `rootGameId`
- `status`
- `errorCode`
- `elapsedMs`

---

## 16. 推荐开发顺序

1. 补 `games` 表权限字段与血缘字段迁移。
2. 补齐 `GET /games/:id` 字段输出与权限判断。
3. 落 `PATCH /games/:id/settings`。
4. 落 `POST /games/:id/fork`，同时实现额度扣减与 `canPlay` 语义。
5. 校验 `POST /games/:id/iterate` 是否满足“原作品 ID 不变”。
6. 完成登录恢复与全链路联调。

---

## 17. 对后端的最终硬性要求

1. `GET /api/v1/games/:id` 必须返回完整作品详情，并显式包含 `allowFork`。
2. `POST /api/v1/games/:id/iterate` 必须作用于原作品 ID。
3. `POST /api/v1/games/:id/fork` 必须创建新作品 ID，并且成功返回时新副本必须立即可被 `GET /games/:newId` 读取。
4. Fork 必须计入一次创建额度消耗，并遵循与 `generate` 一致的 `canPlay` 规则。
5. `PATCH /api/v1/games/:id/settings` 必须支持 `allowFork`。
6. Fork 权限必须以后端校验为准，不能只靠前端禁用。
7. 既有 Fork 副本必须永久独立保留，不受源作者后续关闭 Fork 权限或删除源作品影响。
8. 未登录用户点击“Fork 后继续创作”后，登录恢复时必须能基于 `sourceGameId` 继续完成该意图。
9. 响应必须带清晰 `message`，错误码和 HTTP 状态码必须正确。

---

## 18. 前端依赖位置

便于后端开发时对照前端调用点：

- [src/services/game.js](/D:/Project/gamevallies/gamevallies-frontend/src/services/game.js)
- [src/store/gameStore.js](/D:/Project/gamevallies/gamevallies-frontend/src/store/gameStore.js)
- [src/utils/authNavigation.js](/D:/Project/gamevallies/gamevallies-frontend/src/utils/authNavigation.js)
- [src/pages/create/index.jsx](/D:/Project/gamevallies/gamevallies-frontend/src/pages/create/index.jsx)
- [src/pages/game/detail/index.jsx](/D:/Project/gamevallies/gamevallies-frontend/src/pages/game/detail/index.jsx)
- [src/pages/game/play/index.jsx](/D:/Project/gamevallies/gamevallies-frontend/src/pages/game/play/index.jsx)
- [src/pages/profile/index.jsx](/D:/Project/gamevallies/gamevallies-frontend/src/pages/profile/index.jsx)

