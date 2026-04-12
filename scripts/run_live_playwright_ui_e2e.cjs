const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('@playwright/test');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(FRONTEND_ROOT, '..', 'gamevallies-backend');
const ENV_PATH = path.join(BACKEND_ROOT, '.env.deploy');
const CHROME_EXECUTABLE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MOBILE_DEVICE = devices['iPhone 13'];
const WORKSPACE_TITLE_INPUT_SELECTOR = '.creation-config-input-wrap input, .creation-create-settings__field--name input, input.creation-config-input, input.form-input, input.create-entry__name-input, input.weui-input';
const WORKSPACE_COMPOSER_INPUT_SELECTOR = '.creation-create-composer__input-wrap input, .creation-create-composer__input input, input.creation-create-composer__input, textarea.creation-answer-composer__textarea, textarea.iterate-textarea, textarea.form-textarea, textarea.create-entry__textarea, textarea';
const WORKSPACE_SEND_SELECTOR = '.creation-create-composer__send:not(.creation-create-composer__send--disabled), .creation-session-actions__button--ghost:not(.creation-session-actions__button--disabled)';
const WORKSPACE_PRIMARY_ACTION_SELECTOR = '.creation-create-composer__action--primary:not(.creation-create-composer__action--disabled), .creation-session-actions__button--primary:not(.creation-session-actions__button--disabled), .form-actions .action-btn.play-btn, .iterate-submit-btn, .iterate-primary-btn, .fork-submit-btn';
const WORKSPACE_LANDSCAPE_SELECTOR = '.creation-create-orientation__option:nth-child(2), .orientation-option:nth-child(2), .create-entry__orientation-option:nth-child(2)';
const PROFILE_TAB_PATTERNS = {
  works: /\u4f5c\u54c1|Works/i,
  drafts: /\u8349\u7a3f|Draft/i,
  liked: /\u70b9\u8d5e|Like/i,
  bookmarks: /\u6536\u85cf|Bookmark/i,
  tasks: /\u4efb\u52a1|Task/i,
};

const CASES = [
  {
    name: 'office_slacker_ui',
    orientation: 'portrait',
    titlePrefix: 'PW UI Office Slacker',
    prompt:
      'Make a funny mobile office slacker game with five short stages. The player taps and drags to fake working, dodge surprise manager inspections, and survive absurd workplace moments.',
    createAnswer:
      'Set it in a bright modern office tower with silly coworkers, snack corners, printers, and dramatic manager patrol routes.',
    iterateFeedback:
      'Keep the stealth comedy core, but make the later stages more chaotic with lunch break, standup meeting, and report review interruptions.',
    forkPrompt:
      'Keep the funny stealth loop, but remake it as a neon cyberpunk night-shift office with stronger visual feedback and faster pacing.',
  },
  {
    name: 'circuit_classroom_ui',
    orientation: 'portrait',
    titlePrefix: 'PW UI Circuit Classroom',
    prompt:
      'Create a mobile educational circuit puzzle where players drag batteries, switches, and wires to light targets across staged classroom levels.',
    createAnswer:
      'Set it in a cheerful classroom lab with desks, chalkboards, and colorful robot teaching aids that explain each puzzle clearly.',
    iterateFeedback:
      'Add a parallel circuit stage, make the tutorial clearer, and shorten the explanation copy after each level.',
    forkPrompt:
      'Keep the drag-to-build circuit idea, but restyle it as a colorful robot workshop with toy-like parts and brighter success effects.',
  },
  {
    name: 'parkour_delivery_ui',
    orientation: 'landscape',
    titlePrefix: 'PW UI Parkour Delivery',
    prompt:
      'Create a landscape rooftop delivery game where the hero dashes across buildings, avoids drones, and drops parcels onto target balconies.',
    createAnswer:
      'Use a sunset city skyline with narrow rooftops, billboards, AC units, and quick near-miss moments over busy streets.',
    iterateFeedback:
      'Add a storm round, increase the sense of speed, and make successful parcel drops feel more dramatic.',
    forkPrompt:
      'Keep the rooftop parkour delivery loop, but remake it as a moon-base courier run with low gravity jumps and sci-fi HUD effects.',
  },
  {
    name: 'fruit_merge_relax_ui',
    orientation: 'portrait',
    titlePrefix: 'PW UI Fruit Merge Relax',
    prompt:
      'Create a cozy mobile fruit merge puzzle with soft visuals, simple drag controls, satisfying combo chains, and easy onboarding for first-time players.',
    createAnswer:
      'Set it on a warm picnic table with plush fruit designs, soft pastel colors, and gentle celebration effects for combos.',
    iterateFeedback:
      'Add a clearer first-move tutorial, stronger combo celebration, and a limited booster that appears in stage two.',
    forkPrompt:
      'Keep the relaxing merge gameplay, but remake it as a dessert laboratory with glossy candy pieces and more theatrical chain reactions.',
  },
  {
    name: 'history_quiz_show_ui',
    orientation: 'landscape',
    titlePrefix: 'PW UI History Quiz Show',
    prompt:
      'Build a landscape history quiz show with fast rounds, clear answer choices, countdown pressure, and playful stage presentation for students.',
    createAnswer:
      'Style it like a bright TV studio with a host podium, audience cheers, category lights, and dramatic round transitions.',
    iterateFeedback:
      'Trim the explanation text after each answer, add a stronger finale recap, and make streak effects feel more like a TV show.',
    forkPrompt:
      'Keep the quiz-show structure, but remake it as a time-travel academy challenge with more dramatic transitions and futuristic stage art.',
  },
];

