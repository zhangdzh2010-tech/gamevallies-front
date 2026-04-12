const fs = require('fs');
const path = require('path');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(FRONTEND_ROOT, '..', 'gamevallies-backend');
const ENV_PATH = path.join(BACKEND_ROOT, '.env.deploy');

function loadEnv(filePath) {
  const env = {};
  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const index = trimmed.indexOf('=');
    if (index <= 0) {
      return;
    }

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  });
  return env;
}

function unwrap(body) {
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data;
  }
  return body;
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);

  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
  });

  const text = await response.text();
  clearTimeout(timeoutId);

  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_error) {
      body = text;
    }
  }

  if (!response.ok) {
    const preview = typeof body === 'string'
      ? body.slice(0, 400)
      : JSON.stringify(body).slice(0, 400);
    throw new Error(`HTTP ${response.status} for ${url}: ${preview}`);
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    data: unwrap(body),
  };
}

async function adminCreateUser(baseUrl, adminToken, username, password) {
  return fetchJson(`${baseUrl}/api/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
    },
    body: JSON.stringify({
      username,
      displayName: username,
      password,
      role: 'user',
    }),
  });
}

async function adminDeleteUser(baseUrl, adminToken, userId) {
  return fetchJson(`${baseUrl}/api/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'x-admin-token': adminToken,
    },
  });
}

async function login(baseUrl, account, password) {
  return fetchJson(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account,
      password,
    }),
  });
}

