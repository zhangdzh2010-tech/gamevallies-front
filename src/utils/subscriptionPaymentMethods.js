export const DEFAULT_SUBSCRIPTION_PAYMENT_METHOD = 'alipay';

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
    statusLabel: '暂不可用',
    description: '当前暂不支持微信支付。',
    actionLabel: '微信支付暂不可用',
    loadingLabel: '微信支付暂不可用',
    available: false,
    iconText: '微',
  },
];

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
