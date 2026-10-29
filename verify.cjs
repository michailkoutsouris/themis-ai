const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
  const context = await browser.newContext({viewport: {width:1440,height:1000}, acceptDownloads:true});
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.copied = [];
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async value => {window.copied.push(value);}}});
  });
  await page.goto(pathToFileURL(path.join(__dirname,'dist/index.html')).href);
  assert.match(await page.title(), /Θέμις/);
  const prompts = await page.locator('#prompt-data').evaluate(el => JSON.parse(el.textContent));
  for (const prompt of prompts) {
    const canonical = fs.readFileSync(path.join(__dirname,'dist/prompts',prompt.filename),'utf8').trim()+'\n';
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
    if (width===390 || width===1440) {
      await page.evaluate(() => window.scrollTo(0,0));
      await page.screenshot({path:'/tmp/themis-qa/'+width+'.png',fullPage:true});
    }
  }
  await page.locator('.faq summary').first().click();
  assert.equal(await page.locator('.faq details').first().getAttribute('open'),'');
  assert.equal(await page.locator('a[target=_blank]:not([rel*="noopener"])').count(),0);
  assert.deepEqual(errors,[],'no runtime errors');
  await context.close();
  const noJS = await browser.newContext({javaScriptEnabled:false});
  const fallback = await noJS.newPage();
  await fallback.goto(pathToFileURL(path.join(__dirname,'dist/index.html')).href);
  assert.equal(await fallback.locator('#text-start').inputValue(),prompts[0].content);
  assert.ok(await fallback.locator('noscript').isVisible());
  await browser.close();
  console.log('PASS: canonical prompts, 4 tabs/copy actions, hero copy, keyboard, expand/collapse, Markdown download, clipboard fallbacks, no-JS, 4 responsive widths, safe links, no JS errors.');
})().catch(error => {console.error(error);process.exit(1);});
