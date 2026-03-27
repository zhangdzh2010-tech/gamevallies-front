import { create } from 'zustand';
import Taro from '@tarojs/taro';
import * as gameService from '../services/game';
import * as subscriptionService from '../services/subscription';
import { emitGameUnlocked } from '../utils/gameUnlock';
import { getGameCoverUrl } from '../utils/media';
import { storage } from '../utils/storage';

const QUOTA_CACHE_TTL = 5 * 60 * 1000;
const POST_PAYMENT_SYNC_ATTEMPTS = 4;
const POST_PAYMENT_SYNC_DELAY_MS = 800;
const PAYMENT_STATUS_POLL_ATTEMPTS = 5;
const PAYMENT_STATUS_POLL_DELAY_MS = 1200;
const PAYMENT_AUDIT_KEY = 'subscription_payment_attempt';
const PAYMENT_AUDIT_TTL = 7 * 24 * 60 * 60 * 1000;
const REQUIRED_PAYMENT_FIELDS = ['timeStamp', 'nonceStr', 'package', 'signType', 'paySign'];
const PAID_ORDER_STATUSES = new Set(['paid']);
const FAILED_ORDER_STATUSES = new Set(['canceled', 'cancelled', 'failed', 'refunded']);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePaywallContext(input) {
  if (!input || typeof input !== 'object') {
    return {
      pendingGameId: input ? String(input) : null,
      pendingPlayContext: null,
    };
  }

  const rawGameId = input.gameId || input.id || null;
  const pendingGameId = rawGameId ? String(rawGameId) : null;
  const gameUrl = input.gameUrl || input.url || '';
  const gameTitle = input.gameTitle || input.title || '';
  const gameCover = getGameCoverUrl(input, input.gameCover || input.cover || '');
  const resumePlay = input.resumePlay !== false && Boolean(gameUrl);

  return {
    pendingGameId,
    pendingPlayContext: resumePlay
      ? {
          gameId: pendingGameId,
          gameUrl,
          gameTitle,
          gameCover,
        }
      : null,
  };
}

function buildUnlockedGame(game, unlockResult, gameId, pendingPlayContext) {
  const nextGame = {
    ...(game || {}),
  };

  nextGame.id = nextGame.id || gameId || pendingPlayContext?.gameId || '';
  nextGame.title = nextGame.title || pendingPlayContext?.gameTitle || '';
  nextGame.gameUrl = nextGame.gameUrl || pendingPlayContext?.gameUrl || '';
  nextGame.coverUrl = getGameCoverUrl(nextGame, pendingPlayContext?.gameCover || '');
  nextGame.thumbnailUrl = getGameCoverUrl({ thumbnailUrl: nextGame.thumbnailUrl }, nextGame.coverUrl);
  nextGame.canPlay = unlockResult?.canPlay !== false;
  nextGame.requireSubscription = false;
  nextGame.quotaRemaining = unlockResult?.quotaRemaining ?? nextGame.quotaRemaining ?? null;

  return nextGame;
}

function getErrorMessage(error) {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  return error.message || error.errMsg || '';
}

function isPaymentCanceled(error) {
  const text = getErrorMessage(error);
  if (!text) {
    return false;
  }

  return text.toLowerCase().includes('cancel') || text.includes('取消');
}

function normalizeOrderStatus(status) {
  if (!status) {
    return '';
  }

  return String(status).trim().toLowerCase();
}

function isPaidOrder(status) {
  return PAID_ORDER_STATUSES.has(normalizeOrderStatus(status));
}

function isFailedOrder(status) {
  return FAILED_ORDER_STATUSES.has(normalizeOrderStatus(status));
}

function getOrderFailureMessage(orderStatus) {
  const status = normalizeOrderStatus(orderStatus?.status);

  if (status === 'canceled' || status === 'cancelled') {
    return '支付已取消';
  }

  if (status === 'failed') {
    return '微信支付未完成，请重试';
  }

  if (status === 'refunded') {
    return '支付已退款，请联系客服';
  }

  return '';
}

function getPaymentFailureMessage(stage, error, orderStatus = null) {
  if (stage === 'create_order') {
    return error?.message || '创建支付订单失败，请稍后重试';
  }

  if (stage === 'invalid_payment') {
    return '支付参数异常，请稍后重试';
  }

  const orderFailureMessage = getOrderFailureMessage(orderStatus);
  if (orderFailureMessage) {
    return orderFailureMessage;
  }

  if (stage === 'verify_payment') {
    return '支付结果确认中，请稍后在订阅页查看';
  }

  return error?.message || '微信支付失败，请重试';
}

