import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import useQuotaStore from '../../stores/quotaStore';
import { getQuotaSummary } from '../../utils/quotaSummary';
import { Storage } from '../../utils/storage';
import { isH5Runtime } from '../../utils/runtime';
import {
  getSubscriptionPaymentOption,
  isSubscriptionPaymentMethodAvailable,
  SUBSCRIPTION_PAYMENT_OPTIONS,
} from '../../utils/subscriptionPaymentMethods';
import './index.scss';

function formatCount(value) {
  const numericValue = Number(value) || 0;

  if (numericValue >= 10000) {
    return `${(numericValue / 10000).toFixed(1)}\u4e07`;
  }

  if (numericValue >= 1000) {
    return `${(numericValue / 1000).toFixed(1)}k`;
  }

  return String(numericValue);
}

function formatDate(dateStr) {
  if (!dateStr) {
    return '--';
  }

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatQuotaCount(value) {
  return `${Number(value) || 0} \u6b21`;
}

export default function SubscriptionPage() {
  const isH5 = isH5Runtime();
  const freeQuota = useQuotaStore((state) => state.freeQuota);
  const totalFreeQuota = useQuotaStore((state) => state.totalFreeQuota);
  const subscription = useQuotaStore((state) => state.subscription);
  const plans = useQuotaStore((state) => state.plans);
  const subscriberCount = useQuotaStore((state) => state.subscriberCount);
  const fetchQuota = useQuotaStore((state) => state.fetchQuota);
  const fetchPlans = useQuotaStore((state) => state.fetchPlans);
  const closePaywall = useQuotaStore((state) => state.closePaywall);
  const subscribe = useQuotaStore((state) => state.subscribe);
  const subscribing = useQuotaStore((state) => state.subscribing);
  const subscribingPlanId = useQuotaStore((state) => state.subscribingPlanId);
  const selectedPaymentMethod = useQuotaStore((state) => state.selectedPaymentMethod);
  const setSelectedPaymentMethod = useQuotaStore((state) => state.setSelectedPaymentMethod);

  const quotaSummary = getQuotaSummary({ freeQuota, totalFreeQuota, subscription });
  const selectedPaymentOption = getSubscriptionPaymentOption(selectedPaymentMethod);
  const selectedPaymentAvailable = isSubscriptionPaymentMethodAvailable(selectedPaymentMethod);

  const loadPageData = () => {
    closePaywall();

    if (!Storage.getToken()) {
      Taro.showToast({ title: '\u8bf7\u5148\u767b\u5f55', icon: 'none' });
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 500);
      return;
    }

    fetchQuota(true);
    fetchPlans();
  };

  useDidShow(() => {
    loadPageData();
  });

  const handleSubscribeClick = async (planId) => {
    if (subscribing) {
      return;
    }

    if (!selectedPaymentAvailable) {
      Taro.showToast({ title: `${selectedPaymentOption.label}\u6682\u4e0d\u53ef\u7528`, icon: 'none' });
      return;
    }

    await subscribe(planId);
  };

  const openHistoryPage = () => {
    Taro.navigateTo({ url: '/pages/subscription/history/index' }).catch(() => {});
  };

  const subscriptionHighlights = [
    {
      key: 'total',
      label: '\u603b\u989d\u5ea6',
      value: formatQuotaCount(quotaSummary.totalQuota),
    },
    {
      key: 'used',
      label: '\u603b\u4f7f\u7528\u91cf',
      value: formatQuotaCount(quotaSummary.totalUsed),
    },
    {
      key: 'remaining',
      label: '\u5269\u4f59\u989d\u5ea6',
      value: formatQuotaCount(quotaSummary.totalRemaining),
    },
    {
      key: 'payment',
      label: '\u652f\u4ed8\u65b9\u5f0f',
      value: selectedPaymentOption.label,
    },
  ];

  const selectedPaymentNote = selectedPaymentAvailable
    ? '\u4e0b\u5355\u540e\u4f1a\u8df3\u8f6c\u5230\u652f\u4ed8\u9875\uff0c\u652f\u4ed8\u5b8c\u6210\u8fd4\u56de\u540e\u4f1a\u81ea\u52a8\u5237\u65b0\u8ba2\u9605\u72b6\u6001\u3002'
    : '\u5f53\u524d\u6682\u4e0d\u652f\u6301\u5fae\u4fe1\u652f\u4ed8\uff0c\u8bf7\u5148\u4f7f\u7528\u652f\u4ed8\u5b9d\u5b8c\u6210\u652f\u4ed8\u3002';

  const getButtonLabel = (planId) => {
    if (subscribing && subscribingPlanId === planId) {
      return selectedPaymentOption.loadingLabel;
    }

    return selectedPaymentOption.actionLabel;
  };

  return (
    <View className={`subscription-container${isH5 ? ' subscription-container--h5' : ''}`}>
      <AppTopBar showBack rightText={'\u8bb0\u5f55'} onRightClick={openHistoryPage} />

      <PageScrollContainer scrollY className="subscription-scroll">
        <View className="subscription-shell">
          <View className="subscription-stage">
            <View className="subscription-stage__copy">
              <Text className="subscription-stage__eyebrow">Subscription Center</Text>
              <Text className="subscription-stage__title">{'\u8ba2\u9605\u4e0e\u989d\u5ea6'}</Text>
              <Text className="subscription-stage__desc">
                {'\u8fd9\u91cc\u7edf\u4e00\u5c55\u793a\u4f60\u7684\u603b\u521b\u4f5c\u989d\u5ea6\u3001\u603b\u4f7f\u7528\u91cf\u3001\u5269\u4f59\u989d\u5ea6\u548c\u5f53\u524d\u8ba2\u9605\u72b6\u6001\u3002'}
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

          <View className="quota-card">
            <Text className="quota-card-eyebrow">Quota Overview</Text>
            <Text className="quota-card-title">{'\u521b\u4f5c\u989d\u5ea6\u603b\u89c8'}</Text>

            <View className="quota-progress-wrap">
              <View className="quota-progress-bg">
                <View className="quota-progress-fill" style={{ width: `${quotaSummary.usagePercent}%` }} />
              </View>
              <Text className="quota-progress-text">
                {`\u5df2\u4f7f\u7528 ${quotaSummary.totalUsed} / ${quotaSummary.totalQuota} \u6b21`}
              </Text>
            </View>

            <View className="quota-remaining">
              <Text className="quota-remaining-num">{quotaSummary.totalRemaining}</Text>
              <Text className="quota-remaining-label">{'\u6b21\u5269\u4f59'}</Text>
            </View>
          </View>

          <View className="sub-status-card">
            <Text className="sub-status-eyebrow">Subscription Status</Text>
            <Text className="sub-status-title">{'\u5f53\u524d\u8ba2\u9605\u72b6\u6001'}</Text>

            <View className="sub-status-info">
              <View className="sub-info-row">
                <Text className="sub-info-label">{'\u8ba2\u9605\u72b6\u6001'}</Text>
                <Text className="sub-info-value">{subscription.active ? '\u5df2\u751f\u6548' : '\u672a\u8ba2\u9605'}</Text>
              </View>
              <View className="sub-info-row">
                <Text className="sub-info-label">{'\u5f53\u524d\u5957\u9910'}</Text>
                <Text className="sub-info-value">{subscription.planName || '--'}</Text>
              </View>
              <View className="sub-info-row">
                <Text className="sub-info-label">{'\u6709\u6548\u671f\u81f3'}</Text>
                <Text className="sub-info-value">{formatDate(subscription.expiresAt)}</Text>
              </View>
              <View className="sub-info-row">
                <Text className="sub-info-label">{'\u603b\u4f7f\u7528\u91cf'}</Text>
                <Text className="sub-info-value">
                  {`${quotaSummary.totalUsed} / ${quotaSummary.totalQuota} \u6b21`}
                </Text>
              </View>
            </View>
          </View>

          <View className="subscription-record-entry" onClick={openHistoryPage}>
            <View className="subscription-record-entry__copy">
              <Text className="subscription-record-entry__title">{'\u8ba2\u9605\u8bb0\u5f55'}</Text>
              <Text className="subscription-record-entry__desc">
                {'\u67e5\u770b\u5f53\u524d\u8ba2\u9605\u72b6\u6001\u548c\u6700\u8fd1\u4e00\u7b14\u652f\u4ed8\u8bb0\u5f55\u3002'}
              </Text>
            </View>
            <View className="subscription-record-entry__action">
              <Text>{'\u67e5\u770b\u8bb0\u5f55'}</Text>
            </View>
          </View>

          <View className="payment-method-card">
            <View className="payment-method-card__head">
              <View className="payment-method-card__copy">
                <Text className="payment-method-card__eyebrow">Payment Method</Text>
                <Text className="payment-method-card__title">{'\u9009\u62e9\u652f\u4ed8\u65b9\u5f0f'}</Text>
              </View>
              <Text className={`payment-method-card__badge ${selectedPaymentAvailable ? 'is-live' : 'is-soon'}`}>
                {selectedPaymentAvailable ? '\u5f53\u524d\u53ef\u7528' : '\u6682\u4e0d\u53ef\u7528'}
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

          <View className="plans-section">
            <View className="plans-section-head">
              <View className="plans-section-head__copy">
                <Text className="plans-section-kicker">Subscription Plans</Text>
                <Text className="plans-section-title">{'\u9009\u62e9\u5957\u9910\u5e76\u5b8c\u6210\u652f\u4ed8'}</Text>
              </View>
              <Text className="plans-section-meta">{`\u5f53\u524d ${selectedPaymentOption.label}`}</Text>
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
                      <Text className="plan-card-currency">{'\u00A5'}</Text>
                      <Text className="plan-card-amount">{plan.priceDisplay}</Text>
                      <Text className="plan-card-period">/{plan.periodLabel}</Text>
                    </View>
                  </View>

                  <Text className="plan-card-quota">{plan.quotaLabel}</Text>

                  <View className="plan-card-features">
                    {(plan.features || []).map((feature, index) => (
                      <View key={index} className="plan-card-feature">
                        <Text className="feature-dot">*</Text>
                        <Text className="feature-text">{feature}</Text>
                      </View>
                    ))}
                  </View>

                  <Text className="plan-card-payment-hint">
                    {selectedPaymentAvailable
                      ? `\u4f7f\u7528${selectedPaymentOption.label}\u5b8c\u6210\u652f\u4ed8`
                      : '\u5fae\u4fe1\u652f\u4ed8\u5f53\u524d\u6682\u4e0d\u53ef\u7528'}
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
              <Text>{`\u5df2\u6709 ${formatCount(subscriberCount)} \u4eba\u8ba2\u9605`}</Text>
            </View>
          ) : null}

          <View className="bottom-spacer" />
        </View>
      </PageScrollContainer>

      <CustomTabBar activeIndex={4} />
    </View>
  );
}
