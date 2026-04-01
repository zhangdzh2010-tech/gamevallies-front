import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:4173';

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      code: status >= 400 ? status : 0,
      message: status >= 400 ? 'error' : 'success',
      data: body,
    }),
  };
}

function errorJson(message, status = 400) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      code: status,
      message,
      data: null,
    }),
  };
}

function buildAuthStorage() {
  return {
    token: 'playwright-token',
    user: {
      id: 'user-1',
      username: 'playwright_user',
      displayName: 'Playwright User',
    },
  };
}

async function createContext(browser, extraStorage = {}) {
  const context = await browser.newContext();
  const storage = {
    ...buildAuthStorage(),
    ...extraStorage,
  };

  await context.addInitScript((payload) => {
    const wrap = (value) => JSON.stringify({
      data: value,
      timestamp: Date.now(),
    });

    localStorage.setItem('gamevallies_access_token', wrap(payload.token));
    localStorage.setItem('gamevallies_user', wrap(payload.user));

    if (payload.iterateEntryGame) {
      localStorage.setItem('gamevallies_iterate_entry_game', JSON.stringify({
        ...payload.iterateEntryGame,
        createdAt: Date.now(),
      }));
    }
  }, storage);

  return context;
}

function attachDiagnostics(page, label) {
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const ignoredConsolePatterns = [
    /creation-sessions\/active: not found/i,
    /Failed to load resource: the server responded with a status of 404/i,
  ];

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (ignoredConsolePatterns.some((pattern) => pattern.test(text))) {
        return;
      }
      consoleErrors.push(text);
    }
  });

  page.on('requestfailed', (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
  });

  return () => {
    if (pageErrors.length || consoleErrors.length || requestFailures.length) {
      const detail = [
        pageErrors.length ? `pageerror:\n${pageErrors.join('\n')}` : '',
        consoleErrors.length ? `console:\n${consoleErrors.join('\n')}` : '',
        requestFailures.length ? `requestfailed:\n${requestFailures.join('\n')}` : '',
      ].filter(Boolean).join('\n\n');

      throw new Error(`[${label}] 页面诊断失败\n${detail}`);
    }
  };
}

