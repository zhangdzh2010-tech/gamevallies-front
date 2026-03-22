# Frontend API Schema

当前文档描述 `gamevallies-backend` 对前端实际暴露的接口契约，覆盖：

- C 端前台：认证、用户、订阅、游戏生成、Feed、社交
- 管理后台：生成任务、LLM 网关、云 Region Target

更新时间：`2026-03-22`

---

## 1. Base URL

生产统一入口：

```text
https://www.gamevallies.com/api/v1
```

常用补充地址：

- 游戏预览页：`https://www.gamevallies.com/games/:gameId/preview`
- 游戏实际运行页：`https://www.gamevallies.com/games/:gameId/index.html`
- 管理后台页面：`https://www.gamevallies.com/admin`

---

## 2. 通用规范

### 2.1 鉴权

除登录、短信验证码、微信小程序登录、公开游戏/Feed 浏览外，默认携带：

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

管理后台额外使用：

```http
x-admin-token: <admin_token>
```

### 2.2 响应包裹格式

#### 格式 A：主业务接口

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

#### 格式 B：用户兼容接口

少量 `users/*` 历史兼容接口仍返回：

```json
{
  "success": true,
  "data": {}
}
```

### 2.3 分页对象

#### 形式 1：`items + hasMore`

```json
{
  "items": [],
  "hasMore": true,
  "page": 1,
  "limit": 20,
  "total": 100
}
```

#### 形式 2：`data + pagination`

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

前端消费时，统一按实际接口返回为准，不要假设所有分页接口完全同形。

---

## 3. 核心对象

### 3.1 User

```json
{
  "id": "string",
  "username": "string",
  "email": "string | undefined",
  "phone": "string | undefined",
  "avatar": "string",
  "avatarUrl": "string",
  "bio": "string",
  "displayName": "string",
  "createdAt": "ISO8601",
  "followerCount": 0,
  "followingCount": 0,
  "gameCount": 0,
  "totalPlays": 0
}
```

### 3.2 GameSummary

```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "status": "ready | generating | published | banned | failed",
  "gameUrl": "string",
  "previewUrl": "string",
  "coverUrl": "string",
  "tags": ["string"],
  "type": "casual | puzzle | education | string",
  "plays": 0,
  "likes": 0,
  "forks": 0,
  "commentCount": 0,
  "qualityScore": 0,
  "canPlay": true,
  "requireSubscription": false,
  "authorId": "string | null",
  "author": {
    "id": "string",
    "username": "string",
    "avatar": "string"
  },
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "publishedAt": "ISO8601 | null"
}
```

### 3.3 GenerationTask

