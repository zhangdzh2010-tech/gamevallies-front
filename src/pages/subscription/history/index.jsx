import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../../components/common/AppTopBar';
import { PageScrollContainer } from '../../../components/common/PageScrollContainer';
import CreativeShell from '../../../components/creative-web/CreativeShell';
import useQuotaStore from '../../../stores/quotaStore';
import * as subscriptionService from '../../../services/subscription';
import { getQuotaSummary } from '../../../utils/quotaSummary';
import { Storage } from '../../../utils/storage';
import { isH5Runtime } from '../../../utils/runtime';
import './index.scss';

const PENDING_RECORD_STATUSES = new Set([
  'creating_order',
  'awaiting_payment',
  'redirecting_payment',
  'verifying_payment',
  'syncing_entitlement',
]);

const FAILURE_RECORD_STATUSES = new Set(['failed', 'refunded', 'canceled', 'cancelled']);

function formatDate(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return `${formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function normalizeRecordStatus(paymentAttempt, orderStatus, subscriptionActive) {
  const rawStatus = orderStatus?.status || paymentAttempt?.orderStatus || paymentAttempt?.status || '';
  const status = String(rawStatus).trim().toLowerCase();

  if (subscriptionActive || status === 'paid' || status === 'completed') {
    return {
      label: '\u5df2\u751f\u6548',
      tone: 'success',
      description: '\u8ba2\u9605\u5df2\u751f\u6548\uff0c\u53ef\u4ee5\u7ee7\u7eed\u4f7f\u7528\u521b\u4f5c\u989d\u5ea6\u3002',
    };
  }

  if (status === 'completed_with_warning') {
    return {
      label: '\u5f85\u540c\u6b65',
      tone: 'warning',
      description: paymentAttempt?.lastError || '\u652f\u4ed8\u5df2\u5b8c\u6210\uff0c\u8ba2\u9605\u80fd\u529b\u6b63\u5728\u540c\u6b65\u4e2d\u3002',
    };
  }

  if (PENDING_RECORD_STATUSES.has(status)) {
    return {
      label: '\u5904\u7406\u4e2d',
      tone: 'pending',
      description: '\u652f\u4ed8\u5b8c\u6210\u540e\uff0c\u8fd9\u91cc\u4f1a\u81ea\u52a8\u5237\u65b0\u4e3a\u6700\u65b0\u72b6\u6001\u3002',
    };
  }

  if (status === 'canceled' || status === 'cancelled') {
    return {
      label: '\u5df2\u53d6\u6d88',
      tone: 'failure',
      description: paymentAttempt?.lastError || '\u8fd9\u7b14\u8ba2\u9605\u5df2\u53d6\u6d88\uff0c\u6ca1\u6709\u751f\u6548\u3002',
    };
  }

  if (FAILURE_RECORD_STATUSES.has(status)) {
    return {
      label: '\u5931\u8d25',
      tone: 'failure',
      description: paymentAttempt?.lastError || '\u8fd9\u7b14\u8ba2\u9605\u6ca1\u6709\u6210\u529f\u5b8c\u6210\u3002',
    };
  }

  return {
    label: '\u5df2\u8bb0\u5f55',
    tone: 'neutral',
    description: paymentAttempt?.lastError || '\u6700\u8fd1\u4e00\u7b14\u8ba2\u9605\u8bb0\u5f55\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002',
  };
}

function resolvePlanName(paymentAttempt, orderStatus, plans, subscription) {
  if (orderStatus?.planName) {
    return orderStatus.planName;
  }

  if (subscription?.planName && subscription?.active) {
    return subscription.planName;
  }

  const planId = paymentAttempt?.planId;
  if (!planId) {
    return '--';
  }

  return plans.find((plan) => plan.id === planId)?.name || planId;
}

export default function SubscriptionHistoryPage() {
  const isH5 = isH5Runtime();
  const freeQuota = useQuotaStore((state) => state.freeQuota);
  const totalFreeQuota = useQuotaStore((state) => state.totalFreeQuota);
  const subscription = useQuotaStore((state) => state.subscription);
  const plans = useQuotaStore((state) => state.plans);
  const paymentAttempt = useQuotaStore((state) => state.paymentAttempt);
  const fetchQuota = useQuotaStore((state) => state.fetchQuota);
  const fetchPlans = useQuotaStore((state) => state.fetchPlans);
  const hydratePaymentAttempt = useQuotaStore((state) => state.hydratePaymentAttempt);

  const [recordLoading, setRecordLoading] = useState(true);
  const [orderStatus, setOrderStatus] = useState(null);

  const quotaSummary = getQuotaSummary({ freeQuota, totalFreeQuota, subscription });

  const loadPageData = async () => {
    if (!Storage.getToken()) {
      Taro.showToast({ title: '\u8bf7\u5148\u767b\u5f55', icon: 'none' });
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 500);
      return;
    }

    setRecordLoading(true);
    setOrderStatus(null);

    await Promise.all([fetchQuota(true), fetchPlans()]);
    const nextPaymentAttempt = await hydratePaymentAttempt();

    if (nextPaymentAttempt?.orderId) {
      try {
        const nextOrderStatus = await subscriptionService.getOrderStatus(nextPaymentAttempt.orderId);
        setOrderStatus(nextOrderStatus || null);
      } catch (error) {
        console.warn('getOrderStatus failed in subscription history:', error);
      }
    }

    setRecordLoading(false);
  };

  useDidShow(() => {
    void loadPageData();
  });

  const recordStatus = normalizeRecordStatus(paymentAttempt, orderStatus, subscription.active);
  const latestPlanName = resolvePlanName(paymentAttempt, orderStatus, plans, subscription);
  const latestUpdatedAt = orderStatus?.updatedAt
    || orderStatus?.paidAt
    || paymentAttempt?.updatedAt
    || null;

  const historyContent = (
    <PageScrollContainer scrollY className="subscription-history-scroll">
        <View className="subscription-history-shell">
          <View className="subscription-history-card">
            <Text className="subscription-history-card__eyebrow">Current Subscription</Text>
            <Text className="subscription-history-card__title">{'\u5f53\u524d\u8ba2\u9605\u72b6\u6001'}</Text>

            <View className="subscription-history-card__rows">
              <View className="subscription-history-card__row">
                <Text className="subscription-history-card__label">{'\u8ba2\u9605\u72b6\u6001'}</Text>
                <Text className="subscription-history-card__value">{subscription.active ? '\u5df2\u751f\u6548' : '\u672a\u8ba2\u9605'}</Text>
              </View>
              <View className="subscription-history-card__row">
                <Text className="subscription-history-card__label">{'\u5f53\u524d\u5957\u9910'}</Text>
                <Text className="subscription-history-card__value">{subscription.planName || '--'}</Text>
              </View>
              <View className="subscription-history-card__row">
                <Text className="subscription-history-card__label">{'\u6709\u6548\u671f\u81f3'}</Text>
                <Text className="subscription-history-card__value">{formatDate(subscription.expiresAt)}</Text>
              </View>
              <View className="subscription-history-card__row">
                <Text className="subscription-history-card__label">{'\u603b\u989d\u5ea6'}</Text>
                <Text className="subscription-history-card__value">{`${quotaSummary.totalQuota} \u6b21`}</Text>
              </View>
              <View className="subscription-history-card__row">
                <Text className="subscription-history-card__label">{'\u603b\u4f7f\u7528\u91cf'}</Text>
                <Text className="subscription-history-card__value">{`${quotaSummary.totalUsed} \u6b21`}</Text>
              </View>
            </View>
          </View>

          <View className="subscription-record-card">
            <View className="subscription-record-card__header">
              <View className="subscription-record-card__copy">
                <Text className="subscription-record-card__eyebrow">Latest Record</Text>
                <Text className="subscription-record-card__title">{'\u6700\u8fd1\u4e00\u7b14\u8ba2\u9605\u8bb0\u5f55'}</Text>
                <Text className="subscription-record-card__desc">{recordStatus.description}</Text>
              </View>
              {!recordLoading && paymentAttempt ? (
                <Text className={`subscription-record-badge subscription-record-badge--${recordStatus.tone}`}>
                  {recordStatus.label}
                </Text>
              ) : null}
            </View>

            {recordLoading ? (
              <View className="subscription-history-empty subscription-history-empty--compact">
                <Text className="subscription-history-empty__text">{'\u52a0\u8f7d\u4e2d...'}</Text>
              </View>
            ) : paymentAttempt ? (
              <View className="subscription-record-card__rows">
                <View className="subscription-record-card__row">
                  <Text className="subscription-record-card__label">{'\u8ba2\u5355\u53f7'}</Text>
                  <Text className="subscription-record-card__value subscription-record-card__value--mono">
                    {paymentAttempt.orderId || '--'}
                  </Text>
                </View>
                <View className="subscription-record-card__row">
                  <Text className="subscription-record-card__label">{'\u5957\u9910'}</Text>
                  <Text className="subscription-record-card__value">{latestPlanName}</Text>
                </View>
                <View className="subscription-record-card__row">
                  <Text className="subscription-record-card__label">{'\u72b6\u6001'}</Text>
                  <Text className="subscription-record-card__value">{recordStatus.label}</Text>
                </View>
                <View className="subscription-record-card__row">
                  <Text className="subscription-record-card__label">{'\u6700\u8fd1\u66f4\u65b0'}</Text>
                  <Text className="subscription-record-card__value">{formatDateTime(latestUpdatedAt)}</Text>
                </View>
                {paymentAttempt.lastError ? (
                  <View className="subscription-record-card__notice">
                    <Text className="subscription-record-card__notice-text">{paymentAttempt.lastError}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="subscription-history-empty">
                <Text className="subscription-history-empty__title">{'\u6682\u65e0\u8ba2\u9605\u8bb0\u5f55'}</Text>
                <Text className="subscription-history-empty__text">
                  {'\u5b8c\u6210\u4e00\u6b21\u8ba2\u9605\u540e\uff0c\u8fd9\u91cc\u4f1a\u5c55\u793a\u6700\u8fd1\u4e00\u7b14\u652f\u4ed8\u8bb0\u5f55\u3002'}
                </Text>
              </View>
            )}
          </View>

          <View className="bottom-spacer" />
        </View>
    </PageScrollContainer>
  );

  return (
    <View className={`subscription-history-container${isH5 ? ' subscription-history-container--h5' : ''}`}>
      {isH5 ? (
        <CreativeShell active="works" title="订阅记录">
          {historyContent}
        </CreativeShell>
      ) : (
        <>
          <AppTopBar showBack title={'\u8ba2\u9605\u8bb0\u5f55'} />
          {historyContent}
        </>
      )}
    </View>
  );
}
