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
    post.mockResolvedValue({
      orderId: 'order-1',
      payment: {
        payUrl: 'https://pay.example.com/cashier?token=abc',
      },
    });
  });

  test('uses jsapi payment flow markers for h5 wechat browser orders', async () => {
    jest.spyOn(runtime, 'isH5Runtime').mockReturnValue(true);
    jest.spyOn(runtime, 'isWechatBrowserRuntime').mockReturnValue(true);
    window.history.replaceState({}, '', '/#/pages/subscription/index');
    const expectedReturnUrl = encodeURIComponent(window.location.href);

    await createOrder('plan-pro', 'game-1');

    expect(post).toHaveBeenCalledWith(
      `/api/v1/subscription/order?clientPlatform=wechat_h5&wechatPayFlow=jsapi&returnUrl=${expectedReturnUrl}`,
      {
        planId: 'plan-pro',
        gameId: 'game-1',
      }
    );
  });

  test('uses mweb payment flow markers for h5 browser orders outside wechat', async () => {
    jest.spyOn(runtime, 'isH5Runtime').mockReturnValue(true);
    jest.spyOn(runtime, 'isWechatBrowserRuntime').mockReturnValue(false);
    window.history.replaceState({}, '', '/#/pages/subscription/index');
    const expectedReturnUrl = encodeURIComponent(window.location.href);

    await createOrder('plan-pro');

    expect(post).toHaveBeenCalledWith(
      `/api/v1/subscription/order?clientPlatform=h5&wechatPayFlow=mweb&returnUrl=${expectedReturnUrl}`,
      {
        planId: 'plan-pro',
      }
    );
  });

  test('keeps weapp orders on the plain order endpoint', async () => {
    jest.spyOn(runtime, 'isH5Runtime').mockReturnValue(false);
    jest.spyOn(runtime, 'isWechatBrowserRuntime').mockReturnValue(false);

    await createOrder('plan-pro', 'game-1');

    expect(post).toHaveBeenCalledWith('/api/v1/subscription/order', {
      planId: 'plan-pro',
      gameId: 'game-1',
    });
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
});
