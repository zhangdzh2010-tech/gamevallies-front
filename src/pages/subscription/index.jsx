import { useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import useQuotaStore from '../../stores/quotaStore';
import { Storage } from '../../utils/storage';
import Taro from '@tarojs/taro';
import './index.scss';

export default function SubscriptionPage() {
  const freeQuota = useQuotaStore((s) => s.freeQuota);
  const totalFreeQuota = useQuotaStore((s) => s.totalFreeQuota);
  const subscription = useQuotaStore((s) => s.subscription);
  const plans = useQuotaStore((s) => s.plans);
  const subscriberCount = useQuotaStore((s) => s.subscriberCount);
  const fetchQuota = useQuotaStore((s) => s.fetchQuota);
  const fetchPlans = useQuotaStore((s) => s.fetchPlans);
  const closePaywall = useQuotaStore((s) => s.closePaywall);
  const subscribe = useQuotaStore((s) => s.subscribe);
  const subscribing = useQuotaStore((s) => s.subscribing);
  const subscribingPlanId = useQuotaStore((s) => s.subscribingPlanId);

  const usedQuota = totalFreeQuota - freeQuota;
  const usedPercent = totalFreeQuota > 0 ? Math.round((usedQuota / totalFreeQuota) * 100) : 0;

  useEffect(() => {
    closePaywall();

    if (!Storage.getToken()) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 500);
      return;
    }

    fetchQuota(true);
    fetchPlans();
  }, [closePaywall, fetchPlans, fetchQuota]);

  const handleSubscribeClick = async (planId) => {
    if (subscribing) return;
    await subscribe(planId);
  };

  const formatCount = (num) => {
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(num);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <View className="subscription-container">
      <AppTopBar showBack />

      <ScrollView scrollY className="subscription-scroll">
        <View className="quota-card">
          <Text className="quota-card-title">免费创作额度</Text>
          <View className="quota-progress-wrap">
            <View className="quota-progress-bg">
              <View className="quota-progress-fill" style={{ width: `${usedPercent}%` }} />
            </View>
            <Text className="quota-progress-text">已用 {usedQuota} / {totalFreeQuota} 次</Text>
          </View>
          <View className="quota-remaining">
            <Text className="quota-remaining-num">{freeQuota}</Text>
            <Text className="quota-remaining-label">次剩余</Text>
          </View>
        </View>

        {subscription.active && (
          <View className="sub-status-card">
            <Text className="sub-status-title">当前订阅</Text>
            <View className="sub-status-info">
              <View className="sub-info-row">
                <Text className="sub-info-label">套餐</Text>
                <Text className="sub-info-value">{subscription.planName || '--'}</Text>
              </View>
              <View className="sub-info-row">
                <Text className="sub-info-label">有效期至</Text>
                <Text className="sub-info-value">{formatDate(subscription.expiresAt)}</Text>
              </View>
              <View className="sub-info-row">
                <Text className="sub-info-label">本期已用</Text>
                <Text className="sub-info-value">
                  {subscription.usedThisPeriod} / {subscription.quotaThisPeriod} 次
                </Text>
              </View>
            </View>
          </View>
        )}

        <View className="plans-section">
          <Text className="plans-section-title">订阅套餐</Text>
          <View className="plans-list">
            {plans.map((plan) => (
              <View
                key={plan.id}
                className={`plan-card ${plan.recommended ? 'recommended' : ''}`}
              >
                {plan.badge ? (
                  <View className="plan-card-badge">
                    <Text>{plan.badge}</Text>
                  </View>
                ) : null}

                <View className="plan-card-header">
                  <Text className="plan-card-name">{plan.name}</Text>
                  <View className="plan-card-price">
                    <Text className="plan-card-currency">¥</Text>
                    <Text className="plan-card-amount">{plan.priceDisplay}</Text>
                    <Text className="plan-card-period">/{plan.periodLabel}</Text>
                  </View>
                </View>

                <Text className="plan-card-quota">{plan.quotaLabel}</Text>

                <View className="plan-card-features">
                  {(plan.features || []).map((feature, index) => (
                    <View key={index} className="plan-card-feature">
                      <Text className="feature-dot">✓</Text>
                      <Text className="feature-text">{feature}</Text>
                    </View>
                  ))}
                </View>

                <View
                  className={`plan-card-subscribe-btn ${
                    subscribing && subscribingPlanId === plan.id ? 'subscribing' : ''
                  } ${
                    subscribing && subscribingPlanId !== plan.id ? 'disabled' : ''
                  }`}
                  onClick={() => handleSubscribeClick(plan.id)}
                >
                  <Text>
                    {subscribing && subscribingPlanId === plan.id ? '处理中...' : '立即订阅'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {subscriberCount > 0 && (
          <View className="subscriber-bar">
            <Text>已有 {formatCount(subscriberCount)} 人订阅</Text>
          </View>
        )}

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={4} />
    </View>
  );
}
