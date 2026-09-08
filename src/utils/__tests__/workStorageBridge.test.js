/* eslint-env jest */
import vm from 'vm';
import { readWorkStorage, saveWorkMessage, withWorkStorage, workStorageKey, WORK_STORAGE_LIMIT } from '../workStorageBridge';

test('sandbox storage supports save, restore and clear without exposing host storage', () => {
  const messages = [];
  const child = {};
  Object.defineProperty(child, 'localStorage', { configurable: true, get() { throw new Error('sandbox origin'); } });
  const html = withWorkStorage('<!doctype html><html><script>original()</script></html>', {colors:'["#abcdef"]'}, 'channel-a');
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(code, {window:child,parent:{postMessage:value=>messages.push(value)},DOMException});
  expect(child.localStorage.getItem('colors')).toBe('["#abcdef"]');
  expect(child.localStorage.getItem('authToken')).toBeNull();
  child.localStorage.setItem('favorites', '[1,2]');
  expect(messages[0].values.favorites).toBe('[1,2]');
  child.sessionStorage.setItem('temporary','x');
  expect(messages).toHaveLength(1);
  expect(() => child.localStorage.setItem('huge', 'x'.repeat(WORK_STORAGE_LIMIT))).toThrow();
  child.localStorage.clear();
  expect(child.localStorage.length).toBe(0);
});

test('only the bound iframe and channel can save a bounded work-specific record', () => {
  const data = new Map([['authToken','private-host-token']]);
  const host = {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const source = {};
  const key = workStorageKey('user-a','work-a');
  const message = {source,data:{type:'work-storage',channel:'a',values:{saved:'palette'}}};
  expect(saveWorkMessage({...message,source:{}},source,'a',host,key)).toBe(false);
  expect(saveWorkMessage(message,source,'b',host,key)).toBe(false);
  expect(saveWorkMessage(message,source,'a',host,key)).toBe(true);
  expect(readWorkStorage(host,key)).toEqual({saved:'palette'});
  expect(readWorkStorage(host,workStorageKey('user-b','work-a'))).toEqual({});
  expect(readWorkStorage(host,workStorageKey('user-a','work-b'))).toEqual({});
  expect(host.getItem('authToken')).toBe('private-host-token');
  expect(saveWorkMessage({...message,data:{...message.data,values:{bad:123}}},source,'a',host,key)).toBe(false);
});

test('stored HTML-like text cannot escape the bootstrap script', () => {
  const html = withWorkStorage('<p>work</p>', {value:'</script><script>attack()</script>'}, 'a');
  expect(html.match(/<script>/g)).toHaveLength(1);
  expect(html).toContain('\\u003c/script>');
});
