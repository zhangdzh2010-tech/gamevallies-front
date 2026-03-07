# API Schema

前端调用的所有接口文档，包含请求体、响应体和错误码。

---

## 服务地址

| 服务 | 开发环境 | 生产环境 | 环境变量 |
|------|---------|---------|---------|
| 用户/认证 | `http://172.16.30.179:3001` | `https://api.playforge.com` | `TARO_APP_AUTH_SERVICE_URL` |
| 游戏 | `http://172.16.30.179:3002` | `https://api.playforge.com` | `TARO_APP_GAME_SERVICE_URL` |
| 社交 | `http://172.16.30.179:3003` | `https://api.playforge.com` | `TARO_APP_SOCIAL_SERVICE_URL` |
| Feed | `http://172.16.30.179:3004` | `https://api.playforge.com` | `TARO_APP_FEED_SERVICE_URL` |
| AI | `http://172.16.30.179:8001` | `https://api.playforge.com` | `TARO_APP_AI_SERVICE_URL` |
| WebSocket | `ws://172.16.30.179:3001` | `wss://ws.playforge.com` | `TARO_APP_WS_URL` |
| 游戏内容 | `http://172.16.30.179:3002` | `https://cdn.playforge.com` | `TARO_APP_GAME_CONTENT_URL` |

---

## 通用规范

### 请求头

所有接口（除登录/注册外）须携带：

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

### 响应体格式

前端存在两套 HTTP 工具，响应格式不同：

**格式 A** — `services/api.js`（认证、游戏、Feed、社交服务使用）

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

> `code` 为 `0` 或 `200` 时视为成功，其余为业务错误。

**格式 B** — `utils/request.js`（用户、评论服务使用）

```json
{
  "success": true,
  "data": { ... }
}
```

失败时：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

### 分页响应

```json
{
  "items": [ ... ],
  "hasMore": true,
  "page": 1,
  "limit": 10,
  "total": 100
}
```

---

## 错误码标准

### HTTP 状态码

| 状态码 | 说明 | 前端处理 |
|--------|------|---------|
| 200 | 成功 | — |
| 400 | 请求参数错误 | 显示错误信息 |
| 401 | 未授权 / Token 过期 | 自动刷新 Token，失败则跳登录页 |
| 403 | 无权限 | 显示无权限提示 |
| 404 | 资源不存在 | 显示 404 |
| 429 | 请求过于频繁 | 显示限流提示 |
| 500 | 服务端错误 | 显示服务器错误 |

### 业务错误码（格式 A）

| code | 说明 |
|------|------|
| 0 / 200 | 成功 |
| 1001 | 参数缺失或格式错误 |
| 1002 | 资源不存在 |
| 1003 | 无操作权限 |
| 2001 | 账号不存在 |
| 2002 | 密码错误 |
| 2003 | 账号已被禁用 |
| 2004 | Token 无效或已过期 |
| 2005 | 验证码错误或已过期 |
| 3001 | 游戏生成失败 |
| 3002 | 游戏不存在 |
| 3003 | 游戏已发布，不可修改 |

### 业务错误码（格式 B）

| code | 说明 |
|------|------|
| `UNAUTHORIZED` | 未登录或 Token 失效 |
| `UNKNOWN_ERROR` | 未知错误 |
| `HTTP_400` | 请求错误 |
| `HTTP_403` | 无权限 |
| `HTTP_404` | 资源不存在 |
| `HTTP_500` | 服务端错误 |

---

## 数据模型

### User

```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "phone": "string",
  "avatar": "string (url)",
  "bio": "string",
  "createdAt": "ISO8601"
}
```

### Game

```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "status": "draft | generating | ready | published",
  "gameUrl": "string (url)",
  "coverUrl": "string (url)",
  "tags": ["string"],
  "type": "space | music | puzzle | action | casual",
  "plays": 0,
  "likes": 0,
  "forks": 0,
  "authorId": "string",
  "author": { "id": "string", "username": "string", "avatar": "string" },
  "createdAt": "ISO8601",
  "publishedAt": "ISO8601"
}
```

### Comment

