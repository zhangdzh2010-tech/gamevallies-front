/* eslint-disable react/prop-types */
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import useQuotaStore from '../../stores/quotaStore';
import { isH5Runtime } from '../../utils/runtime';
import {
  getSubscriptionPaymentOption,
  isSubscriptionPaymentMethodAvailable,
  SUBSCRIPTION_PAYMENT_OPTIONS,
} from '../../utils/subscriptionPaymentMethods';
import './PaywallPopup.scss';

export function PaywallPopup() {
  const isH5 = isH5Runtime();
  const showPaywall = useQuotaStore((s) => s.showPaywall);
  const plans = useQuotaStore((s) => s.plans);
  const subscriberCount = useQuotaStore((s) => s.subscriberCount);
  const subscribing = useQuotaStore((s) => s.subscribing);
  const subscribingPlanId = useQuotaStore((s) => s.subscribingPlanId);
  const closePaywall = useQuotaStore((s) => s.closePaywall);
  const subscribe = useQuotaStore((s) => s.subscribe);
  const selectedPaymentMethod = useQuotaStore((s) => s.selectedPaymentMethod);
  const setSelectedPaymentMethod = useQuotaStore((s) => s.setSelectedPaymentMethod);

  if (!showPaywall) return null;

  const selectedPaymentOption = getSubscriptionPaymentOption(selectedPaymentMethod);
  const selectedPaymentAvailable = isSubscriptionPaymentMethodAvailable(selectedPaymentMethod);

  const handleClose = () => {
    if (subscribing) return;
    closePaywall();
  };

  const handleSubscribe = async (planId) => {
    if (subscribing) return;

    if (!selectedPaymentAvailable) {
      Taro.showToast({ title: `${selectedPaymentOption.label}暂不可用`, icon: 'none' });
      return;
    }

    await subscribe(planId);
  };

  const formatCount = (num) => {
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(num);
  };

  const selectedPaymentNote = selectedPaymentAvailable
    ? '将跳转到支付宝收银台完成支付，付款后自动返回。'
    : `${selectedPaymentOption.label}暂不可用，请切换为支付宝继续。`;

  const getButtonLabel = (planId) => {
    if (subscribing && subscribingPlanId === planId) {
      return selectedPaymentOption.loadingLabel;
    }

    return selectedPaymentOption.actionLabel;
  };

  const plansContent = (
    <>
      <View className="paywall-payment-methods">
        <View className="paywall-payment-methods__head">
          <Text className="paywall-payment-methods__eyebrow">Payment Method</Text>
          <Text className="paywall-payment-methods__title">先选支付方式，再挑套餐</Text>
        </View>

        <View className="paywall-payment-methods__list">
          {SUBSCRIPTION_PAYMENT_OPTIONS.map((option) => {
            const selected = selectedPaymentMethod === option.id;

            return (
              <View
                key={option.id}
                className={`paywall-payment-option ${selected ? 'is-selected' : ''} ${option.available ? 'is-live' : 'is-soon'}`}
                onClick={() => setSelectedPaymentMethod(option.id)}
              >
                <View className={`paywall-payment-option__icon paywall-payment-option__icon--${option.id}`}>
                  <Text>{option.iconText}</Text>
                </View>

                <View className="paywall-payment-option__copy">
                  <View className="paywall-payment-option__top">
                    <Text className="paywall-payment-option__label">{option.label}</Text>
                    <Text className={`paywall-payment-option__status ${option.available ? 'is-live' : 'is-soon'}`}>
                      {option.statusLabel}
                    </Text>
                  </View>
                  <Text className="paywall-payment-option__desc">{option.description}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text className="paywall-payment-methods__note">{selectedPaymentNote}</Text>
      </View>

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

            <Text className="plan-payment-hint">
              {selectedPaymentAvailable
                ? `使用${selectedPaymentOption.label}完成支付`
                : '请切换可用支付方式'}
            </Text>

            <View
              className={`plan-subscribe-btn ${plan.recommended ? 'btn-primary' : 'btn-secondary'} ${
                subscribing && subscribingPlanId === plan.id ? 'loading' : ''
              } ${
                subscribing && subscribingPlanId !== plan.id ? 'disabled' : ''
              } ${
                !selectedPaymentAvailable ? 'coming-soon' : ''
              }`}
              onClick={() => handleSubscribe(plan.id)}
            >
              <Text>{getButtonLabel(plan.id)}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="paywall-footer-hint">
        <Text className="subscriber-count">已有 {formatCount(subscriberCount)} 人订阅</Text>
      </View>
    </>
  );

  return (
    <View className={`paywall-overlay ${subscribing ? 'locked' : ''}`} onClick={handleClose}>
      <View className="paywall-panel" onClick={(e) => e.stopPropagation()}>
        <View className="paywall-header">
          <View
            className={`paywall-close ${subscribing ? 'disabled' : ''}`}
            onClick={handleClose}
          >
            <Text className="paywall-close-text">x</Text>
          </View>
          <Text className="paywall-icon">支付方式</Text>
          <Text className="paywall-title">选择支付方式并解锁更多创作</Text>
          <Text className="paywall-subtitle">
            支持支付宝支付，几秒完成订阅。
          </Text>
        </View>

        {isH5 ? (
          <View className="paywall-plans-scroll paywall-plans-scroll--h5">
            {plansContent}
          </View>
        ) : (
          <ScrollView scrollY className="paywall-plans-scroll">
            {plansContent}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