function getPaymentPayload(order) {
  const payment = order?.payment;
  if (!payment || typeof payment !== 'object') {
    return null;
  }

  const missingField = REQUIRED_PAYMENT_FIELDS.find((field) => !payment[field]);
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

async function persistPaymentAttempt(attempt) {
  try {
    await storage.setItem(PAYMENT_AUDIT_KEY, attempt, { ttl: PAYMENT_AUDIT_TTL });
  } catch (error) {
    console.warn('persistPaymentAttempt failed:', error);
  }
}

const useQuotaStore = create((set, get) => ({
  freeQuota: 0,
  totalFreeQuota: 0,
  subscription: {
    active: false,
    planId: null,
    planName: null,
    expiresAt: null,
    usedThisPeriod: 0,
    quotaThisPeriod: 0,
  },
  plans: [],
  subscriberCount: 0,

  loading: false,
  showPaywall: false,
  pendingGameId: null,
  pendingPlayContext: null,
  subscribing: false,
  subscribingPlanId: null,
  paymentAttempt: null,

  _lastFetchTime: 0,

  fetchQuota: async (force = false) => {
    const { _lastFetchTime } = get();
    if (!force && Date.now() - _lastFetchTime < QUOTA_CACHE_TTL) {
      return {
        freeQuota: get().freeQuota,
        totalFreeQuota: get().totalFreeQuota,
        subscription: get().subscription,
      };
    }

    set({ loading: true });
    try {
      const data = await subscriptionService.getQuota();
      set({
        freeQuota: data.freeQuota ?? 0,
        totalFreeQuota: data.totalFreeQuota ?? 0,
        subscription: data.subscription || get().subscription,
        loading: false,
        _lastFetchTime: Date.now(),
      });
      return data;
    } catch (error) {
      console.error('fetchQuota failed:', error);
      set({ loading: false });
      return null;
    }
  },

  fetchPlans: async () => {
    if (get().plans.length > 0) return;

    try {
      const data = await subscriptionService.getPlans();
      set({
        plans: data.plans || [],
        subscriberCount: data.subscriberCount || 0,
      });
    } catch (error) {
      console.error('fetchPlans failed:', error);
    }
  },

  openPaywall: (context) => {
    const normalizedContext = normalizePaywallContext(context);
    set({
      showPaywall: true,
      pendingGameId: normalizedContext.pendingGameId,
      pendingPlayContext: normalizedContext.pendingPlayContext,
    });
    get().fetchPlans();
  },

  closePaywall: (options = {}) => {
    if (get().subscribing && !options?.force) {
      return false;
    }

    set({
      showPaywall: false,
      pendingGameId: null,
      pendingPlayContext: null,
      subscribing: false,
      subscribingPlanId: null,
    });

    return true;
  },

  _setPaymentAttempt: async (patch) => {
    const nextAttempt = {
      ...(get().paymentAttempt || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    set({ paymentAttempt: nextAttempt });
    await persistPaymentAttempt(nextAttempt);
    return nextAttempt;
  },

  _waitForPaymentConfirmation: async (orderId) => {
    let latestQuota = null;
    let latestOrderStatus = null;
    let canQueryOrderStatus = Boolean(orderId && typeof subscriptionService.getOrderStatus === 'function');

    for (let attempt = 0; attempt < PAYMENT_STATUS_POLL_ATTEMPTS; attempt += 1) {
      latestQuota = await get().fetchQuota(true);
      const subscriptionActive = Boolean(latestQuota?.subscription?.active ?? get().subscription?.active);

      if (canQueryOrderStatus) {
        try {
          const nextOrderStatus = await subscriptionService.getOrderStatus(orderId);
          if (nextOrderStatus) {
            latestOrderStatus = nextOrderStatus;
          }
        } catch (error) {
          console.warn('getOrderStatus failed:', error);
          canQueryOrderStatus = false;
        }
      }

      if (
        subscriptionActive ||
        isPaidOrder(latestOrderStatus?.status) ||
        isFailedOrder(latestOrderStatus?.status)
      ) {
        return {
          quota: latestQuota,
          orderStatus: latestOrderStatus,
          subscriptionActive: subscriptionActive || isPaidOrder(latestOrderStatus?.status),
        };
      }

      if (attempt < PAYMENT_STATUS_POLL_ATTEMPTS - 1) {
        await delay(PAYMENT_STATUS_POLL_DELAY_MS * (attempt + 1));
      }
    }

    return {
      quota: latestQuota,
      orderStatus: latestOrderStatus,
      subscriptionActive:
        Boolean(latestQuota?.subscription?.active ?? get().subscription?.active) ||
        isPaidOrder(latestOrderStatus?.status),
    };
  },

  _completePendingUnlockAfterPayment: async (gameId, pendingPlayContext = null) => {
    let lastError = null;

    for (let attempt = 0; attempt < POST_PAYMENT_SYNC_ATTEMPTS; attempt += 1) {
      await get().fetchQuota(true);

      try {
        const unlockResult = await subscriptionService.unlockGame(gameId);
        if (unlockResult?.canPlay === false) {
          throw new Error('订阅已生效，但当前作品试玩权限尚未打开');
        }

        const unlockedGame = await gameService.getGame(gameId).catch(() => null);
        const mergedGame = buildUnlockedGame(unlockedGame, unlockResult, gameId, pendingPlayContext);

        emitGameUnlocked({
          gameId,
          game: mergedGame,
          quotaRemaining: mergedGame.quotaRemaining,
          resumePlay: Boolean(pendingPlayContext?.gameUrl),
          playContext: pendingPlayContext,
        });

        return mergedGame;
      } catch (error) {
        lastError = error;
      }

      const unlockedGame = await gameService.getGame(gameId).catch(() => null);
      if (unlockedGame?.canPlay !== false) {
        const mergedGame = buildUnlockedGame(unlockedGame, null, gameId, pendingPlayContext);

        emitGameUnlocked({
          gameId,
          game: mergedGame,
          quotaRemaining: mergedGame.quotaRemaining,
          resumePlay: Boolean(pendingPlayContext?.gameUrl),
          playContext: pendingPlayContext,
        });

        return mergedGame;
      }

      if (attempt < POST_PAYMENT_SYNC_ATTEMPTS - 1) {
        await delay(POST_PAYMENT_SYNC_DELAY_MS * (attempt + 1));
      }
    }

    throw lastError || new Error('订阅已生效，但试玩权限仍在同步中，请稍后重试');
  },

  subscribe: async (planId) => {
    const { pendingGameId, pendingPlayContext } = get();
    const normalizedPlanId = planId || null;

    set({ subscribing: true, subscribingPlanId: normalizedPlanId });
    await get()._setPaymentAttempt({
      status: 'creating_order',
      stage: 'create_order',
      planId: normalizedPlanId,
      gameId: pendingGameId,
      orderId: null,
      orderStatus: null,
      lastError: null,
    });

    let order = null;
    try {
      order = await subscriptionService.createOrder(planId, pendingGameId);
    } catch (error) {
      console.error('create subscription order failed:', error);
      set({ subscribing: false, subscribingPlanId: null });
      await get()._setPaymentAttempt({
        status: 'failed',
        stage: 'create_order',
        lastError: getErrorMessage(error),
      });
      Taro.showToast({ title: getPaymentFailureMessage('create_order', error), icon: 'none' });
      return false;
    }

    const orderId = order?.orderId ? String(order.orderId) : null;
    const paymentPayload = getPaymentPayload(order);

    await get()._setPaymentAttempt({
      status: paymentPayload ? 'awaiting_payment' : 'failed',
      stage: paymentPayload ? 'request_payment' : 'invalid_payment',
      orderId,
      lastError: paymentPayload ? null : 'missing_payment_payload',
    });

    if (!paymentPayload) {
      set({ subscribing: false, subscribingPlanId: null });
      Taro.showToast({ title: getPaymentFailureMessage('invalid_payment'), icon: 'none' });
      return false;
    }

    let paymentError = null;

    try {
      await Taro.requestPayment(paymentPayload);
    } catch (error) {
      if (isPaymentCanceled(error)) {
        set({ subscribing: false, subscribingPlanId: null });
        await get()._setPaymentAttempt({
          status: 'cancelled',
          stage: 'request_payment',
          orderId,
          lastError: getErrorMessage(error),
        });
        return false;
      }

      paymentError = error;
      console.error('requestPayment failed:', error);
    }

    await get()._setPaymentAttempt({
      status: 'verifying_payment',
      stage: 'verify_payment',
      orderId,
      lastError: paymentError ? getErrorMessage(paymentError) : null,
    });

    const confirmation = await get()._waitForPaymentConfirmation(orderId);
    const orderStatus = confirmation.orderStatus;
    const subscriptionConfirmed =
      confirmation.subscriptionActive || isPaidOrder(orderStatus?.status);

    await get()._setPaymentAttempt({
      status: subscriptionConfirmed ? 'syncing_entitlement' : 'verifying_payment',
      stage: subscriptionConfirmed ? (pendingGameId ? 'unlock_game' : 'refresh_quota') : 'verify_payment',
      orderId,
      orderStatus: normalizeOrderStatus(orderStatus?.status) || null,
      lastError: paymentError ? getErrorMessage(paymentError) : null,
    });

    if (isFailedOrder(orderStatus?.status)) {
      set({ subscribing: false, subscribingPlanId: null });
      await get()._setPaymentAttempt({
        status: 'failed',
        stage: 'verify_payment',
        orderId,
        orderStatus: normalizeOrderStatus(orderStatus?.status),
        lastError: getOrderFailureMessage(orderStatus) || getErrorMessage(paymentError),
      });
      Taro.showToast({ title: getOrderFailureMessage(orderStatus), icon: 'none' });
      return false;
    }

    if (paymentError && !subscriptionConfirmed) {
      set({ subscribing: false, subscribingPlanId: null });
      await get()._setPaymentAttempt({
        status: 'failed',
        stage: 'request_payment',
        orderId,
        orderStatus: normalizeOrderStatus(orderStatus?.status) || null,
        lastError: getErrorMessage(paymentError),
      });
      Taro.showToast({
        title: getPaymentFailureMessage('request_payment', paymentError, orderStatus),
        icon: 'none',
      });
      return false;
    }

    try {
      if (pendingGameId) {
        await get()._completePendingUnlockAfterPayment(pendingGameId, pendingPlayContext);
      } else {
        const latestQuota = await get().fetchQuota(true);
        const hasActiveSubscription = Boolean(
          latestQuota?.subscription?.active ?? get().subscription?.active
        );

        if (!hasActiveSubscription && !subscriptionConfirmed) {
          throw new Error('支付结果确认中，请稍后在订阅页查看');
        }
      }

      await get().fetchQuota(true);

      set({
        showPaywall: false,
        pendingGameId: null,
        pendingPlayContext: null,
        subscribing: false,
        subscribingPlanId: null,
      });

      await get()._setPaymentAttempt({
        status: 'completed',
        stage: 'done',
        orderId,
        orderStatus: normalizeOrderStatus(orderStatus?.status) || 'paid',
        lastError: null,
      });

      Taro.showToast({ title: '订阅成功', icon: 'success' });
      return true;
    } catch (error) {
      console.error('post-payment sync failed:', error);

      const latestConfirmation = await get()._waitForPaymentConfirmation(orderId);
      const latestOrderStatus = latestConfirmation.orderStatus || orderStatus;
      const entitlementConfirmed =
        latestConfirmation.subscriptionActive || isPaidOrder(latestOrderStatus?.status);

      set({
        subscribing: false,
        subscribingPlanId: null,
        ...(entitlementConfirmed
          ? {
              showPaywall: false,
              pendingGameId: null,
              pendingPlayContext: null,
            }
          : {}),
      });

      await get()._setPaymentAttempt({
        status: entitlementConfirmed ? 'completed_with_warning' : 'failed',
        stage: 'sync_post_payment',
        orderId,
        orderStatus: normalizeOrderStatus(latestOrderStatus?.status) || null,
        lastError: getErrorMessage(error),
      });

      Taro.showToast({
        title: entitlementConfirmed
          ? error?.message || '订阅已生效，请重新进入作品试玩'
          : '支付结果确认中，请稍后在订阅页查看',
        icon: 'none',
      });

      return entitlementConfirmed;
    }
  },

  refreshAfterPayment: async () => {
    await get().fetchQuota(true);
  },

  updateAfterCreate: (canPlay, quotaRemaining) => {
    void canPlay;
    set((prev) => ({
      freeQuota: Math.max(0, quotaRemaining ?? prev.freeQuota - 1),
    }));
  },

  reset: () => {
    void storage.removeItem(PAYMENT_AUDIT_KEY);
    set({
      freeQuota: 0,
      totalFreeQuota: 0,
      subscription: {
        active: false,
        planId: null,
        planName: null,
        expiresAt: null,
        usedThisPeriod: 0,
        quotaThisPeriod: 0,
      },
      plans: [],
      subscriberCount: 0,
      loading: false,
      showPaywall: false,
      pendingGameId: null,
      pendingPlayContext: null,
      subscribing: false,
      subscribingPlanId: null,
      paymentAttempt: null,
      _lastFetchTime: 0,
    });
  },
}));

export default useQuotaStore;