async function installRoutes(page, scenario) {
  const requestLog = [];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const postData = request.postData() || '';
    const body = postData ? JSON.parse(postData) : null;
    requestLog.push({ method, path, body });

    if (path === '/api/v1/games/creation-sessions/active' && method === 'GET') {
      await route.fulfill(errorJson('not found', 404));
      return;
    }

    if (path === '/api/v1/games/game-1' && method === 'GET') {
      await route.fulfill(json({
        id: 'game-1',
        title: '贪吃蛇',
        status: 'ready',
        description: '一款节奏很快的贪吃蛇小游戏',
        orientation: 'portrait',
        canPlay: true,
        qualityScore: 9.7,
      }));
      return;
    }

    if (path === '/api/v1/games/game-1/generation-status' && method === 'GET') {
      await route.fulfill(json(null));
      return;
    }

    if (path === '/api/v1/games/source-1' && method === 'GET') {
      await route.fulfill(json({
        id: 'source-1',
        title: '节奏达人',
        status: 'published',
        description: '一款节奏点击游戏',
        orientation: 'portrait',
        allowFork: true,
        plays: 6600,
        likes: 891,
        forks: 190,
        author: { id: 'author-1', displayName: 'seed_creator' },
      }));
      return;
    }

    if (path === '/api/v1/games/creation-sessions' && method === 'POST') {
      if (!body?.entryMode || body?.entryMode === 'create') {
        await route.fulfill(json({
          id: 'create-session-1',
          status: 'collecting',
          revision: 1,
          entryMode: 'create',
          titleDraft: body.title || '2048',
          initialPrompt: body.prompt,
          orientation: body.orientation || 'portrait',
          conversation: [
            { id: 'msg-user-create-1', role: 'user', content: body.prompt },
          ],
          currentQuestion: {
            id: 'question-create-1',
            slotKey: 'win_condition',
            prompt: '这局里玩家怎样算赢？',
            placeholder: '例如：合成到 2048',
            required: true,
            options: ['合成到 2048', '达到指定分数'],
          },
        }));
        return;
      }

      if (body?.entryMode === 'iterate') {
        await route.fulfill(json({
          id: 'iterate-session-1',
          status: 'ready',
          revision: 5,
          entryMode: 'iterate',
          titleDraft: '贪吃蛇',
          initialPrompt: body.prompt,
          sourceGameId: 'game-1',
          orientation: 'portrait',
          conversation: [
            { id: 'msg-user-iterate-1', role: 'user', content: body.prompt },
          ],
        }));
        return;
      }

      if (body?.entryMode === 'fork') {
        await route.fulfill(json({
          id: 'fork-session-1',
          status: 'ready',
          revision: 7,
          entryMode: 'fork',
          titleDraft: '节奏达人',
          initialPrompt: body.prompt,
          sourceGameId: 'source-1',
          orientation: 'portrait',
          conversation: [
            { id: 'msg-user-fork-1', role: 'user', content: body.prompt },
          ],
        }));
        return;
      }
    }

    if (path === '/api/v1/games/creation-sessions/create-session-1/messages' && method === 'POST') {
      await route.fulfill(json({
        id: 'create-session-1',
        status: 'ready',
        revision: 2,
        entryMode: 'create',
        titleDraft: '2048',
        initialPrompt: '做一个 2048 游戏',
        orientation: 'portrait',
        conversation: [
          { id: 'msg-user-create-1', role: 'user', content: '做一个 2048 游戏' },
          { id: 'msg-user-create-2', role: 'user', content: body.content },
        ],
      }));
      return;
    }

    if (path === '/api/v1/games/creation-sessions/create-session-1/generate' && method === 'POST') {
      scenario.createGenerateBody = body;
      await route.fulfill(json({
        id: 'create-session-1',
        status: 'generating',
        revision: 3,
        entryMode: 'create',
        generatedGameId: 'created-game-1',
        generationTaskId: 'task-create-1',
      }));
      return;
    }

    if (path === '/api/v1/games/creation-sessions/iterate-session-1/generate' && method === 'POST') {
      scenario.iterateGenerateBody = body;
      await route.fulfill(json({
        id: 'iterate-session-1',
        status: 'generating',
        revision: 6,
        entryMode: 'iterate',
        sourceGameId: 'game-1',
        generatedGameId: 'iterated-game-1',
        generationTaskId: 'task-iterate-1',
      }));
      return;
    }

    if (path === '/api/v1/games/creation-sessions/fork-session-1/generate' && method === 'POST') {
      scenario.forkGenerateBody = body;
      await route.fulfill(json({
        id: 'fork-session-1',
        status: 'generating',
        revision: 8,
        entryMode: 'fork',
        sourceGameId: 'source-1',
        generatedGameId: 'forked-game-1',
        generationTaskId: 'task-fork-1',
      }));
      return;
    }

    if (path === '/api/v1/games/tasks/task-create-1' && method === 'GET') {
      await route.fulfill(json({
        taskId: 'task-create-1',
        taskType: 'pipeline_run',
        status: 'running',
        gameId: 'created-game-1',
        progressPct: 40,
        displayStageLabel: '生成游戏逻辑',
        displayStageIndex: 2,
        displayStagePct: 40,
      }));
      return;
    }

    if (path === '/api/v1/games/tasks/task-iterate-1' && method === 'GET') {
      await route.fulfill(json({
        taskId: 'task-iterate-1',
        taskType: 'pipeline_iterate',
        status: 'running',
        gameId: 'iterated-game-1',
        progressPct: 35,
        displayStageLabel: '生成游戏逻辑',
        displayStageIndex: 2,
        displayStagePct: 35,
      }));
      return;
    }

    if (path === '/api/v1/games/tasks/task-fork-1' && method === 'GET') {
      await route.fulfill(json({
        taskId: 'task-fork-1',
        taskType: 'pipeline_run',
        status: 'running',
        gameId: 'forked-game-1',
        progressPct: 45,
        displayStageLabel: '生成游戏逻辑',
        displayStageIndex: 2,
        displayStagePct: 45,
      }));
      return;
    }

    if (/^\/api\/v1\/games\/tasks\/task-(create|iterate|fork)-1\/events$/.test(path) && method === 'GET') {
      await route.fulfill(json([]));
      return;
    }

    if (path === '/api/v1/games/created-game-1' && method === 'GET') {
      await route.fulfill(json({
        id: 'created-game-1',
        title: '2048',
        status: 'ready',
        orientation: 'portrait',
        canPlay: true,
      }));
      return;
    }

    if (path === '/api/v1/games/iterated-game-1' && method === 'GET') {
      await route.fulfill(json({
        id: 'iterated-game-1',
        title: '贪吃蛇强化版',
        status: 'ready',
        orientation: 'portrait',
        canPlay: true,
        qualityScore: 9.9,
      }));
      return;
    }

    if (path === '/api/v1/games/forked-game-1' && method === 'GET') {
      await route.fulfill(json({
        id: 'forked-game-1',
        title: '节奏达人新版本',
        status: 'ready',
        orientation: 'portrait',
        canPlay: true,
      }));
      return;
    }

    if (path === '/api/v1/users/quota' && method === 'GET') {
      await route.fulfill(json({
        remainingCreateCount: 99,
        dailyQuota: 99,
        usedCount: 0,
        canCreate: true,
        subscriptionActive: true,
      }));
      return;
    }

    console.log(`UNHANDLED ${method} ${path}`);
    await route.fulfill(errorJson(`Unhandled route: ${method} ${path}`, 500));
  });

  return requestLog;
}

