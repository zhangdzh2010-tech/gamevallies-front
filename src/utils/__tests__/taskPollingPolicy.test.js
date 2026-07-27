/* eslint-env jest */
const {
  WS_HEALTH_WINDOW_MS,
  TASK_POLL_INTERVALS_FAST,
  TASK_POLL_INTERVALS_SLOW,
  isWsHealthy,
  decideTaskPollIntervals,
} = require('../taskPollingPolicy');

describe('taskPollingPolicy', () => {
  describe('decideTaskPollIntervals', () => {
    test('WS 健康时使用慢间隔(兜底对账)', () => {
      expect(decideTaskPollIntervals(true)).toEqual({ taskMs: 20000, eventsMs: 15000 });
      expect(decideTaskPollIntervals(true)).toBe(TASK_POLL_INTERVALS_SLOW);
    });

    test('WS 不健康时恢复历史快间隔', () => {
      expect(decideTaskPollIntervals(false)).toEqual({ taskMs: 4000, eventsMs: 2500 });
      expect(decideTaskPollIntervals(false)).toBe(TASK_POLL_INTERVALS_FAST);
    });
  });

  describe('isWsHealthy', () => {
    const now = 1_000_000;

    test('未连接一律不健康', () => {
      expect(isWsHealthy({ connected: false, lastActivityAt: now, now })).toBe(false);
    });

    test('已连接但从未收到帧时不健康', () => {
      expect(isWsHealthy({ connected: true, lastActivityAt: 0, now })).toBe(false);
      expect(isWsHealthy({ connected: true, lastActivityAt: undefined, now })).toBe(false);
    });

    test('活跃时间在窗口内(含边界)为健康', () => {
      expect(isWsHealthy({ connected: true, lastActivityAt: now - 1000, now })).toBe(true);
      expect(
        isWsHealthy({ connected: true, lastActivityAt: now - WS_HEALTH_WINDOW_MS, now })
      ).toBe(true);
    });

    test('活跃时间超窗视为不健康(静默死连接回退快轮询)', () => {
      expect(
        isWsHealthy({ connected: true, lastActivityAt: now - WS_HEALTH_WINDOW_MS - 1, now })
      ).toBe(false);
    });

    test('缺省参数(空调用)不抛错且判定不健康', () => {
      expect(isWsHealthy()).toBe(false);
      expect(isWsHealthy({})).toBe(false);
    });
  });
});
