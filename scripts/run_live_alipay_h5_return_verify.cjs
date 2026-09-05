const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('@playwright/test');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(FRONTEND_ROOT, '..', 'gamevallies-backend');
const ENV_PATH = path.join(BACKEND_ROOT, '.env.production');
const CHROME_EXECUTABLE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MOBILE_DEVICE = devices['iPhone 13'];
const PAYMENT_ATTEMPT_STORAGE_KEY = 'gamevallies_subscription_payment_attempt';
const ACCESS_TOKEN_STORAGE_KEY = 'gamevallies_access_token';

function parseArgs(argv) {
  const options = {
    headed: true,
    timeoutMinutes: 10,
    keepBrowserOpenOnFinish: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--headless') {
      options.headed = false;
    } else if (arg === '--headed') {
      options.headed = true;
    } else if (arg === '--timeout-minutes' && argv[i + 1]) {
      options.timeoutMinutes = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--keep-browser-open') {
      options.keepBrowserOpenOnFinish = true;
    }
  }

  if (!Number.isFinite(options.timeoutMinutes) || options.timeoutMinutes < 1) {
    throw new Error(`Invalid --timeout-minutes value: ${options.timeoutMinutes}`);
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

function compactStamp(stamp) {
  return String(stamp || '').replace(/[^0-9]/g, '');
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
  if (!userId) {
    return null;
  }

  return fetchJson(`${baseUrl}/api/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'x-admin-token': adminToken,
    },
  });
}

async function gotoMiniPage(page, baseUrl, miniPath) {
  await page.goto(appUrl(baseUrl, miniPath), { waitUntil: 'domcontentloaded' });
}

async function waitForVisible(page, selector, timeout = 30000) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
}

async function click(page, selector, options = {}) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: options.timeout || 30000 });
  await locator.click({ force: true, ...options });
}

async function loginViaUi(page, baseUrl, credentials) {
  await gotoMiniPage(page, baseUrl, '/pages/login/index');
  await waitForVisible(page, '.login-container', 30000);
  const inputs = page.locator('.form-section .input-field input');
  await inputs.nth(0).waitFor({ state: 'visible', timeout: 30000 });
  await inputs.nth(0).fill(credentials.username);
  await inputs.nth(1).fill(credentials.password);
  await click(page, '.login-btn');
  await page.waitForFunction(
    () => window.location.hash.includes('/pages/index/index')
      || window.location.hash.includes('/pages/create/index')
      || window.location.hash.includes('/pages/profile/index'),
    null,
    { timeout: 30000 },
  );
}

function parseWrappedStorageValue(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed?.data ?? null;
  } catch (_error) {
    return value;
  }
}

async function readAppStorage(page, key) {
  return page.evaluate((storageKey) => {
    try {
      return window.localStorage.getItem(storageKey);
    } catch (_error) {
      return null;
    }
  }, key);
}

async function getAccessTokenFromPage(page) {
  const rawToken = await readAppStorage(page, ACCESS_TOKEN_STORAGE_KEY);
  return parseWrappedStorageValue(rawToken);
}

async function getPaymentAttemptFromPage(page) {
  const raw = await readAppStorage(page, PAYMENT_ATTEMPT_STORAGE_KEY);
  return parseWrappedStorageValue(raw);
}

async function getPlans(baseUrl, token) {
  const payload = await fetchJson(`${baseUrl}/api/v1/subscription/plans`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
  return payload?.data?.plans || payload?.plans || [];
}

function buildAuthHeaders(authValue) {
  if (!authValue) {
    return {};
  }

  const headerValue = String(authValue).startsWith('Bearer ')
    ? String(authValue)
    : `Bearer ${String(authValue)}`;

  return {
    Authorization: headerValue,
  };
}

async function getOrderStatus(baseUrl, authValue, orderId) {
  const payload = await fetchJson(`${baseUrl}/api/v1/subscription/orders/${orderId}`, {
    headers: buildAuthHeaders(authValue),
  });
  return payload?.data || payload;
}

async function getSubscriptionStatus(baseUrl, authValue) {
  const payload = await fetchJson(`${baseUrl}/api/v1/subscription/status`, {
    headers: buildAuthHeaders(authValue),
  });
  return payload?.data || payload;
}

async function waitForPaidOrder(baseUrl, authValue, orderId, timeoutMs, result) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const orderStatus = await getOrderStatus(baseUrl, authValue, orderId);
    result.orderPolls.push({
      checkedAt: new Date().toISOString(),
      status: orderStatus?.status || null,
      paidAt: orderStatus?.paidAt || null,
      subscriptionActive: Boolean(orderStatus?.subscriptionActive),
    });

    if (String(orderStatus?.status || '').toLowerCase() === 'paid') {
      return orderStatus;
    }

    if (['failed', 'canceled', 'cancelled', 'refunded'].includes(String(orderStatus?.status || '').toLowerCase())) {
      return orderStatus;
    }

    await sleep(3000);
  }

  return null;
}

async function waitForSubscriptionActive(baseUrl, authValue, timeoutMs, result) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const subscriptionStatus = await getSubscriptionStatus(baseUrl, authValue);
    result.subscriptionPolls.push({
      checkedAt: new Date().toISOString(),
      active: Boolean(subscriptionStatus?.active),
      planId: subscriptionStatus?.planId || null,
      planName: subscriptionStatus?.planName || null,
      expiresAt: subscriptionStatus?.expiresAt || null,
    });

    if (subscriptionStatus?.active) {
      return subscriptionStatus;
    }

    await sleep(2500);
  }

  return null;
}

async function captureScreenshot(page, filePath) {
  await page.screenshot({
    path: filePath,
    fullPage: true,
  }).catch(() => {});
}

async function maybeNavigateBackToReturnUrl(page, returnUrl) {
  if (!returnUrl) {
    return false;
  }

  const currentUrl = page.url();
  if (currentUrl === returnUrl) {
    return true;
  }

  await page.goto(returnUrl, { waitUntil: 'domcontentloaded' });
  return true;
}

async function waitForUiMembershipState(page, timeout = 90000) {
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText || '';
      return text.includes('支付宝订阅已生效') || text.includes('当前订阅');
    },
    null,
    { timeout },
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.PUBLIC_API_BASE_URL || 'https://gamevallies.com').replace(/\/$/, '');
  const adminToken = env.ADMIN_TOKEN;
  const stamp = nowStamp();
  const shortStamp = compactStamp(stamp).slice(-12);
  const artifactDir = path.join(FRONTEND_ROOT, 'tmp_alipay_h5_verify_artifacts', stamp);
  fs.mkdirSync(artifactDir, { recursive: true });

  const username = `pwa_${shortStamp}`;
  const password = `Pay!${stamp}`;
  const result = {
    startedAt: new Date().toISOString(),
    baseUrl,
    artifactDir,
    username,
    orderPolls: [],
    subscriptionPolls: [],
    ok: false,
  };

  let createdUserId = null;
  let browser = null;
  let context = null;
  let page = null;
  let resolveCapturedOrderPayload = null;
  const capturedOrderPayloadPromise = new Promise((resolve) => {
    resolveCapturedOrderPayload = resolve;
  });
  let capturedOrderPayload = null;

  try {
    const createUserResponse = await adminCreateUser(baseUrl, adminToken, username, password);
    createdUserId = createUserResponse?.data?.id || createUserResponse?.id || null;

    browser = await chromium.launch({
      headless: !options.headed,
      executablePath: CHROME_EXECUTABLE,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    context = await browser.newContext({
      ...MOBILE_DEVICE,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    page = await context.newPage();
    await page.exposeFunction('__codexCaptureSubscriptionOrderResponse', async (payload) => {
      if (capturedOrderPayload) {
        return;
      }

      capturedOrderPayload = payload;
      resolveCapturedOrderPayload(payload);
    });
    await page.addInitScript(() => {
      const capturePayload = (payload) => {
        if (!payload) {
          return;
        }

        try {
          window.localStorage.setItem('__codex_last_subscription_order_payload', JSON.stringify(payload));
        } catch (_error) {
          // ignore storage failures
        }

        if (typeof window.__codexCaptureSubscriptionOrderResponse === 'function') {
          void window.__codexCaptureSubscriptionOrderResponse(payload);
        }
      };

      const isSubscriptionOrderRequest = (method, url) => (
        String(method || 'GET').toUpperCase() === 'POST'
        && String(url || '').includes('/api/v1/subscription/order')
      );

      const originalOpen = window.XMLHttpRequest?.prototype?.open;
      const originalSend = window.XMLHttpRequest?.prototype?.send;
      const originalSetRequestHeader = window.XMLHttpRequest?.prototype?.setRequestHeader;
      if (originalOpen && originalSend) {
        window.XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
          this.__codexMethod = method;
          this.__codexUrl = url;
          this.__codexHeaders = {};
          return originalOpen.call(this, method, url, ...rest);
        };

        if (originalSetRequestHeader) {
          window.XMLHttpRequest.prototype.setRequestHeader = function patchedSetRequestHeader(name, value) {
            try {
              this.__codexHeaders = this.__codexHeaders || {};
              this.__codexHeaders[String(name)] = String(value);
            } catch (_error) {
              // ignore header capture failures
            }

            return originalSetRequestHeader.call(this, name, value);
          };
        }

        window.XMLHttpRequest.prototype.send = function patchedSend(...args) {
          this.addEventListener('loadend', () => {
            try {
              if (!isSubscriptionOrderRequest(this.__codexMethod, this.__codexUrl)) {
                return;
              }

              capturePayload({
                transport: 'xhr',
                url: String(this.__codexUrl || ''),
                status: Number(this.status || 0),
                responseText: typeof this.responseText === 'string' ? this.responseText : '',
                headers: this.__codexHeaders || {},
              });
            } catch (_error) {
              // ignore interception errors
            }
          }, { once: true });

          return originalSend.apply(this, args);
        };
      }

      if (typeof window.fetch === 'function') {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const [input, init] = args;
          const method = init?.method || input?.method || 'GET';
          const url = typeof input === 'string' ? input : (input?.url || '');
          const response = await originalFetch(...args);

          try {
            const normalizedHeaders = {};
            const headerEntries = init?.headers
              ? Array.isArray(init.headers)
                ? init.headers
                : typeof init.headers.forEach === 'function'
                  ? Array.from(init.headers.entries())
                  : Object.entries(init.headers)
              : [];
            for (const [name, value] of headerEntries) {
              normalizedHeaders[String(name)] = String(value);
            }

            if (isSubscriptionOrderRequest(method, url)) {
              capturePayload({
                transport: 'fetch',
                url: String(url || ''),
                status: Number(response.status || 0),
                responseText: await response.clone().text(),
                headers: normalizedHeaders,
              });
            }
          } catch (_error) {
            // ignore interception errors
          }

          return response;
        };
      }
    });

    console.log('Step 1/6: login with temp user');
    await loginViaUi(page, baseUrl, { username, password });
    await captureScreenshot(page, path.join(artifactDir, '01_after_login.png'));

    const accessToken = await getAccessTokenFromPage(page);
    if (!accessToken) {
      throw new Error('Could not read access token from H5 localStorage after login');
    }
    result.accessTokenCaptured = true;

    const plans = await getPlans(baseUrl, accessToken);
    const selectedPlan = [...plans]
      .filter((plan) => Number(plan.price || 0) >= 1)
      .sort((a, b) => Number(a.price || 0) - Number(b.price || 0))[0];
    if (!selectedPlan?.id) {
      throw new Error('No paid subscription plan available for payment verification');
    }
    result.selectedPlan = {
      id: selectedPlan.id,
      name: selectedPlan.name,
      price: selectedPlan.price,
      priceDisplay: selectedPlan.priceDisplay,
    };

    console.log(`Step 2/6: open subscription page and select plan ${selectedPlan.id}`);
    await gotoMiniPage(page, baseUrl, '/pages/subscription/index');
    await waitForVisible(page, '.subscription-container', 30000);
    await waitForVisible(page, '.plan-card-subscribe-btn', 30000);
    await captureScreenshot(page, path.join(artifactDir, '02_subscription_page.png'));

    const selectedPlanCard = page.locator('.plan-card').filter({ hasText: selectedPlan.name }).first();
    const selectedPlanButton = selectedPlanCard.locator('.plan-card-subscribe-btn').first();
    await selectedPlanButton.waitFor({ state: 'visible', timeout: 30000 });

    await selectedPlanButton.click({ force: true });
    const capturedOrder = await Promise.race([
      capturedOrderPayloadPromise,
      sleep(30000).then(() => null),
    ]);
    if (!capturedOrder?.responseText) {
      throw new Error('Timed out capturing subscription order response payload from the page');
    }

    const orderBody = JSON.parse(capturedOrder.responseText);
    const orderData = orderBody?.data || orderBody;
    const payUrl = orderData?.payment?.payUrl || null;
    const orderId = orderData?.orderId || null;

    if (!payUrl || !orderId) {
      throw new Error(`Subscription order response missing payUrl or orderId: ${JSON.stringify(orderData)}`);
    }

    result.orderId = orderId;
    result.payUrl = payUrl;
    result.orderRequestUrl = capturedOrder.url || null;
    result.orderResponseStatus = capturedOrder.status || null;
    const requestUrl = new URL(capturedOrder.url);
    result.provider = requestUrl.searchParams.get('provider');
    result.returnUrl = requestUrl.searchParams.get('returnUrl');

    console.log('Step 3/6: waiting for H5 payment attempt to persist and redirect to Alipay');
    await page.waitForURL(/openapi\.alipay\.com|alipay\.com/i, { timeout: 60000 }).catch(() => null);
    await sleep(3000);
    result.payDomainUrl = page.url();
    await captureScreenshot(page, path.join(artifactDir, '03_alipay_page.png'));

    console.log('Step 4/6: polling order status until paid');
    console.log('If the browser shows an Alipay cashier or QR code, complete the payment now. The script will continue automatically after the order turns paid.');
    const authValue = capturedOrder.headers?.Authorization
      || capturedOrder.headers?.authorization
      || accessToken;
    const orderStatus = await waitForPaidOrder(
      baseUrl,
      authValue,
      orderId,
      options.timeoutMinutes * 60 * 1000,
      result,
    );

    if (!orderStatus) {
      throw new Error(`Timed out waiting for order ${orderId} to become paid`);
    }

    result.finalOrderStatus = orderStatus;
    if (String(orderStatus.status || '').toLowerCase() !== 'paid') {
      throw new Error(`Order ${orderId} finished with status ${orderStatus.status}`);
    }

    console.log('Step 5/6: return to subscription page and wait for resumePendingPayment');
    await maybeNavigateBackToReturnUrl(page, result.returnUrl || appUrl(baseUrl, '/pages/subscription/index'));
    await waitForVisible(page, '.subscription-container', 30000);
    await page.bringToFront().catch(() => {});
    await waitForUiMembershipState(page, 90000);
    await captureScreenshot(page, path.join(artifactDir, '04_after_return.png'));

    const paymentAttempt = await getPaymentAttemptFromPage(page);
    result.paymentAttemptAfterReturn = paymentAttempt;

    console.log('Step 6/6: verify subscription API state');
    const subscriptionStatus = await waitForSubscriptionActive(baseUrl, authValue, 90000, result);
    if (!subscriptionStatus?.active) {
      throw new Error('Subscription status did not become active after paid order');
    }

    result.subscriptionStatus = subscriptionStatus;
    result.ok = true;
    result.finishedAt = new Date().toISOString();

    const outputPath = path.join(FRONTEND_ROOT, `tmp_alipay_h5_return_verify_${stamp}.json`);
    result.outputPath = outputPath;
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(JSON.stringify({
      output: outputPath,
      artifactDir,
      orderId,
      provider: result.provider,
      ok: true,
    }, null, 2));

    if (options.keepBrowserOpenOnFinish) {
      console.log('Browser left open because --keep-browser-open was set.');
      return;
    }
  } catch (error) {
    result.ok = false;
    result.errorMessage = error.message;
    result.finishedAt = new Date().toISOString();

    if (page) {
      await captureScreenshot(page, path.join(artifactDir, 'failure.png'));
    }

    const outputPath = path.join(FRONTEND_ROOT, `tmp_alipay_h5_return_verify_${stamp}.json`);
    result.outputPath = outputPath;
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.error(JSON.stringify({
      output: outputPath,
      artifactDir,
      error: error.message,
    }, null, 2));
    throw error;
  } finally {
    if (!result.ok && createdUserId) {
      await adminDeleteUser(baseUrl, adminToken, createdUserId).catch(() => {});
    }

    if (!options.keepBrowserOpenOnFinish) {
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

