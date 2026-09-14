/* eslint-env jest */
import {
  isSamePublicSite,
  normalizeOrigin,
  preferRelativeBase,
} from '../sameOriginBase';

test('treats www and apex as the same public site', () => {
  expect(isSamePublicSite('https://www.zlspace.ai', 'https://zlspace.ai')).toBe(true);
  expect(isSamePublicSite('https://zlspace.ai/', 'https://www.zlspace.ai')).toBe(true);
  expect(isSamePublicSite('https://www.zlspace.ai', 'https://www.zlspace.ai')).toBe(true);
  expect(isSamePublicSite('https://www.zlspace.ai', 'https://content.zlspace.ai')).toBe(false);
  expect(isSamePublicSite('http://www.zlspace.ai', 'https://www.zlspace.ai')).toBe(false);
});

test('uses a relative base when SERVICE_URLS already match the page host', () => {
  expect(preferRelativeBase('https://www.zlspace.ai', 'https://www.zlspace.ai/square')).toBe('');
  expect(preferRelativeBase('https://www.zlspace.ai/', 'https://zlspace.ai')).toBe('');
  expect(preferRelativeBase('https://www.zlspace.ai', 'http://localhost:10086')).toBe('https://www.zlspace.ai');
  expect(preferRelativeBase('', 'https://www.zlspace.ai')).toBe('');
  expect(normalizeOrigin('https://www.zlspace.ai/api')).toBe('https://www.zlspace.ai');
});
