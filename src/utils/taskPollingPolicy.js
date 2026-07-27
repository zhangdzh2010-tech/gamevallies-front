/**
 * 生成任务轮询的自适应间隔策略(纯函数,便于单测)。
 *
 * 双通道背景:任务进度以 HTTP 轮询为准,WebSocket 推送仅用于触发立即刷新。
 * WS 健康时轮询只作兜底对账,放缓到慢间隔;WS 断开/未连接时恢复快间隔。
 */

/** WS 活跃窗口:超过该时长没有收到任何帧(含 engine.io ping)即视为不健康。 */
export const WS_HEALTH_WINDOW_MS = 60 * 1000;

/** WS 不健康时的快轮询间隔(与历史行为一致)。 */
export const TASK_POLL_INTERVALS_FAST = Object.freeze({
  taskMs: 4000,
  eventsMs: 2500,
});

/** WS 健康时的兜底慢轮询间隔。 */
export const TASK_POLL_INTERVALS_SLOW = Object.freeze({
  taskMs: 20000,
  eventsMs: 15000,
});

/**
 * 判定 WebSocket 连接是否健康。
 *
 * 健康 = 已连接 且 最近 healthWindowMs 内收到过帧(事件或心跳)。
 * 未连接、从未收到消息、活跃时间超窗均视为不健康。
 */
export function isWsHealthy({
  connected,
  lastActivityAt,
  now = Date.now(),
  healthWindowMs = WS_HEALTH_WINDOW_MS,
} = {}) {
  if (!connected) {
    return false;
  }
  if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) {
    return false;
  }
  return now - lastActivityAt <= healthWindowMs;
}

/**
 * 根据 WS 健康状态决定任务状态/事件轮询间隔。
 * @param {boolean} wsHealthy
 * @returns {{ taskMs: number, eventsMs: number }}
 */
export function decideTaskPollIntervals(wsHealthy) {
  return wsHealthy ? TASK_POLL_INTERVALS_SLOW : TASK_POLL_INTERVALS_FAST;
}
