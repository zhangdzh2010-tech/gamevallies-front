const WEAPP_JSAPI_FIELDS = ['timeStamp', 'nonceStr', 'package', 'signType', 'paySign'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isLaunchableUrl(url) {
  return /^(https?:\/\/|weixin:\/\/|wxp:\/\/|alipays?:\/\/)/i.test(url);
}

function pickPaymentValue(payment, keys) {
  for (const key of keys) {
    const value = payment?.[key];
    if (isNonEmptyString(value)) {
      return {
        key,
        value: value.trim(),
      };
    }
  }

  return null;
}

function normalizeWeappJsapiPayload(payment) {
  const missingField = WEAPP_JSAPI_FIELDS.find((field) => !payment?.[field]);
  if (missingField) {
    return null;
  }

  return {
    timeStamp: payment.timeStamp,
    nonceStr: payment.nonceStr,
    package: payment.package,
    signType: payment.signType,
    paySign: payment.paySign,
  };
}

function appendMwebReturnUrl(url, returnUrl) {
  if (!isNonEmptyString(url) || !isNonEmptyString(returnUrl) || !/^https?:\/\//i.test(url)) {
    return url;
  }

  if (!/mweb/i.test(url) || /(?:\?|&)redirect_url=/i.test(url)) {
    return url;
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('redirect_url', returnUrl);
    return parsed.toString();
  } catch (_error) {
    return url;
  }
}

export function resolveSubscriptionPaymentAction(order, options = {}) {
  const payment = order?.payment;
  if (!payment || typeof payment !== 'object') {
    return null;
  }

  const weappJsapiPayload = normalizeWeappJsapiPayload(payment);

  const redirectCandidate = pickPaymentValue(payment, [
    'mwebUrl',
    'mweb_url',
    'redirectUrl',
    'redirect_url',
    'payUrl',
    'pay_url',
    'paymentUrl',
    'payment_url',
    'cashierUrl',
    'cashier_url',
    'url',
  ]);

  if (redirectCandidate && isLaunchableUrl(redirectCandidate.value)) {
    return {
      kind: 'h5_redirect',
      source: redirectCandidate.key,
      url:
        redirectCandidate.key === 'mwebUrl' || redirectCandidate.key === 'mweb_url'
          ? appendMwebReturnUrl(redirectCandidate.value, options.returnUrl)
          : redirectCandidate.value,
    };
  }

  const schemeCandidate = pickPaymentValue(payment, [
    'schemeUrl',
    'scheme_url',
    'wechatPayUrl',
    'wechat_pay_url',
    'nativePayUrl',
    'native_pay_url',
    'nativeUrl',
    'native_url',
    'deeplink',
  ]);

  if (schemeCandidate && isLaunchableUrl(schemeCandidate.value)) {
    return {
      kind: 'h5_redirect',
      source: schemeCandidate.key,
      url: schemeCandidate.value,
    };
  }

  const codeUrlCandidate = pickPaymentValue(payment, ['codeUrl', 'code_url']);
  if (codeUrlCandidate && isLaunchableUrl(codeUrlCandidate.value)) {
    return {
      kind: 'h5_redirect',
      source: codeUrlCandidate.key,
      url: codeUrlCandidate.value,
    };
  }

  if (codeUrlCandidate) {
    return {
      kind: 'unsupported_qrcode',
      source: codeUrlCandidate.key,
      url: codeUrlCandidate.value,
    };
  }

  if (weappJsapiPayload) {
    return {
      kind: 'jsapi',
      payload: weappJsapiPayload,
    };
  }

  return null;
}

export function getPaymentActionFailureMessage(action) {
  if (!action) {
    return '支付参数异常，请稍后重试';
  }

  if (action.kind === 'jsapi') {
    return '当前环境无法调起微信支付，请在微信中重新打开页面';
  }

  if (action.kind === 'unsupported_qrcode') {
    return '当前订单返回的是二维码地址，前端暂不支持，请改为返回 payUrl';
  }

  return '支付参数异常，请稍后重试';
}

export function launchPaymentAction(action) {
  if (!action?.url) {
    throw new Error('支付跳转地址为空');
  }

  if (typeof window === 'undefined' || typeof window.location?.assign !== 'function') {
    throw new Error('当前环境不支持支付跳转');
  }

  window.location.assign(action.url);
}

export async function launchJsapiPayment(action, options = {}) {
  if (action?.kind !== 'jsapi' || !action.payload) {
    throw new Error('微信支付参数不完整');
  }

  if (options.isH5 && typeof window !== 'undefined') {
    let bridge = window.WeixinJSBridge;
    if (!bridge || typeof bridge.invoke !== 'function') {
      bridge = await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          document.removeEventListener('WeixinJSBridgeReady', onReady);
          reject(new Error('微信支付组件尚未就绪，请在微信中重新打开页面'));
        }, 5000);
        const onReady = () => {
          window.clearTimeout(timeout);
          document.removeEventListener('WeixinJSBridgeReady', onReady);
          resolve(window.WeixinJSBridge);
        };
        document.addEventListener('WeixinJSBridgeReady', onReady, false);
      });
    }
    if (!bridge || typeof bridge.invoke !== 'function') {
      throw new Error('微信支付组件尚未就绪，请在微信中重新打开页面');
    }
    await new Promise((resolve, reject) => {
      bridge.invoke('getBrandWCPayRequest', action.payload, (result) => {
        const message = result?.err_msg || result?.errMsg || '';
        if (/\bok\b/i.test(message)) {
          resolve(result);
        } else {
          reject(new Error(/cancel/i.test(message) ? '支付已取消' : (message || '微信支付失败')));
        }
      });
    });
    return;
  }

  if (typeof options.requestPayment !== 'function') {
    throw new Error('当前环境无法调起微信支付');
  }
  await options.requestPayment(action.payload);
}
