/* eslint-env jest */
import { buildCreativePrompt, saveCreativeDraft, consumeCreativeDraft, normalizeWorks } from '../creativeModel';

afterEach(() => { sessionStorage.clear(); jest.restoreAllMocks(); });
test('preserves an original science idea and adds scientific constraints without requiring a game', () => {
  const result = buildCreativePrompt('比较两组双摆的运动轨迹', 'physics', 'experiment');
  expect(result).toContain('比较两组双摆的运动轨迹');
  expect(result).toContain('物理规律');
  expect(result).toContain('单位、参数范围与简化假设');
  expect(result).toContain('不要自动添加积分、输赢、关卡');
});
test('supports biological and chemical ideas and keeps art open-ended', () => {
  for (const domain of ['biology', 'chemistry']) expect(buildCreativePrompt('观察变量变化', domain)).toContain('不编造实验数据');
  expect(buildCreativePrompt('画一个声音的世界', 'art', 'exploration')).toContain('自由操作和即时反馈');
  expect(buildCreativePrompt('画一个声音的世界', 'art')).not.toContain('定量计算');
});
test('preserves the creative draft across login and consumes it exactly once', () => {
  expect(saveCreativeDraft({ prompt: '一个细胞生长模型', domain: 'biology' })).toBe(true);
  expect(consumeCreativeDraft()).toMatchObject({ prompt: '一个细胞生长模型', domain: 'biology' });
  expect(consumeCreativeDraft()).toBeNull();
});
test('does not revive an expired or malformed draft', () => {
  jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(31 * 60 * 1000);
  saveCreativeDraft({ prompt: '过期的创意' });
  expect(consumeCreativeDraft()).toBeNull();
  sessionStorage.setItem('gamevallies.creative-web.draft.v1', '{bad json');
  expect(consumeCreativeDraft()).toBeNull();
});
test('never fills a failed or empty work list with demonstration projects', () => {
  expect(normalizeWorks(null)).toEqual([]);
  expect(normalizeWorks({ items: [{ id: 'real-work' }] })).toEqual([{ id: 'real-work' }]);
});
