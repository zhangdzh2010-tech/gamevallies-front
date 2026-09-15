/* eslint-env jest */
import { isPlayableWorkId } from '../../../utils/workPlayability';
import {
  adaptPublicWork,
  filterWorks,
  inferWorkDomain,
  isPhotosynthesisWork,
  KEEP_WORKS,
  pickPhotosynthesisWork,
} from '../keepWorks';

test('KEEP ids are not treated as playable works', () => {
  expect(KEEP_WORKS.every((work) => !isPlayableWorkId(work.id))).toBe(true);
  expect(isPlayableWorkId('pub-photo')).toBe(true);
});

test('KEEP list covers every landing filter without AI 游戏工坊 copy', () => {
  const domains = new Set(KEEP_WORKS.map((work) => work.domain));
  expect(domains.has('physics')).toBe(true);
  expect(domains.has('chemistry')).toBe(true);
  expect(domains.has('biology')).toBe(true);
  expect(JSON.stringify(KEEP_WORKS)).not.toMatch(/AI 游戏工坊/);
});

test('photosynthesis band prefers a published cover then the KEEP slot', () => {
  const keep = KEEP_WORKS.find((work) => work.id === 'keep-photosynthesis');
  expect(isPhotosynthesisWork(keep)).toBe(true);
  expect(pickPhotosynthesisWork(KEEP_WORKS)?.id).toBe('keep-photosynthesis');
  expect(pickPhotosynthesisWork(KEEP_WORKS)?.coverUrl).toBeFalsy();
  const covered = { id: 'api-photo', title: '光合产氧', coverUrl: 'https://cdn.example.com/o2.png' };
  expect(pickPhotosynthesisWork([covered, ...KEEP_WORKS]).coverUrl).toBe('https://cdn.example.com/o2.png');
  expect(pickPhotosynthesisWork([{ id: 'other', title: '单摆' }])).toBeNull();
});

test('public works infer domain from title tags and can be filtered', () => {
  const work = adaptPublicWork({ id: '1', title: '光合产氧', description: '生物学示意' });
  expect(inferWorkDomain(work)).toBe('biology');
  expect(filterWorks([work], 'biology')).toHaveLength(1);
  expect(filterWorks([work], 'physics')).toHaveLength(0);
});

test('adapted public works expose a display author for title-only cards', () => {
  expect(adaptPublicWork({ id: '1', title: '光合产氧', author: { displayName: '林栖' } }).author).toBe('林栖');
  expect(adaptPublicWork({ id: '2', title: '单摆' }).author).toBe('创作者');
  expect(KEEP_WORKS.every((work) => work.author)).toBe(true);
});