function parseArgs(argv) {
  const options = {
    limit: CASES.length,
    start: 1,
    headed: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit' && argv[i + 1]) {
      options.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--start' && argv[i + 1]) {
      options.start = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--headed') {
      options.headed = true;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error(`Invalid --limit value: ${options.limit}`);
  }
  if (!Number.isFinite(options.start) || options.start < 1) {
    throw new Error(`Invalid --start value: ${options.start}`);
  }

  return options;
}

function loadEnv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const values = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const [key, ...rest] = trimmed.split('=');
    values[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
  }

  return values;
}

function nowStamp() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${hh}${mm}${ss}`;
}

function appUrl(baseUrl, miniPath) {
  const normalized = miniPath.startsWith('/') ? miniPath : `/${miniPath}`;
  return `${baseUrl.replace(/\/$/, '')}/#${normalized}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  if (text) {
    body = JSON.parse(text);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 300)}`);
  }
  return body;
}

function extractMyGames(payload) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  return payload?.data?.items
    || payload?.data?.games
    || payload?.items
    || payload?.games
    || [];
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

async function gotoMiniPage(page, baseUrl, miniPath) {
  await page.goto(appUrl(baseUrl, miniPath), { waitUntil: 'domcontentloaded' });
}

async function waitForHash(page, fragment, timeout = 30000) {
  await page.waitForFunction(
    (value) => window.location.hash.includes(value),
    fragment,
    { timeout },
  );
}

async function waitForVisible(page, selector, timeout = 30000) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
}

async function waitForHidden(page, selector, timeout = 30000) {
  await page.locator(selector).first().waitFor({ state: 'hidden', timeout });
}

async function click(page, selector, options = {}) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: options.timeout || 30000 });
  await locator.click({ force: true, ...options });
}

async function fill(page, selector, value, timeout = 30000) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout });
  await locator.fill(value);
}

async function waitForCreateSessionReady(page) {
  await Promise.race([
    waitForVisible(page, '.form-actions .action-btn.play-btn', 180000),
    page.waitForFunction(
      () => Boolean(
        document.querySelector('.create-header--progress')
        || document.querySelector('.create-header--completion')
      ),
      null,
      { timeout: 180000 },
    ),
  ]);
}

async function waitForWorkflowSessionReady(page, label) {
  await Promise.race([
    page.waitForFunction(
      () => document.querySelectorAll('.creation-conversation-item').length >= 2,
      null,
      { timeout: 180000 },
    ),
    page.waitForFunction(
      () => document.querySelectorAll('.creation-create-composer__action').length >= 2,
      null,
      { timeout: 180000 },
    ),
    page.waitForFunction(
      () => document.querySelectorAll('.creation-session-actions__button').length >= 2,
      null,
      { timeout: 180000 },
    ),
    page.waitForFunction(
      () => Boolean(
        document.querySelector('.progress-panel')
      ),
      null,
      { timeout: 180000 },
    ),
  ]).catch((error) => {
    throw new Error(`Timed out waiting for ${label} session ready state: ${error.message}`);
  });
}

async function waitForCreateCompletion(page) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('.completion-panel .completion-actions')),
    null,
    { timeout: 1500000 },
  );
}

async function waitForIterateCompletion(page) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('.iterate-actions .iterate-action-btn--ghost')),
    null,
    { timeout: 1500000 },
  );
}

async function waitForForkCompletion(page) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('.fork-actions .fork-submit-btn')),
    null,
    { timeout: 1500000 },
  );
}

async function maybePlayInOverlay(page) {
  const lockedButton = page.locator('.locked-play-btn, .play-btn.locked, .iterate-action-btn--secondary').first();
  if (await lockedButton.isVisible().catch(() => false)) {
    return {
      attempted: false,
      blockedByPaywall: true,
      buttonText: ((await lockedButton.textContent().catch(() => '')) || '').trim(),
    };
  }

  const playButton = page.locator(
    '.completion-actions .play-btn:not(.locked), .action-buttons .play-btn:not(.locked), .iterate-action-btn--primary',
  ).first();
  if (!(await playButton.isVisible().catch(() => false))) {
    return { attempted: false };
  }

  const buttonText = ((await playButton.textContent()) || '').trim();
  await playButton.click({ force: true });
  try {
    await waitForVisible(page, '.game-player-overlay.visible iframe.player-iframe', 30000);
    await sleep(3000);
    await click(page, '.player-btn.back-btn');
    await waitForHidden(page, '.game-player-overlay.visible', 30000);
    return {
      attempted: true,
      buttonText,
    };
  } catch (_error) {
    return {
      attempted: false,
      buttonText,
      reason: 'player_overlay_not_detected',
    };
  }
}

async function loginViaUi(page, baseUrl, credentials) {
  await gotoMiniPage(page, baseUrl, '/pages/login/index');
  await waitForVisible(page, '.login-container', 30000);
  const inputs = page.locator('.form-section .input-field input');
  await inputs.nth(0).waitFor({ state: 'visible', timeout: 30000 });
  await inputs.nth(0).fill(credentials.username);
  await inputs.nth(1).fill(credentials.password);
  await click(page, '.login-btn');
  await Promise.race([
    waitForHash(page, '/pages/index/index', 30000),
    waitForHash(page, '/pages/create/index', 30000),
    waitForHash(page, '/pages/profile/index', 30000),
  ]);
}

async function captureMyGames(page, baseUrl) {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'GET' && response.url().includes('/api/v1/games/my'),
    { timeout: 60000 },
  );
  await gotoMiniPage(page, baseUrl, '/pages/profile/index');
  const response = await responsePromise;
  const body = await response.json();
  return extractMyGames(body);
}

async function waitForMyGameByTitle(page, baseUrl, title, timeout = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const games = await captureMyGames(page, baseUrl);
    const match = games.find((game) => game.title === title);
    if (match) {
      return { games, match };
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for profile game titled "${title}"`);
}

