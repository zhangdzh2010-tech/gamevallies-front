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

  const runtime = options.runtime || process.env.TARO_ENV || '';
  const weappJsapiPayload = normalizeWeappJsapiPayload(payment);

  if (weappJsapiPayload && runtime === 'weapp') {
    return {
      kind: 'weapp_jsapi',
      payload: weappJsapiPayload,
    };
  }

  if (weappJsapiPayload && options.isWechatBrowser) {
    return {
      kind: 'wechat_h5_jsapi',
      payload: weappJsapiPayload,
    };
  }

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
      kind: 'unsupported_jsapi',
      payload: weappJsapiPayload,
    };
  }

  return null;
}

export function getPaymentActionFailureMessage(action) {
  if (!action) {
    return '支付参数异常，请稍后重试';
  }

  if (action.kind === 'unsupported_jsapi') {
    return '当前 H5 后端仍返回小程序支付参数，请改为返回 H5/native 支付跳转链接';
  }

  if (action.kind === 'unsupported_qrcode') {
    return '当前 H5 后端返回的是二维码 code_url，请改为返回可直接拉起支付的链接';
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

function waitForWeixinJSBridge() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('当前环境不支持微信 H5 支付'));
  }

  if (window.WeixinJSBridge?.invoke) {
    return Promise.resolve(window.WeixinJSBridge);
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      document.removeEventListener('WeixinJSBridgeReady', handleReady);
      document.removeEventListener('onWeixinJSBridgeReady', handleReady);
    };

    const handleReady = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(window.WeixinJSBridge);
    };

    document.addEventListener('WeixinJSBridgeReady', handleReady, { once: true });
    document.addEventListener('onWeixinJSBridgeReady', handleReady, { once: true });

    window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(new Error('微信支付桥接未就绪，请稍后重试'));
    }, 4000);
  });
}

export async function invokeWechatH5Payment(payload) {
  if (!payload) {
    throw new Error('微信 H5 支付参数为空');
  }

  const bridge = await waitForWeixinJSBridge();

  return new Promise((resolve, reject) => {
    bridge.invoke('getBrandWCPayRequest', payload, (result) => {
      const errMsg = result?.err_msg || result?.errMsg || '';
      const normalized = String(errMsg).toLowerCase();

      if (normalized.includes('ok')) {
        resolve(result);
        return;
      }

      if (normalized.includes('cancel')) {
        const error = new Error(errMsg || '支付已取消');
        error.code = 'PAYMENT_CANCELLED';
        reject(error);
        return;
      }

      reject(new Error(errMsg || '微信支付失败'));
    });
  });
}
