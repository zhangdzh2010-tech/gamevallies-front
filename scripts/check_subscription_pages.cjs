const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('@playwright/test');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(FRONTEND_ROOT, '..', 'gamevallies-backend');
const ENV_PATH = path.join(BACKEND_ROOT, '.env.production');
const CHROME_EXECUTABLE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MOBILE_DEVICE = devices['iPhone 13'];

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

function appUrl(baseUrl, miniPath) {
  const normalized = miniPath.startsWith('/') ? miniPath : `/${miniPath}`;
  return `${baseUrl.replace(/\/$/, '')}/#${normalized}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 300)}`);
  }
  return body;
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

async function waitForVisible(page, selector, timeout = 30000) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
}

async function click(page, selector, timeout = 30000) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout });
  await locator.click({ force: true });
}

async function clickTabByIndex(page, index, timeout = 30000) {
  const tab = page.locator('.custom-tab-bar .tab-item').nth(index);
  await tab.waitFor({ state: 'visible', timeout });
  await tab.click({ force: true });
}

async function loginViaUi(page, baseUrl, credentials) {
  await gotoMiniPage(page, baseUrl, '/pages/login/index');
  await waitForVisible(page, '.login-container', 30000);
  const inputs = page.locator('.form-section .input-field input');
  await inputs.nth(0).fill(credentials.username);
  await inputs.nth(1).fill(credentials.password);
  await click(page, '.login-btn');
  await page.waitForFunction(
    () => window.location.hash.includes('/pages/index/index') || window.location.hash.includes('/pages/profile/index'),
    null,
    { timeout: 30000 },
  );
}

async function collectPageSnapshot(page) {
  return page.evaluate(() => ({
    hash: window.location.hash,
    title: document.title || '',
    bodyText: (document.body?.innerText || '').trim().slice(0, 1000),
    pageCount: document.querySelectorAll('.taro_page').length,
  }));
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.PUBLIC_API_BASE_URL || 'https://gamevallies.com').replace(/\/$/, '');
  const adminToken = env.ADMIN_TOKEN;
  const stamp = Date.now();
  const username = `pwsub_${stamp}`;
  const password = `Pw!${stamp}`;

  await adminCreateUser(baseUrl, adminToken, username, password);

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_EXECUTABLE,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    ...MOBILE_DEVICE,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message || String(error));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    await loginViaUi(page, baseUrl, { username, password });
    await clickTabByIndex(page, 4);
    await page.waitForFunction(() => window.location.hash.includes('/pages/profile/index'), null, { timeout: 30000 });
    await page.waitForTimeout(5000);
    const profileSnapshot = await collectPageSnapshot(page);
    const profileShellVisible = await page.locator('.profile-shell, .profile-container').first().isVisible().catch(() => false);
    if (!profileShellVisible) {
      await page.screenshot({ path: path.join(FRONTEND_ROOT, 'tmp_subscription_profile_failure.png'), fullPage: true }).catch(() => {});
      throw new Error(`profile_shell_missing: ${JSON.stringify({ profileSnapshot, runtimeErrors, consoleErrors })}`);
    }
    const membershipVisible = await page.locator('.profile-membership-btn').first().isVisible().catch(() => false);
    if (!membershipVisible) {
      await page.screenshot({ path: path.join(FRONTEND_ROOT, 'tmp_subscription_profile_failure.png'), fullPage: true }).catch(() => {});
      throw new Error(`profile_membership_btn_missing: ${JSON.stringify({ profileSnapshot, runtimeErrors, consoleErrors })}`);
    }
    await click(page, '.profile-membership-btn');
    await page.waitForFunction(() => window.location.hash.includes('/pages/subscription/index'), null, { timeout: 30000 });
    await waitForVisible(page, '.subscription-shell', 30000);
    const subscriptionSnapshot = await collectPageSnapshot(page);

    const rightAction = page.locator('.app-top-bar__action').first();
    if (await rightAction.isVisible().catch(() => false)) {
      await rightAction.click({ force: true });
    } else {
      await click(page, '.subscription-record-entry');
    }

    await page.waitForFunction(() => window.location.hash.includes('/pages/subscription/history/index'), null, { timeout: 30000 });
    await waitForVisible(page, '.subscription-history-shell', 30000);
    const historySnapshot = await collectPageSnapshot(page);

    const result = {
      ok: true,
      baseUrl,
      username,
      runtimeErrors,
      consoleErrors,
      profileSnapshot,
      subscriptionSnapshot,
      historySnapshot,
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message || String(error),
  }, null, 2));
  process.exitCode = 1;
});

