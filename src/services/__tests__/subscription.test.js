/* eslint-env jest */
import { get, post } from '../api';
import { createOrder, getQuota } from '../subscription';
import * as runtime from '../../utils/runtime';

jest.mock('../api', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

describe('subscriptionService.createOrder', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    Object.defineProperty(window, 'navigator', {
      value: { userAgent: 'Mozilla/5.0' },
      configurable: true,
    });
    post.mockResolvedValue({
      orderId: 'order-1',
      payment: {
        payUrl: 'https://pay.example.com/cashier?token=abc',
      },
    });
  });

  test('uses alipay_wap for mobile h5 orders', async () => {
    jest.spyOn(runtime, 'isH5Runtime').mockReturnValue(true);
    Object.defineProperty(window, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
      configurable: true,
    });
    window.history.replaceState({}, '', '/#/pages/subscription/index');
    const expectedReturnUrl = encodeURIComponent(window.location.href);

    await createOrder('plan-pro', 'game-1');

    expect(post).toHaveBeenCalledWith(
      `/api/v1/subscription/order?provider=alipay_wap&returnUrl=${expectedReturnUrl}`,
      {
        planId: 'plan-pro',
        gameId: 'game-1',
      }
    );
  });

  test('uses alipay_page for desktop h5 orders', async () => {
    jest.spyOn(runtime, 'isH5Runtime').mockReturnValue(true);
    Object.defineProperty(window, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0 Safari/537.36' },
      configurable: true,
    });
    window.history.replaceState({}, '', '/#/pages/subscription/index');
    const expectedReturnUrl = encodeURIComponent(window.location.href);

    await createOrder('plan-pro');

    expect(post).toHaveBeenCalledWith(
      `/api/v1/subscription/order?provider=alipay_page&returnUrl=${expectedReturnUrl}`,
      {
        planId: 'plan-pro',
      }
    );
  });

  test('rejects non-h5 environments while wechat payment is disabled', async () => {
    jest.spyOn(runtime, 'isH5Runtime').mockReturnValue(false);

    await expect(createOrder('plan-pro', 'game-1')).rejects.toThrow('当前环境暂不支持支付宝支付');
    expect(post).not.toHaveBeenCalled();
  });

  test('normalizes free and subscription quota fields from the quota api', async () => {
    get.mockResolvedValueOnce({
      freeQuota: 5,
      freeQuotaUsed: 1,
      freeQuotaRemaining: 4,
      subscriptionActive: true,
      subscriptionQuota: 30,
      subscriptionUsed: 12,
      subscriptionRemaining: 18,
      totalRemaining: 22,
      planName: '专业月卡',
    });

    const quota = await getQuota();

    expect(quota).toEqual({
      freeQuota: 4,
      totalFreeQuota: 5,
      subscription: {
        active: true,
        planId: null,
        planName: '专业月卡',
        expiresAt: null,
        usedThisPeriod: 12,
        quotaThisPeriod: 30,
        autoRenew: false,
        remaining: 18,
        totalRemaining: 22,
      },
    });
  });

  test('treats freeQuota as remaining when totalFreeQuota is provided by the quota api', async () => {
    get.mockResolvedValueOnce({
      freeQuota: 3,
      totalFreeQuota: 5,
      subscription: {
        active: true,
        planName: '专业月卡',
        usedThisPeriod: 12,
        quotaThisPeriod: 30,
      },
    });

    const quota = await getQuota();

    expect(quota).toEqual({
      freeQuota: 3,
      totalFreeQuota: 5,
      subscription: {
        active: true,
        planId: null,
        planName: '专业月卡',
        expiresAt: null,
        usedThisPeriod: 12,
        quotaThisPeriod: 30,
        autoRenew: false,
        remaining: 18,
        totalRemaining: 21,
      },
    });
  });
});
