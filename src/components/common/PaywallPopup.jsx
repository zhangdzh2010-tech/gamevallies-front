/* eslint-disable react/prop-types */
import { View, Text, ScrollView } from '@tarojs/components';
import useQuotaStore from '../../stores/quotaStore';
import './PaywallPopup.scss';

export function PaywallPopup() {
  const showPaywall = useQuotaStore((s) => s.showPaywall);
  const plans = useQuotaStore((s) => s.plans);
  const subscriberCount = useQuotaStore((s) => s.subscriberCount);
  const subscribing = useQuotaStore((s) => s.subscribing);
  const subscribingPlanId = useQuotaStore((s) => s.subscribingPlanId);
  const closePaywall = useQuotaStore((s) => s.closePaywall);
  const subscribe = useQuotaStore((s) => s.subscribe);

  if (!showPaywall) return null;

  const handleSubscribe = async (planId) => {
    if (subscribing) return;
    await subscribe(planId);
  };

  const formatCount = (num) => {
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(num);
  };

  return (
    <View className="paywall-overlay" onClick={closePaywall}>
      <View className="paywall-panel" onClick={(e) => e.stopPropagation()}>
        <View className="paywall-header">
          <View className="paywall-close" onClick={closePaywall}>
            <Text className="paywall-close-text">x</Text>
          </View>
          <Text className="paywall-icon">订阅</Text>
          <Text className="paywall-title">解锁无限创作</Text>
          <Text className="paywall-subtitle">
            免费额度用完后，订阅即可继续创作、优化并试玩你的作品。
          </Text>
        </View>

        <ScrollView scrollY className="paywall-plans-scroll">
          <View className="paywall-plans">
            {plans.map((plan) => (
              <View
                key={plan.id}
                className={`paywall-plan-card ${plan.recommended ? 'recommended' : ''}`}
              >
                {plan.badge ? (
                  <View className="plan-badge">
                    <Text>{plan.badge}</Text>
                  </View>
                ) : null}

                <View className="plan-top">
                  <Text className="plan-name">{plan.name}</Text>
                  <View className="plan-price-row">
                    <Text className="plan-currency">¥</Text>
                    <Text className="plan-price">{plan.priceDisplay}</Text>
                    <Text className="plan-period">/{plan.periodLabel}</Text>
                  </View>
                </View>

                <View className="plan-quota">
                  <Text className="plan-quota-text">{plan.quotaLabel}</Text>
                </View>

                <View className="plan-features">
                  {(plan.features || []).map((feature, index) => (
                    <View key={index} className="plan-feature">
                      <Text className="plan-feature-check">✓</Text>
                      <Text className="plan-feature-text">{feature}</Text>
                    </View>
                  ))}
                </View>

                <View
                  className={`plan-subscribe-btn ${plan.recommended ? 'btn-primary' : 'btn-secondary'} ${
                    subscribing && subscribingPlanId === plan.id ? 'loading' : ''
                  } ${
                    subscribing && subscribingPlanId !== plan.id ? 'disabled' : ''
                  }`}
                  onClick={() => handleSubscribe(plan.id)}
                >
                  <Text>
                    {subscribing && subscribingPlanId === plan.id ? '处理中...' : '立即订阅'}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View className="paywall-footer-hint">
            <Text className="subscriber-count">已有 {formatCount(subscriberCount)} 人订阅</Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
