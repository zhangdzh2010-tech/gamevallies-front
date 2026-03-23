# 小程序游戏播放 H5 壳页对接要求

## 1. 背景

当前游戏播放页运行在微信小程序端，页面主体使用 `web-view` 加载真实游戏地址，游戏原始地址形如：

- `https://www.gamevallies.com/games/...`

产品希望在游戏播放界面增加以下交互层：

- 左下角显示作者信息
- 作者后显示“关注”按钮
- 右侧纵向显示点赞、收藏、评论按钮

这套 UI 不能继续放在小程序页面外层悬浮实现，原因是微信小程序平台本身对 `web-view` 有明确限制。

## 2. 小程序平台限制

### 2.1 `web-view` 不能被普通页面组件覆盖

微信小程序的 `web-view` 会铺满页面并覆盖其他组件，因此不能通过普通 `View`、`CoverView`、`z-index` 等方式，在小程序页面外层稳定叠加作者区和互动按钮。

官方文档：

- [web-view 组件文档](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)
- [cover-view 组件文档](https://developers.weixin.qq.com/miniprogram/dev/component/cover-view.html)

### 2.2 `cover-view` 不能解决当前问题

`cover-view` 适用于覆盖部分原生组件，但不适用于覆盖 `web-view`。因此“小游戏内容走 `web-view`，作者/点赞/收藏走小程序外层浮层”的方案不可行。

### 2.3 即时交互不适合走 `postMessage` 转发

`web-view` 与小程序之间的 `postMessage` 更适合做页面退出、回传状态等场景，不适合承载实时的点赞、关注、收藏点击转发。

结论：

- 作者信息、关注、点赞、收藏、评论入口，必须在 `web-view` 加载的网页内部实现
- 小程序页只负责打开网页壳页，不再承担外层悬浮交互

## 3. 需要后端/运维提供的能力

### 3.0 先说明当前前端实现边界

当前前端仓库里，H5 壳页的页面逻辑已经由前端实现，页面路由为：

- `/pages/game/web-shell/index`

也就是说，当前联调口径下，后端/运维最需要提供的不是“重新开发一个壳页业务页面”，而是：

1. 提供一个真实可访问的 H5 入口地址
2. 让这个 H5 入口地址能够正确承载前端现有的壳页路由
3. 配合同域嵌入 `/games/...`
4. 配合登录态和接口访问

前端最终实际打开的地址形态会是：

```text
https://www.gamevallies.com/game-shell/index.html#/pages/game/web-shell/index?id=123&src=%2Fgames%2Fabc123
```

请注意：

- `https://www.gamevallies.com/game-shell/index.html` 是物理存在的 H5 入口地址
- `#/pages/game/web-shell/index?...` 是前端现有壳页路由

如果后端希望改成“自己单独提供一个完全独立的 custom shell 页面”，那也可以，但需要提前和前端确认，因为这会影响小程序端当前的 URL 拼装方式。

### 3.1 提供一个真实可访问的 H5 壳页地址

请提供一个可以直接访问的 HTTPS 页面地址，例如：

- `https://www.gamevallies.com/game-shell/index.html`

该地址用于被小程序 `web-view` 打开。这个页面负责：

- 作为前端 H5 壳页的可访问入口
- 能正确加载前端已经实现的壳页路由
- 由壳页路由渲染作者信息区、关注按钮、点赞/收藏/评论交互层
- 由壳页路由在页面内部通过 `iframe` 加载真实游戏页 `/games/...`

### 3.2 这个地址必须满足以下条件

1. 直接在手机浏览器打开返回 `200`
2. 返回类型为 `text/html`
3. 使用 `https`
4. 域名已配置到微信小程序业务域名白名单
5. 页面可在微信内置浏览器正常打开
6. 最好与真实游戏页同域，即同属 `https://www.gamevallies.com`

### 3.3 不建议使用 hash 路由地址

不建议只提供这种地址：

- `https://www.gamevallies.com/#/pages/game/web-shell/index`

原因：

- 这类地址依赖站点根路径 `/` 能正确返回 H5 入口页
- 当前线上环境如果根路径不返回入口页，会直接导致小程序内全部加载失败

因此请优先提供“物理存在的 HTML 地址”，例如：

- `https://www.gamevallies.com/game-shell/index.html`

## 4. 真实游戏页的嵌入要求

H5 壳页会通过 `iframe` 加载真实游戏地址，例如：

- `/games/abc123`
- `https://www.gamevallies.com/games/abc123`

因此真实游戏页必须允许被同域壳页嵌入。

### 4.1 响应头要求

请确认游戏页不要返回会阻止嵌入的响应头，例如：

- `X-Frame-Options: DENY`

如果配置了 `X-Frame-Options`，建议至少满足同域嵌入，例如：

- `X-Frame-Options: SAMEORIGIN`

如果配置了 CSP，请确认 `Content-Security-Policy` 中的 `frame-ancestors` 不会禁止同域壳页嵌入。

建议目标：

- `https://www.gamevallies.com/game-shell/index.html` 可以稳定 iframe 打开 `https://www.gamevallies.com/games/...`

## 5. 壳页地址的参数契约

建议壳页路由支持以下 query 参数：

- `gameId`
- `src`
- `title`
- `cover`

示例：

```text
https://www.gamevallies.com/game-shell/index.html?gameId=123&src=%2Fgames%2Fabc123&title=%E6%89%93%E5%9C%B0%E9%BC%A0&cover=https%3A%2F%2Fcdn.example.com%2Fcover.png
```

字段说明：

| 参数 | 是否必需 | 说明 |
| --- | --- | --- |
| `gameId` | 是 | 游戏 ID，用于拉取作者、点赞、评论、关注等数据 |
| `src` | 是 | 真实游戏地址，建议支持相对路径 `/games/...` |
| `title` | 否 | 游戏标题，用于首屏兜底展示 |
| `cover` | 否 | 游戏封面，用于首屏占位或分享信息 |

## 6. 壳页页面本身需要实现的能力

壳页页面需要承担完整的播放页交互层职责，建议最少包含以下内容：

### 6.1 左下角信息区

- 作者头像
- 作者昵称
- 游戏标题
- 作者后“关注”按钮

### 6.2 右侧纵向操作列

- 点赞按钮和计数
- 收藏按钮和计数或状态
- 评论按钮和评论数

### 6.3 中间游戏区域

- 页面主体用 `iframe` 打开真实游戏页
- 交互层不要大面积遮挡游戏主操作区域
- 需要适配底部安全区和不同尺寸手机

### 6.4 小程序内跳转能力

如果壳页里的按钮需要跳回小程序，请支持微信 JSSDK：

- `wx.miniProgram.navigateTo(...)`

典型场景：

- 点击评论，跳到小程序游戏详情页评论区
- 未登录时，跳到小程序登录页

如果页面退出时需要同步少量状态给小程序，可以使用：

- `wx.miniProgram.postMessage(...)`

但不建议把点赞、关注、收藏的即时点击处理依赖在 `postMessage` 上。

## 7. 登录态和鉴权要求

壳页如果要直接完成“关注 / 点赞 / 收藏 / 评论跳转前校验”，页面本身必须能够识别当前用户身份。

推荐方案按优先级如下。

### 7.1 方案一：同域会话 Cookie

最推荐：

- 小程序内打开的壳页和游戏页都在 `gamevallies.com` 域下
- 壳页请求接口时，可通过同域会话识别当前用户

优点：

- 改造成本相对最低
- 壳页和游戏页同域更稳定
- 不需要在 URL 上传递长期 token

### 7.2 方案二：短时效壳页令牌

如果当前体系无法直接复用同域登录态，建议后端提供一个短时效 shell token 方案：

- 小程序先调用后端换取一个短时效令牌
- 再把该令牌传给壳页
- 壳页使用该令牌调用社交接口

要求：

- 有效期短
- 只用于壳页会话
- 权限范围尽量收敛

### 7.3 不建议方案：长期 token 直接放 URL

不建议把正式登录 token 或长期 access token 直接拼到 query 参数中，因为会有以下风险：

- 出现在地址栏
- 出现在日志
- 出现在监控、埋点、错误上报链路中
- 容易泄漏

### 7.4 当前前端临时实现说明

当前前端为了让壳页先具备联调能力，内部有一版“通过 URL hash 传递 token 信息，再在页面加载后立即清理地址”的临时实现。

这不是最终推荐方案，只适合作为短期联调用途。正式上线建议以后端落地的方案为准：

1. 最优先：同域会话 Cookie
2. 次优先：短时效 shell token

如果后端能提供上述任一正式方案，前端会同步去掉当前这套临时 token 透传逻辑。

## 8. 后端接口配套要求

壳页需要能拿到以下数据或完成以下动作：

1. 根据 `gameId` 获取游戏详情
2. 获取作者信息
3. 获取当前用户登录状态
4. 获取当前用户是否已关注作者
5. 获取当前用户是否已点赞游戏
6. 获取当前用户是否已收藏游戏
7. 获取点赞数、评论数、收藏数或收藏状态
8. 执行关注 / 取消关注
9. 执行点赞 / 取消点赞
10. 执行收藏 / 取消收藏

如果评论仍然在小程序详情页内完成，则壳页不一定要直接提交评论，但至少要能：

- 获取评论数
- 点击评论后跳转到小程序详情页评论区

### 8.1 当前前端已经按以下接口契约开发

为避免联调时出现“后端接口能力有，但路径或字段不一致”的问题，当前前端实际依赖的接口包括：

1. `GET /api/v1/games/:gameId`
2. `GET /api/v1/users/me`
3. `GET /api/v1/social/like-status/game/:gameId`
4. `GET /api/v1/social/follow-status/:authorId`
5. `POST /api/v1/social/like`
6. `POST /api/v1/social/follow`
7. `DELETE /api/v1/social/follow/:authorId`

请后端优先确认以上接口是否已存在、路径是否一致、返回字段是否兼容。

### 8.2 关于收藏能力的特别说明

当前项目里的“收藏”仍然是设备本地能力，前端使用本地存储维护收藏状态，并没有正式接入账号级收藏后端接口。

这意味着：

- 如果只完成 H5 壳页部署，不新增收藏后端接口，那么播放页里的“收藏”只能继续保持本地收藏
- 如果产品要求“账号级收藏、跨设备同步”，则需要配合落地收藏接口

收藏接口的详细要求请参考已有文档：

- `docs/backend-bookmark-api-implementation.md`

建议对齐方式：

1. 壳页一期可先兼容本地收藏
2. 账号级收藏上线后，再把壳页收藏切到后端真实接口

## 9. 服务端路由与部署要求

后端/运维请确保以下事项：

1. `GET /game-shell/index.html` 能稳定返回壳页页面
2. 不要返回 `404`
3. 不要依赖 `/` 根路径一定存在 H5 入口页
4. 不要强制跳到通用登录页
5. 尽量避免多级重定向
6. 壳页静态资源能在微信内正常加载

建议部署形态：

- 壳页与真实游戏页同域部署
- 壳页为独立物理路径
- 游戏页继续保留原有 `/games/...` 结构

### 9.1 游戏详情接口的附加要求

小程序真实业务链路中，用户可能从首页、发现页、分享、详情页等多个入口进入试玩页。

当小程序侧拿不到缓存中的游戏 URL 时，会退回到：

- 先根据 `gameId` 请求 `GET /api/v1/games/:gameId`
- 再读取其中的 `gameUrl`
- 再进入壳页或原始游戏页

因此对于“可试玩”的已发布游戏，请后端保证：

1. `GET /api/v1/games/:gameId` 能稳定返回可用的 `gameUrl`
2. `gameUrl` 是合法、可访问、可嵌入的地址
3. 已发布游戏不要返回空 `gameUrl`

## 10. 推荐整体 URL 方案

推荐目标结构如下：

```text
物理 H5 入口地址：
https://www.gamevallies.com/game-shell/index.html

前端实际打开示例：
https://www.gamevallies.com/game-shell/index.html#/pages/game/web-shell/index?id=123&src=%2Fgames%2Fabc123&title=%E6%89%93%E5%9C%B0%E9%BC%A0

真实游戏地址：
https://www.gamevallies.com/games/abc123
```

这样做的优点：

- 满足微信小程序 `web-view` 的限制
- 不依赖小程序外层浮层
- 可把作者、关注、点赞、收藏、评论全部放到网页层实现
- 与现有 `/games/...` 资源结构兼容

## 11. 验收标准

后端/运维完成后，请至少满足以下联调结果：

1. 壳页地址可直接在手机浏览器打开，返回 `200`
2. 壳页地址可直接在微信内置浏览器打开，返回 `200`
3. `https://www.gamevallies.com/game-shell/index.html#/pages/game/web-shell/index?...` 可在手机浏览器正常打开
4. 小程序 `web-view` 打开壳页时，不再出现“全部加载失败”
5. 壳页能成功 iframe 打开 `/games/...`
6. 壳页内能正确展示作者信息
7. 壳页内“关注”按钮可正常关注/取关
8. 壳页内点赞按钮可正常点赞/取消点赞
9. 壳页内收藏按钮可正常收藏/取消收藏
10. 壳页内评论按钮可正确跳到小程序详情页评论区
11. 壳页在全面屏设备上底部安全区显示正常
12. 不依赖站点根路径 `/` 返回 H5 入口页

## 12. 前端配合方式

后端/运维提供最终可访问的壳页地址后，前端会通过环境变量接入，例如：

```text
TARO_APP_GAME_SHELL_URL=https://www.gamevallies.com/game-shell/index.html
```

配置完成后，小程序播放页会优先打开该壳页地址；未配置时，当前前端会继续回退到原始游戏地址，保证基础播放不受影响。

## 13. 一句话交付要求

请提供一个可直接访问的、同域的、HTTPS 的 H5 壳页地址，例如：

- `https://www.gamevallies.com/game-shell/index.html`

它需要满足以下目标：

- 可被微信小程序 `web-view` 打开
- 可通过 `iframe` 嵌入 `https://www.gamevallies.com/games/...`
- 页面内部实现作者、关注、点赞、收藏、评论交互层
- 壳页本身可识别登录用户身份并调用现有社交接口
- 支持通过 `wx.miniProgram.navigateTo` 回跳小程序页面