```json
{
  "id": "string",
  "gameId": "string",
  "content": "string",
  "authorId": "string",
  "author": { "id": "string", "username": "string", "avatar": "string" },
  "likes": 0,
  "parentId": "string | null",
  "replyCount": 0,
  "createdAt": "ISO8601"
}
```

### Notification

```json
{
  "id": "string",
  "type": "like | comment | follow | fork | mention | system",
  "title": "string",
  "body": "string",
  "isRead": false,
  "data": { "gameId": "string", "userId": "string" },
  "createdAt": "ISO8601"
}
```

---

## 认证服务 (port 3001)

### POST `/api/v1/auth/register` — 注册

**Request Body:**
```json
{
  "username": "string (3-20位字母数字)",
  "email": "string (email格式)",
  "phone": "string (可选)",
  "password": "string (min 8位)",
  "verificationCode": "string (可选)"
}
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "user": { ...User }
  }
}
```

---

### POST `/api/v1/auth/login` — 登录

**Request Body:**
```json
{
  "account": "string (邮箱或用户名)",
  "password": "string"
}
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "token": "string (JWT)",
    "refreshToken": "string",
    "user": { ...User }
  }
}
```

---

### POST `/api/v1/auth/refresh` — 刷新 Token

**Request Body:**
```json
{
  "refreshToken": "string"
}
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "token": "string",
    "refreshToken": "string"
  }
}
```

---

### POST `/api/v1/auth/logout` — 登出

**Request Body:** `{}`

**Response:**
```json
{ "code": 0, "data": null }
```

---

### POST `/api/v1/auth/send-code` — 发送验证码

**Request Body:**
```json
{
  "target": "string (邮箱或手机号)",
  "type": "register | reset_password | verify"
}
```

**Response:**
```json
{ "code": 0, "data": null }
```

---

### POST `/api/v1/auth/verify-code` — 验证验证码

**Request Body:**
```json
{
  "target": "string",
  "code": "string"
}
```

**Response:**
```json
{
  "code": 0,
  "data": { "valid": true }
}
```

---

### POST `/api/v1/auth/reset-password` — 重置密码

**Request Body:**
```json
{
  "target": "string",
  "code": "string",
  "newPassword": "string"
}
```

**Response:** `{ "code": 0, "data": null }`

---

### POST `/api/v1/auth/change-password` — 修改密码

**Request Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Response:** `{ "code": 0, "data": null }`

---

## 用户服务 (port 3001)

### GET `/api/v1/users/me` — 获取当前用户

**Response:**
```json
{
  "code": 0,
  "data": { ...User }
}
```

---

### GET `/api/v1/users/:userId` — 获取用户信息

**Response:**
```json
{
  "code": 0,
  "data": { ...User }
}
```

---

### PATCH `/api/v1/users/profile` — 更新资料

**Request Body:**
```json
{
  "username": "string (可选)",
  "bio": "string (可选)",
  "avatar": "string url (可选)"
}
```

**Response:**
```json
{
  "code": 0,
  "data": { ...User }
}
```

---

### POST `/api/v1/users/avatar` — 上传头像

**Request Body:**
```json
{
  "filePath": "string (本地文件路径)"
}
```

**Response:**
```json
{
  "code": 0,
  "data": { "url": "string" }
}
```

---

### GET `/users/:userId/followers` — 获取粉丝列表

