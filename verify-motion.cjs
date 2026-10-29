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
  const urlFor = language => process.env.TEST_BASE_URL
    ? new URL(language === 'en' ? 'en/' : './', process.env.TEST_BASE_URL.replace(/\/?$/, '/')).href
    : pathToFileURL(path.join(__dirname, 'dist', language === 'en' ? 'en' : '', 'index.html')).href;
  try {
    for (const language of ['el', 'en']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(() => {
        HTMLCanvasElement.prototype.getContext = () => null;
        window.motionCalls = [];
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (frames, options) {
          window.motionCalls.push({ element: this, frames, options });
          return animate.call(this, frames, options);
        };
        window.copyCount = 0;
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { window.copyCount++; } } });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(urlFor(language));
      await page.waitForFunction(() => window.motionCalls.some(call => call.element.matches('.hero-line-text')));
      assert.equal(await page.locator('html').getAttribute('data-page-motion'), 'full');
      await page.locator('[data-copy=start]').focus();
      assert.equal(await page.locator('.hero-actions').evaluate(el => getComputedStyle(el).opacity), '1', 'keyboard focus immediately reveals its controls');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.copyCount), 1, 'keyboard copy works during the intro');

      await page.evaluate(() => window.scrollTo({ top: document.querySelector('#start').offsetTop, behavior: 'instant' }));
      await page.waitForFunction(() => window.motionCalls.filter(call => call.element.matches('.step')).length === 3);
      const stepCount = await page.evaluate(() => window.motionCalls.filter(call => call.element.matches('.step')).length);
      await page.evaluate(() => { for (const animation of document.getAnimations()) animation.finish(); window.scrollTo({ top: 0, behavior: 'instant' }); });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => window.scrollTo({ top: document.querySelector('#start').offsetTop, behavior: 'instant' }));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => window.motionCalls.filter(call => call.element.matches('.step')).length), stepCount, 'scrolling back does not replay entrances');

      // Pointer focus must not shift a delayed entrance between pointer down/up.
      await page.locator('#tab-start').click();
      await page.locator('#copy-selected').click();
      assert.equal(await page.evaluate(() => window.copyCount), 2, 'pointer copy survives the library entrance');
      await page.locator('#tab-handoff').click();
      assert.equal(await page.locator('#tab-handoff').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('.tabs').evaluate(el => el.style.getPropertyValue('--tab-x')), await page.locator('#tab-handoff').evaluate(el => `${el.offsetLeft}px`));
      await page.locator('#text-handoff').focus();
      assert.equal(await page.locator('#text-handoff').evaluate(el => getComputedStyle(el).opacity), '1', 'text focus finishes the panel entrance');
      await page.locator('[data-expand=handoff]').click();
      await page.waitForFunction(() => document.querySelector('#text-handoff').offsetHeight === 680);
      await page.locator('[data-expand=handoff]').click();
      await page.waitForFunction(() => document.querySelector('#text-handoff').offsetHeight === 360);

      const question = page.locator('.faq details').first();
      const summary = question.locator('summary');
      await summary.scrollIntoViewIfNeeded();
      await summary.evaluate(el => { el.click(); el.click(); el.click(); });
      await page.waitForFunction(() => { const el = document.querySelector('.faq details'); return el.open && !el.dataset.faqTarget; });
      await summary.focus();
      await page.keyboard.press('Space');
      await page.waitForFunction(() => { const el = document.querySelector('.faq details'); return !el.open && !el.dataset.faqTarget; });
      await summary.evaluate(el => el.click());
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.documentElement.dataset.pageMotion === 'reduced');
      assert.equal(await question.getAttribute('open'), '', 'preference change completes the intended FAQ state');
      assert.equal(await page.locator('html').getAttribute('data-page-motion'), 'reduced');
      assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0, 'preference change cancels motion');
      await summary.click();
      assert.equal(await question.getAttribute('open'), null, 'reduced-motion FAQ closes natively');

      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await page.waitForFunction(() => document.querySelector('.reading-progress').style.transform === 'scaleX(1)');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => document.documentElement.dataset.pageMotion === 'full');
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      assert.equal(await page.locator('html').getAttribute('data-page-motion'), 'reduced');
      assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0, 'printing cannot capture concealed entrances');
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => { window.dispatchEvent(new Event('afterprint')); window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
      assert.equal(await page.locator('.reading-progress').count(), 1, 'page-cache return does not duplicate decorations');
      assert.equal(await page.locator('html').getAttribute('data-page-motion'), 'full');
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no overflow at ' + width);
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS: ${language} — entrances, keyboard/pointer access, tab/textarea/FAQ motion, preference changes, progress, printing, and page-cache return.`);
    }
    for (const fallback of ['reduced', 'no-observer', 'no-js']) {
      const context = await browser.newContext({ reducedMotion: fallback === 'reduced' ? 'reduce' : 'no-preference', javaScriptEnabled: fallback !== 'no-js' });
      if (fallback !== 'no-js') await context.addInitScript(mode => {
        HTMLCanvasElement.prototype.getContext = () => null;
        if (mode === 'no-observer') window.IntersectionObserver = undefined;
      }, fallback);
      const page = await context.newPage();
      await page.goto(urlFor('el'));
      assert.equal(await page.locator('.hero h1').isVisible(), true);
      assert.equal(await page.locator('#text-start').inputValue().then(text => text.startsWith('# ΘΕΜΙΣ')), true);
      await page.locator('.faq summary').first().click();
      assert.equal(await page.locator('.faq details').first().getAttribute('open'), '');
      if (fallback !== 'no-js') assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0);
      await context.close();
      console.log(`PASS: ${fallback} — content and native interactions remain available.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
