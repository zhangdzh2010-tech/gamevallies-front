import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, value = 'true'] = entry.replace(/^--/, '').split('=');
    return [key, value];
  })
);

const BASE_URL = args.get('baseUrl') || process.env.GV_E2E_BASE_URL || 'https://gamevallies.com';
const API_BASE_URL = args.get('apiBaseUrl') || process.env.GV_E2E_API_BASE_URL || `${BASE_URL}/api/v1`;
const TOKEN_PATH = process.env.GV_E2E_TOKEN_PATH || '/tmp/gv_token.txt';
const ARTIFACT_DIR = process.env.GV_E2E_ARTIFACT_DIR || path.resolve('tmp/playwright-artifacts');
const ITERATE_GAME_ID = process.env.GV_E2E_ITERATE_GAME_ID || '4f0e467a-d8b0-4420-8ac9-33604189017c';
const FORK_SOURCE_GAME_ID = process.env.GV_E2E_FORK_SOURCE_GAME_ID || '37a543b4-ed14-4591-9af3-ff43864486e4';

const ROUNDS = Number(args.get('rounds') || process.env.GV_E2E_ROUNDS || 10);
const CONCURRENT_ROUNDS = Number(args.get('concurrentRounds') || process.env.GV_E2E_CONCURRENT_ROUNDS || 3);
const HEADLESS = (args.get('headed') || '').toLowerCase() !== 'true';

async function readToken() {
  const token = (await fs.readFile(TOKEN_PATH, 'utf8')).trim();
  assert(token, `Missing token at ${TOKEN_PATH}`);
  return token;
}

