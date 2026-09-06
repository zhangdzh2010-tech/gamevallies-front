/* eslint-env jest */

const mockCreateOrder = jest.fn();
const mockGetOrderStatus = jest.fn();
const mockUnlockGame = jest.fn();
const mockGetQuota = jest.fn();
const mockGetPlans = jest.fn();
const mockGetGame = jest.fn();
const mockShowToast = jest.fn();
const mockRequestPayment = jest.fn(() => Promise.resolve());
const mockNavigateTo = jest.fn(() => Promise.resolve());
const mockLaunchPaymentAction = jest.fn();
const mockLaunchJsapiPayment = jest.fn(() => Promise.resolve());

const mockListeners = new Map();
const mockStorage = {};

const mockEventCenter = {
  on: jest.fn((eventName, handler) => {
    const handlers = mockListeners.get(eventName) || new Set();
    handlers.add(handler);
    mockListeners.set(eventName, handlers);
  }),
  off: jest.fn((eventName, handler) => {
    mockListeners.get(eventName)?.delete(handler);
  }),
  trigger: jest.fn((eventName, payload) => {
    Array.from(mockListeners.get(eventName) || []).forEach((handler) => handler(payload));
  }),
};

jest.mock('@tarojs/taro', () => {
  const api = {
    showToast: mockShowToast,
    requestPayment: mockRequestPayment,
    navigateTo: mockNavigateTo,
    getStorageSync: jest.fn((key) => {
      if (key === '') {
        return mockStorage;
      }

      return mockStorage[key];
    }),
    setStorageSync: jest.fn((key, value) => {
      mockStorage[key] = value;
    }),
    removeStorageSync: jest.fn((key) => {
      delete mockStorage[key];
    }),
    getStorageInfoSync: jest.fn(() => ({ keys: Object.keys(mockStorage) })),
    eventCenter: mockEventCenter,
  };

  return {
    __esModule: true,
    default: api,
    ...api,
  };
});

jest.mock('../../services/subscription', () => ({
  createOrder: (...args) => mockCreateOrder(...args),
  getOrderStatus: (...args) => mockGetOrderStatus(...args),
  unlockGame: (...args) => mockUnlockGame(...args),
  getQuota: (...args) => mockGetQuota(...args),
  getPlans: (...args) => mockGetPlans(...args),
}));

jest.mock('../../services/game', () => ({
  getGame: (...args) => mockGetGame(...args),
  getMyGames: jest.fn(),
  generateGame: jest.fn(),
  getGenerationStatus: jest.fn(),
  getGenerationTask: jest.fn(),
  getGenerationTaskEvents: jest.fn(),
  cancelGenerationTask: jest.fn(),
  forkGame: jest.fn(),
  publishGame: jest.fn(),
  deleteGame: jest.fn(),
  updateGameSettings: jest.fn(),
}));

jest.mock('../../services/websocket', () => ({
  getWebSocketManager: jest.fn(() => ({
    getIsConnected: jest.fn(() => true),
    connect: jest.fn(() => Promise.resolve()),
    onMessage: jest.fn(),
    offMessage: jest.fn(),
  })),
}));

jest.mock('../../utils/paymentRuntime', () => {
  const actual = jest.requireActual('../../utils/paymentRuntime');
  return {
    ...actual,
    launchJsapiPayment: (...args) => mockLaunchJsapiPayment(...args),
    launchPaymentAction: (...args) => mockLaunchPaymentAction(...args),
  };
});

const useQuotaStore = require('../quotaStore').default;
const useGamePlayerStore = require('../gamePlayer').default;
const { useGameStore } = require('../../store/gameStore');

