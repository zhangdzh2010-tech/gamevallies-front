import { create } from 'zustand';
import Taro from '@tarojs/taro';
import * as subscriptionService from '../services/subscription';

const QUOTA_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

const useQuotaStore = create((set, get) => ({
  // ── 数据 ──
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

  // ── UI 状态 ──
  loading: false,
  showPaywall: false,
  pendingGameId: null,
  subscribing: false,
  subscribingPlanId: null,

  // ── 缓存时间戳 ──
  _lastFetchTime: 0,

  // ── Actions ──

  fetchQuota: async (force = false) => {
    const { _lastFetchTime } = get();
    if (!force && Date.now() - _lastFetchTime < QUOTA_CACHE_TTL) return;

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
    } catch (e) {
      console.error('fetchQuota failed:', e);
      set({ loading: false });
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
    } catch (e) {
      console.error('fetchPlans failed:', e);
    }
  },

  openPaywall: (gameId) => {
    set({ showPaywall: true, pendingGameId: gameId || null });
    get().fetchPlans();
  },

  closePaywall: () => {
    set({
      showPaywall: false,
      pendingGameId: null,
      subscribing: false,
      subscribingPlanId: null,
    });
  },

  subscribe: async (planId) => {
    set({ subscribing: true, subscribingPlanId: planId || null });
    try {
      const order = await subscriptionService.createOrder(planId, get().pendingGameId);

      // 调起微信支付
      await Taro.requestPayment({
        timeStamp: order.payment.timeStamp,
        nonceStr: order.payment.nonceStr,
        package: order.payment.package,
        signType: order.payment.signType,
        paySign: order.payment.paySign,
      });

      // 支付成功
      Taro.showToast({ title: '订阅成功！', icon: 'success' });

      // 解锁待解锁的游戏
      const { pendingGameId } = get();
      if (pendingGameId) {
        try {
          await subscriptionService.unlockGame(pendingGameId);
        } catch (e) {
          console.warn('unlockGame failed:', e);
        }
      }

      // 刷新配额
      await get().fetchQuota(true);

      set({
        showPaywall: false,
        pendingGameId: null,
        subscribing: false,
        subscribingPlanId: null,
      });
      return true;
    } catch (e) {
      console.error('subscribe failed:', e);
      set({ subscribing: false, subscribingPlanId: null });
      // 用户取消支付不弹提示
      if (e.errMsg && e.errMsg.includes('cancel')) {
        return false;
      }
      Taro.showToast({ title: '支付失败，请重试', icon: 'none' });
      return false;
    }
  },

  refreshAfterPayment: async () => {
    await get().fetchQuota(true);
  },

  updateAfterCreate: (canPlay, quotaRemaining) => {
    set((prev) => ({
      freeQuota: Math.max(0, quotaRemaining ?? prev.freeQuota - 1),
    }));
  },

  reset: () => {
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
      subscribing: false,
      subscribingPlanId: null,
      _lastFetchTime: 0,
    });
  },
}));

export default useQuotaStore;
