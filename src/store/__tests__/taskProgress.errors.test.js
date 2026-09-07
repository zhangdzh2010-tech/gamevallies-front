import { deriveTaskErrorMessage } from '../game/taskProgress';
jest.mock('../../services/game', () => ({}));

test('terminal timeout does not suggest a result is still being generated', () => {
  expect(deriveTaskErrorMessage({status:'timed_out'})).toContain('已超时并停止');
  expect(deriveTaskErrorMessage({status:'failed',errorMessage:'Pipeline timed out'})).toContain('已超时并停止');
});
test('a transient poll timeout does not mark the running task as failed', () => {
  expect(deriveTaskErrorMessage({status:'running',errorMessage:'request:fail timeout'})).toContain('查看任务状态');
});
test('exhausted worker recovery has a distinct explanation', () => {
  expect(deriveTaskErrorMessage({status:'failed',failureFamily:'worker_interrupted'})).toContain('自动恢复未能完成');
});
