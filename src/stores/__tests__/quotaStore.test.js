/* eslint-env jest */

const mockCreateOrder = jest.fn();
const mockGetOrderStatus = jest.fn();
const mockUnlockGame = jest.fn();
const mockGetQuota = jest.fn();
const mockGetPlans = jest.fn();
const mockGetGame = jest.fn();
const mockShowToast = jest.fn();
const mockRequestPayment = jest.fn(() => Promise.resolve());

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
    navigateTo: jest.fn(() => Promise.resolve()),
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
  iterateGame: jest.fn(),
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

const useQuotaStore = require('../quotaStore').default;
const useGamePlayerStore = require('../gamePlayer').default;
const { useGameStore } = require('../../store/gameStore');

describe('quotaStore payment unlock flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => {
      delete mockStorage[key];
    });

    mockCreateOrder.mockResolvedValue({
      orderId: 'order-1',
      payment: {
        timeStamp: '1',
        nonceStr: 'nonce',
        package: 'prepay_id=123',
        signType: 'RSA',
        paySign: 'sign',
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

  test('subscribing unlocks the pending game and resumes play', async () => {
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

    useQuotaStore.getState().openPaywall({
      gameId: 'game-1',
      gameUrl: 'https://game.example/play',
      gameTitle: 'Locked Game',
      gameCover: 'https://img.example/cover.png',
      resumePlay: true,
    });

    const result = await useQuotaStore.getState().subscribe('plan-pro');

    expect(result).toBe(true);
    expect(mockCreateOrder).toHaveBeenCalledWith('plan-pro', 'game-1');
    expect(mockGetOrderStatus).toHaveBeenCalledWith('order-1');
    expect(mockUnlockGame).toHaveBeenCalledWith('game-1');
    expect(mockGetGame).toHaveBeenCalledWith('game-1');

    expect(useQuotaStore.getState().showPaywall).toBe(false);
    expect(useQuotaStore.getState().pendingGameId).toBe(null);
    expect(useGameStore.getState().canPlay).toBe(true);
    expect(useGameStore.getState().currentGame.canPlay).toBe(true);
    expect(useGamePlayerStore.getState().gameId).toBe('game-1');
    expect(useGamePlayerStore.getState().gameUrl).toBe('https://game.example/play');
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

  test('payment callback failure still recovers when order status is paid', async () => {
    mockRequestPayment.mockRejectedValueOnce(new Error('requestPayment:fail timeout'));
    mockGetQuota
      .mockResolvedValueOnce({
        freeQuota: 0,
        totalFreeQuota: 5,
        subscription: {
          active: false,
          planId: null,
          planName: null,
          expiresAt: null,
          usedThisPeriod: 0,
          quotaThisPeriod: 0,
        },
      })
      .mockResolvedValue({
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

    useQuotaStore.getState().openPaywall({
      gameId: 'game-1',
      gameUrl: 'https://game.example/play',
      gameTitle: 'Locked Game',
      gameCover: 'https://img.example/cover.png',
      resumePlay: true,
    });

    const result = await useQuotaStore.getState().subscribe('plan-pro');

    expect(result).toBe(true);
    expect(mockGetOrderStatus).toHaveBeenCalledWith('order-1');
    expect(mockUnlockGame).toHaveBeenCalledWith('game-1');
    expect(useQuotaStore.getState().paymentAttempt).toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        status: 'completed',
        orderStatus: 'paid',
      })
    );
  });

  test('paywall cannot be closed while payment is in progress', () => {
    useQuotaStore.getState().openPaywall({ gameId: 'game-1' });
    useQuotaStore.setState({ subscribing: true, subscribingPlanId: 'plan-pro' });

    const closed = useQuotaStore.getState().closePaywall();

    expect(closed).toBe(false);
    expect(useQuotaStore.getState().showPaywall).toBe(true);
    expect(useQuotaStore.getState().pendingGameId).toBe('game-1');
  });
});
