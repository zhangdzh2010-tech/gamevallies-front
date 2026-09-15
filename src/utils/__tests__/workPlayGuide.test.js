/* eslint-env jest */
import { EMPTY_PLAY_GUIDE, getWorkPlayGuide } from '../workPlayGuide';

test('prefers dedicated howto fields over description', () => {
  expect(getWorkPlayGuide({
    description: '作品简介',
    playGuide: '拖动滑块改变温度',
  })).toEqual({ text: '拖动滑块改变温度', empty: false });
  expect(getWorkPlayGuide({
    description: '作品简介',
    howto: '点击开始后观察曲线',
  }).text).toBe('点击开始后观察曲线');
  expect(getWorkPlayGuide({ description: '  调节摆长  ' }).text).toBe('调节摆长');
});

test('play payload howto wins over the cached work description', () => {
  expect(getWorkPlayGuide(
    { description: '旧简介' },
    { playGuide: '新玩法' },
  ).text).toBe('新玩法');
});

test('empty work still returns a stable fallback', () => {
  expect(getWorkPlayGuide(null)).toEqual({ text: EMPTY_PLAY_GUIDE, empty: true });
  expect(getWorkPlayGuide({ title: '未命名', description: '   ' })).toEqual({
    text: EMPTY_PLAY_GUIDE,
    empty: true,
  });
});