async function apiRequest(token, method, routePath, body) {
  const response = await fetch(`${API_BASE_URL}${routePath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    text,
    payload,
    data: payload?.data ?? null,
  };
}

async function apiGet(token, routePath, acceptedStatuses = [200]) {
  const result = await apiRequest(token, 'GET', routePath);
  if (!acceptedStatuses.includes(result.status)) {
    throw new Error(`GET ${routePath} failed: ${result.status} ${result.text}`);
  }
  return result;
}

async function apiPost(token, routePath, body = {}, acceptedStatuses = [200, 201]) {
  const result = await apiRequest(token, 'POST', routePath, body);
  if (!acceptedStatuses.includes(result.status)) {
    throw new Error(`POST ${routePath} failed: ${result.status} ${result.text}`);
  }
  return result;
}

async function getCurrentUser(token) {
  const result = await apiGet(token, '/users/me');
  return result.data;
}

async function getMyGames(token) {
  const result = await apiGet(token, '/games/my?page=1&limit=20');
  return result.data?.items || [];
}

async function getGame(token, gameId) {
  const result = await apiGet(token, `/games/${gameId}`);
  return result.data;
}

async function getActiveSession(token) {
  const result = await apiGet(token, '/games/creation-sessions/active', [200, 404]);
  return result.status === 404 ? null : result.data;
}

async function getTask(token, taskId) {
  const result = await apiGet(token, `/games/tasks/${taskId}`, [200, 404]);
  return result.status === 404 ? null : result.data;
}

async function abandonSession(token, sessionId) {
  return apiPost(token, `/games/creation-sessions/${sessionId}/abandon`, {}, [200, 201, 409]);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function clearActiveSession(token, label = 'cleanup') {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const active = await getActiveSession(token);
    if (!active) {
      return null;
    }

    if (active.status === 'generating') {
      if (active.generationTaskId) {
        const task = await getTask(token, active.generationTaskId);
        if (task && ['succeeded', 'failed', 'canceled', 'timed_out'].includes(task.status)) {
          await sleep(1500);
          continue;
        }
      }
      await sleep(3000);
      continue;
    }

    const abandonResult = await abandonSession(token, active.id || active.sessionId);
    if (abandonResult.status === 409) {
      await sleep(1500);
      continue;
    }

    await sleep(1000);
  }

  const active = await getActiveSession(token);
  throw new Error(`[${label}] active session could not be cleared: ${JSON.stringify(active)}`);
}

function wrapStorageValue(value) {
  return JSON.stringify({
    data: value,
    timestamp: Date.now(),
  });
}

async function createContext(browser, { token, user, iterateEntryGame = null }) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  });

  await context.addInitScript((payload) => {
    [
      'gamevallies_create_entry_intent',
      'gamevallies_active_generation_task',
      'gamevallies_tracked_generation_tasks',
      'gamevallies_post_login_redirect',
      'gamevallies_profile_active_tab',
    ].forEach((key) => localStorage.removeItem(key));

    localStorage.setItem('gamevallies_access_token', payload.token);
    localStorage.setItem('gamevallies_user', payload.user);

    if (payload.iterateEntryGame) {
      localStorage.setItem(
        'gamevallies_iterate_entry_game',
        JSON.stringify({
          ...payload.iterateEntryGame,
          createdAt: Date.now(),
        })
      );
    } else {
      localStorage.removeItem('gamevallies_iterate_entry_game');
    }
  }, {
    token: wrapStorageValue(token),
    user: wrapStorageValue(user),
    iterateEntryGame,
  });

  return context;
}

function attachDiagnostics(page, label) {
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const ignoredConsolePatterns = [
    /creation-sessions\/active.*404/i,
    /Failed to load resource: the server responded with a status of 404/i,
  ];

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') {
      return;
    }
    const text = msg.text();
    if (ignoredConsolePatterns.some((pattern) => pattern.test(text))) {
      return;
    }
    consoleErrors.push(text);
  });

  page.on('requestfailed', (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
  });

  return async (artifactName = label) => {
    if (!pageErrors.length && !consoleErrors.length && !requestFailures.length) {
      return;
    }

    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const screenshotPath = path.join(ARTIFACT_DIR, `${artifactName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    const detail = [
      pageErrors.length ? `pageerror:\n${pageErrors.join('\n')}` : '',
      consoleErrors.length ? `console:\n${consoleErrors.join('\n')}` : '',
      requestFailures.length ? `requestfailed:\n${requestFailures.join('\n')}` : '',
      `screenshot: ${screenshotPath}`,
    ].filter(Boolean).join('\n\n');

    throw new Error(`[${label}] 页面诊断失败\n${detail}`);
  };
}

async function setTaroFieldByPlaceholder(page, placeholder, value) {
  await page.waitForFunction((expectedPlaceholder) => {
    return Boolean(
      document.querySelector(`textarea[placeholder="${expectedPlaceholder}"]`)
      || document.querySelector(`input[placeholder="${expectedPlaceholder}"]`)
      || document.querySelector(`[placeholder="${expectedPlaceholder}"]`)
    );
  }, placeholder, { timeout: 15000 });

  await page.evaluate(({ expectedPlaceholder, nextValue }) => {
    const host = document.querySelector(`textarea[placeholder="${expectedPlaceholder}"]`)
      || document.querySelector(`input[placeholder="${expectedPlaceholder}"]`)
      || document.querySelector(`[placeholder="${expectedPlaceholder}"]`);

    if (!host) {
      throw new Error(`Missing field: ${expectedPlaceholder}`);
    }

    const target = host.matches('textarea, input')
      ? host
      : host.querySelector('textarea, input');

    if (target) {
      target.value = nextValue;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }

    host.value = nextValue;
    host.dispatchEvent(new CustomEvent('input', {
      bubbles: true,
      detail: { value: nextValue },
    }));
    host.dispatchEvent(new CustomEvent('change', {
      bubbles: true,
      detail: { value: nextValue },
    }));
  }, { expectedPlaceholder: placeholder, nextValue: value });
}

async function clickByText(page, text) {
  await page.getByText(text, { exact: true }).last().click();
}

async function waitForNoBlockingError(page, label) {
  const blockingTexts = [
    '创建创作会话失败',
    '加载要优化的作品失败',
    '刚才没把这一轮优化准备好',
    '刚才没把这一轮复刻准备好',
    '请从“我的作品”重新进入',
    '请从"我的作品"重新进入',
    '创作阶段遇到问题',
    '优化阶段遇到问题',
    '复刻阶段遇到问题',
  ];

  const bodyText = await page.locator('body').innerText();
  const hit = blockingTexts.find((text) => bodyText.includes(text));
  if (hit) {
    throw new Error(`[${label}] hit blocking page error: ${hit}\n${bodyText}`);
  }
}

async function waitForSessionScreen(page, label) {
  const deadline = Date.now() + 45000;

  while (Date.now() < deadline) {
    await waitForNoBlockingError(page, label);
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('重新开始')) {
      return bodyText;
    }
    if (bodyText.includes('继续上次创作') || bodyText.includes('继续上次优化') || bodyText.includes('继续上次复刻')) {
      throw new Error(`[${label}] unexpectedly landed on resume screen\n${bodyText}`);
    }
    await sleep(1000);
  }

  throw new Error(`[${label}] did not reach session screen within timeout`);
}

async function waitForProgressScreen(page, label) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    await waitForNoBlockingError(page, label);
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('生成进度') || bodyText.includes('优化进度') || bodyText.includes('复刻进度')) {
      return bodyText;
    }
    await sleep(1000);
  }
  throw new Error(`[${label}] did not reach progress screen within timeout`);
}