async function createSession(baseUrl, token, prompt, title) {
  return fetchJson(`${baseUrl}/api/v1/games/creation-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt,
      title,
      orientation: 'portrait',
    }),
  });
}

async function getSession(baseUrl, token, sessionId) {
  return fetchJson(`${baseUrl}/api/v1/games/creation-sessions/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function appendMessage(baseUrl, token, sessionId, content, revision) {
  return fetchJson(`${baseUrl}/api/v1/games/creation-sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content,
      ...(revision != null ? { revision } : {}),
    }),
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSessionSettled(baseUrl, token, sessionId, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await getSession(baseUrl, token, sessionId);
    const session = response.data;
    const status = String(session?.status || '');

    if (status && status !== 'initializing') {
      return session;
    }

    if (status === 'abandoned') {
      throw new Error('Creation session became abandoned while waiting for initialization to settle');
    }

    await delay(1200);
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for session to leave initializing`);
}

function parseSseEventBlock(block) {
  const lines = block.split('\n');
  let eventName = 'message';
  const dataLines = [];

  lines.forEach((line) => {
    if (!line || line.startsWith(':')) {
      return;
    }

    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim() || 'message';
      return;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  if (!dataLines.length) {
    return null;
  }

  const rawData = dataLines.join('\n');
  let data = rawData;
  try {
    data = JSON.parse(rawData);
  } catch (_error) {
    // Keep the raw payload when it is not valid JSON.
  }

  return {
    event: eventName,
    data,
    rawData,
    receivedAt: new Date().toISOString(),
  };
}

async function openSseStream(url, headers, onEvent, signal) {
  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`SSE HTTP ${response.status}: ${errorText.slice(0, 400)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('SSE response body is not readable');
  }

  const responseHeaders = Object.fromEntries(response.headers.entries());
  const decoder = new TextDecoder();
  let buffer = '';

  const pump = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = parseSseEventBlock(block);
        if (parsed) {
          onEvent(parsed);
        }
        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    const tail = buffer.trim();
    if (tail) {
      const parsed = parseSseEventBlock(tail);
      if (parsed) {
        onEvent(parsed);
      }
    }
  })();

  return {
    responseHeaders,
    done: pump,
    close: async () => {
      try {
        await reader.cancel();
      } catch (_error) {
        // Ignore explicit reader cancel failures.
      }
    },
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getEventType(event) {
  const explicitType = typeof event?.event === 'string' ? event.event.trim() : '';
  if (explicitType && explicitType !== 'message') {
    return explicitType;
  }

  const dataType = typeof event?.data?.type === 'string' ? event.data.type.trim() : '';
  return dataType || explicitType || '';
}

function isEventType(event, ...types) {
  return types.includes(getEventType(event));
}

function buildStats(events) {
  return events.reduce((acc, item) => {
    const eventType = getEventType(item) || item.event || 'message';
    acc[eventType] = (acc[eventType] || 0) + 1;
    return acc;
  }, {});
}

function toEpochMs(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function detectIncrementalDelivery(events, minTimestamp = 0) {
  const deltas = events.filter((event) => (
    isEventType(event, 'delta', 'assistant.reply.delta')
    && Number(event?.data?.timestamp || 0) >= minTimestamp
  ));

  if (deltas.length < 2) {
    return false;
  }

  const receivedTimes = deltas
    .map((event) => toEpochMs(event.receivedAt))
    .filter(Boolean);

  if (receivedTimes.length < 2) {
    return false;
  }

  return Math.max(...receivedTimes) - Math.min(...receivedTimes) >= 1000;
}

function firstMatchingEvent(events, predicate) {
  return events.find(predicate) || null;
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const baseUrl = String(env.PUBLIC_API_BASE_URL || 'https://gamevallies.com').replace(/\/$/, '');
  const adminToken = env.ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error(`ADMIN_TOKEN is missing in ${ENV_PATH}`);
  }

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const username = `sse_probe_${stamp}`;
  const password = `Pw!${stamp}`;
  const prompt = 'Build a portrait puzzle game where each round lasts about two minutes and the player mainly uses tap and drag interactions.';
  const answer = 'The player wins by clearing all blockers on the board within a limited number of moves and earning three stars.';

  const outputDir = path.join(FRONTEND_ROOT, 'tmp_creation_session_sse');
  ensureDir(outputDir);
  const outputPath = path.join(outputDir, `verify_${stamp}.json`);

  let createdUserId = null;
  let accessToken = '';
  let sseAbortController = null;
  const events = [];

  const summary = {
    ok: false,
    testedAt: new Date().toISOString(),
    baseUrl,
    username,
    sessionId: '',
    createRevision: null,
    answerRevision: null,
    answerSubmittedAt: null,
    sseHeaders: null,
    eventCounts: {},
    totalEvents: 0,
    firstEventAt: null,
    lastEventAt: null,
    events: [],
    verification: {
      hasBootstrap: false,
      bootstrapCarriesSnapshot: false,
      bootstrapCarriesStreamPath: false,
      hasDeltaAfterAnswer: false,
      deltaCarriesAccumulated: false,
      hasDoneAfterAnswer: false,
      doneCarriesMessage: false,
      hasSnapshotAfterAnswer: false,
      snapshotCarriesSession: false,
      snapshotAdvancedRevision: false,
      contentTypeLooksCorrect: false,
      eventsArrivedIncrementally: false,
    },
  };

  try {
    console.log('[SSE] creating temporary user');
    const createUserResponse = await adminCreateUser(baseUrl, adminToken, username, password);
    createdUserId =
      createUserResponse?.data?.id
      || createUserResponse?.data?.userId
      || createUserResponse?.body?.data?.id
      || null;

    console.log('[SSE] logging in');
    const loginResponse = await login(baseUrl, username, password);
    accessToken = loginResponse?.data?.token || loginResponse?.data?.accessToken || '';
    if (!accessToken) {
      throw new Error('Login succeeded but no access token was returned');
    }

    console.log('[SSE] creating creation session');
    const createResponse = await createSession(baseUrl, accessToken, prompt, `SSE Probe ${stamp}`);
    const createdSession = createResponse.data;
    const sessionId = createdSession?.sessionId || createdSession?.id;
    if (!sessionId) {
      throw new Error('Create session succeeded but no sessionId was returned');
    }

    summary.sessionId = sessionId;
    summary.createRevision = createdSession?.revision ?? null;

    console.log(`[SSE] opening event stream for ${sessionId}`);
    sseAbortController = new AbortController();
    const { responseHeaders, done, close } = await openSseStream(
      `${baseUrl}/api/v1/games/creation-sessions/${sessionId}/events`,
      {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'text/event-stream',
        Cache: 'no-cache',
      },
      (parsedEvent) => {
        events.push(parsedEvent);
      },
      sseAbortController.signal,
    );

    summary.sseHeaders = responseHeaders;
    summary.verification.contentTypeLooksCorrect = String(responseHeaders['content-type'] || '').includes('text/event-stream');

    console.log('[SSE] waiting for session initialization to settle');
    const settledSession = await waitForSessionSettled(baseUrl, accessToken, sessionId, 45000);
    const answerRevision = settledSession?.revision ?? createdSession?.revision ?? undefined;
    summary.answerRevision = answerRevision ?? null;

    console.log('[SSE] submitting one answer round');
    const answerSubmittedAt = Date.now();
    summary.answerSubmittedAt = answerSubmittedAt;
    await appendMessage(baseUrl, accessToken, sessionId, answer, answerRevision);

    console.log('[SSE] collecting stream events');
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30000) {
      const hasDelta = events.some((event) => (
        isEventType(event, 'delta', 'assistant.reply.delta')
        && Number(event?.data?.timestamp || 0) >= answerSubmittedAt - 3000
      ));
      const hasDone = events.some((event) => (
        isEventType(event, 'done', 'assistant.reply.done')
        && Number(event?.data?.timestamp || 0) >= answerSubmittedAt - 3000
      ));
      const hasSnapshot = events.some((event) => (
        isEventType(event, 'snapshot', 'session.updated')
        && Number(event?.data?.session?.revision ?? event?.data?.revision ?? 0) > Number(answerRevision ?? 0)
      ));
      const hasError = events.some((event) => (
        isEventType(event, 'error', 'session.error')
        && Number(event?.data?.timestamp || 0) >= answerSubmittedAt - 3000
      ));

      if ((hasDelta && hasDone && hasSnapshot) || hasError) {
        break;
      }
      await delay(300);
    }

    sseAbortController.abort();
    await close();
    await Promise.race([
      done.catch((error) => {
        if (error?.name !== 'AbortError') {
          throw error;
        }
      }),
      delay(1000),
    ]);

    summary.eventCounts = buildStats(events);
    summary.totalEvents = events.length;
    summary.firstEventAt = events[0]?.receivedAt || null;
    summary.lastEventAt = events[events.length - 1]?.receivedAt || null;
    summary.events = events.slice(0, 80);

    const bootstrapEvent = firstMatchingEvent(events, (event) => isEventType(event, 'bootstrap', 'session.bootstrap'));
    const deltaEvent = firstMatchingEvent(events, (event) => (
      isEventType(event, 'delta', 'assistant.reply.delta')
      && Number(event?.data?.timestamp || 0) >= answerSubmittedAt - 3000
    ));
    const doneEvent = firstMatchingEvent(events, (event) => (
      isEventType(event, 'done', 'assistant.reply.done')
      && Number(event?.data?.timestamp || 0) >= answerSubmittedAt - 3000
    ));
    const snapshotEvent = firstMatchingEvent(events, (event) => (
      isEventType(event, 'snapshot', 'session.updated')
      && Number(event?.data?.timestamp || 0) >= answerSubmittedAt - 3000
    ));

    summary.verification.hasBootstrap = Boolean(bootstrapEvent);
    summary.verification.bootstrapCarriesSnapshot = Boolean(bootstrapEvent?.data?.session);
    summary.verification.bootstrapCarriesStreamPath = Boolean(
      typeof bootstrapEvent?.data?.session?.streamPath === 'string'
      && bootstrapEvent.data.session.streamPath.includes('/creation-sessions/')
      && bootstrapEvent.data.session.streamPath.endsWith('/events'),
    );
    summary.verification.hasDeltaAfterAnswer = Boolean(deltaEvent);
    summary.verification.deltaCarriesAccumulated = Boolean(
      typeof deltaEvent?.data?.delta === 'string'
      && typeof deltaEvent?.data?.accumulated === 'string',
    );
    summary.verification.hasDoneAfterAnswer = Boolean(doneEvent);
    summary.verification.doneCarriesMessage = Boolean(typeof doneEvent?.data?.message === 'string');
    summary.verification.hasSnapshotAfterAnswer = Boolean(snapshotEvent);
    summary.verification.snapshotCarriesSession = Boolean(snapshotEvent?.data?.session);
    summary.verification.snapshotAdvancedRevision = Boolean(
      Number(snapshotEvent?.data?.session?.revision ?? snapshotEvent?.data?.revision ?? 0) > Number(answerRevision ?? 0),
    );
    summary.verification.eventsArrivedIncrementally = detectIncrementalDelivery(events, answerSubmittedAt - 3000);

    const allChecksPassed = Object.values(summary.verification).every(Boolean);
    summary.ok = allChecksPassed;

    fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    if (!allChecksPassed) {
      throw new Error(`SSE verification failed: ${JSON.stringify(summary.verification)}`);
    }

    console.log('[SSE] verification passed');
    console.log(JSON.stringify({
      ok: true,
      outputPath,
      sessionId,
      eventCounts: summary.eventCounts,
      verification: summary.verification,
    }, null, 2));
  } catch (error) {
    summary.ok = false;
    summary.error = error.message;
    summary.eventCounts = buildStats(events);
    summary.totalEvents = events.length;
    summary.firstEventAt = events[0]?.receivedAt || null;
    summary.lastEventAt = events[events.length - 1]?.receivedAt || null;
    summary.events = events.slice(0, 80);
    fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      outputPath,
      eventCounts: summary.eventCounts,
      verification: summary.verification,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (sseAbortController) {
      try {
        sseAbortController.abort();
      } catch (_error) {
        // Ignore cleanup failures.
      }
    }

    if (createdUserId) {
      console.log('[SSE] cleaning up temporary user');
      await adminDeleteUser(baseUrl, adminToken, createdUserId).catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
