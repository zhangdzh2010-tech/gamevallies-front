# GameVallies Frontend

GameVallies 的多端前端仓库，基于 Taro 4 和 React 18，当前主要服务于微信小程序，并同步构建 H5 版本。

## 当前状态

- 当前主代码以 `JavaScript / JSX + Sass` 为主，不是 TypeScript 项目
- 构建目标包含 `weapp` 和 `h5`
- 核心业务链路已经集中在首页分发、AI 创作、作品试玩、订阅解锁、个人中心
- 文档入口见 [docs/README.md](docs/README.md)

## 技术栈

- Taro 4
- React 18
- Zustand
- Sass
- Webpack 5
- Jest

## 常用命令

```bash
npm run dev:weapp
npm run dev:h5
npm run build:weapp
npm run build:h5
npm test
npm run lint
```

构建产物默认输出到：

- `dist/weapp`
- `dist/h5`

## 环境配置

项目通过 [config/index.js](config/index.js) 在构建时注入环境变量。

常用环境文件：

- `.env`：默认环境配置
- `.env.production`：部署环境配置
- `.env.production.example`：部署配置示例
- `.env.development`：本地 watch 模式覆盖配置，可选

主要环境变量定义集中在 [src/config/env.js](src/config/env.js)。

## 目录结构

```text
config/                     Taro 构建配置与环境变量注入
docs/                       项目文档、设计文档、归档资料
scripts/                    辅助脚本
src/
  app.jsx                   应用入口
  app.config.js             页面与 tabBar 配置
  components/common/        通用 UI 组件
  config/                   前端运行时配置
  custom-tab-bar/           自定义 tabBar
  images/                   静态资源
  pages/
    index/                  首页
    discover/               发现页
    create/                 AI 创作页
    message/                消息通知页
    profile/                个人中心
    login/                  登录页
    register/               注册页
    game/                   游戏详情、试玩、迭代、复刻
    subscription/           订阅页
  services/                 API 与 WebSocket 服务层
  store/gameStore.js        创作任务与作品工作流 store
  stores/                   播放器、额度/支付等 store
  styles/                   全局样式与主题变量
  test-utils/               测试辅助
  types/                    运行时配置常量
  utils/                    存储、鉴权跳转、分享、书签等工具
```

更详细的代码地图见 [docs/project-structure.md](docs/project-structure.md)。

## 主要页面

- `pages/index/index`：热门 feed、分类筛选、点赞/收藏、进入作品
- `pages/create/index`：AI 创建入口、任务恢复、创作态承接
- `pages/game/detail/index`：作品详情、互动与跳转
- `pages/game/play/index`：作品试玩页
- `pages/game/iterate/index`：作品迭代页
- `pages/game/fork/index`：作品复刻页
- `pages/message/index`：消息通知
- `pages/profile/index`：个人中心、作品管理、任务状态
- `pages/subscription/index`：订阅与权益说明

## 核心链路

### 1. 鉴权与跳转恢复

- 登录/注册能力在 [src/services/auth.js](src/services/auth.js)
- 登录后的跳转恢复、创作入口保护在 [src/utils/authNavigation.js](src/utils/authNavigation.js)
- Token / 用户信息存储在 [src/utils/storage.js](src/utils/storage.js)

### 2. AI 创作工作流

- 页面入口在 [src/pages/create/index.jsx](src/pages/create/index.jsx)
- 创作任务状态、轮询、恢复、阶段展示在 [src/store/gameStore.js](src/store/gameStore.js)
- 相关接口在 [src/services/game.js](src/services/game.js)

### 3. 试玩与订阅解锁

- 全局播放器在 [src/stores/gamePlayer.js](src/stores/gamePlayer.js)
- 额度、支付、解锁状态在 [src/stores/quotaStore.js](src/stores/quotaStore.js)
- 支付弹窗组件在 [src/components/common/PaywallPopup.jsx](src/components/common/PaywallPopup.jsx)

### 4. Feed 与互动

- 首页/发现页数据由 [src/services/feed.js](src/services/feed.js) 提供
- 点赞、关注、评论、通知由 [src/services/social.js](src/services/social.js) 提供

## 测试

当前仓库已有的测试主要覆盖：

- 首页关键交互
- 创作页主流程
- 试玩页导航
- 配额/支付 store
- 鉴权跳转工具

Jest 配置见 [jest.config.js](jest.config.js)。

## 文档

- 文档索引：[docs/README.md](docs/README.md)
- 代码结构说明：[docs/project-structure.md](docs/project-structure.md)
- 历史归档资料：[docs/archive/README.md](docs/archive/README.md)


## 部署

[阿里云部署与维护](docs/ALIYUN_DEPLOYMENT.md)。
