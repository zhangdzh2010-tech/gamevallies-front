/* eslint-env jest */
import { formatUserErrorMessage, isNetworkError, NETWORK_MESSAGE } from '../networkError';

test('maps browser Failed to fetch and Taro network failures to Chinese copy', () => {
  expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  expect(isNetworkError({ errMsg: 'request:fail timeout' })).toBe(true);
  expect(isNetworkError(new Error('广场数据格式错误'))).toBe(false);
  expect(formatUserErrorMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_MESSAGE);
  expect(formatUserErrorMessage(new Error('服务暂时不可用'))).toBe('服务暂时不可用');
  expect(formatUserErrorMessage({}, '广场暂时无法加载，请重试。')).toBe('广场暂时无法加载，请重试。');
});
