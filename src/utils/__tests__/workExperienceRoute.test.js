/* eslint-env jest */

const mockRedirectTo = jest.fn(() => Promise.resolve());
const mockReLaunch = jest.fn(() => Promise.resolve());
const mockNavigateTo = jest.fn(() => Promise.resolve());

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    redirectTo: (...args) => mockRedirectTo(...args),
    reLaunch: (...args) => mockReLaunch(...args),
    navigateTo: (...args) => mockNavigateTo(...args),
  },
}));

const {
  WORK_EXPERIENCE_PAGE_PATH,
  buildWorkExperiencePath,
  consumePendingExperienceWork,
  isMobileWorkShellPath,
  isPcWorkExperiencePath,
  openWorkExperience,
  parseH5HashRoute,
  redirectWorkShellIfMismatched,
  registerWorkExperienceOverlayHost,
  rememberExperienceWork,
  resolveWorkOpenPath,
  shouldBlockWorkShell,
  syncH5WorkShellRoute,
  unregisterWorkExperienceOverlayHost,
} = require('../workExperienceRoute');

describe('work experience routes', () => {
  const previousEnv = process.env.TARO_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    unregisterWorkExperienceOverlayHost();
    process.env.TARO_ENV = 'h5';
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  });

  afterEach(() => {
    process.env.TARO_ENV = previousEnv;
  });

  test('builds a dedicated PC experience path', () => {
    expect(buildWorkExperiencePath('work-1')).toBe('/pages/game/experience/index?id=work-1');
    expect(isPcWorkExperiencePath(WORK_EXPERIENCE_PAGE_PATH)).toBe(true);
    expect(isMobileWorkShellPath('/pages/game/detail/index?id=work-1')).toBe(true);
    expect(isMobileWorkShellPath('/pages/game/play/index')).toBe(true);
    expect(isMobileWorkShellPath('/pages/game/play-landscape/index')).toBe(true);
    expect(isMobileWorkShellPath(WORK_EXPERIENCE_PAGE_PATH)).toBe(false);
  });

  test('desktop H5 opens the PC experience, phone H5 and weapp keep mobile detail', () => {
    expect(resolveWorkOpenPath('pub-1')).toBe('/pages/game/experience/index?id=pub-1');
    window.innerWidth = 390;
    expect(resolveWorkOpenPath('pub-1')).toBe('/pages/game/detail/index?id=pub-1');
    process.env.TARO_ENV = 'weapp';
    window.innerWidth = 1440;
    expect(resolveWorkOpenPath('pub-1')).toBe('/pages/game/detail/index?id=pub-1');
  });

  test('stores a one-use experience snapshot for the matching work id', () => {
    rememberExperienceWork({ id: 'keep-1', title: '双摆', author: '智了' });
    expect(consumePendingExperienceWork('other')).toBeNull();
    rememberExperienceWork({ id: 'keep-1', title: '双摆', author: '智了' });
    expect(consumePendingExperienceWork('keep-1')).toMatchObject({ id: 'keep-1', title: '双摆' });
    expect(consumePendingExperienceWork('keep-1')).toBeNull();
  });

  test('parses H5 hashes and redirects desktop visits away from mobile shells', () => {
    expect(parseH5HashRoute('#/pages/game/detail/index?id=pub-9')).toEqual({
      path: '/pages/game/detail/index',
      params: { id: 'pub-9' },
    });
    expect(shouldBlockWorkShell('/pages/game/detail/index')).toBe(true);
    expect(redirectWorkShellIfMismatched({
      path: '/pages/game/play/index',
      workId: 'pub-9',
    })).toBe(true);
    expect(mockRedirectTo).toHaveBeenCalledWith({ url: '/pages/game/experience/index?id=pub-9' });
  });

  test('redirects phone-width visits away from the PC experience shell', () => {
    window.innerWidth = 390;
    expect(shouldBlockWorkShell('/pages/game/experience/index')).toBe(true);
    expect(syncH5WorkShellRoute('#/pages/game/experience/index?id=pub-9')).toBe(true);
    expect(mockRedirectTo).toHaveBeenCalledWith({ url: '/pages/game/detail/index?id=pub-9' });
  });

  test('PC clicks open an overlay host instead of navigating to the experience page', () => {
    const open = jest.fn();
    registerWorkExperienceOverlayHost(open);
    expect(openWorkExperience({ id: 'pub-1', title: '摆' })).toEqual({
      overlay: true,
      work: expect.objectContaining({ id: 'pub-1', title: '摆' }),
    });
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'pub-1' }));
    expect(mockNavigateTo).not.toHaveBeenCalled();
    unregisterWorkExperienceOverlayHost();
  });

  test('PC clicks without a host fall back to the experience deep-link route', () => {
    openWorkExperience({ id: 'pub-1', title: '摆' });
    expect(mockNavigateTo).toHaveBeenCalledWith({ url: '/pages/game/experience/index?id=pub-1' });
  });

  test('phone clicks keep the mobile detail path even when a host is registered', () => {
    registerWorkExperienceOverlayHost(jest.fn());
    window.innerWidth = 390;
    openWorkExperience({ id: 'pub-1' });
    expect(mockNavigateTo).toHaveBeenCalledWith({ url: '/pages/game/detail/index?id=pub-1' });
    unregisterWorkExperienceOverlayHost();
  });

  test('does not redirect weapp or already-correct shells', () => {
    expect(redirectWorkShellIfMismatched({
      path: '/pages/game/experience/index',
      workId: 'pub-9',
    })).toBe(false);
    process.env.TARO_ENV = 'weapp';
    expect(syncH5WorkShellRoute('#/pages/game/detail/index?id=pub-9')).toBe(false);
    expect(mockRedirectTo).not.toHaveBeenCalled();
  });
});
