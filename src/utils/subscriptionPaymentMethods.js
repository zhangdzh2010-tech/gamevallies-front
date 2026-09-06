export const SUBSCRIPTION_PAYMENT_OPTIONS = [
  {
    id: 'alipay',
    label: '支付宝',
    shortLabel: '支付宝',
    statusLabel: '当前可用',
    description: '推荐使用，跳转支付宝收银台完成支付。',
    actionLabel: '支付宝支付开通',
    loadingLabel: '正在跳转支付宝...',
    available: true,
    iconText: '支',
  },
  {
    id: 'wechat',
    label: '微信支付',
    shortLabel: '微信',
    statusLabel: '当前可用',
    description: '支持微信内支付及手机浏览器微信收银台。',
    actionLabel: '微信支付开通',
    loadingLabel: '正在打开微信支付...',
    available: true,
    iconText: '微',
  },
];

function getDefaultAvailablePaymentMethod() {
  const firstAvailable = SUBSCRIPTION_PAYMENT_OPTIONS.find((option) => option.available);
  return firstAvailable ? firstAvailable.id : SUBSCRIPTION_PAYMENT_OPTIONS[0]?.id || 'alipay';
}

export const DEFAULT_SUBSCRIPTION_PAYMENT_METHOD = getDefaultAvailablePaymentMethod();

export function normalizeSubscriptionPaymentMethod(value) {
  return SUBSCRIPTION_PAYMENT_OPTIONS.some((option) => option.id === value)
    ? value
    : DEFAULT_SUBSCRIPTION_PAYMENT_METHOD;
}

export function getSubscriptionPaymentOption(methodId) {
  return SUBSCRIPTION_PAYMENT_OPTIONS.find((option) => option.id === methodId)
    || SUBSCRIPTION_PAYMENT_OPTIONS[0];
}

export function isSubscriptionPaymentMethodAvailable(methodId) {
  return Boolean(getSubscriptionPaymentOption(methodId)?.available);
}
