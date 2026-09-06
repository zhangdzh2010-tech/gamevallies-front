import { create } from 'zustand';
import * as gameService from '../services/game';
import * as subscriptionService from '../services/subscription';
import { emitGameUnlocked } from '../utils/gameUnlock';
import { getGameCoverUrl } from '../utils/media';
import { getGameOrientation } from '../utils/gameOrientation';
import {
  getPaymentActionFailureMessage,
  launchPaymentAction,
  resolveSubscriptionPaymentAction,
} from '../utils/paymentRuntime';
import { isH5Runtime } from '../utils/runtime';
import { toastError, toastInfo, toastSuccess } from '../utils/feedback';
import { storage } from '../utils/storage';
import {
  DEFAULT_SUBSCRIPTION_PAYMENT_METHOD,
  normalizeSubscriptionPaymentMethod,
} from '../utils/subscriptionPaymentMethods';

const QUOTA_CACHE_TTL = 5 * 60 * 1000;
const POST_PAYMENT_SYNC_ATTEMPTS = 4;
const POST_PAYMENT_SYNC_DELAY_MS = 800;
const PAYMENT_STATUS_POLL_ATTEMPTS = 5;
const PAYMENT_STATUS_POLL_DELAY_MS = 1200;
const PAYMENT_AUDIT_KEY = 'subscription_payment_attempt';
const PAYMENT_AUDIT_TTL = 7 * 24 * 60 * 60 * 1000;
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
  const gameOrientation = getGameOrientation(input, 'portrait');
  const resumePlay = input.resumePlay !== false && Boolean(gameUrl);

  return {
    pendingGameId,
    pendingPlayContext: resumePlay
      ? {
          gameId: pendingGameId,
          gameUrl,
          gameTitle,
          gameCover,
          gameOrientation,
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
  nextGame.orientation = getGameOrientation(nextGame, pendingPlayContext?.gameOrientation || 'portrait');
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
    return '支付未完成，请重试';
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

  return error?.message || '支付失败，请重试';
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
  selectedPaymentMethod: DEFAULT_SUBSCRIPTION_PAYMENT_METHOD,

  _lastFetchTime: 0,

  hydratePaymentAttempt: async () => {
    if (get().paymentAttempt) {
      return get().paymentAttempt;
    }

    const savedAttempt = await storage.getItem(PAYMENT_AUDIT_KEY);
    if (savedAttempt) {
      set({ paymentAttempt: savedAttempt });
      return savedAttempt;
    }

    return null;
  },

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

  setSelectedPaymentMethod: (paymentMethod) => {
    set({ selectedPaymentMethod: normalizeSubscriptionPaymentMethod(paymentMethod) });
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
      pendingPlayContext,
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
      toastError(getPaymentFailureMessage('create_order', error));
      return false;
    }

    const orderId = order?.orderId ? String(order.orderId) : null;
    const paymentAction = resolveSubscriptionPaymentAction(order, {
      runtime: process.env.TARO_ENV,
      returnUrl: isH5Runtime() && typeof window !== 'undefined' ? window.location.href : '',
      isWechatBrowser: isH5Runtime() && typeof navigator !== 'undefined'
        ? /micromessenger/i.test(navigator.userAgent || '')
        : false,
    });

    await get()._setPaymentAttempt({
      status: paymentAction ? 'awaiting_payment' : 'failed',
      stage: paymentAction ? 'request_payment' : 'invalid_payment',
      orderId,
      pendingPlayContext,
      lastError: paymentAction ? null : 'missing_payment_action',
    });

    if (!paymentAction) {
      set({ subscribing: false, subscribingPlanId: null });
      toastError(getPaymentFailureMessage('invalid_payment'));
      return false;
    }

    if (paymentAction.kind === 'h5_redirect') {
      await get()._setPaymentAttempt({
        status: 'redirecting_payment',
        stage: 'redirect_payment',
        orderId,
        pendingPlayContext,
        lastError: null,
      });

      try {
        launchPaymentAction(paymentAction);
      } catch (error) {
        console.error('launchPaymentAction failed:', error);
        set({ subscribing: false, subscribingPlanId: null });
        await get()._setPaymentAttempt({
          status: 'failed',
          stage: 'redirect_payment',
          orderId,
          pendingPlayContext,
          lastError: getErrorMessage(error),
        });
        toastError(error, '无法打开支付宝支付，请稍后重试');
        return false;
      }

      set({
        showPaywall: false,
        pendingGameId: null,
        pendingPlayContext: null,
        subscribing: false,
        subscribingPlanId: null,
      });

      toastInfo('正在打开支付宝，请支付完成后返回');
      return true;
    }

    set({ subscribing: false, subscribingPlanId: null });
    await get()._setPaymentAttempt({
      status: 'failed',
      stage: 'request_payment',
      orderId,
      pendingPlayContext,
      lastError: getPaymentActionFailureMessage(paymentAction),
    });
    toastError(getPaymentActionFailureMessage(paymentAction));
    return false;
  },

  refreshAfterPayment: async () => {
    await get().fetchQuota(true);
  },

  resumePendingPayment: async (options = {}) => {
    const silent = options.silent !== false;
    const paymentAttempt = get().paymentAttempt || (await get().hydratePaymentAttempt());
    if (!paymentAttempt?.orderId || get().subscribing) {
      return false;
    }

    const resumableStatuses = new Set([
      'awaiting_payment',
      'redirecting_payment',
      'verifying_payment',
      'syncing_entitlement',
      'completed_with_warning',
    ]);

    if (!resumableStatuses.has(normalizeOrderStatus(paymentAttempt.status))) {
      return false;
    }

    const orderId = String(paymentAttempt.orderId);
    const pendingGameId = get().pendingGameId || paymentAttempt.gameId || null;
    const pendingPlayContext = get().pendingPlayContext || paymentAttempt.pendingPlayContext || null;
    const confirmation = await get()._waitForPaymentConfirmation(orderId);
    const orderStatus = confirmation.orderStatus;
    const subscriptionConfirmed =
      confirmation.subscriptionActive || isPaidOrder(orderStatus?.status);

    if (isFailedOrder(orderStatus?.status)) {
      await get()._setPaymentAttempt({
        status: 'failed',
        stage: 'verify_payment',
        orderId,
        orderStatus: normalizeOrderStatus(orderStatus?.status),
        pendingPlayContext,
        lastError: getOrderFailureMessage(orderStatus),
      });

      if (!silent) {
        toastError(getOrderFailureMessage(orderStatus));
      }

      return false;
    }

    if (!subscriptionConfirmed) {
      return false;
    }

    try {
      if (pendingGameId) {
        await get()._completePendingUnlockAfterPayment(pendingGameId, pendingPlayContext);
      } else {
        await get().fetchQuota(true);
      }

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
        pendingPlayContext: null,
        lastError: null,
      });

      if (!silent) {
        toastSuccess('订阅成功');
      }

      return true;
    } catch (error) {
      console.error('resumePendingPayment failed:', error);

      await get()._setPaymentAttempt({
        status: 'completed_with_warning',
        stage: 'sync_post_payment',
        orderId,
        orderStatus: normalizeOrderStatus(orderStatus?.status) || 'paid',
        pendingPlayContext,
        lastError: getErrorMessage(error),
      });

      if (!silent) {
        toastError(error, '订阅已生效，请重新进入作品确认权益');
      }

      return true;
    }
  },

  updateAfterCreate: (canPlay, quotaRemaining) => {
    void canPlay;
    void quotaRemaining;
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