async function waitForMyGameById(page, baseUrl, gameId, timeout = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const games = await captureMyGames(page, baseUrl);
    const match = games.find((game) => game.id === gameId);
    if (match) {
      return { games, match };
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for profile game ${gameId}`);
}

async function waitForMyGameByTitleWithPredicate(page, baseUrl, title, predicate, timeout = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const games = await captureMyGames(page, baseUrl);
    const match = games.find((game) => game.title === title);
    if (match && predicate(match, games)) {
      return { games, match };
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for stable profile game titled "${title}"`);
}

async function waitForMyGameByIdWithPredicate(page, baseUrl, gameId, predicate, timeout = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const games = await captureMyGames(page, baseUrl);
    const match = games.find((game) => game.id === gameId);
    if (match && predicate(match, games)) {
      return { games, match };
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for stable profile game ${gameId}`);
}

async function waitForNewMyGame(page, baseUrl, existingGameIds, predicate, timeout = 120000) {
  const existingIds = new Set((existingGameIds || []).map((value) => String(value)));
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const games = await captureMyGames(page, baseUrl);
    const match = games.find((game) => !existingIds.has(String(game.id)) && predicate(game, games));
    if (match) {
      return { games, match };
    }
    await sleep(3000);
  }

  throw new Error('Timed out waiting for a newly created profile game');
}

async function maybeAnswerSessionQuestion(page, answer, label) {
  if (!answer || !answer.trim()) {
    return { answered: false, reason: 'empty_answer' };
  }

  const composerInput = page.locator(WORKSPACE_COMPOSER_INPUT_SELECTOR).first();
  const submitButton = page.locator(WORKSPACE_SEND_SELECTOR).first();

  if (!(await composerInput.isVisible().catch(() => false)) || !(await submitButton.isVisible().catch(() => false))) {
    return { answered: false, reason: 'question_not_visible' };
  }

  await fill(page, WORKSPACE_COMPOSER_INPUT_SELECTOR, answer, 120000);
  await submitButton.click({ force: true });
  await waitForWorkflowSessionReady(page, label);
  return { answered: true };
}

async function clickPrimaryWorkflowAction(page, label, timeout = 120000) {
  const button = page.locator(WORKSPACE_PRIMARY_ACTION_SELECTOR).first();
  await button.waitFor({ state: 'visible', timeout });
  const text = ((await button.textContent().catch(() => '')) || '').trim();
  await button.click({ force: true });
  return { text, label };
}

async function clickProfileTab(page, tabKeyOrIndex) {
  const pattern = typeof tabKeyOrIndex === 'string' ? PROFILE_TAB_PATTERNS[tabKeyOrIndex] : null;
  const locator = pattern
    ? page.locator('.tabs-container .tab-item').filter({ hasText: pattern }).first()
    : page.locator('.tabs-container .tab-item').nth(tabKeyOrIndex);
  await locator.waitFor({ state: 'visible', timeout: 30000 });
  await locator.click({ force: true });
  await sleep(1000);
}

async function publishFromDrafts(page, baseUrl, game) {
  const gameTitle = game?.title || '';
  const item = page.locator('.games-list__item').filter({ hasText: gameTitle }).first();
  await item.waitFor({ state: 'visible', timeout: 60000 });
  const button = item.locator('.game-publish-primary-btn').first();
  if (!(await button.isVisible().catch(() => false))) {
    return { published: false, reason: 'publish_button_not_visible' };
  }
  await button.scrollIntoViewIfNeeded().catch(() => {});
  await button.click({ timeout: 30000 });
  const nextState = await waitForMyGameByIdWithPredicate(
    page,
    baseUrl,
    game.id,
    (nextGame) => !['ready', 'draft'].includes(String(nextGame.status || '')),
    180000,
  ).catch(() => null);
  return {
    published: Boolean(nextState?.match),
    status: nextState?.match?.status || null,
  };
}

async function runCase(browser, baseUrl, adminToken, stamp, caseIndex, caseConfig, artifactRoot) {
  const caseStamp = `${stamp}_${String(caseIndex).padStart(2, '0')}`;
  const title = `${caseConfig.titlePrefix} ${caseStamp}`;
  const password = `Pw!${caseStamp}`;
  const author = { username: `pwui_a_${caseStamp}`, password };
  const forker = { username: `pwui_f_${caseStamp}`, password };
  const caseDir = path.join(artifactRoot, caseConfig.name);
  fs.mkdirSync(caseDir, { recursive: true });

  console.log(`[${caseIndex}] creating temp users for ${caseConfig.name}`);
  await adminCreateUser(baseUrl, adminToken, author.username, author.password);
  await adminCreateUser(baseUrl, adminToken, forker.username, forker.password);

  const result = {
    caseIndex,
    caseName: caseConfig.name,
    title,
    orientation: caseConfig.orientation,
    author: { username: author.username },
    forker: { username: forker.username },
    create: {},
    iterate: {},
    fork: {},
    ok: false,
  };

  const authorContext = await browser.newContext({
    ...MOBILE_DEVICE,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const authorPage = await authorContext.newPage();

  try {
    console.log(`[${caseIndex}] author logging in`);
    await loginViaUi(authorPage, baseUrl, author);
    const authorGamesBefore = await captureMyGames(authorPage, baseUrl).catch(() => []);

    console.log(`[${caseIndex}] author creating game`);
    await gotoMiniPage(authorPage, baseUrl, '/pages/create/index');
    await authorPage.waitForFunction(
      () => Boolean(
        document.querySelector('.creation-create-workspace')
        || document.querySelector('.create-container')
        || document.querySelector('input')
        || document.querySelector('textarea')
        || document.querySelector('.creation-create-composer__action')
        || document.querySelector('.creation-session-actions__button')
      ),
      null,
      { timeout: 30000 },
    );

    if (caseConfig.orientation === 'landscape') {
      const landscapeSwitch = authorPage.locator(WORKSPACE_LANDSCAPE_SELECTOR).first();
      if (await landscapeSwitch.isVisible().catch(() => false)) {
        await landscapeSwitch.click({ force: true });
      }
    }

    const freshTitleInput = authorPage.locator(WORKSPACE_TITLE_INPUT_SELECTOR).first();
    if (await freshTitleInput.isVisible().catch(() => false)) {
      await fill(authorPage, WORKSPACE_TITLE_INPUT_SELECTOR, title);
      await fill(authorPage, WORKSPACE_COMPOSER_INPUT_SELECTOR, caseConfig.prompt);
      await click(authorPage, WORKSPACE_SEND_SELECTOR);
      await waitForWorkflowSessionReady(authorPage, 'create');
    }
    result.create.sessionAnswer = await maybeAnswerSessionQuestion(authorPage, caseConfig.createAnswer || caseConfig.prompt, 'create');
    result.create.generateAction = await clickPrimaryWorkflowAction(authorPage, 'create', 120000);

    console.log(`[${caseIndex}] capturing created game`);
    let sourceState = await waitForNewMyGame(
      authorPage,
      baseUrl,
      authorGamesBefore.map((game) => game.id),
      (game) => String(game.status || '') !== 'generating',
      1500000,
    );
    let sourceGame = sourceState.match;
    result.create.gameId = sourceGame.id;
    result.create.actualTitle = sourceGame.title;
    result.create.play = { attempted: false, skipped: true };
    result.create.statusBeforePublish = sourceGame.status;
    if (String(sourceGame.status || '') === 'failed') {
      throw new Error(`Create result game ${sourceGame.id} ended in failed status`);
    }

    if (['ready', 'draft'].includes(String(sourceGame.status || ''))) {
      await clickProfileTab(authorPage, 'drafts');
      result.create.publish = await publishFromDrafts(authorPage, baseUrl, sourceGame);
      sourceState = await waitForMyGameById(authorPage, baseUrl, sourceGame.id);
      sourceGame = sourceState.match;
    } else {
      result.create.publish = { published: false, reason: 'already_public' };
    }
    result.create.statusAfterPublish = sourceGame.status;
    result.create.detailUrl = appUrl(baseUrl, `/pages/game/detail/index?id=${sourceGame.id}&authorView=1`);

    console.log(`[${caseIndex}] author opening iterate flow`);
    await gotoMiniPage(authorPage, baseUrl, `/pages/game/detail/index?id=${sourceGame.id}&authorView=1`);
    await waitForVisible(authorPage, '.action-buttons .fork-btn', 120000);
    await click(authorPage, '.action-buttons .fork-btn');
    await waitForHash(authorPage, '/pages/game/iterate/index', 30000);
    const authorGameIdsBeforeIterate = (await captureMyGames(authorPage, baseUrl).catch(() => [])).map((game) => game.id);
    await gotoMiniPage(authorPage, baseUrl, `/pages/game/iterate/index?gameId=${sourceGame.id}`);
    await waitForVisible(authorPage, WORKSPACE_COMPOSER_INPUT_SELECTOR, 120000);
    await fill(authorPage, WORKSPACE_COMPOSER_INPUT_SELECTOR, caseConfig.iterateFeedback, 120000);
    await click(authorPage, WORKSPACE_SEND_SELECTOR, { timeout: 120000 });
    await waitForWorkflowSessionReady(authorPage, 'iterate');
    result.iterate.sessionAnswer = await maybeAnswerSessionQuestion(authorPage, caseConfig.iterateFeedback, 'iterate');
    result.iterate.generateAction = await clickPrimaryWorkflowAction(authorPage, 'iterate', 120000);

    console.log(`[${caseIndex}] checking iterate publish state`);
    let iterateState = await waitForNewMyGame(
      authorPage,
      baseUrl,
      authorGameIdsBeforeIterate,
      (game) => String(game.status || '') !== 'generating',
      1500000,
    ).catch(() => waitForMyGameByIdWithPredicate(
      authorPage,
      baseUrl,
      sourceGame.id,
      (game) => String(game.status || '') !== 'generating',
      1500000,
    ));
    let iterateGame = iterateState.match;
    result.iterate.play = { attempted: false, skipped: true };
    result.iterate.statusBeforePublish = iterateGame.status;
    result.iterate.actualTitle = iterateGame.title;
    if (String(iterateGame.status || '') === 'failed') {
      throw new Error(`Iterate result game ${iterateGame.id} ended in failed status`);
    }
    if (['ready', 'draft'].includes(String(iterateGame.status || ''))) {
      await clickProfileTab(authorPage, 'drafts');
      result.iterate.publish = await publishFromDrafts(authorPage, baseUrl, iterateGame);
      iterateState = await waitForMyGameById(authorPage, baseUrl, iterateGame.id);
      iterateGame = iterateState.match;
    } else {
      result.iterate.publish = { published: false, reason: 'already_public' };
    }
    result.iterate.sourceGameId = sourceGame.id;
    result.iterate.gameId = iterateGame.id;
    result.iterate.statusAfterPublish = iterateGame.status;
    result.iterate.detailUrl = appUrl(baseUrl, `/pages/game/detail/index?id=${iterateGame.id}`);

    await authorPage.screenshot({
      path: path.join(caseDir, 'author_after_iterate.png'),
      fullPage: true,
    });
  } catch (error) {
    result.ok = false;
    result.errorStage = 'author_flow';
    result.errorMessage = error.message;
    await authorPage.screenshot({
      path: path.join(caseDir, 'author_failure.png'),
      fullPage: true,
    }).catch(() => {});
    await authorContext.close().catch(() => {});
    throw { result, error };
  }

  await authorContext.close();

  const forkerContext = await browser.newContext({
    ...MOBILE_DEVICE,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const forkerPage = await forkerContext.newPage();

  try {
    console.log(`[${caseIndex}] forker logging in`);
    await loginViaUi(forkerPage, baseUrl, forker);
    const forkerGamesBefore = await captureMyGames(forkerPage, baseUrl).catch(() => []);

    console.log(`[${caseIndex}] forker opening published detail`);
    await gotoMiniPage(forkerPage, baseUrl, `/pages/game/detail/index?id=${result.iterate.gameId}`);
    await waitForVisible(forkerPage, '.action-buttons .play-btn', 120000);
    result.fork.play = await maybePlayInOverlay(forkerPage);

    await click(forkerPage, '.action-buttons .fork-btn');
    await waitForHash(forkerPage, '/pages/game/fork/index', 30000);
    await waitForVisible(forkerPage, WORKSPACE_COMPOSER_INPUT_SELECTOR, 120000);
    await fill(forkerPage, WORKSPACE_COMPOSER_INPUT_SELECTOR, caseConfig.forkPrompt, 120000);
    await click(forkerPage, WORKSPACE_SEND_SELECTOR, { timeout: 120000 });
    await waitForWorkflowSessionReady(forkerPage, 'fork');
    result.fork.sessionAnswer = await maybeAnswerSessionQuestion(forkerPage, caseConfig.forkPrompt, 'fork');
    result.fork.generateAction = await clickPrimaryWorkflowAction(forkerPage, 'fork', 120000);

    console.log(`[${caseIndex}] waiting for forked game to appear`);
    const forkState = await waitForNewMyGame(
      forkerPage,
      baseUrl,
      forkerGamesBefore.map((game) => game.id),
      (game) => String(game.status || '') !== 'generating',
      1500000,
    ).catch(async () => {
      const fallback = await captureMyGames(forkerPage, baseUrl);
      const first = fallback.find((game) => String(game.status || '') !== 'generating') || fallback[0] || null;
      return { games: fallback, match: first };
    });
    const forkGame = forkState.match;
    if (!forkGame) {
      throw new Error('Could not find forked game in forker profile');
    }

    result.fork.gameId = forkGame.id;
    result.fork.actualTitle = forkGame.title;
    result.fork.status = forkGame.status;
    if (String(forkGame.status || '') === 'failed') {
      throw new Error(`Fork result game ${forkGame.id} ended in failed status`);
    }
    result.ok = true;

    await forkerPage.screenshot({
      path: path.join(caseDir, 'fork_success.png'),
      fullPage: true,
    });
  } catch (error) {
    result.ok = false;
    result.errorStage = 'fork_flow';
    result.errorMessage = error.message;
    await forkerPage.screenshot({
      path: path.join(caseDir, 'fork_failure.png'),
      fullPage: true,
    }).catch(() => {});
    throw { result, error };
  } finally {
    await forkerContext.close().catch(() => {});
  }

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.PUBLIC_API_BASE_URL || 'https://gamevallies.com').replace(/\/$/, '');
  const adminToken = env.ADMIN_TOKEN;
  const stamp = nowStamp();
  const artifactDir = path.join(FRONTEND_ROOT, 'tmp_playwright_ui_e2e_artifacts', stamp);
  fs.mkdirSync(artifactDir, { recursive: true });

  const selectedCases = CASES.slice(options.start - 1, options.start - 1 + options.limit);
  if (!selectedCases.length) {
    throw new Error(`No cases selected from start=${options.start} limit=${options.limit}`);
  }

  const browser = await chromium.launch({
    headless: !options.headed,
    executablePath: CHROME_EXECUTABLE,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const summary = {
    startedAt: new Date().toISOString(),
    baseUrl,
    artifactDir,
    requestedStart: options.start,
    requestedLimit: options.limit,
    completed: 0,
    okCount: 0,
    results: [],
  };

  try {
    for (let index = 0; index < selectedCases.length; index += 1) {
      const caseConfig = selectedCases[index];
      const caseNumber = options.start + index;
      try {
        const result = await runCase(browser, baseUrl, adminToken, stamp, caseNumber, caseConfig, artifactDir);
        summary.results.push(result);
        summary.completed += 1;
        summary.okCount += result.ok ? 1 : 0;
      } catch (wrapped) {
        const failedResult = wrapped.result || {
          caseIndex: caseNumber,
          caseName: caseConfig.name,
          ok: false,
          errorStage: 'unknown',
          errorMessage: wrapped.error ? wrapped.error.message : String(wrapped),
        };
        summary.results.push(failedResult);
        summary.completed += 1;
      }

      fs.writeFileSync(
        path.join(artifactDir, 'partial-results.json'),
        JSON.stringify(summary, null, 2),
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }

  summary.finishedAt = new Date().toISOString();
  const outputPath = path.join(FRONTEND_ROOT, `tmp_playwright_ui_e2e_${stamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    output: outputPath,
    completed: summary.completed,
    okCount: summary.okCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
