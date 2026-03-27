# H5 转 App 落地清单

## 1. 文档目标

本文档用于指导当前 `gamevallies-frontend` 项目从现有 Taro H5 产物，落地为 Android / iOS App。

本文档聚焦一条最短、最现实的路线：

- 保留现有 Taro 前端代码
- 继续使用 `build:h5` 产出 Web 资源
- 使用 Capacitor 作为原生壳，将 H5 打包为 App

不采用本阶段目标的路线：

- 直接改造成 Taro React Native
- 直接写原生 Android / iOS 双端
- 继续只停留在浏览器 H5

---

## 2. 当前项目现状

结合当前仓库代码，现状如下：

- 项目已支持 `weapp` 和 `h5` 两个构建目标。
- 项目当前没有 `rn`、`capacitor`、`cordova`、`electron` 等 App 打包链路。
- H5 构建脚本已存在，输出目录为 `dist/h5`。
- 项目内存在多处微信小程序专属能力，不能原样直接搬到 App。

关键代码位置：

- H5 / 小程序构建脚本：[package.json](d:/Project/gamevallies/gamevallies-frontend/package.json#L11)
- H5 输出目录：[config/index.js](d:/Project/gamevallies/gamevallies-frontend/config/index.js#L8)
- 环境变量注入：[config/index.js](d:/Project/gamevallies/gamevallies-frontend/config/index.js#L98)
- H5 环境配置：[src/config/env.js](d:/Project/gamevallies/gamevallies-frontend/src/config/env.js#L3)

---

## 3. 推荐路线

推荐路线：

1. 保持 Taro 继续输出 H5
2. 新增 Capacitor 工程目录
3. 将 `dist/h5` 作为 App Web 资源目录
4. 补齐 App 登录、支付、分享、WebView 通信替代方案
5. 使用 Android Studio / Xcode 正式出包

这条路线的优点：

- 对现有代码侵入最小
- 可以快速看到 App 形态
- 前端团队延续 Web/Taro 技术栈即可推进
- 后续需要接原生能力时，可按 Capacitor 插件逐步补强

---

## 4. 当前已确认状态

2026-03-27 已验证：

- `npm.cmd run build:h5` 可以成功构建 H5
- 当前主要是体积警告，不是阻塞性错误
- 产物可作为 Capacitor 的 `webDir` 输入

当前构建现象：

- 构建成功
- 存在 bundle 体积偏大的 warning
- 说明 H5 产物链路可用，但后续 App 版本需要做性能优化

---

## 5. 一次性基础建设清单

## 5.1 新增 App 壳工程

需要完成：

- 初始化 Capacitor
- 新增 Android 工程
- 新增 iOS 工程
- 建立 H5 产物与原生壳同步流程

建议命令：

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npx cap init gamevallies com.gamevallies.app
npx cap add android
npx cap add ios
```

建议新增文件：

- `capacitor.config.ts` 或 `capacitor.config.json`

关键配置：

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gamevallies.app',
  appName: 'GameVallies',
  webDir: 'dist/h5',
  bundledWebRuntime: false,
};

export default config;
```

---

## 5.2 增加打包脚本

建议在 `package.json` 新增以下脚本：

```json
{
  "scripts": {
    "build:app:web": "taro build --type h5",
    "app:sync": "npx cap sync",
    "app:android": "npx cap open android",
    "app:ios": "npx cap open ios",
    "build:app": "npm run build:app:web && npm run app:sync"
  }
}
```

目的：

- 统一团队出包入口
- 避免每次手动 build + sync 漏步骤

---

## 5.3 目录约定

建议目录结构：

```text
gamevallies-frontend/
  android/
  ios/
  dist/h5/
  capacitor.config.ts
  src/
  config/
```

约束：

- `android/` 和 `ios/` 提交到仓库
- `dist/` 不提交
- `capacitor.config.*` 提交

---

## 6. 前端代码改造清单

## 6.1 统一平台识别

当前代码大量使用：

- `process.env.TARO_ENV === 'weapp'`

App 版本需要新增一层统一平台判断，不建议后面继续散落写条件分支。

建议新增：

- `src/utils/platform.js`

建议暴露：

```js
export const isWeapp = process.env.TARO_ENV === 'weapp';
export const isH5 = process.env.TARO_ENV === 'h5';
export const isApp = isH5 && Boolean(window?.Capacitor);
export const getRuntimePlatform = () => {
  if (isWeapp) return 'weapp';
  if (isApp) return 'app';
  return 'web';
};
```

后续所有登录、支付、分享、壳通信都基于这一层判断。

---

## 6.2 登录能力替换

当前项目使用的是微信小程序登录接口：

- [auth.js](d:/Project/gamevallies/gamevallies-frontend/src/services/auth.js#L4)

这意味着 App 不能直接复用当前登录链路。

必须补的 App 登录方案，三选一：

1. 手机号验证码登录
2. 微信开放平台 App 登录
3. 游客登录 + 后续绑定

推荐优先级：

1. 手机号验证码登录
2. 微信 App 登录

原因：

- 手机号登录接入成本低
- 后端改造最小
- iOS/Android 行为更一致

前端必做项：

- 登录页按平台切换登录方式
- App 端隐藏“微信小程序一键登录”文案
- 保留 H5 和小程序原逻辑

---

## 6.3 支付能力替换

当前订阅支付使用的是微信小程序支付：

- [quotaStore.js](d:/Project/gamevallies/gamevallies-frontend/src/stores/quotaStore.js#L423)

这在 App 中不能直接使用。

App 端可选方案：

1. 微信 App 支付
2. 支付宝 App 支付
3. 苹果内购 IAP
4. H5 收银台跳转支付

如果你的订阅是数字内容型会员，iOS 端要重点评估 Apple IAP 合规要求。

建议：

- Android：先接微信 App 支付
- iOS：先评估是否必须走 IAP

前端必做项：

- 抽象统一支付入口 `paySubscription()`
- `weapp` 使用 `Taro.requestPayment`
- `app` 使用 Capacitor 原生支付插件或自定义桥接
- `web` 继续保留 H5 支付跳转能力

---

## 6.4 分享能力替换

当前项目在多个页面使用了小程序分享能力：

- `useShareAppMessage`
- `useShareTimeline`

例如：

- [play/index.jsx](d:/Project/gamevallies/gamevallies-frontend/src/pages/game/play/index.jsx#L4)
- [play/index.jsx](d:/Project/gamevallies/gamevallies-frontend/src/pages/game/play/index.jsx#L115)

App 端不能直接复用。

App 需要改成：

- 原生系统分享
- 复制链接
- 拉起微信/QQ/系统分享面板

建议封装统一分享能力：

- `src/utils/shareRuntime.js`

目标接口：

```js
shareGame({ title, url, imageUrl, path })
```

平台实现：

- `weapp`：走现有小程序分享
- `app`：走 Capacitor Share 或原生分享插件
- `web`：走 `navigator.share` 或复制链接

---

## 6.5 小程序 WebView 通信替换

当前小游戏壳页依赖 `wx.miniProgram`：

- [web-shell/index.jsx](d:/Project/gamevallies/gamevallies-frontend/src/pages/game/web-shell/index.jsx#L159)

这部分在 App 中必须替换。

需要抽象两个方向的通信：

1. 宿主容器 -> H5 游戏
2. H5 游戏 -> 宿主容器

建议方案：

- App 中统一使用 Capacitor WebView + `postMessage` / 插件桥接
- 小程序保留原 `wx.miniProgram.postMessage`

建议封装：

- `src/utils/gameHostBridge.js`

暴露统一方法：

- `sendToHost(type, payload)`
- `navigateHost(url)`
- `getHostEnv()`

---

## 6.6 环境变量与域名策略

当前 H5 会从环境变量注入服务地址：

- [config/index.js](d:/Project/gamevallies/gamevallies-frontend/config/index.js#L102)
- [env.js](d:/Project/gamevallies/gamevallies-frontend/src/config/env.js#L5)

App 需要明确：

- 正式环境 API 域名
- 测试环境 API 域名
- WebSocket 域名
- 游戏资源域名
- H5 页面访问域名

必须确认：

- Android 是否允许明文 HTTP
- iOS ATS 是否要求全 HTTPS
- WebSocket 是否全站 `wss://`

建议：

- App 统一只走 HTTPS / WSS
- 所有服务地址按 `production / staging / development` 分层

---

## 7. Capacitor 插件清单

建议至少评估和补齐以下插件：

- `@capacitor/app`
- `@capacitor/browser`
- `@capacitor/share`
- `@capacitor/device`
- `@capacitor/network`
- `@capacitor/push-notifications`

可能需要自定义或第三方插件的能力：

- 微信 App 登录
- 微信 App 支付
- 原生文件下载 / 保存图片
- 更强的 WebView 桥接

---

## 8. 后端配合清单

App 落地不只是前端改造，后端必须同步补：

## 8.1 登录接口

补充至少一种 App 可用登录接口：

- 手机号验证码登录
- 微信 App 登录

不能继续只依赖：

- `/api/v1/auth/wechat/miniapp-login`

---

## 8.2 支付接口

后端需支持 App 端支付下单参数返回。

至少区分：

- 小程序支付下单
- App 支付下单
- H5 支付下单

建议支付创建接口增加：

```json
{
  "platform": "weapp | h5 | app_android | app_ios"
}
```

---

## 8.3 分享落地页

App 分享出去的链接，建议统一落到 H5 详情页或下载页。

必须准备：

- 游戏详情 H5 页
- App 下载页
- Deep Link / Universal Link 规划

---

## 8.4 推送与消息

如果后续 App 要做真正的消息通知，需要后端支持：

- App 推送 token 绑定
- 推送消息下发
- 未读状态同步

这不是 H5 转壳的阻塞项，但会很快变成上线后的体验短板。

---

## 9. Android / iOS 原生侧清单

## 9.1 Android

需要确认：

- 应用包名
- 签名证书
- 渠道包策略
- 微信开放平台 Android 配置
- 支付 SDK 接入
- 网络安全配置
- 文件读写权限

## 9.2 iOS

需要确认：

- Bundle Identifier
- 开发者账号与证书
- Associated Domains
- ATS 配置
- 微信 iOS SDK
- Apple IAP 评估
- 审核合规文案

---

## 10. 打包流程清单

每次发 App 包建议按以下顺序执行：

1. 更新代码
2. 切正式环境变量
3. 执行 H5 构建
4. 同步到 Capacitor 原生工程
5. 打开 Android / iOS 工程
6. 在原生 IDE 中生成测试包
7. 回归登录 / 支付 / 分享 / 打开游戏流程
8. 生成发布包

建议命令流程：

```bash
npm run build:h5
npx cap sync
npx cap open android
npx cap open ios
```

---

## 11. 测试清单

## 11.1 基础链路

- App 首次启动正常
- H5 资源加载正常
- 页面路由正常
- 返回行为正常
- 刷新和重进状态正常

## 11.2 账号链路

- 登录成功
- 退出成功
- token 刷新正常
- 未登录拦截正常

## 11.3 支付链路

- 订阅页打开正常
- 创建订单成功
- 支付成功后会员状态刷新
- 支付取消状态正确
- 支付失败提示正确
- 已支付但前端回调异常时能正确补单

## 11.4 游戏链路

- 创建游戏成功
- 试玩成功
- 分享后能回到正确页面
- WebView 游戏与宿主状态同步正常

## 11.5 分享链路

- 系统分享成功
- 复制链接成功
- 从分享链接打开详情成功
- App 未安装时跳下载页

---

## 12. 当前项目的明确阻塞项

在真正开始 App 打包前，当前仓库至少有以下阻塞项必须规划：

1. 登录只支持微信小程序登录
2. 支付使用的是微信小程序支付
3. 分享依赖小程序分享 API
4. 游戏壳与宿主通信依赖 `wx.miniProgram`
5. iOS 数字订阅支付合规方案未确定

这些不解决，App 即使能打出来，也会在核心业务链路上不可用。

---

## 13. 推荐实施顺序

建议分三阶段推进。

### 阶段一：先把壳跑通

- 初始化 Capacitor
- 跑通 `build:h5 -> cap sync -> Android/iOS 打开`
- 确保页面能打开
- 修基础路由和样式问题

### 阶段二：补关键业务闭环

- App 登录
- App 支付
- App 分享
- WebView 桥接

### 阶段三：上线前强化

- 推送
- 性能优化
- 埋点
- 崩溃监控
- 包体积治理

---

## 14. 上线前验收标准

满足以下条件后，才建议进入正式提审或灰度：

- Android 和 iOS 都能正常启动
- 登录可用
- 支付可用
- 分享可用
- 游戏试玩和返回路径正常
- 核心页面白屏率可控
- H5 资源版本更新机制稳定
- 线上 API / WS / 资源域名全部正式可达

---

## 15. 官方参考

- Taro 官方构建说明：https://docs.taro.zone/en/docs/GETTING-STARTED
- Taro 官方总览：https://docs.taro.zone/en/docs/
- Capacitor 官方文档：https://capacitorjs.com/docs/next
- Capacitor 官方首页：https://capacitorjs.com/

---

## 16. 最终建议

对当前项目来说，最合适的落地路径不是“直接做原生 App”，而是：

1. 先稳定产出 H5
2. 用 Capacitor 包壳
3. 定向改掉小程序独占能力
4. 再逐步增强原生体验

这是目前开发成本、迭代速度和可控性之间最平衡的方案。
