const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : { channel: 'chrome' }),
    headless: true,
  });
  try {
    for (const language of ['el', 'en']) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const context = await browser.newContext({ reducedMotion, viewport: { width: 390, height: 844 } });
        await context.addInitScript(() => {
          // Isolate button effects from the independently tested WebGL background.
          HTMLCanvasElement.prototype.getContext = () => null;
          window.copyWrites = [];
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            writeText: text => new Promise(resolve => {
              window.resolveCopy = () => { window.copyWrites.push(text); resolve(); };
            }),
          } });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const directory = language === 'en' ? 'en/' : '';
        const targetURL = process.env.TEST_BASE_URL
          ? new URL(directory, process.env.TEST_BASE_URL.replace(/\/?$/, '/')).href
          : pathToFileURL(path.join(__dirname, 'dist', directory, 'index.html')).href;
        await page.goto(targetURL);
        const hero = page.locator('[data-copy=start]');
        const initialWidth = await hero.evaluate(el => el.offsetWidth);
        await hero.focus();
        await page.keyboard.press('Enter');
        assert.equal(await hero.getAttribute('data-copy-state'), 'pending');
        assert.equal(await hero.isDisabled(), true);
        assert.equal(await hero.getAttribute('aria-busy'), 'true');
        assert.equal(await hero.locator('.copy-label-done').isVisible(), false, 'no confirmation before clipboard completion');
        await page.evaluate(() => window.resolveCopy());
        await page.waitForFunction(() => document.querySelector('[data-copy=start]').dataset.copyState === 'success');
        assert.equal(await hero.isDisabled(), false);
        assert.equal(await hero.getAttribute('aria-busy'), null);
        assert.equal(await hero.locator('.copy-label-done').textContent(), language === 'en' ? 'Copied!' : 'Αντιγράφηκε!');
        await hero.locator('.copy-label-done').waitFor({ state: 'visible' });
        assert.equal(await hero.evaluate(el => el.offsetWidth), initialWidth, 'confirmation does not resize the layout');
        assert.equal(await page.evaluate(() => window.copyWrites.at(-1)), await page.locator('#text-start').inputValue());
        const runningAnimations = await hero.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length);
        assert.equal(runningAnimations > 0, reducedMotion === 'no-preference', 'reduced motion suppresses all button animations');
        await hero.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));

        // A second successful click must replay the burst and restart the reset timer.
        await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.copyWrites.push(text); }; });
        await hero.click();
        assert.equal(await hero.getAttribute('data-copy-state'), 'success');
        if (reducedMotion === 'no-preference') {
          const elapsed = await hero.evaluate(el => el.getAnimations().find(animation => animation.animationName === 'copy-celebrate').currentTime);
          assert.ok(elapsed < 300, 'repeat copy restarts the success animation');
        }
        await page.waitForFunction(() => !document.querySelector('[data-copy=start]').dataset.copyState);
        await hero.locator('.copy-label-done').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-copy=start] .copy-label-ready')).opacity === '1');
        assert.equal(await hero.locator('.copy-label-ready').isVisible(), true, 'original label is restored');

        const selected = page.locator('#copy-selected');
        await selected.focus();
        await page.keyboard.press('Space');
        assert.equal(await selected.getAttribute('data-copy-state'), 'success', 'library button supports keyboard activation');
        assert.equal(await hero.getAttribute('data-copy-state'), null, 'buttons maintain independent feedback');
        await page.evaluate(() => {
          navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
          document.execCommand = () => false;
        });
        await selected.click();
        assert.equal(await selected.getAttribute('data-copy-state'), null, 'manual-copy fallback never celebrates success');
        assert.equal(await selected.isDisabled(), false);
        assert.equal(await selected.getAttribute('aria-busy'), null);
        assert.match(await page.locator('#toast').textContent(), language === 'en' ? /manually/ : /χειροκίνητη αντιγραφή/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'effects do not create horizontal overflow');
        assert.deepEqual(errors, []);
        await context.close();
        console.log(`PASS: ${language}, ${reducedMotion} — copy completion, repeat animation, keyboard, reset, failure, and stable mobile layout.`);
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
