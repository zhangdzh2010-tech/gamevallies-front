/* eslint-env jest */
const { getQuotaSummary } = require('../quotaSummary');

describe('getQuotaSummary', () => {
  test('combines free and subscription quota into one summary', () => {
    expect(getQuotaSummary({
      freeQuota: 76,
      totalFreeQuota: 99,
      subscription: {
        usedThisPeriod: 4,
        quotaThisPeriod: 30,
        remaining: 26,
        totalRemaining: 102,
      },
    })).toEqual({
      freeRemaining: 76,
      freeTotal: 99,
      freeUsed: 23,
      subscriptionUsed: 4,
      subscriptionQuota: 30,
      subscriptionRemaining: 26,
      totalRemaining: 102,
      totalUsed: 27,
      totalQuota: 129,
      usagePercent: 21,
    });
  });

  test('falls back to free quota only when there is no subscription quota', () => {
    expect(getQuotaSummary({
      freeQuota: 4,
      totalFreeQuota: 5,
      subscription: {
        usedThisPeriod: 0,
        quotaThisPeriod: 0,
      },
    })).toEqual({
      freeRemaining: 4,
      freeTotal: 5,
      freeUsed: 1,
      subscriptionUsed: 0,
      subscriptionQuota: 0,
      subscriptionRemaining: 0,
      totalRemaining: 4,
      totalUsed: 1,
      totalQuota: 5,
      usagePercent: 20,
    });
  });
});
