/* eslint-env jest */
const mockRequest = jest.fn();
const mockNavigateTo = jest.fn();
const mockGetToken = jest.fn(() => '');
const mockGetRefreshToken = jest.fn(() => '');
const mockFetch = jest.fn();

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    request: mockRequest,
    navigateTo: mockNavigateTo,
  },
  request: mockRequest,
  navigateTo: mockNavigateTo,
}));

jest.mock('../../utils/storage', () => ({
  Storage: {
    getToken: mockGetToken,
    getRefreshToken: mockGetRefreshToken,
    setToken: jest.fn(),
    setRefreshToken: jest.fn(),
    removeToken: jest.fn(),
    removeRefreshToken: jest.fn(),
  },
}));

describe('api.get', () => {
  const originalTaroEnv = process.env.TARO_ENV;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    mockRequest.mockResolvedValue({
      statusCode: 200,
      data: {
        data: {
          items: [],
        },
      },
    });
    mockFetch.mockResolvedValue({
      status: 200,
      headers: {
        get: jest.fn(() => 'application/json'),
      },
      json: jest.fn(async () => ({
        data: {
          items: [],
        },
      })),
      text: jest.fn(async () => ''),
    });
  });

  afterAll(() => {
    process.env.TARO_ENV = originalTaroEnv;
    global.fetch = originalFetch;
  });

  test('uses a no-store fetch request for H5 API GET requests', async () => {
    process.env.TARO_ENV = 'h5';
    const { get } = require('../api');

    await get('/api/v1/feed/trending', {
      data: { page: 1, limit: 10 },
    });

    expect(mockRequest).not.toHaveBeenCalled();
    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/feed/trending?page=1&limit=10'),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
      })
    );
    expect(fetchOptions.headers['Cache-Control']).toBeUndefined();
    expect(fetchOptions.headers.Pragma).toBeUndefined();
    expect(fetchOptions.headers.Expires).toBeUndefined();
    expect(fetchOptions.headers['Content-Type']).toBeUndefined();
  });

  test('allows callers to opt into browser caching explicitly', async () => {
    process.env.TARO_ENV = 'h5';
    const { get } = require('../api');

    await get('/api/v1/games/game-types', {
      useCache: true,
    });

    const requestConfig = mockRequest.mock.calls[0][0];
    expect(requestConfig.url).toContain('/api/v1/games/game-types');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
