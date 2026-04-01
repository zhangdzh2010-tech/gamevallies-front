# H5 微信授权登录与 Native/H5 支付接入说明

更新时间：`2026-03-28`

## 当前前端改动

- H5 登录页不再把微信登录死绑到小程序 `wx.login()`
- H5 现在优先走微信 OAuth 授权入口
- 登录页支持 `code/state` 回跳处理
- 小程序 `miniapp-login` 保持不变
- 订阅支付不再只识别 `wx.requestPayment` 参数
- H5 现在支持以下支付返回结构：
  - `mwebUrl` / `redirectUrl` / `payUrl` / `cashierUrl`
  - `schemeUrl` / `wechatPayUrl` / `nativePayUrl`
  - `codeUrl`
- H5 支付返回后，前端会在页面重新聚焦时自动补查订单状态并刷新订阅权益

## 这次没有做的事

`docs/微信支付` 目录下的证书、私钥、APIv2/APIv3 密钥都属于后端商户侧凭据，不能打进前端包。

这意味着：

- 前端不能直接用这些密钥换取微信 OAuth token
- 前端不能直接签名 Native / JSAPI / H5 支付请求
- 这些文件只能给后端下单、回调验签、订单查询使用

## 当前后端实际缺口

对照本地 `gamevallies-backend` 代码确认：

- 已有：
  - `POST /api/v1/auth/wechat/miniapp-login`
  - `POST /api/v1/subscription/order` 返回小程序 `wx.requestPayment` 参数
- 缺失：
  - H5 微信 OAuth code 换登录态接口
  - H5 / Native 支付下单返回跳转链接或拉起链接

## 建议后端新增接口

### 1. H5 微信授权登录

建议新增：

```http
POST /api/v1/auth/wechat/h5-login
Content-Type: application/json
```

请求体：

```json
{
  "code": "wechat oauth code",
  "state": "oauth state",
  "redirectUri": "https://gamevallies.com/#/pages/login/index"
}
```

响应体沿用现有登录结构：

```json
{
  "code": 0,
  "data": {
    "token": "string",
    "refreshToken": "string",
    "user": {}
  }
}
```

### 2. H5 / Native 支付下单

当前 `POST /api/v1/subscription/order` 前端已开始附带 query 标记：

```text
/api/v1/subscription/order?clientPlatform=h5|wechat_h5&wechatPayFlow=native
```

建议后端按这组 query 标记决定支付返回结构，而不是继续返回小程序 `requestPayment` 参数。

可选返回结构示例：

#### H5 收银台 / MWEB

```json
{
  "code": 0,
  "data": {
    "orderId": "order_xxx",
    "payment": {
      "mwebUrl": "https://wx.tenpay.com/..."
    }
  }
}
```

#### Native / Scheme 拉起

```json
{
  "code": 0,
  "data": {
    "orderId": "order_xxx",
    "payment": {
      "schemeUrl": "weixin://wxpay/bizpayurl?pr=xxx"
    }
  }
}
```

#### 已封装好的收银台页

```json
{
  "code": 0,
  "data": {
    "orderId": "order_xxx",
    "payment": {
      "payUrl": "https://gamevallies.com/pay/cashier/order_xxx"
    }
  }
}
```

## 前端环境变量

H5 微信授权登录至少还需要补：

```env
TARO_APP_WECHAT_OAUTH_APP_ID=wx_xxx
TARO_APP_WECHAT_OAUTH_SCOPE=snsapi_base
```

说明：

- 这里是 H5 OAuth 的公开 `AppID`
- 不是 `docs/微信支付` 里的商户私钥/证书
- `AppSecret` 必须只放后端
