const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const targetURL = process.env.TEST_BASE_URL || pathToFileURL(path.join(__dirname, 'dist/index.html')).href;

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : { channel: 'chrome' }),
    headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      window.waveDrawCalls = 0;
      const draw = WebGL2RenderingContext.prototype.drawArrays;
      WebGL2RenderingContext.prototype.drawArrays = function (...args) {
        window.waveDrawCalls++;
        return draw.apply(this, args);
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(targetURL);
    await page.waitForFunction(() => document.querySelector('[data-pattern-waves]').dataset.waveState === 'animated');
    const before = await page.evaluate(() => window.waveDrawCalls);
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => window.waveDrawCalls) > before, 'the supplied wave effect renders frames');

    await page.evaluate(() => window.scrollTo({ top: document.querySelector('#sources').offsetTop, behavior: 'instant' }));
    await page.waitForTimeout(150);
    const offscreen = await page.evaluate(() => window.waveDrawCalls);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.waveDrawCalls), offscreen, 'off-screen hero does not keep rendering');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('[data-pattern-waves]').dataset.waveState === 'still');
    await page.waitForTimeout(150);
    const still = await page.evaluate(() => window.waveDrawCalls);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.waveDrawCalls), still, 'reduced motion produces a stationary background');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('[data-pattern-waves]').dataset.waveState === 'animated');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    assert.equal(await page.locator('[data-pattern-waves] canvas').count(), 0, 'pagehide releases the WebGL surface');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    assert.equal(await page.locator('[data-pattern-waves] canvas').count(), 1, 'returning from the page cache restores one surface');
    assert.deepEqual(errors, [], 'no WebGL runtime errors');
    await context.close();

    const fallbackContext = await browser.newContext();
    await fallbackContext.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
        return getContext.call(this, kind, ...args);
      };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedPrompt = text; } } });
    });
    const fallbackPage = await fallbackContext.newPage();
    const fallbackErrors = [];
    fallbackPage.on('pageerror', error => fallbackErrors.push(error.message));
    await fallbackPage.goto(targetURL);
    assert.equal(await fallbackPage.locator('[data-pattern-waves]').getAttribute('data-wave-state'), 'fallback');
    assert.equal(await fallbackPage.locator('.hero h1').isVisible(), true);
    await fallbackPage.locator('[data-copy=start]').click();
    assert.equal(await fallbackPage.evaluate(() => window.copiedPrompt), await fallbackPage.locator('#text-start').inputValue());
    assert.deepEqual(fallbackErrors, [], 'missing WebGL does not break the page');
    await fallbackContext.close();
  } finally {
    await browser.close();
  }
  console.log('PASS: wave rendering, off-screen pause, reduced motion, page lifecycle cleanup, and usable controls without WebGL.');
})().catch(error => { console.error(error); process.exit(1); });
