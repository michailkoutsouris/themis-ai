const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  const context = await browser.newContext({viewport: {width:1440,height:1000}, acceptDownloads:true});
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.copied = [];
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async value => {window.copied.push(value);}}});
  });
  await page.goto(targetURL);
  assert.match(await page.title(), /Θέμις/);
  assert.equal(await page.locator('.brand-name').textContent(), 'Θέμις.');
  assert.equal(await page.locator('.seal, .scope-art').count(), 0);
  assert.equal(await page.locator('.repo-link').getAttribute('href'), 'https://github.com/michailkoutsouris/themis-ai');
  assert.equal(await page.locator('.license-note a').first().getAttribute('href'), 'https://github.com/michailkoutsouris/themis-ai/blob/main/LICENSE');
  // The note stays at the viewport bottom as the sticky desktop rail scrolls.
  for (const height of [600, 1000]) {
    await page.setViewportSize({ width: 1440, height });
    for (const scrollY of [0, 900]) {
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);
      const geometry = await page.locator('.rail').evaluate(rail => ({
        top: rail.getBoundingClientRect().top,
        bottom: rail.getBoundingClientRect().bottom,
        noteBottom: rail.querySelector('.rail-note').getBoundingClientRect().bottom,
        padding: parseFloat(getComputedStyle(rail).paddingBottom),
        viewport: innerHeight,
      }));
      assert.ok(Math.abs(geometry.top) < 1, 'rail sticks to viewport top');
      assert.ok(Math.abs(geometry.bottom - geometry.viewport) < 1, 'rail fills viewport height');
      assert.ok(Math.abs(geometry.noteBottom + geometry.padding - geometry.viewport) < 1, 'note aligns with viewport bottom');
    }
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const prompts = await page.locator('#prompt-data').evaluate(el => JSON.parse(el.textContent));
  for (const prompt of prompts) {
    const canonical = fs.readFileSync(path.join(__dirname,'src/content/prompts',prompt.filename),'utf8').trim()+'\n';
    assert.equal(prompt.content, canonical, prompt.id+' canonical text');
    assert.equal(await page.locator('#text-'+prompt.id).inputValue(), canonical, prompt.id+' visible text');
    await page.locator('#tab-'+prompt.id).click();
    assert.equal(await page.locator('#tab-'+prompt.id).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('[role=tabpanel]:visible').count(),1);
    await page.locator('#copy-selected').click();
    assert.equal(await page.evaluate(() => window.copied.at(-1)), canonical, prompt.id+' copied text');
  }
  await page.locator('[data-copy=start]').click();
  assert.equal(await page.evaluate(() => window.copied.at(-1)),prompts[0].content,'hero copies main regardless of selected tab');
  await page.locator('#tab-start').click();
  await page.locator('#tab-start').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-review').getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');
  assert.equal(await page.locator('#tab-handoff').getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');
  const expand = page.locator('[data-expand=start]');
  await expand.click();
  assert.equal(await expand.getAttribute('aria-expanded'),'true');
  await expand.click();
  assert.equal(await expand.getAttribute('aria-expanded'),'false');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.download').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(),'themis-prompts.md');
  const downloaded = fs.readFileSync(await download.path(),'utf8');
  for (const prompt of prompts) assert.ok(downloaded.includes(prompt.content.trim()),prompt.id+' in downloaded bundle');
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {throw new Error('Permission denied');};
    document.execCommand = command => {window.fallbackCommand=command; return true;};
  });
  await page.locator('#copy-selected').click();
  assert.equal(await page.evaluate(() => window.fallbackCommand),'copy');
  assert.match(await page.locator('#toast').textContent(),/Αντιγράφηκε/);
  await page.evaluate(() => {document.execCommand = () => false;});
  await page.locator('#copy-selected').click();
  assert.match(await page.locator('#toast').textContent(),/χειροκίνητη αντιγραφή/);
  assert.equal(await page.locator('#text-start').evaluate(el => el.selectionEnd-el.selectionStart),prompts[0].content.length);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'no page overflow at '+width);
    const visibleControls = page.locator('button:visible, a:visible');
    assert.ok(await visibleControls.count()>10);
    if (process.env.QA_SCREENSHOT_DIR && (width===390 || width===1440)) {
      fs.mkdirSync(process.env.QA_SCREENSHOT_DIR, { recursive: true });
      await page.evaluate(() => window.scrollTo(0,0));
      await page.screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,width+'.png'),fullPage:true});
    }
  }
  await page.locator('.faq summary').first().click();
  assert.equal(await page.locator('.faq details').first().getAttribute('open'),'');
  assert.equal(await page.locator('a[target=_blank]:not([rel*="noopener"])').count(),0);
  assert.deepEqual(errors,[],'no runtime errors');
  await context.close();
  const noJS = await browser.newContext({javaScriptEnabled:false});
  const fallback = await noJS.newPage();
  await fallback.goto(targetURL);
  assert.equal(await fallback.locator('#text-start').inputValue(),prompts[0].content);
  assert.ok(await fallback.locator('noscript').isVisible());
  await noJS.close();
  if (process.env.TEST_BASE_URL) {
    for (const prompt of prompts) {
      const response = await fetch(new URL('/prompts/' + prompt.filename, targetURL));
      assert.equal(response.status, 200, prompt.filename + ' served');
      assert.match(response.headers.get('content-type'), /text\/markdown/);
      assert.equal((await response.text()).trim() + '\n', prompt.content);
    }
    const bundleResponse = await fetch(new URL('/themis-prompts.md', targetURL));
    assert.equal(bundleResponse.status, 200, 'Markdown bundle served');
    assert.equal(await bundleResponse.text(), fs.readFileSync(path.join(__dirname, 'dist/themis-prompts.md'), 'utf8'));
    assert.equal((await fetch(new URL('/this-page-does-not-exist', targetURL))).status, 404);
  }
  } finally {
    await browser.close();
  }
  console.log('PASS: canonical prompts, 4 tabs/copy actions, hero copy, keyboard, expand/collapse, Markdown download, clipboard fallbacks, no-JS, 4 responsive widths, safe links, no JS errors, sticky sidebar geometry, repository/license links.');
})().catch(error => {console.error(error);process.exit(1);});
