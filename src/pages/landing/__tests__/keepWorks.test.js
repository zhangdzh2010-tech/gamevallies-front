/* eslint-env jest */
import { adaptPublicWork, filterWorks, inferWorkDomain, KEEP_WORKS } from '../keepWorks';

test('KEEP list covers every landing filter without AI 游戏工坊 copy', () => {
  const domains = new Set(KEEP_WORKS.map((work) => work.domain));
  expect(domains.has('physics')).toBe(true);
  expect(domains.has('chemistry')).toBe(true);
  expect(domains.has('biology')).toBe(true);
  expect(JSON.stringify(KEEP_WORKS)).not.toMatch(/AI 游戏工坊/);
});

test('public works infer domain from title tags and can be filtered', () => {
  const work = adaptPublicWork({ id: '1', title: '光合产氧', description: '生物学示意' });
  expect(inferWorkDomain(work)).toBe('biology');
  expect(filterWorks([work], 'biology')).toHaveLength(1);
  expect(filterWorks([work], 'physics')).toHaveLength(0);
});