async function runCreateFlow(browser) {
  const scenario = {};
  const context = await createContext(browser);
  const page = await context.newPage();
  const verifyDiagnostics = attachDiagnostics(page, 'create');
  const requestLog = await installRoutes(page, scenario);

  await page.goto(`${BASE_URL}/#/pages/create/index`, { waitUntil: 'networkidle' });
  await setTaroFieldByPlaceholder(page, '先说一句你想做什么游戏', '做一个 2048 游戏');
  await page.getByText('开始创作').click();

  await page.waitForTimeout(200);
  await expectText(page, '这局里玩家怎样算赢？');
  await setTaroFieldByPlaceholder(page, '例如：合成到 2048', '合成到 2048');
  await page.getByText('提交回答').click();
  await page.waitForTimeout(200);
  await page.getByText('开始创作').click();
  await page.waitForTimeout(500);

  assert.deepEqual(scenario.createGenerateBody, { revision: 2 }, 'create generate 请求没有带 revision');
  verifyDiagnostics();
  await context.close();
  return requestLog;
}

async function runIterateFlow(browser) {
  const scenario = {};
  const context = await createContext(browser, {
    iterateEntryGame: {
      id: 'game-1',
      title: '贪吃蛇',
      status: 'ready',
      description: '一款节奏很快的贪吃蛇小游戏',
      orientation: 'portrait',
      canPlay: true,
      qualityScore: 9.7,
    },
  });
  const page = await context.newPage();
  const verifyDiagnostics = attachDiagnostics(page, 'iterate');
  const requestLog = await installRoutes(page, scenario);

  await page.goto(`${BASE_URL}/#/pages/game/iterate/index?gameId=game-1`, { waitUntil: 'networkidle' });
  await setTaroFieldByPlaceholder(page, '说说这次最想优化的部分', '把节奏做得更快，吃到食物时反馈更爽');
  await page.getByText('开始优化').click();
  await page.waitForTimeout(300);

  await expectText(page, '开始优化');
  const sessionButtons = page.getByText('开始优化');
  await sessionButtons.last().click();
  await page.waitForTimeout(500);

  assert.deepEqual(scenario.iterateGenerateBody, { revision: 5 }, 'iterate generate 请求没有带 revision');

  const pageText = await page.locator('body').innerText();
  assert(
    pageText.includes('优化进度') || pageText.includes('进行中...') || pageText.includes('生成游戏逻辑'),
    `iterate 生成后没有进入进度态，当前页面文本:\n${pageText}`
  );

  verifyDiagnostics();
  await context.close();
  return requestLog;
}

async function runForkFlow(browser) {
  const scenario = {};
  const context = await createContext(browser);
  const page = await context.newPage();
  const verifyDiagnostics = attachDiagnostics(page, 'fork');
  const requestLog = await installRoutes(page, scenario);

  await page.goto(`${BASE_URL}/#/pages/game/fork/index?sourceGameId=source-1`, { waitUntil: 'networkidle' });
  await setTaroFieldByPlaceholder(page, '说说你想保留什么、改变什么', '保留核心玩法，把节奏和美术都做得更爽');
  await page.getByText('开始复刻').click();
  await page.waitForTimeout(300);
  const sessionButtons = page.getByText('开始复刻');
  await sessionButtons.last().click();
  await page.waitForTimeout(500);

  assert.deepEqual(scenario.forkGenerateBody, { revision: 7 }, 'fork generate 请求没有带 revision');

  const pageText = await page.locator('body').innerText();
  assert(
    pageText.includes('复刻进度') || pageText.includes('进行中...') || pageText.includes('生成游戏逻辑'),
    `fork 生成后没有进入进度态，当前页面文本:\n${pageText}`
  );

  verifyDiagnostics();
  await context.close();
  return requestLog;
}

async function expectText(page, text) {
  await page.getByText(text).waitFor({ state: 'visible', timeout: 5000 });
}

async function setTaroFieldByPlaceholder(page, placeholder, value) {
  await page.waitForFunction((expectedPlaceholder) => {
    return Boolean(
      document.querySelector(`textarea[placeholder="${expectedPlaceholder}"]`)
      || document.querySelector(`input[placeholder="${expectedPlaceholder}"]`)
      || document.querySelector(`[placeholder="${expectedPlaceholder}"]`)
    );
  }, placeholder);

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const createLog = await runCreateFlow(browser);
    const iterateLog = await runIterateFlow(browser);
    const forkLog = await runForkFlow(browser);

    console.log(JSON.stringify({
      ok: true,
      createCalls: createLog.map((item) => `${item.method} ${item.path}`),
      iterateCalls: iterateLog.map((item) => `${item.method} ${item.path}`),
      forkCalls: forkLog.map((item) => `${item.method} ${item.path}`),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
