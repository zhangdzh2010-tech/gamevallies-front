import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Storage } from '../../utils/storage';
import { readWorkStorage, saveWorkMessage, withWorkStorage, workStorageKey } from '../../utils/workStorageBridge';

export default function WorkSandbox({ html, src, workId, ...props }) {
  const frame = useRef(null);
  const [fetched, setFetched] = useState('');
  const [error, setError] = useState('');
  const user = Storage.getUser() || {};
  const key = workStorageKey(user.id || user.userId, workId);
  const channel = useMemo(() => `work-${Date.now()}-${Math.random().toString(36).slice(2)}`, [key]);
  useEffect(() => {
    if (!src) return undefined;
    let active = true;
    setFetched(''); setError('');
    // Public works remain accessible without an authenticated play request.
    fetch(src, { credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(response => { if (!response.ok) throw new Error('作品暂时无法加载，请关闭后重试。'); return response.text(); })
      .then(value => { if (active) setFetched(value); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [src]);
  const content = useMemo(() => {
    const source = html || fetched;
    if (!source) return '';
    let values = {};
    try { values = readWorkStorage(window.localStorage, key); } catch { /* private browsing */ }
    return withWorkStorage(source, values, channel);
  }, [html, fetched, key, channel]);
  useEffect(() => {
    const receive = event => {
      try { saveWorkMessage(event, frame.current?.contentWindow, channel, window.localStorage, key); }
      catch { /* The embedded work retains an in-memory copy if persistence is blocked. */ }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [key, channel]);
  if (error) return <p role="alert">{error}</p>;
  if (!content) return <p role="status">正在加载作品…</p>;
  return <iframe {...props} ref={frame} srcDoc={content} sandbox="allow-scripts" referrerPolicy="no-referrer" />;
}
