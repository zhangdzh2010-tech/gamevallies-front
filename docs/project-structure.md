# 项目结构说明

## 技术栈

- Taro 4
- React 18
- Zustand
- Sass
- Jest

当前仓库的业务代码以 `JavaScript / JSX` 为主。

## 顶层目录

### `config/`

Taro 构建配置入口。

- 负责注入 `.env` / `.env.development`
- 区分 `weapp` 与 `h5` 输出目录
- 为 H5 构建补充浏览器环境 polyfill
- 通过 alias 将 `@tarojs/hooks` 指向 [src/utils/taroHooks.js](../src/utils/taroHooks.js)

### `docs/`

项目文档目录。

- 保留正在使用的设计/联调文档
- `archive/` 下存放已经退出主开发面的历史资料

### `src/`

应用源代码。

## `src/` 目录职责

### `src/pages/`

按页面组织业务代码。

- `index/`：首页 feed
- `discover/`：发现页
- `create/`：AI 创作主入口
- `message/`：消息通知
- `profile/`：个人中心、作品与任务管理
- `login/` / `register/`：鉴权入口
- `game/`：详情、试玩、迭代、复刻等子流程
- `subscription/`：订阅说明与权益页

### `src/components/common/`

跨页面复用的通用组件。

重点组件：

- `AppTopBar`
- `CustomTabBar`
- `GameCard`
- `GamePlayer`
- `FloatingPlayer`
- `PaywallPopup`
- `SharePanel`

### `src/services/`

接口层与实时通信层。

- `api.js`：统一请求封装、鉴权恢复、微服务路由
- `auth.js`：登录注册、个人资料
- `feed.js`：首页/发现页 feed
- `game.js`：作品创建、获取、发布、迭代、复刻
- `social.js`：点赞、评论、通知、关注
- `subscription.js`：订阅、支付、配额、解锁
- `websocket.js`：Taro Socket 封装

### `src/store/`

当前仅保留 `gameStore.js`，负责创作任务工作流。

它承接：

- 新建作品任务
- 任务恢复
- 任务轮询与 WebSocket 事件
- 迭代/复刻相关状态
- 个人中心任务态联动

### `src/stores/`

保留轻量、明确职责的独立 store。

- `gamePlayer.js`：全局浮层播放器与试玩上下文
- `quotaStore.js`：免费额度、订阅、微信支付、支付后解锁

### `src/utils/`

工具与跨页面业务辅助。

重点文件：

- `authNavigation.js`：登录保护、创作入口恢复、登录后跳转
- `storage.js`：Token / 用户信息持久化
- `bookmarks.js`：本地收藏状态同步
- `gameUnlock.js`：试玩解锁事件
- `share.js`：分享路径拼装
- `taroHooks.js`：`@tarojs/hooks` 本地 shim

### `src/test-utils/`

测试辅助组件与 mock。

## 当前主链路

### 鉴权

- 登录页、注册页直接调用 `services/auth.js`
- 登录态和跳转恢复统一收口到 `utils/authNavigation.js`

### 创作

- `pages/create/index.jsx` 负责 UI 与入口恢复
- `store/gameStore.js` 负责长任务状态管理
- `services/game.js` 与 `services/websocket.js` 负责服务端通信

### 试玩与支付

- `stores/gamePlayer.js` 负责作品试玩承接
- `stores/quotaStore.js` 负责订阅支付与权益同步
- `components/common/PaywallPopup.jsx` 负责付费弹层 UI

### 互动

- 首页、详情页、个人中心均通过 `services/social.js` / `services/feed.js` 拉取互动数据

## 本轮清理结果

本次已从主代码路径中移除以下未接入链路：

- 未使用的旧鉴权 store / request 封装
- 未使用的旧 hooks 包装层
- 未使用的占位消息页
- 未使用的 store barrel / service barrel
- 页面目录中的历史设计草稿，已移入 `docs/archive/`
