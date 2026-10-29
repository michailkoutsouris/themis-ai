const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { unzipSync } = require('fflate');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const baseURL = process.env.TEST_BASE_URL || pathToFileURL(path.join(__dirname, 'dist/index.html')).href;

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : { channel: 'chrome' }),
    headless: true,
  });
  try {
  for (const language of ['el', 'en']) {
  const directory = language === 'en' ? 'en/' : '';
  const targetURL = process.env.TEST_BASE_URL
    ? new URL(directory || './', baseURL.endsWith('/') ? baseURL : baseURL + '/').href
    : new URL(directory + 'index.html', baseURL).href;
  const otherLanguage = language === 'en' ? 'el' : 'en';
  const archiveFilename = language === 'en' ? 'themis-prompts-en.zip' : 'themis-prompts.zip';
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
  assert.match(await page.title(), language === 'en' ? /Themis/ : /Θέμις/);
  assert.equal(await page.locator('html').getAttribute('lang'), language);
  assert.equal(await page.locator('.language-switch [aria-current=page]').getAttribute('lang'), language);
  assert.equal(await page.locator('.brand-name').textContent(), language === 'en' ? 'Themis' : 'Θέμις');
  if (language === 'en') {
    const untranslated = await page.evaluate(() => {
      const body = document.body.cloneNode(true);
      for (const element of body.querySelectorAll('script, textarea, .language-switch')) element.remove();
      return /[\p{Script=Greek}]/u.test(body.textContent);
    });
    assert.equal(untranslated, false, 'English UI contains no untranslated Greek text');
  }
  assert.equal(await page.locator('.seal, .scope-art').count(), 0);
  assert.equal(await page.locator('.repo-link').getAttribute('href'), 'https://github.com/michailkoutsouris/themis-ai');
  assert.equal(await page.locator('.license-note a').first().getAttribute('href'), 'https://github.com/michailkoutsouris/themis-ai/blob/main/LICENSE');
  assert.equal(await page.locator('aside, .rail').count(), 0, 'sidebar is removed');
  // The first screen adapts to the actual navbar height and the viewport.
  for (const [width, height, fitsViewport] of [[1440, 700, true], [1440, 1000, true], [1440, 1440, true], [390, 844, true], [320, 568, false], [844, 390, false]]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.evaluate(() => {
      const navbar = document.querySelector('.topline').getBoundingClientRect();
      const hero = document.querySelector('.hero').getBoundingClientRect();
      const brand = document.querySelector('.brand').getBoundingClientRect();
      const tagline = document.querySelector('.brand-sub').getBoundingClientRect();
      return { navbarBottom: navbar.bottom, heroTop: hero.top, heroBottom: hero.bottom, heroHeight: hero.height, viewport: innerHeight, sameRow: Math.min(brand.bottom, tagline.bottom) > Math.max(brand.top, tagline.top), divider: getComputedStyle(document.querySelector('.brand-sub')).borderInlineStartWidth };
    });
    assert.ok(Math.abs(geometry.heroTop - geometry.navbarBottom) < 1, 'hero follows the actual navbar height');
    assert.ok(geometry.heroHeight >= 520, 'hero keeps its minimum height');
    assert.ok(geometry.heroBottom >= geometry.viewport - 1, 'first screen fills the viewport');
    if (fitsViewport) assert.ok(Math.abs(geometry.heroBottom - geometry.viewport) < 1, 'navbar and hero fill exactly one viewport');
    assert.equal(geometry.sameRow, true, 'wordmark and description share a row');
    assert.equal(geometry.divider, '1px');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const prompts = await page.locator('#prompt-data').evaluate(el => JSON.parse(el.textContent));
  assert.deepEqual(prompts.map(prompt => prompt.id), ['start', 'final', 'handoff', 'review']);
  assert.deepEqual(await page.locator('[role=tab]').evaluateAll(tabs => tabs.map(tab => tab.dataset.tab)), ['start', 'final', 'handoff', 'review']);
  assert.equal(await page.locator('#tab-final').textContent(), language === 'en' ? 'Full Check' : 'Πλήρης Έλεγχος');
  function verifyArchive(bytes) {
    const entries = unzipSync(bytes);
    assert.deepEqual(Object.keys(entries).sort(), prompts.map(prompt => prompt.filename).sort(), 'ZIP contains exactly four separate prompts');
    for (const prompt of prompts) assert.equal(Buffer.from(entries[prompt.filename]).toString('utf8'), prompt.content, prompt.id + ' ZIP content matches canonical text');
  }
  for (const prompt of prompts) {
    const canonical = fs.readFileSync(path.join(__dirname,'src/content/prompts',directory,prompt.filename),'utf8').trim()+'\n';
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
  assert.equal(await page.locator('#tab-final').getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');
  assert.equal(await page.locator('#tab-review').getAttribute('aria-selected'),'true');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#tab-handoff').getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');
  for (const prompt of prompts) {
    await page.locator('#tab-' + prompt.id).click();
    const expand = page.locator('[data-expand=' + prompt.id + ']');
    assert.equal(await expand.locator('.icon-expand').isVisible(), true);
    assert.equal(await expand.locator('.icon-collapse').isVisible(), false);
    await expand.click();
    assert.equal(await expand.getAttribute('aria-expanded'), 'true');
    assert.equal(await expand.locator('.icon-expand').isVisible(), false);
    assert.equal(await expand.locator('.icon-collapse').isVisible(), true);
    assert.equal(await page.locator('#text-' + prompt.id).evaluate(el => el.classList.contains('expanded')), true);
    await expand.click();
    assert.equal(await expand.getAttribute('aria-expanded'), 'false');
    assert.equal(await expand.locator('.icon-expand').isVisible(), true);
    assert.equal(await expand.locator('.icon-collapse').isVisible(), false);
  }
  await page.locator('#tab-start').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.download').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(),archiveFilename);
  verifyArchive(fs.readFileSync(await download.path()));
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {throw new Error('Permission denied');};
    document.execCommand = command => {window.fallbackCommand=command; return true;};
  });
  await page.locator('#copy-selected').click();
  assert.equal(await page.evaluate(() => window.fallbackCommand),'copy');
  assert.match(await page.locator('#toast').textContent(),language === 'en' ? /Copied:/ : /Αντιγράφηκε/);
  await page.evaluate(() => {document.execCommand = () => false;});
  await page.locator('#copy-selected').click();
  assert.match(await page.locator('#toast').textContent(),language === 'en' ? /manually/ : /χειροκίνητη αντιγραφή/);
  assert.equal(await page.locator('#text-start').evaluate(el => el.selectionEnd-el.selectionStart),prompts[0].content.length);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'no page overflow at '+width);
    const visibleControls = page.locator('button:visible, a:visible');
    assert.ok(await visibleControls.count()>10);
    if (process.env.QA_SCREENSHOT_DIR && (width===390 || width===1440)) {
      fs.mkdirSync(process.env.QA_SCREENSHOT_DIR, { recursive: true });
      await page.evaluate(() => window.scrollTo(0,0));
      await page.screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,language+'-'+width+'.png'),fullPage:true});
    }
  }
  assert.equal(await page.locator('.faq details').count(), 4);
  for (const question of await page.locator('.faq details').all()) {
    assert.equal(await question.locator('.icon-down').isVisible(), true);
    assert.equal(await question.locator('.icon-up').isVisible(), false);
    await question.locator('summary').click();
    assert.equal(await question.getAttribute('open'), '');
    assert.equal(await question.locator('.icon-down').isVisible(), false);
    assert.equal(await question.locator('.icon-up').isVisible(), true);
    await question.locator('summary').click();
    assert.equal(await question.locator('.icon-down').isVisible(), true);
  }
  assert.equal(await page.locator('a[target=_blank]:not([rel*="noopener"])').count(),0);
  assert.deepEqual(errors,[],'no runtime errors');
  await page.evaluate(() => { window.location.hash = 'sources'; });
  await page.locator(`.language-switch a[lang=${otherLanguage}]`).click();
  assert.equal(await page.locator('html').getAttribute('lang'), otherLanguage, 'language switch changes the page language');
  assert.equal(new URL(page.url()).hash, '#sources', 'language switch preserves the section');
  const otherCanonical = fs.readFileSync(path.join(__dirname, 'src/content/prompts', otherLanguage === 'en' ? 'en' : '', 'themis-main.md'), 'utf8').trim() + '\n';
  assert.equal(await page.locator('#text-start').inputValue(), otherCanonical, 'language switch changes prompt text');
  await context.close();
  const noJS = await browser.newContext({javaScriptEnabled:false});
  const fallback = await noJS.newPage();
  await fallback.goto(targetURL);
  assert.equal(await fallback.locator('#text-start').inputValue(),prompts[0].content);
  assert.ok(await fallback.locator('noscript').isVisible());
  if (process.env.TEST_BASE_URL) {
    const downloadReady = fallback.waitForEvent('download');
    await fallback.locator('noscript a').click();
    const archive = await downloadReady;
    assert.equal(archive.suggestedFilename(), archiveFilename, 'localized ZIP download works without JavaScript');
    verifyArchive(fs.readFileSync(await archive.path()));
  }
  await fallback.locator('.faq summary').first().click();
  assert.equal(await fallback.locator('.faq .icon-up').first().isVisible(), true, 'FAQ icon changes without JavaScript');
  await fallback.locator(`.language-switch a[lang=${otherLanguage}]`).click();
  assert.equal(await fallback.locator('html').getAttribute('lang'), otherLanguage, 'language switch works without JavaScript');
  assert.equal(await fallback.locator('#text-start').inputValue(), otherCanonical);
  await noJS.close();
  if (process.env.TEST_BASE_URL) {
    for (const prompt of prompts) {
      const response = await fetch(new URL('prompts/' + prompt.filename, targetURL));
      assert.equal(response.status, 200, prompt.filename + ' served');
      assert.match(response.headers.get('content-type'), /text\/markdown/);
      assert.equal((await response.text()).trim() + '\n', prompt.content);
    }
    const archiveResponse = await fetch(new URL(archiveFilename, targetURL));
    assert.equal(archiveResponse.status, 200, 'ZIP archive served');
    assert.match(archiveResponse.headers.get('content-type'), /application\/zip/);
    verifyArchive(new Uint8Array(await archiveResponse.arrayBuffer()));
    const bundleResponse = await fetch(new URL('themis-prompts.md', targetURL));
    assert.equal(bundleResponse.status, 200, 'Markdown bundle served');
    assert.equal(await bundleResponse.text(), fs.readFileSync(path.join(__dirname, 'dist', directory, 'themis-prompts.md'), 'utf8'));
    assert.equal((await fetch(new URL('this-page-does-not-exist', targetURL))).status, 404);
  }
  console.log('PASS: ' + language + ' — canonical prompts, copy/download, clipboard fallbacks, keyboard, responsive layouts, no-JS, and language switching.');
  }
  } finally {
    await browser.close();
  }
  console.log('PASS: both languages, viewport-filling hero and navbar geometry, repository/license links, and no runtime errors.');
})().catch(error => {console.error(error);process.exit(1);});
