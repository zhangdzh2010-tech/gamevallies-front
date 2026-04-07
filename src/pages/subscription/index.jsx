import { useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import useQuotaStore from '../../stores/quotaStore';
import { Storage } from '../../utils/storage';
import { isH5Runtime } from '../../utils/runtime';
import {
  getSubscriptionPaymentOption,
  isSubscriptionPaymentMethodAvailable,
  SUBSCRIPTION_PAYMENT_OPTIONS,
} from '../../utils/subscriptionPaymentMethods';
import './index.scss';

export default function SubscriptionPage() {
  const isH5 = isH5Runtime();
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
  const selectedPaymentMethod = useQuotaStore((s) => s.selectedPaymentMethod);
  const setSelectedPaymentMethod = useQuotaStore((s) => s.setSelectedPaymentMethod);

  const usedQuota = totalFreeQuota - freeQuota;
  const usedPercent = totalFreeQuota > 0 ? Math.round((usedQuota / totalFreeQuota) * 100) : 0;
  const featuredPlan = plans.find((plan) => plan.recommended) || plans[0] || null;
  const selectedPaymentOption = getSubscriptionPaymentOption(selectedPaymentMethod);
  const selectedPaymentAvailable = isSubscriptionPaymentMethodAvailable(selectedPaymentMethod);

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

    if (!selectedPaymentAvailable) {
      Taro.showToast({ title: `${selectedPaymentOption.label}暂未实现`, icon: 'none' });
      return;
    }

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

  const subscriptionHighlights = [
    {
      key: 'quota',
      label: subscription.active ? '当前套餐' : '剩余免费额度',
      value: subscription.active ? (subscription.planName || '会员中') : `${freeQuota} 次`,
    },
    {
      key: 'payment',
      label: '支付方式',
      value: selectedPaymentOption.label,
    },
    {
      key: 'community',
      label: '订阅用户',
      value: subscriberCount > 0 ? formatCount(subscriberCount) : 'New',
    },
  ];

  const selectedPaymentNote = selectedPaymentAvailable
    ? '下单后会跳转到支付宝收银台，支付完成返回后自动刷新订阅状态。'
    : '微信支付入口已预留，当前版本先支持支付宝，后续再接入微信支付。';

  const getButtonLabel = (planId) => {
    if (subscribing && subscribingPlanId === planId) {
      return selectedPaymentOption.loadingLabel;
    }

    return selectedPaymentOption.actionLabel;
  };

  return (
    <View className={`subscription-container${isH5 ? ' subscription-container--h5' : ''}`}>
      <AppTopBar showBack />

      <PageScrollContainer scrollY className="subscription-scroll">
        <View className="subscription-stage">
          <View className="subscription-stage__copy">
            <Text className="subscription-stage__eyebrow">Payment Options</Text>
            <Text className="subscription-stage__title">
              {subscription.active ? '订阅已生效，继续稳定创作' : '先选支付方式，再解锁完整创作额度'}
            </Text>
            <Text className="subscription-stage__desc">
              {subscription.active
                ? '你当前的订阅权益已经生效，可以继续查看套餐、有效期与额度消耗情况。'
                : '当前先支持支付宝支付，同时预留了微信支付入口，后续可无缝补齐。'}
            </Text>
          </View>
          <View className="subscription-stage__metrics">
            {subscriptionHighlights.map((highlight) => (
              <View key={highlight.key} className="subscription-stage__metric">
                <Text className="subscription-stage__metric-label">{highlight.label}</Text>
                <Text className="subscription-stage__metric-value">{highlight.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="payment-method-card">
          <View className="payment-method-card__head">
            <View className="payment-method-card__copy">
              <Text className="payment-method-card__eyebrow">Payment Method</Text>
              <Text className="payment-method-card__title">选择支付方式</Text>
            </View>
            <Text className={`payment-method-card__badge ${selectedPaymentAvailable ? 'is-live' : 'is-soon'}`}>
              {selectedPaymentAvailable ? '立即可用' : '敬请期待'}
            </Text>
          </View>

          <View className="payment-method-list">
            {SUBSCRIPTION_PAYMENT_OPTIONS.map((option) => {
              const selected = selectedPaymentMethod === option.id;

              return (
                <View
                  key={option.id}
                  className={`payment-method-option ${selected ? 'is-selected' : ''} ${option.available ? 'is-live' : 'is-soon'}`}
                  onClick={() => setSelectedPaymentMethod(option.id)}
                >
                  <View className={`payment-method-option__icon payment-method-option__icon--${option.id}`}>
                    <Text>{option.iconText}</Text>
                  </View>

                  <View className="payment-method-option__copy">
                    <View className="payment-method-option__top">
                      <Text className="payment-method-option__label">{option.label}</Text>
                      <Text className={`payment-method-option__status ${option.available ? 'is-live' : 'is-soon'}`}>
                        {option.statusLabel}
                      </Text>
                    </View>
                    <Text className="payment-method-option__desc">{option.description}</Text>
                  </View>

                  <View className={`payment-method-option__radio ${selected ? 'is-selected' : ''}`} />
                </View>
              );
            })}
          </View>

          <Text className="payment-method-card__note">{selectedPaymentNote}</Text>
        </View>

        <View className="quota-card">
          <Text className="quota-card-eyebrow">Subscription Billing</Text>
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

        {subscription.active ? (
          <View className="sub-status-card">
            <Text className="sub-status-eyebrow">Active Plan</Text>
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
        ) : null}

        <View className="plans-section">
          <View className="plans-section-head">
            <View className="plans-section-head__copy">
              <Text className="plans-section-kicker">Subscription Plans</Text>
              <Text className="plans-section-title">选择套餐并完成支付</Text>
            </View>
            <Text className="plans-section-meta">
              当前 {selectedPaymentOption.label}
            </Text>
          </View>

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

                <Text className="plan-card-kicker">{plan.recommended ? 'Recommended Plan' : 'Flexible Choice'}</Text>

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

                <Text className="plan-card-payment-hint">
                  {selectedPaymentAvailable ? `使用${selectedPaymentOption.label}完成支付` : '微信支付入口暂未实现'}
                </Text>

                <View
                  className={`plan-card-subscribe-btn ${
                    subscribing && subscribingPlanId === plan.id ? 'subscribing' : ''
                  } ${
                    subscribing && subscribingPlanId !== plan.id ? 'disabled' : ''
                  } ${
                    !selectedPaymentAvailable ? 'coming-soon' : ''
                  }`}
                  onClick={() => handleSubscribeClick(plan.id)}
                >
                  <Text>{getButtonLabel(plan.id)}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {subscriberCount > 0 ? (
          <View className="subscriber-bar">
            <Text>已有 {formatCount(subscriberCount)} 人订阅</Text>
          </View>
        ) : null}

        <View className="bottom-spacer" />
      </PageScrollContainer>

      <CustomTabBar activeIndex={4} />
    </View>
  );
}
