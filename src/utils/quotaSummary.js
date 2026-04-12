function toSafeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function getQuotaSummary({ freeQuota = 0, totalFreeQuota = 0, subscription = {} } = {}) {
  const freeRemaining = Math.max(0, toSafeNumber(freeQuota));
  const freeTotal = Math.max(0, toSafeNumber(totalFreeQuota));
  const freeUsed = Math.max(0, freeTotal - freeRemaining);

  const subscriptionUsed = Math.max(0, toSafeNumber(subscription?.usedThisPeriod));
  const subscriptionQuota = Math.max(0, toSafeNumber(subscription?.quotaThisPeriod));
  const subscriptionRemaining = Math.max(
    0,
    toSafeNumber(
      subscription?.remaining !== undefined && subscription?.remaining !== null
        ? subscription.remaining
        : Math.max(0, subscriptionQuota - subscriptionUsed),
    ),
  );

  const totalRemaining = Math.max(
    0,
    toSafeNumber(
      subscription?.totalRemaining !== undefined && subscription?.totalRemaining !== null
        ? subscription.totalRemaining
        : freeRemaining + subscriptionRemaining,
    ),
  );

  const totalUsed = Math.max(0, freeUsed + subscriptionUsed);
  const inferredTotal = totalRemaining + totalUsed;
  const fallbackTotal = freeTotal + subscriptionQuota;
  const totalQuota = Math.max(inferredTotal, fallbackTotal, totalUsed, totalRemaining);
  const usagePercent = totalQuota > 0
    ? Math.max(0, Math.min(100, Math.round((totalUsed / totalQuota) * 100)))
    : 0;

  return {
    freeRemaining,
    freeTotal,
    freeUsed,
    subscriptionUsed,
    subscriptionQuota,
    subscriptionRemaining,
    totalRemaining,
    totalUsed,
    totalQuota,
    usagePercent,
  };
}

export default getQuotaSummary;