describe('quotaStore payment unlock flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TARO_ENV = 'h5';
    Object.keys(mockStorage).forEach((key) => {
      delete mockStorage[key];
    });

    mockCreateOrder.mockResolvedValue({
      orderId: 'order-1',
      payment: {
        payUrl: 'https://openapi.alipay.com/gateway.do?token=abc',
      },
    });
    mockGetOrderStatus.mockResolvedValue({
      orderId: 'order-1',
      status: 'paid',
      subscriptionActive: true,
    });
    mockUnlockGame.mockResolvedValue({
      unlocked: true,
      canPlay: true,
      quotaRemaining: 29,
    });
    mockGetQuota.mockResolvedValue({
      freeQuota: 0,
      totalFreeQuota: 5,
      subscription: {
        active: true,
        planId: 'plan-pro',
        planName: '专业月卡',
        expiresAt: null,
        usedThisPeriod: 1,
        quotaThisPeriod: 30,
      },
    });
    mockGetPlans.mockResolvedValue({ plans: [], subscriberCount: 0 });
    mockGetGame.mockResolvedValue({
      id: 'game-1',
      title: 'Locked Game',
      gameUrl: 'https://game.example/play',
      orientation: 'landscape',
      canPlay: true,
      quotaRemaining: 29,
      coverUrl: 'https://img.example/cover.png',
    });

    useQuotaStore.getState().reset();
    useGamePlayerStore.getState().closeGame();
    useGameStore.setState({
      currentGame: null,
      currentTask: null,
      currentTaskEvents: [],
      currentTaskCursor: 0,
      createEntryIntent: null,
      myGames: [],
      trackedTasks: [],
      isGenerating: false,
      generationProgress: null,
      generatingGameId: null,
      isLoading: false,
      error: null,
      terminalError: null,
      latestTaskMessage: '',
      canPlay: true,
    });
  });

  test('h5 subscription redirects to alipay and persists a pending payment attempt', async () => {
    useQuotaStore.getState().openPaywall({
      gameId: 'game-1',
      gameUrl: 'https://game.example/play',
      gameTitle: 'Locked Game',
      gameCover: 'https://img.example/cover.png',
      gameOrientation: 'landscape',
      resumePlay: true,
    });

    const result = await useQuotaStore.getState().subscribe('plan-pro');

    expect(result).toBe(true);
    expect(mockCreateOrder).toHaveBeenCalledWith('plan-pro', 'game-1', 'alipay');
    expect(mockLaunchPaymentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'h5_redirect',
        url: 'https://openapi.alipay.com/gateway.do?token=abc',
      })
    );
    expect(mockRequestPayment).not.toHaveBeenCalled();
    expect(useQuotaStore.getState().showPaywall).toBe(false);
    expect(useQuotaStore.getState().paymentAttempt).toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        status: 'redirecting_payment',
        gameId: 'game-1',
      })
    );
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '正在打开支付宝支付，请支付完成后返回',
      icon: 'none',
    }));
  });

  test('resumePendingPayment unlocks the pending game and resumes play after payment is confirmed', async () => {
    useGameStore.setState({
      currentGame: {
        id: 'game-1',
        title: 'Locked Game',
        gameUrl: 'https://game.example/play',
        canPlay: false,
        requireSubscription: true,
      },
      generatingGameId: 'game-1',
      canPlay: false,
    });

    useQuotaStore.setState({
      paymentAttempt: {
        orderId: 'order-1',
        status: 'redirecting_payment',
        gameId: 'game-1',
        pendingPlayContext: {
          gameId: 'game-1',
          gameUrl: 'https://game.example/play',
          gameTitle: 'Locked Game',
          gameCover: 'https://img.example/cover.png',
          gameOrientation: 'landscape',
        },
      },
    });

    const result = await useQuotaStore.getState().resumePendingPayment({ silent: false });

    expect(result).toBe(true);
    expect(mockGetOrderStatus).toHaveBeenCalledWith('order-1');
    expect(mockUnlockGame).toHaveBeenCalledWith('game-1');
    expect(mockGetGame).toHaveBeenCalledWith('game-1');

    expect(useQuotaStore.getState().showPaywall).toBe(false);
    expect(useQuotaStore.getState().pendingGameId).toBe(null);
    expect(useGameStore.getState().canPlay).toBe(true);
    expect(useGameStore.getState().currentGame.canPlay).toBe(true);
    expect(useGamePlayerStore.getState().gameId).toBe('game-1');
    expect(useGamePlayerStore.getState().gameUrl).toBe('https://game.example/play');
    expect(useGamePlayerStore.getState().gameOrientation).toBe('landscape');
    expect(mockNavigateTo).not.toHaveBeenCalled();
    expect(useQuotaStore.getState().paymentAttempt).toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        status: 'completed',
        orderStatus: 'paid',
      })
    );
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '订阅成功',
      icon: 'success',
    }));
  });

  test('paywall cannot be closed while payment is in progress', () => {
    useQuotaStore.getState().openPaywall({ gameId: 'game-1' });
    useQuotaStore.setState({ subscribing: true, subscribingPlanId: 'plan-pro' });

    const closed = useQuotaStore.getState().closePaywall();

    expect(closed).toBe(false);
    expect(useQuotaStore.getState().showPaywall).toBe(true);
    expect(useQuotaStore.getState().pendingGameId).toBe('game-1');
  });

  test('completes a WeChat JSAPI payment returned by the backend', async () => {
    mockCreateOrder.mockResolvedValueOnce({
      orderId: 'order-legacy',
      payment: {
        timeStamp: '2',
        nonceStr: 'nonce-h5',
        package: 'prepay_id=wx123',
        signType: 'RSA',
        paySign: 'sign-h5',
      },
    });

    const result = await useQuotaStore.getState().subscribe('plan-pro');

    expect(result).toBe(true);
    expect(mockLaunchJsapiPayment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'jsapi' }),
      expect.objectContaining({ isH5: true, requestPayment: mockRequestPayment })
    );
    expect(mockLaunchPaymentAction).not.toHaveBeenCalled();
    expect(useQuotaStore.getState().paymentAttempt).toEqual(
      expect.objectContaining({
        orderId: 'order-legacy',
        status: 'paid',
        stage: 'complete',
      })
    );
  });

  test('updateAfterCreate keeps quota display untouched until fetchQuota refreshes it', () => {
    useQuotaStore.setState({
      freeQuota: 4,
      totalFreeQuota: 5,
      subscription: {
        active: true,
        planId: 'plan-pro',
        planName: '专业月卡',
        expiresAt: null,
        usedThisPeriod: 12,
        quotaThisPeriod: 30,
        remaining: 18,
        totalRemaining: 22,
      },
    });

    useQuotaStore.getState().updateAfterCreate(true, 17);

    expect(useQuotaStore.getState().freeQuota).toBe(4);
    expect(useQuotaStore.getState().subscription.remaining).toBe(18);
  });
});
