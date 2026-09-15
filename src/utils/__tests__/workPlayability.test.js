/* eslint-env jest */
import { isPlayableWorkId } from '../workPlayability';

test('KEEP marketing ids are not playable', () => {
  expect(isPlayableWorkId('keep-pendulum')).toBe(false);
  expect(isPlayableWorkId('keep-photosynthesis')).toBe(false);
  expect(isPlayableWorkId('  KEEP-orbit-play  ')).toBe(false);
  expect(isPlayableWorkId('pub-1')).toBe(true);
  expect(isPlayableWorkId('')).toBe(false);
  expect(isPlayableWorkId(null)).toBe(false);
});