**Query Params:** `page=1&limit=20`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [ { ...User } ],
    "hasMore": true,
    "total": 100
  }
}
```

---

### GET `/users/:userId/following` — 获取关注列表

**Query Params:** `page=1&limit=20`

**Response:** 同上

---

### POST `/users/:userId/follow` — 关注用户

**Request Body:** `{}`

**Response:** `{ "success": true, "data": null }`

---

### DELETE `/users/:userId/follow` — 取消关注

**Response:** `{ "success": true, "data": null }`

---

### GET `/users/search` — 搜索用户

**Query Params:** `q=string&limit=20`

**Response:**
```json
{
  "success": true,
  "data": { "items": [ { ...User } ] }
}
```

---

### GET `/users/:userId/stats` — 用户统计

**Response:**
```json
{
  "success": true,
  "data": {
    "gamesCreated": 0,
    "totalPlays": 0,
    "totalLikes": 0,
    "followers": 0,
    "following": 0
  }
}
```

---

## 游戏服务 (port 3002)

### GET `/api/v1/games/:gameId` — 获取游戏详情

**Response:**
```json
{
  "code": 0,
  "data": { ...Game }
}
```

---

### GET `/api/v1/games/my` — 我的游戏列表

**Query Params:** `page=1&limit=10`

**Response:**
```json
{
  "code": 0,
  "data": {
    "items": [ { ...Game } ],
    "hasMore": true,
    "page": 1
  }
}
```

---

### POST `/api/v1/games/:gameId/fork` — Fork 游戏

**Request Body:** `{}`

**Response:**
```json
{
  "code": 0,
  "data": { "gameId": "string" }
}
```

---

### POST `/api/v1/games/:gameId/publish` — 发布游戏

**Request Body:**
```json
{
  "title": "string (可选，覆盖默认标题)",
  "description": "string (可选)",
  "tags": ["string"]
}
```

**Response:**
```json
{
  "code": 0,
  "data": { ...Game }
}
```

---

## AI 服务 (port 8001)

### POST `/api/v1/games/generate` — AI 生成游戏

**Request Body:**
```json
{
  "prompt": "string (游戏描述，自然语言)"
}
```

**Response:**
```json
{
  "code": 0,
  "data": { "gameId": "string" }
}
```

> 生成进度通过 WebSocket 事件 `gen:progress` / `gen:complete` 推送。

---

### POST `/api/v1/games/:gameId/iterate` — AI 迭代优化

**Request Body:**
```json
{
  "feedback": "string (修改意见，自然语言)"
}
```

**Response:**
```json
{
  "code": 0,
  "data": { "iterationId": "string" }
}
```

---

## 社交服务 (port 3003)

### POST `/api/v1/social/like` — 切换点赞

**Request Body:**
```json
{
  "targetType": "game | comment",
  "targetId": "string"
}
```

**Response:**
```json
{
  "code": 0,
  "data": { "liked": true, "likes": 100 }
}
```

---

### POST `/api/v1/social/follow` — 关注用户

**Request Body:**
```json
{
  "targetId": "string (userId)"
}
```

**Response:** `{ "code": 0, "data": null }`

---

### DELETE `/api/v1/social/follow/:userId` — 取消关注

**Response:** `{ "code": 0, "data": null }`

---

### GET `/api/v1/social/followers/:userId` — 粉丝列表

**Query Params:** `page=1&limit=10`

**Response:**
```json
{
  "code": 0,
  "data": { "items": [ { ...User } ], "hasMore": true }
}
```

---

### GET `/api/v1/social/follow-status/:userId` — 查询关注状态

**Response:**
```json
{
  "code": 0,
  "data": { "following": true }
}
```

---

### GET `/api/v1/social/like-status/:type/:id` — 查询点赞状态

**Response:**
```json
{
  "code": 0,
  "data": { "liked": true }
}
```

---

### POST `/api/v1/comments` — 创建评论

**Request Body:**
```json
{
  "gameId": "string",
  "content": "string (1-500字)",
  "parentId": "string | null (回复时传)"
}
```

**Response:**
```json
{
  "code": 0,
  "data": { ...Comment }
}
```

---

### GET `/api/v1/comments/games/:gameId` — 获取游戏评论

**Query Params:** `page=1&limit=10`

**Response:**
```json
{
  "code": 0,
  "data": { "items": [ { ...Comment } ], "hasMore": true }
}
```

---

### DELETE `/api/v1/comments/:commentId` — 删除评论

**Response:** `{ "code": 0, "data": null }`

---

### GET `/api/v1/comments/:commentId/replies` — 获取回复

**Query Params:** `limit=5`

**Response:**
```json
{
  "code": 0,
  "data": { "items": [ { ...Comment } ] }
}
```

---

### GET `/api/v1/notifications` — 通知列表

**Query Params:** `page=1&limit=10`

**Response:**
```json
{
  "code": 0,
  "data": { "items": [ { ...Notification } ], "hasMore": true }
}
```

---

### POST `/api/v1/notifications/mark-read` — 标记已读

**Request Body:**
```json
{
  "ids": ["string"]
}
```

**Response:** `{ "code": 0, "data": null }`

---

### POST `/api/v1/notifications/mark-all-read` — 全部已读

**Request Body:** `{}`

**Response:** `{ "code": 0, "data": null }`

---

### GET `/api/v1/notifications/unread-count` — 未读数量

**Response:**
```json
{
  "code": 0,
  "data": { "count": 5 }
}
```

---

## Feed 服务 (port 3004)

所有 Feed 接口 **Query Params** 通用格式：`page=1&limit=10`

### GET `/api/v1/feed/trending` — 热门游戏

**Response:**
```json
{
  "code": 0,
  "data": { "items": [ { ...Game } ], "hasMore": true, "page": 1 }
}
```

---

### GET `/api/v1/feed/latest` — 最新游戏

**Response:** 同上

---

### GET `/api/v1/feed/following` — 关注动态

**Response:** 同上

---

### GET `/api/v1/feed/featured` — 精选游戏

**Query Params:** `limit=6`

**Response:** 同上

---

### GET `/api/v1/feed/search` — 搜索游戏

**Query Params:** `q=string&page=1&limit=10&gameType=space`

**Response:** 同上

---

### GET `/api/v1/feed/category` — 按分类

**Query Params:** `category=string&page=1&limit=10`

**Response:** 同上

---

### GET `/api/v1/tags/trending` — 热门标签

**Query Params:** `limit=10`

**Response:**
```json
{
  "code": 0,
  "data": { "items": [ { "tag": "string", "count": 100 } ] }
}
```

---

### GET `/api/v1/challenges/current` — 当前挑战

**Response:**
```json
{
  "code": 0,
  "data": {
    "id": "string",
    "title": "string",
    "description": "string",
    "endsAt": "ISO8601"
  }
}
```

---

### GET `/api/v1/creators/trending` — 热门创作者

**Query Params:** `limit=10`

**Response:**
```json
{
  "code": 0,
  "data": { "items": [ { ...User, "gamesCount": 10, "totalPlays": 5000 } ] }
}
```

---

## WebSocket (port 3001)

### 连接

```
ws://172.16.30.179:3001?token=<access_token>
```

心跳：客户端每 30 秒发送 `{ "type": "ping" }`，服务端回 `{ "type": "pong" }`。
断线重连：指数退避，最多 5 次。

---

### 服务端 → 客户端事件

#### `gen:progress` — 游戏生成进度

```json
{
  "type": "gen:progress",
  "gameId": "string",
  "data": {
    "progress": 60,
    "message": "正在生成游戏逻辑..."
  }
}
```

#### `gen:complete` — 游戏生成完成

```json
{
  "type": "gen:complete",
  "gameId": "string",
  "data": {
    "success": true,
    "game": { ...Game },
    "error": "string (失败时)"
  }
}
```

#### `notification` — 推送通知

```json
{
  "type": "notification",
  "data": { ...Notification }
}
```

---

### 客户端 → 服务端事件

| type | 说明 | payload |
|------|------|---------|
| `ping` | 心跳 | `{}` |

---

## 游戏内容文件

游戏 HTML 通过 WebView 直接加载，不走 API 鉴权：

```
GET {TARO_APP_GAME_CONTENT_URL}/games/:gameId/index.html
```

---

## 注意事项

1. **两套请求工具并存**：`services/api.js` 用于认证/游戏/Feed/社交，响应格式 A；`utils/request.js` 用于用户/评论，响应格式 B。后端需确认统一。
2. **路径前缀不一致**：`user.js`/`comment.js` 的路径无 `/api/v1` 前缀，需与后端对齐。
3. **Token 自动刷新**：401 时前端自动用 `refreshToken` 换新 token，换失败则跳登录页。
4. **`switchTab` 导航**：登录成功后跳转 Tab 页需使用 `navigation.switchTab()`，当前 `taroHooks.js` 中尚未实现该方法。