```json
{
  "taskId": "string",
  "taskType": "pipeline_run | pipeline_iterate",
  "region": "cn_shanghai | ap_southeast_johor",
  "status": "queued | running | succeeded | failed | canceled | timed_out",
  "timeoutS": 600,
  "wsChannel": "game:<gameId>",
  "pollUrl": "/api/v1/games/tasks/<taskId>",
  "eventsUrl": "/api/v1/games/tasks/<taskId>/events",
  "cancelUrl": "/api/v1/games/tasks/<taskId>/cancel",
  "gameId": "string",
  "version": 1,
  "progressStage": "string | null",
  "progressPct": 0,
  "progressMessage": "string | null",
  "failedStage": "string | null",
  "errorMessage": "string | null",
  "retryCount": 0,
  "fallback": "string | null",
  "cancelRequested": false,
  "previewUrl": "string | null",
  "gatewayConfigVersion": 12,
  "routeSnapshot": {},
  "resultSummary": {},
  "startedAt": "ISO8601 | null",
  "completedAt": "ISO8601 | null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### 3.4 GenerationTaskEvent

```json
{
  "id": "string",
  "taskId": "string",
  "gameId": "string",
  "userId": "string",
  "eventType": "status | progress | note | error | llm_call",
  "stage": "string | null",
  "percentage": 0,
  "message": "string",
  "details": {},
  "createdAt": "ISO8601"
}
```

### 3.5 SubscriptionPlan

```json
{
  "id": "plan_monthly_basic",
  "name": "基础月卡",
  "price": 990,
  "priceDisplay": "9.9",
  "currency": "CNY",
  "period": "monthly | yearly",
  "periodLabel": "月 | 年",
  "quota": 10,
  "quotaLabel": "10次/月",
  "features": ["string"],
  "recommended": false,
  "badge": "string | null"
}
```

### 3.6 SubscriptionStatus

```json
{
  "active": true,
  "planId": "string | null",
  "planName": "string | null",
  "expiresAt": "ISO8601 | null",
  "usedThisPeriod": 0,
  "quotaThisPeriod": 0,
  "autoRenew": false
}
```

### 3.7 SubscriptionOrderStatus

```json
{
  "orderId": "string",
  "status": "pending | paid | canceled | failed | refunded",
  "planId": "string",
  "planName": "string",
  "amount": 990,
  "currency": "CNY",
  "gameIdToUnlock": "string | null",
  "paidAt": "ISO8601 | null",
  "expiresAt": "ISO8601 | null",
  "quotaRemaining": 9,
  "subscriptionActive": true
}
```

### 3.8 Comment

```json
{
  "id": "string",
  "gameId": "string",
  "content": "string",
  "authorId": "string | null",
  "author": { "...User": "..." },
  "likes": 0,
  "parentId": "string | null",
  "replyCount": 0,
  "createdAt": "ISO8601",
  "replies": []
}
```

### 3.9 Notification

```json
{
  "id": "string",
  "type": "like | comment | follow | fork | system",
  "title": "string",
  "body": "string",
  "isRead": false,
  "data": {
    "targetId": "string | null",
    "userId": "string | null",
    "gameId": "string | null"
  },
  "createdAt": "ISO8601",
  "actor": { "...User": "..." }
}
```

---

## 4. C 端前台 API

### 4.1 Auth

#### `POST /auth/login`

请求：

```json
{
  "account": "string",
  "password": "string"
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "token": "string",
    "refreshToken": "string",
    "user": { "...User": "..." }
  }
}
```

#### `POST /auth/refresh`

```json
{
  "refreshToken": "string"
}
```

#### `POST /auth/logout`

说明：

- 需要登录
- 可从请求头 `x-refresh-token` 读取旧 refresh token 并吊销

#### `POST /auth/sms/send-code`

请求：

```json
{
  "phone": "13800138000",
  "type": "register | login | reset_password"
}
```

成功响应：

```json
{
  "code": 0,
  "data": null
}
```

常见业务错误：

- `400` 手机号不合法
- `429` 发送过于频繁
- `503` Redis / 短信服务不可用

#### `POST /auth/sms/register`

```json
{
  "phone": "13800138000",
  "smsCode": "123456",
  "nickname": "string",
  "password": "string"
}
```

响应同 `login`

#### `POST /auth/sms/login`

```json
{
  "phone": "13800138000",
  "smsCode": "123456"
}
```

响应同 `login`

#### `POST /auth/wechat/miniapp-login`

```json
{
  "code": "wx.login() 返回的 code",
  "nickname": "string",
  "avatarUrl": "string"
}
```

响应同 `login`

#### `GET /auth/profile`

返回当前登录用户：

```json
{
  "code": 0,
  "data": { "...User": "..." }
}
```

---

### 4.2 User

#### `GET /users/me`

返回当前登录用户。

#### `PATCH /users/profile`

说明：

- 需要登录
- 用于昵称、头像、简介等资料更新
- 具体可更新字段以 `UpdateProfileDto` 为准，前端当前主要使用 `displayName`、`bio`、`avatarUrl`

建议请求：

```json
{
  "displayName": "string",
  "bio": "string",
  "avatarUrl": "string"
}
```

#### `POST /users/avatar`

```json
{
  "filePath": "string"
}
```

#### `GET /users/quota`

响应：

```json
{
  "code": 0,
  "data": {
    "freeQuota": 5,
    "freeQuotaUsed": 1,
    "freeQuotaRemaining": 4,
    "subscriptionActive": true,
    "subscriptionQuota": 10,
    "subscriptionUsed": 2,
    "subscriptionRemaining": 8,
    "totalRemaining": 12,
    "expiresAt": "ISO8601 | null"
  }
}
```

#### `GET /users/search?q=<keyword>&page=1&limit=20`

返回格式 B：

```json
{
  "success": true,
  "data": {
    "items": [{ "...User": "..." }],
    "hasMore": true,
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

#### `GET /users/:id/profile`

公开用户资料页。

#### `GET /users/:id/stats`

返回用户维度统计数据。

#### `GET /users/:id/followers`
#### `GET /users/:id/following`

返回格式 B，分页对象内为 `User[]`。

#### `POST /users/:id/follow`
#### `DELETE /users/:id/follow`

返回格式 B：

```json
{
  "success": true,
  "data": null
}
```

---

### 4.3 Subscription / Billing

#### `GET /subscription/plans`

响应：

```json
{
  "code": 0,
  "data": {
    "plans": [{ "...SubscriptionPlan": "..." }],
    "subscriberCount": 123
  }
}
```

#### `POST /subscription/order`

请求：

```json
{
  "planId": "plan_monthly_pro",
  "gameId": "string"
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "orderId": "order_xxx",
    "payment": {
      "timeStamp": "string",
      "nonceStr": "string",
      "package": "prepay_id=xxx",
      "signType": "RSA",
      "paySign": "string"
    }
  }
}
```

说明：

- 真实微信支付时，前端直接把 `payment` 传给 `wx.requestPayment`
- 接口成功状态是 `HTTP 200 + code=0`

#### `GET /subscription/status`

响应：

```json
{
  "code": 0,
  "data": { "...SubscriptionStatus": "..." }
}
```

#### `GET /subscription/orders/:id`

响应：

```json
{
  "code": 0,
  "data": { "...SubscriptionOrderStatus": "..." }
}
```

#### `POST /subscription/orders/:id/mock-pay`

仅本地 / mock 支付环境使用。

---

### 4.4 Games

#### `POST /games/expand-prompt`

请求：

```json
{
  "description": "做一个点击躲避障碍物的小游戏",
  "regionHint": "cn_shanghai"
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "expanded_prompt": "string"
  }
}
```

#### `POST /games/generate`

请求：

```json
{
  "description": "做一个点击躲避障碍物的小游戏",
  "prompt": "string",
  "title": "障碍躲避",
  "regionHint": "cn_shanghai | ap_southeast_johor",
  "timeoutS": 600
}
```

说明：

- `description` 和 `prompt` 二选一
- `timeoutS` 允许范围 `30-3600`

响应：

```json
{
  "code": 0,
  "data": {
    "id": "gameId",
    "title": "障碍躲避",
    "description": "string",
    "status": "generating",
    "version": 1,
    "previewUrl": "string",
    "canPlay": true,
    "quotaRemaining": 4,
    "requireSubscription": false,
    "generationTask": { "...GenerationTask": "..." }
  }
}
```

#### `GET /games/:id/generation-status`

用于旧前端或简单轮询。

响应示例：

```json
{
  "code": 0,
  "data": {
    "taskId": "string",
    "taskType": "pipeline_run",
    "status": "running",
    "stage": "intent_parsing",
    "gameId": "string",
    "version": 1,
    "wsChannel": "game:<gameId>",
    "pollUrl": "/api/v1/games/<gameId>/generation-status",
    "previewUrl": "string",
    "gameStatus": "generating",
    "canPlay": true,
    "requireSubscription": false,
    "failedStage": null,
    "failedReason": null,
    "retryCount": 0,
    "lastErrorAt": null
  }
}
```

#### `GET /games/tasks/:taskId`

返回 `GenerationTask`

#### `GET /games/tasks/:taskId/events?limit=200`

响应：

```json
{
  "code": 0,
  "data": [{ "...GenerationTaskEvent": "..." }]
}
```

#### `POST /games/tasks/:taskId/cancel`

返回最新 `GenerationTask`

#### `GET /games/my/games?page=1&limit=10`
#### `GET /games/my?page=1&limit=10`

返回当前用户自己的游戏列表，分页对象中的元素为 `GameSummary[]`。

#### `GET /games/explore/published?page=1&limit=10`

公开游戏广场，返回 `GameSummary[]`。

#### `GET /games/game-types`

返回前端可展示的游戏分类字典。

#### `GET /games/:id`

返回单个 `GameSummary`

#### `GET /games/:id/play`

响应：

```json
{
  "code": 0,
  "data": {
    "htmlCode": "<!DOCTYPE html>...</html>",
    "gameId": "string"
  }
}
```

#### `POST /games/:id/unlock`

需要登录。用于订阅后解锁或消耗可用额度解锁。

#### `POST /games/:id/iterate`

请求：

```json
{
  "feedback": "把主角移动速度调快一点，并增加得分动画",
  "regionHint": "cn_shanghai",
  "timeoutS": 600
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "gameId": "string",
    "version": 2,
    "status": "iterating",
    "generationTask": { "...GenerationTask": "..." }
  }
}
```

#### `POST /games/:id/publish`

发布游戏。

#### `PATCH /games/:id/settings`

前端用于更新游戏设置、可见性等。

#### `DELETE /games/:id`

删除自己的游戏。

#### `GET /games/:id/share-data`

响应：

```json
{
  "code": 0,
  "data": {
    "title": "string",
    "description": "string",
    "thumbnailUrl": "string | null",
    "url": "string",
    "author": "string",
    "stats": {
      "plays": 0,
      "likes": 0,
      "qualityScore": 0
    }
  }
}
```

#### `GET /games/creator/:creatorId/reputation`

返回创作者声誉相关信息，供创作者主页或后台展示。

---

### 4.5 Feed / Discovery

以下接口统一返回格式 A，分页对象中的元素为 `GameSummary[]`：

- `GET /feed/trending?page=1&limit=20`
- `GET /feed/latest?page=1&limit=20`
- `GET /feed/featured?page=1&limit=20`
- `GET /feed/following?page=1&limit=20`（需登录）
- `GET /feed/category?category=casual&page=1&limit=20`
- `GET /feed/by-type/:type?page=1&limit=20`

分页响应示例：

```json
{
  "code": 0,
  "data": {
    "items": [{ "...GameSummary": "..." }],
    "hasMore": true,
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

#### `GET /challenges/current`

```json
{
  "code": 0,
  "data": {
    "id": "string",
    "title": "string",
    "description": "string",
    "endsAt": "ISO8601",
    "startDate": "ISO8601",
    "participantCount": 0,
    "rules": ["string"]
  }
}
```

#### `GET /challenges/:id/games?page=1&limit=20`

挑战赛关联游戏列表，分页对象中的元素为 `GameSummary[]`。

#### `GET /tags/trending?page=1&limit=20`
#### `GET /tags/all?page=1&limit=20`

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "tag": "casual",
        "count": 128
      }
    ],
    "hasMore": true,
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

#### `GET /creators/trending?page=1&limit=20`

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "string",
        "username": "string",
        "avatar": "string",
        "bio": "string",
        "gamesCount": 0,
        "totalPlays": 0,
        "followerCount": 0
      }
    ],
    "hasMore": true,
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

---

### 4.6 Social / Comment / Notification

#### `POST /social/follow`

```json
{
  "targetId": "user_id"
}
```

响应：

```json
{
  "code": 0,
  "data": null
}
```

#### `DELETE /social/follow/:userId`

取消关注。

#### `GET /social/followers/:userId?page=1&limit=20`
#### `GET /social/following/:userId?page=1&limit=20`

返回分页 `User[]`

#### `GET /social/follow-status/:userId`

```json
{
  "code": 0,
  "data": {
    "isFollowing": true
  }
}
```

#### `POST /social/like`

```json
{
  "targetType": "game | comment",
  "targetId": "string"
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "liked": true,
    "likes": 12
  }
}
```

#### `GET /social/like-status/:type/:id`

返回当前用户是否已点赞。

#### `POST /comments`

```json
{
  "gameId": "string",
  "content": "string",
  "parentId": "string | null"
}
```

响应为 `Comment`

#### `GET /comments/games/:gameId?page=1&limit=20`

返回分页 `Comment[]`

#### `GET /comments/:commentId/replies?page=1&limit=5`

返回分页 `Comment[]`

#### `DELETE /comments/:id`

删除评论。

#### `POST /comments/:id/like`

响应：

```json
{
  "code": 0,
  "data": {
    "liked": true,
    "likes": 3
  }
}
```

#### `GET /notifications?page=1&limit=20`

返回分页 `Notification[]`

#### `POST /notifications/mark-read`

```json
{
  "ids": ["notification_id"]
}
```

#### `POST /notifications/mark-all-read`

全部已读。

#### `GET /notifications/unread-count`

```json
{
  "code": 0,
  "data": {
    "count": 3
  }
}
```

---

## 5. 管理后台 API

说明：

- 所有管理接口前缀为 `/api/v1/admin/*`
- 统一请求头：`x-admin-token`
- 当前服务端做了简单 IP 限流：`20 次 / 分钟 / IP`

### 5.1 生成任务

#### `GET /admin/tasks?page=1&limit=20&status=&search=`

返回任务分页列表。

#### `GET /admin/tasks/:id`

返回任务详情，包含：

- `game`
- `user`
- `events`
- `llmCallLogs`

#### `GET /admin/tasks/:id/events?limit=100`

返回：

```json
{
  "code": 0,
  "data": {
    "items": [{ "...GenerationTaskEvent": "..." }]
  }
}
```

### 5.2 云 Region Target

#### `GET /admin/cloud/accounts`

返回云账号列表。

#### `GET /admin/cloud/regions`

返回云 Region 目录。

#### `GET /admin/cloud/ai-engine-region-targets?providerSelectableOnly=true`

返回 `ai-engine` 的 Region Target 列表。前端做 Provider 下拉时，使用 `providerSelectableOnly=true`。

#### `POST /admin/cloud/ai-engine-region-targets`
#### `PUT /admin/cloud/ai-engine-region-targets/:id`

核心字段：

```json
{
  "accountId": "string",
  "regionCatalogId": "string",
  "executionRegion": "cn_shanghai | ap_southeast_johor",
  "displayName": "string",
  "functionName": "gv-ai-engine-cn",
  "registry": "string",
  "registryNamespace": "string",
  "imageRepository": "string",
  "serviceRegionEnv": "cn_shanghai",
  "deployEnabled": true
}
```

#### `POST /admin/cloud/ai-engine-region-targets/sync-deploy`

部署脚本回写 Region Target 状态时使用。

### 5.3 LLM Gateway

#### `GET /admin/llm/providers`

返回 Provider 列表，字段包含：

```json
{
  "id": "string",
  "name": "Deepseek-cn-上海",
  "providerType": "openai_compatible | anthropic",
  "region": "cn_shanghai",
  "regionTargetId": "string",
  "regionDisplayName": "cn_shanghai",
  "baseUrl": "string",
  "model": "string",
  "fastModel": "string | null",
  "requestTimeoutS": 600,
  "connectTimeoutS": 15,
  "priority": 100,
  "enabled": true,
  "apiKeySet": true,
  "apiKeyMasked": "sk-xxxx...yyyy"
}
```

#### `POST /admin/llm/providers`
#### `PUT /admin/llm/providers/:id`

请求体：

```json
{
  "name": "string",
  "providerType": "openai_compatible | anthropic",
  "regionTargetId": "string",
  "priority": 100,
  "baseUrl": "string",
  "apiKey": "string",
  "model": "string",
  "fastModel": "string | null",
  "requestTimeoutS": 600,
  "connectTimeoutS": 15,
  "description": "string",
  "enabled": true
}
```

#### `DELETE /admin/llm/providers/:id`
#### `POST /admin/llm/providers/:id/test`

#### `GET /admin/llm/steps`

返回固定步骤字典：

```json
{
  "id": "string",
  "stepKey": "intent_parse",
  "stepOrder": 30,
  "stageLabel": "Stage 02",
  "displayName": "意图解析",
  "description": "将自然语言描述解析成 GameSpec",
  "enabled": true
}
```

#### `GET /admin/llm/routes?executionRegion=cn_shanghai`

返回固定步骤与当前 Provider 绑定关系列表。

#### `GET /admin/llm/routes/:id`

返回单条绑定详情，当前后台切换步骤模型时会用到这个接口。

#### `POST /admin/llm/routes`
#### `PUT /admin/llm/routes/:id`

请求体：

```json
{
  "stepKey": "intent_parse",
  "executionRegion": "cn_shanghai",
  "providerId": "string",
  "enabled": true
}
```

#### `DELETE /admin/llm/routes/:id`
#### `POST /admin/llm/refresh`

---

## 6. WebSocket 事件

当前生成进度推送仍通过 `game-service` WebSocket：

- 频道：`game:<gameId>`
- 用户侧事件：
  - `gen:progress`
  - `gen:complete`
  - `gen:error`

推荐前端策略：

1. 创建生成任务后，先保存 `generationTask.taskId`
2. 优先订阅 WebSocket 进度
3. 同时保留 `GET /games/tasks/:taskId` 和 `GET /games/tasks/:taskId/events` 轮询兜底
4. 老前端仍可继续用 `GET /games/:id/generation-status`

---

## 7. 说明与边界

- `ai-engine` 的 `/api/v1/ai/*` 更多是服务间接口，普通前端不建议直接依赖
- 文档优先描述“当前代码已经实现并对前端可用”的接口，不展开内部回调
- 若字段与代码实现发生冲突，以控制器、Presenter、DTO 和线上真实返回为准
