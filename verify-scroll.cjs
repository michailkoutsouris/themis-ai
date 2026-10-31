const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const urlFor = lang => process.env.TEST_BASE_URL
  ? new URL(lang === 'en' ? 'en/' : './', process.env.TEST_BASE_URL.replace(/\/?$/, '/')).href
  : pathToFileURL(path.join(__dirname, 'dist', lang === 'en' ? 'en' : '', 'index.html')).href;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const lang of ['el', 'en']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.setDefaultTimeout(10000);
      await page.addInitScript(() => HTMLCanvasElement.prototype.getContext = () => null);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(urlFor(lang));
      // Capture actual animation frames, including the first input after idle time.
      for (const idle of [0, 1200]) {
        await page.waitForTimeout(idle);
        const from = await page.evaluate(() => scrollY);
        const samples = await page.evaluate(() => new Promise(resolve => {
          const samples = [];
          let count = 0;
          document.body.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true }));
          function record() { samples.push(scrollY); if (++count < 50) requestAnimationFrame(record); else resolve(samples); }
          requestAnimationFrame(record);
        }));
        assert.ok(samples.some(value => value > from && value < from + 280), 'page wheel has intermediate frames after idle ' + idle);
        assert.ok(Math.abs(samples.at(-1) - from - 300) <= 2, 'page wheel reaches its target');
      }
      for (const id of ['start', 'final', 'handoff', 'review']) {
        await page.locator('#tab-' + id).click();
        const field = page.locator('#text-' + id);
        await field.scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await field.hover();
        await page.waitForTimeout(150);
        const pageY = await page.evaluate(() => scrollY);
        const target = await field.evaluate(el => Math.min(300, el.scrollHeight - el.clientHeight));
        await field.evaluate(el => { window.promptScrollSamples = []; el.addEventListener('scroll', () => window.promptScrollSamples.push(el.scrollTop)); });
        await page.mouse.wheel(0, 300);
        await page.waitForFunction(({id, target}) => Math.abs(document.getElementById('text-' + id).scrollTop - target) <= 2, {id, target});
        if (target > 100) assert.ok(await page.evaluate(target => window.promptScrollSamples.some(value => value > 0 && value < target - 10), target), 'prompt scroll has intermediate frames');
        assert.ok(Math.abs(await page.evaluate(() => scrollY) - pageY) <= 1, 'prompt scrolling leaves the page still: ' + id + ' from ' + pageY + ' to ' + await page.evaluate(() => scrollY));
        if (id === 'start') {
          await field.focus();
          await page.keyboard.press('PageDown');
          await page.waitForFunction(() => document.querySelector('#text-start').scrollTop > 300);
        }
        // Contain wheel input at the end rather than unexpectedly scrolling the page.
        await field.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
        await page.waitForTimeout(100);
        await page.mouse.wheel(0, 200);
        await page.waitForTimeout(150);
        assert.ok(Math.abs(await page.evaluate(() => scrollY) - pageY) <= 1, 'prompt boundary does not leak wheel input');
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('html').evaluate(el => el.classList.contains('lenis')), false);
      assert.equal(await page.locator('#text-review').evaluate(el => getComputedStyle(el).scrollBehavior), 'auto');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
      assert.equal(await page.locator('textarea.lenis').count(), 4, 'page-cache return restores each scroll area');
      for (const width of [320, 390, 560]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('.step').first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(900);
        const layout = await page.locator('.step').evaluateAll(steps => steps.map(step => {
          const label = step.querySelector('.step-num').getBoundingClientRect();
          const heading = step.querySelector('h3').getBoundingClientRect();
          const description = step.querySelector('p').getBoundingClientRect();
          return label.bottom <= heading.top && heading.bottom <= description.top && Math.abs(label.left - heading.left) <= 1;
        }));
        assert.ok(layout.every(Boolean), 'mobile labels sit above heading and description at ' + width);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS: ${lang} — smooth page/prompt wheel input, idle resume, contained boundaries, reduced motion, lifecycle and mobile steps.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