async function verifyIterateTaskCenterResume(page, label) {
  await page.evaluate(() => {
    localStorage.setItem('gamevallies_profile_active_tab', JSON.stringify({
      data: 'tasks',
      timestamp: Date.now(),
    }));
  });
  await page.goto(`${BASE_URL}/#/pages/profile/index`, { waitUntil: 'domcontentloaded' });

  const firstTaskCard = page.locator('.profile-task-card').first();
  await firstTaskCard.waitFor({ state: 'visible', timeout: 15000 });

  const cardText = await firstTaskCard.innerText();
  if (!cardText.includes('优化作品')) {
    throw new Error(`[${label}] task center did not classify iterate task as 优化作品\n${cardText}`);
  }
  if (cardText.includes('新建作品')) {
    throw new Error(`[${label}] iterate task card regressed to 新建作品\n${cardText}`);
  }

  await firstTaskCard.getByText('继续查看', { exact: true }).click();
  await page.waitForURL(/#\/pages\/game\/iterate\/index/, { timeout: 15000 });
  await waitForProgressScreen(page, `${label}-resume`);
}

async function waitForTaskTerminalAndClear(token, label) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const active = await getActiveSession(token);
    if (!active) {
      return null;
    }

    if (active.generationTaskId) {
      const task = await getTask(token, active.generationTaskId);
      if (task && ['succeeded', 'failed', 'canceled', 'timed_out'].includes(task.status)) {
        await sleep(2000);
        const maybeActive = await getActiveSession(token);
        if (!maybeActive) {
          return task;
        }
        if (maybeActive.status !== 'generating') {
          await abandonSession(token, maybeActive.id || maybeActive.sessionId).catch(() => null);
        }
      }
    }

    await sleep(3000);
  }

  throw new Error(`[${label}] task did not settle before timeout`);
}

