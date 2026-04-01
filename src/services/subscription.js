import { get, post } from './api';
import { isH5Runtime, isWechatBrowserRuntime } from '../utils/runtime';

// ═══════════════════════════════════════════
// Mock data — 后端接口就绪后删除此文件顶部的 mock 拦截
// ═══════════════════════════════════════════
const USE_MOCK = false;

const MOCK_PLANS = [
  {
    id: 'plan_monthly_basic',
    name: '基础月卡',
    price: 990,
    priceDisplay: '9.9',
    currency: 'CNY',
    period: 'monthly',
    periodLabel: '月',
    quota: 10,
    quotaLabel: '10次/月',
    features: ['每月10次创建', 'AI迭代优化', '优先生成'],
    recommended: false,
    badge: null,
  },
  {
    id: 'plan_monthly_pro',
    name: '专业月卡',
    price: 1990,
    priceDisplay: '19.9',
    currency: 'CNY',
    period: 'monthly',
    periodLabel: '月',
    quota: 30,
    quotaLabel: '30次/月',
    features: ['每月30次创建', '无限AI迭代', '优先生成', '专属客服'],
    recommended: true,
    badge: '推荐',
  },
];

const MOCK_QUOTA = {
  freeQuota: 3,
  totalFreeQuota: 5,
  subscription: {
    active: false,
    planId: null,
    planName: null,
    expiresAt: null,
    usedThisPeriod: 0,
    quotaThisPeriod: 0,
  },
};

const MOCK_SUBSCRIPTION_STATUS = {
  active: false,
  planId: null,
  planName: null,
  expiresAt: null,
  usedThisPeriod: 0,
  quotaThisPeriod: 0,
  autoRenew: false,
};

const MOCK_ORDER = {
  orderId: 'order_mock_' + Date.now(),
  payment: {
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: 'mock_nonce_' + Math.random().toString(36).slice(2, 10),
    package: 'prepay_id=mock_prepay_' + Date.now(),
    signType: 'RSA',
    paySign: 'mock_sign_' + Math.random().toString(36).slice(2),
  },
};

const MOCK_UNLOCK = { unlocked: true, canPlay: true, quotaRemaining: 29 };
const MOCK_SUBSCRIBER_COUNT = 1234;

function normalizeQuotaResponse(data) {
  if (!data || typeof data !== 'object') {
    return { ...MOCK_QUOTA };
  }

  const freeQuota = Number(data.freeQuota ?? data.totalFreeQuota ?? 0) || 0;
  const freeQuotaUsed = Number(data.freeQuotaUsed ?? 0) || 0;
  const freeQuotaRemaining = Number(data.freeQuotaRemaining ?? Math.max(0, freeQuota - freeQuotaUsed)) || 0;
  const subscriptionQuota = Number(data.subscription?.quotaThisPeriod ?? data.subscriptionQuota ?? 0) || 0;
  const subscriptionUsed = Number(data.subscription?.usedThisPeriod ?? data.subscriptionUsed ?? 0) || 0;
  const subscriptionRemaining = Number(
    data.subscription?.remaining ?? data.subscriptionRemaining ?? Math.max(0, subscriptionQuota - subscriptionUsed)
  ) || 0;
  const totalRemaining = Number(data.totalRemaining ?? (freeQuotaRemaining + subscriptionRemaining)) || 0;

  return {
    freeQuota: freeQuotaRemaining,
    totalFreeQuota: freeQuota,
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

// ═══════════════════════════════════════════
// API Functions
// ═══════════════════════════════════════════

/**
 * 获取用户配额信息
 */
export async function getQuota() {
  if (USE_MOCK) {
    await delay(300);
    return { ...MOCK_QUOTA };
  }
  const data = await get('/api/v1/users/quota');
  return normalizeQuotaResponse(data);
}

/**
 * 获取订阅套餐列表
 */
export async function getPlans() {
  if (USE_MOCK) {
    await delay(300);
    return { plans: [...MOCK_PLANS], subscriberCount: MOCK_SUBSCRIBER_COUNT };
  }
  return get('/api/v1/subscription/plans');
}

/**
 * 创建订阅订单（调起微信支付）
 */
export async function createOrder(planId, gameId) {
  if (USE_MOCK) {
    await delay(500);
    return { ...MOCK_ORDER };
  }

  let platformQuery = '';
  if (isH5Runtime()) {
    const isWechatBrowser = isWechatBrowserRuntime();
    const query = new URLSearchParams({
      clientPlatform: isWechatBrowser ? 'wechat_h5' : 'h5',
      wechatPayFlow: isWechatBrowser ? 'jsapi' : 'mweb',
    });

    if (typeof window !== 'undefined' && window.location?.href) {
      query.set('returnUrl', window.location.href);
    }

    platformQuery = `?${query.toString()}`;
  }

  return post(
    `/api/v1/subscription/order${platformQuery}`,
    {
      planId,
      ...(gameId ? { gameId } : {}),
    }
  );
}

/**
 * 查询订阅状态
 */
export async function getSubscriptionStatus() {
  if (USE_MOCK) {
    await delay(200);
    return { ...MOCK_SUBSCRIPTION_STATUS };
  }
  return get('/api/v1/subscription/status');
}

/**
 * 查询订阅订单状态
 */
export async function getOrderStatus(orderId) {
  if (USE_MOCK) {
    await delay(200);
    return {
      ...MOCK_SUBSCRIPTION_STATUS,
      orderId,
      status: 'paid',
      subscriptionActive: true,
    };
  }
  return get(`/api/v1/subscription/orders/${orderId}`);
}

/**
 * 解锁游戏
 */
export async function unlockGame(gameId) {
  if (USE_MOCK) {
    await delay(300);
    return { ...MOCK_UNLOCK };
  }
  return post(`/api/v1/games/${gameId}/unlock`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  getQuota,
  getPlans,
  createOrder,
  getSubscriptionStatus,
  getOrderStatus,
  unlockGame,
};
