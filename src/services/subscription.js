import { get, post } from './api';
import { isH5Runtime } from '../utils/runtime';

const MOBILE_H5_USER_AGENT_RE = /android|webos|iphone|ipad|ipod|mobile|phone|windows phone|harmonyos/i;

const EMPTY_QUOTA = {
  freeQuota: 0,
  totalFreeQuota: 0,
  subscription: {
    active: false,
    planId: null,
    planName: null,
    expiresAt: null,
    usedThisPeriod: 0,
    quotaThisPeriod: 0,
    autoRenew: false,
    remaining: 0,
    totalRemaining: 0,
  },
};

function normalizeQuotaResponse(data) {
  if (!data || typeof data !== 'object') {
    return {
      ...EMPTY_QUOTA,
      subscription: {
        ...EMPTY_QUOTA.subscription,
      },
    };
  }

  const rawFreeQuota = Number(data.freeQuota ?? 0) || 0;
  const explicitTotalFreeQuota = data.totalFreeQuota;
  const hasExplicitTotalFreeQuota = explicitTotalFreeQuota !== null && explicitTotalFreeQuota !== undefined;
  const freeQuotaUsed = Number(data.usedFreeQuota ?? data.freeQuotaUsed ?? 0) || 0;
  const hasExplicitRemaining = data.freeQuotaRemaining !== null && data.freeQuotaRemaining !== undefined;
  const totalFreeQuota = Number(
    hasExplicitTotalFreeQuota
      ? explicitTotalFreeQuota
      : rawFreeQuota
  ) || 0;
  const freeQuotaRemaining = Number(
    hasExplicitRemaining
      ? data.freeQuotaRemaining
      : (hasExplicitTotalFreeQuota ? rawFreeQuota : Math.max(0, rawFreeQuota - freeQuotaUsed))
  ) || 0;
  const subscriptionQuota = Number(data.subscription?.quotaThisPeriod ?? data.subscriptionQuota ?? 0) || 0;
  const subscriptionUsed = Number(data.subscription?.usedThisPeriod ?? data.subscriptionUsed ?? 0) || 0;
  const subscriptionRemaining = Number(
    data.subscription?.remaining ?? data.subscriptionRemaining ?? Math.max(0, subscriptionQuota - subscriptionUsed)
  ) || 0;
  const totalRemaining = Number(data.totalRemaining ?? (freeQuotaRemaining + subscriptionRemaining)) || 0;

  return {
    freeQuota: freeQuotaRemaining,
    totalFreeQuota,
    subscription: {
      active: data.subscription?.active ?? data.subscriptionActive ?? false,
      planId: data.subscription?.planId ?? data.planId ?? null,
      planName: data.subscription?.planName ?? data.planName ?? null,
      expiresAt: data.subscription?.expiresAt ?? data.expiresAt ?? null,
      usedThisPeriod: subscriptionUsed,
      quotaThisPeriod: subscriptionQuota,
      autoRenew: data.subscription?.autoRenew ?? data.autoRenew ?? false,
      remaining: subscriptionRemaining,
      totalRemaining,
    },
  };
}

function getSubscriptionReturnUrl() {
  if (typeof window === 'undefined' || !window.location?.href) {
    return '';
  }

  return window.location.href;
}

function resolveAlipayProvider() {
  const userAgent = typeof navigator === 'undefined' ? '' : (navigator.userAgent || '');
  return MOBILE_H5_USER_AGENT_RE.test(userAgent) ? 'alipay_wap' : 'alipay_page';
}

function resolvePaymentQuery(paymentMethod) {
  if (paymentMethod !== 'wechat') {
    if (!isH5Runtime()) {
      throw new Error('当前环境暂不支持支付宝支付，请在 H5 页面完成订阅');
    }
    return { provider: resolveAlipayProvider() };
  }

  if (!isH5Runtime()) {
    return {
      provider: 'wechat_pay',
      clientPlatform: 'weapp',
      wechatPayFlow: 'jsapi',
    };
  }

  const userAgent = typeof navigator === 'undefined' ? '' : (navigator.userAgent || '');
  const isWechatBrowser = /micromessenger/i.test(userAgent);
  return {
    provider: 'wechat_pay',
    clientPlatform: isWechatBrowser ? 'wechat_h5' : 'h5',
    wechatPayFlow: isWechatBrowser ? 'jsapi' : 'mweb',
  };
}

export async function getQuota() {
  const data = await get('/api/v1/users/quota');
  return normalizeQuotaResponse(data);
}

export async function getPlans() {
  return get('/api/v1/subscription/plans');
}

export async function createOrder(planId, gameId, paymentMethod = 'alipay') {
  const query = new URLSearchParams(resolvePaymentQuery(paymentMethod));
  const returnUrl = getSubscriptionReturnUrl();
  if (returnUrl) {
    query.set('returnUrl', returnUrl);
  }

  return post(
    `/api/v1/subscription/order?${query.toString()}`,
    {
      planId,
      ...(gameId ? { gameId } : {}),
    }
  );
}

export async function getSubscriptionStatus() {
  return get('/api/v1/subscription/status');
}

export async function getOrderStatus(orderId) {
  return get(`/api/v1/subscription/orders/${orderId}`);
}

export async function unlockGame(gameId) {
  return post(`/api/v1/games/${gameId}/unlock`);
}

export default {
  getQuota,
  getPlans,
  createOrder,
  getSubscriptionStatus,
  getOrderStatus,
  unlockGame,
};