async function runCreateFlow(browser, env, round, { triggerGenerate = false } = {}) {
  await clearActiveSession(env.token, `create-pre-${round}`);
  const context = await createContext(browser, env);
  const page = await context.newPage();
  const verifyDiagnostics = attachDiagnostics(page, `create-round-${round}`);
  const prompt = `做一个第${round}轮测试的接金币小游戏，左右滑动接金币，漏接会扣分`;

  try {
    await page.goto(`${BASE_URL}/#/pages/create/index`, { waitUntil: 'domcontentloaded' });
    await setTaroFieldByPlaceholder(page, '先说一句你想做什么游戏', prompt);
    await clickByText(page, '开始创作');
    await waitForSessionScreen(page, `create-round-${round}`);

    if (triggerGenerate) {
      await clickByText(page, '开始创作');
      await waitForProgressScreen(page, `create-generate-round-${round}`);
      await verifyDiagnostics(`create-round-${round}`);
      await context.close();
      await waitForTaskTerminalAndClear(env.token, `create-generate-round-${round}`);
      return { flow: 'create', round, generated: true, prompt };
    }

    await verifyDiagnostics(`create-round-${round}`);
    await context.close();
    await clearActiveSession(env.token, `create-post-${round}`);
    return { flow: 'create', round, generated: false, prompt };
  } catch (error) {
    await verifyDiagnostics(`create-round-${round}`).catch((diagnosticError) => {
      throw diagnosticError;
    });
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}

async function runIterateFlow(browser, env, round, { triggerGenerate = false } = {}) {
  await clearActiveSession(env.token, `iterate-pre-${round}`);
  const context = await createContext(browser, {
    ...env,
    iterateEntryGame: env.iterateGame,
  });
  const page = await context.newPage();
  const verifyDiagnostics = attachDiagnostics(page, `iterate-round-${round}`);
  const prompt = `把节奏做得更快一点，第${round}轮测试里重点优化反馈和关卡耐玩性`;

  try {
    await page.goto(`${BASE_URL}/#/pages/game/iterate/index?gameId=${env.iterateGame.id}`, { waitUntil: 'domcontentloaded' });
    await setTaroFieldByPlaceholder(page, '说说这次最想优化的部分', prompt);
    await clickByText(page, '开始优化');
    await waitForSessionScreen(page, `iterate-round-${round}`);

    if (triggerGenerate) {
      await clickByText(page, '开始优化');
      await waitForProgressScreen(page, `iterate-generate-round-${round}`);
      await verifyIterateTaskCenterResume(page, `iterate-generate-round-${round}`);
      await verifyDiagnostics(`iterate-round-${round}`);
      await context.close();
      await waitForTaskTerminalAndClear(env.token, `iterate-generate-round-${round}`);
      return { flow: 'iterate', round, generated: true, prompt };
    }

    await verifyDiagnostics(`iterate-round-${round}`);
    await context.close();
    await clearActiveSession(env.token, `iterate-post-${round}`);
    return { flow: 'iterate', round, generated: false, prompt };
  } catch (error) {
    await verifyDiagnostics(`iterate-round-${round}`).catch((diagnosticError) => {
      throw diagnosticError;
    });
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}

async function runForkFlow(browser, env, round, { triggerGenerate = false } = {}) {
  await clearActiveSession(env.token, `fork-pre-${round}`);
  const context = await createContext(browser, env);
  const page = await context.newPage();
  const verifyDiagnostics = attachDiagnostics(page, `fork-round-${round}`);
  const prompt = `保留核心玩法，第${round}轮测试里把上手引导更清楚，整体节奏更流畅`;

  try {
    await page.goto(`${BASE_URL}/#/pages/game/fork/index?sourceGameId=${env.forkSourceId}`, { waitUntil: 'domcontentloaded' });
    await setTaroFieldByPlaceholder(page, '说说你想保留什么、改变什么', prompt);
    await clickByText(page, '开始复刻');
    await waitForSessionScreen(page, `fork-round-${round}`);

    if (triggerGenerate) {
      await clickByText(page, '开始复刻');
      await waitForProgressScreen(page, `fork-generate-round-${round}`);
      await verifyDiagnostics(`fork-round-${round}`);
      await context.close();
      await waitForTaskTerminalAndClear(env.token, `fork-generate-round-${round}`);
      return { flow: 'fork', round, generated: true, prompt };
    }

    await verifyDiagnostics(`fork-round-${round}`);
    await context.close();
    await clearActiveSession(env.token, `fork-post-${round}`);
    return { flow: 'fork', round, generated: false, prompt };
  } catch (error) {
    await verifyDiagnostics(`fork-round-${round}`).catch((diagnosticError) => {
      throw diagnosticError;
    });
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}

async function runConcurrentProbe(browser, env, round) {
  await clearActiveSession(env.token, `concurrent-pre-${round}`);

  const flows = [
    () => runCreateFlow(browser, env, `concurrent-${round}-create`),
    () => runIterateFlow(browser, env, `concurrent-${round}-iterate`),
    () => runForkFlow(browser, env, `concurrent-${round}-fork`),
  ];

  const results = await Promise.allSettled(flows.map((runner) => runner()));
  await clearActiveSession(env.token, `concurrent-post-${round}`).catch(() => null);
  return results.map((result, index) => ({
    flow: ['create', 'iterate', 'fork'][index],
    status: result.status,
    reason: result.status === 'rejected' ? String(result.reason?.message || result.reason) : '',
  }));
}

async function buildEnvironment(token) {
  const user = await getCurrentUser(token);
  const games = await getMyGames(token);
  const exactIterateGame = await getGame(token, ITERATE_GAME_ID).catch(() => null);
  const iterateGame = exactIterateGame
    || games.find((game) => String(game.id) === ITERATE_GAME_ID)
    || games.find((game) => game.canPlay !== false && ['published', 'ready'].includes(game.status))
    || games[0];

  assert(iterateGame?.id, 'No valid iterate game found for live E2E');

  const forkSource = await getGame(token, FORK_SOURCE_GAME_ID);
  assert(forkSource?.id, `Fork source ${FORK_SOURCE_GAME_ID} is unavailable`);

  return {
    token,
    user,
    iterateGame,
    forkSourceId: forkSource.id,
  };
}

async function main() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const token = await readToken();
  const env = await buildEnvironment(token);
  const browser = await chromium.launch({ headless: HEADLESS });
  const sequentialResults = [];
  const concurrentResults = [];

  try {
    for (let round = 1; round <= ROUNDS; round += 1) {
      sequentialResults.push(await runCreateFlow(browser, env, round));
      sequentialResults.push(await runIterateFlow(browser, env, round));
      sequentialResults.push(await runForkFlow(browser, env, round));
    }

    for (let round = 1; round <= CONCURRENT_ROUNDS; round += 1) {
      concurrentResults.push({
        round,
        results: await runConcurrentProbe(browser, env, round),
      });
    }

    // Full generation handoff smoke once per flow after the stability loops.
    const generationSmoke = [];
    generationSmoke.push(await runCreateFlow(browser, env, 'smoke', { triggerGenerate: true }));
    generationSmoke.push(await runIterateFlow(browser, env, 'smoke', { triggerGenerate: true }));
    generationSmoke.push(await runForkFlow(browser, env, 'smoke', { triggerGenerate: true }));

    console.log(JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      rounds: ROUNDS,
      concurrentRounds: CONCURRENT_ROUNDS,
      iterateGameId: env.iterateGame.id,
      forkSourceId: env.forkSourceId,
      sequentialResults,
      concurrentResults,
      generationSmoke,
    }, null, 2));
  } finally {
    await browser.close();
    await clearActiveSession(token, 'final-cleanup').catch(() => null);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
