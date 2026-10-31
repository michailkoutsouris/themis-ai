(() => {
  'use strict';
  const seen = new WeakSet();
  const ease = 'cubic-bezier(.16,1,.3,1)';
  let dispose;

  function mountMotion() {
    const root = document.documentElement;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const supported = typeof Element.prototype.animate === 'function' && typeof IntersectionObserver === 'function';
    const active = new Map();
    const faqRuns = new Map();
    const resizeRuns = new Map();
    const listeners = [];
    const entries = new Map();
    let observer;
    let frame = 0;
    let alive = true;
    let pointerFocusUntil = 0;
    let reduced = preference.matches || !supported;
    let activeTab = document.querySelector('[role=tab][aria-selected=true]')?.dataset.tab;

    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    };
    function animate(element, frames, options = {}) {
      if (reduced || !alive || document.hidden) return null;
      const animation = element.animate(frames, { duration: 760, easing: ease, fill: 'backwards', ...options });
      active.set(animation, element);
      animation.finished.then(() => active.delete(animation), () => active.delete(animation));
      return animation;
    }
    function finishRelated(target) {
      for (const [animation, element] of active) {
        if (element.contains(target) || target.contains(element)) {
          try { animation.finish(); } catch (_) { animation.cancel(); }
        }
      }
    }
    function rule(element, delay = 0) {
      let line = element.querySelector(':scope > .motion-rule');
      if (!line) {
        element.classList.add('motion-ruled');
        line = document.createElement('i');
        line.className = 'motion-rule';
        line.setAttribute('aria-hidden', 'true');
        element.append(line);
      }
      animate(line, [{ transform: 'scaleX(0)', opacity: .9 }, { transform: 'scaleX(1)', opacity: .45 }], { duration: 1000, delay });
    }
    function drawIcon(element, delay) {
      for (const [index, path] of [...element.querySelectorAll('.section-icon path')].entries()) {
        const length = path.getTotalLength();
        if (!length) continue;
        animate(path, [
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: length, opacity: .2 },
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0, opacity: 1 },
        ], { duration: 1000, delay: delay + 80 + index * 90 });
      }
    }
    function reveal(element, entry) {
      if (seen.has(element)) return;
      seen.add(element);
      let frames;
      if (entry.kind === 'line') frames = [{ transform: 'translateY(110%) rotate(2deg)', opacity: .1 }, { transform: 'translateY(0) rotate(0)', opacity: 1 }];
      else if (entry.kind === 'sheet') frames = [{ transform: 'perspective(1200px) translateY(28px) rotateX(3deg) scale(.985)', opacity: 0 }, { transform: 'perspective(1200px) translateY(0) rotateX(0) scale(1)', opacity: 1 }];
      else if (entry.kind === 'heading') frames = [{ transform: 'translateX(-16px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }];
      else if (entry.kind === 'nav') frames = [{ transform: 'translateY(-10px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }];
      else if (entry.kind === 'waves') frames = [{ opacity: 0 }, { opacity: 1 }];
      else frames = [{ transform: 'translateY(24px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }];
      const hero = element.closest('.landing');
      const duration = hero ? (entry.kind === 'waves' ? 900 : entry.kind === 'line' ? 650 : 420) : 760;
      animate(element, frames, { duration, delay: entry.delay });
      if (entry.kind === 'heading') drawIcon(element, entry.delay);
      if (entry.ruled) rule(element, entry.delay + 80);
    }
    function register(selector, kind = 'rise', stagger = 0, delay = 0, ruled = false) {
      for (const [index, element] of [...document.querySelectorAll(selector)].entries()) {
        entries.set(element, { kind, delay: delay + (index % 4) * stagger, ruled });
      }
    }
    register('.brand-lockup, .top-actions', 'nav', 50, 40);
    register('.hero-content > .eyebrow', 'rise', 0, 80);
    register('.hero-line-text', 'line', 70, 100);
    register('.hero-copy', 'rise', 0, 220);
    register('.hero-actions', 'rise', 0, 280);
    register('.scope-strip > span', 'rise', 50, 350);
    register('.hero-waves', 'waves');
    register('.section-title-row', 'heading');
    register('.section-header > p', 'rise', 0, 110);
    register('.step', 'rise', 100, 100, true);
    register('.setup, .library', 'sheet', 0, 110);
    register('.settings-list > li', 'rise', 65, 170);
    register('.small-note, .sources-inline, .library-help, .specialists', 'rise', 0, 100);
    register('.person', 'rise', 75, 70, true);
    register('.source-row', 'rise', 65, 40, true);
    register('.faq details', 'rise', 65, 60, true);
    register('.closing-copy, .closing-meta', 'rise', 100, 50);

    const progress = document.querySelector('.reading-progress') || document.createElement('div');
    if (!progress.isConnected) {
      progress.className = 'reading-progress';
      progress.setAttribute('aria-hidden', 'true');
      document.body.append(progress);
    }
    function updateTabs() {
      const tabs = document.querySelector('.tabs');
      const tab = tabs?.querySelector('[aria-selected=true]');
      if (!tab) return;
      tabs.style.setProperty('--tab-x', `${tab.offsetLeft}px`);
      tabs.style.setProperty('--tab-width', `${tab.offsetWidth}px`);
      tabs.setAttribute('data-motion-tabs', '');
    }
    function updateProgress() {
      frame = 0;
      if (!alive) return;
      const range = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${range > 0 ? Math.min(1, Math.max(0, scrollY / range)) : 0})`;
    }
    function scheduleProgress() {
      if (!frame) frame = requestAnimationFrame(updateProgress);
    }
    function closeRun(details, run, complete) {
      if (faqRuns.get(details) !== run) return;
      faqRuns.delete(details);
      if (complete) details.open = run.opening;
      delete details.dataset.faqTarget;
    }
    function onDisclosure(event) {
      const summary = event.target instanceof Element ? event.target.closest('.faq summary') : null;
      if (!summary || reduced || event.defaultPrevented || event.button > 0) return;
      event.preventDefault();
      const details = summary.parentElement;
      // Finish the entrance after the click has landed, before measuring the fold.
      if (!faqRuns.has(details)) finishRelated(details);
      const previous = faqRuns.get(details);
      const opening = previous ? !previous.opening : !details.open;
      const from = details.getBoundingClientRect().height;
      previous?.animation.cancel();
      details.open = true;
      const style = getComputedStyle(details);
      const to = opening ? details.getBoundingClientRect().height
        : summary.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      details.dataset.faqTarget = opening ? 'open' : 'closed';
      const animation = animate(details, [{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }], { duration: 400 });
      if (!animation) { details.open = opening; delete details.dataset.faqTarget; return; }
      const run = { animation, opening };
      faqRuns.set(details, run);
      animation.finished.then(() => closeRun(details, run, true), () => closeRun(details, run, false));
      if (opening) for (const paragraph of details.querySelectorAll('p')) animate(paragraph, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 360, delay: 60 });
    }
    function onTab(event) {
      updateTabs();
      if (event.detail.id === activeTab) return;
      activeTab = event.detail.id;
      const panel = document.getElementById(`panel-${activeTab}`);
      if (!panel) return;
      finishRelated(panel.parentElement);
      for (const [index, element] of [...panel.querySelectorAll('.prompt-heading, .prompt-text, .prompt-bottom')].entries()) {
        animate(element, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 420, delay: index * 45 });
      }
    }
    function onPromptResize(event) {
      const field = document.getElementById(event.detail.id);
      if (!field) return;
      resizeRuns.get(field)?.cancel();
      const to = field.offsetHeight;
      const animation = animate(field, [{ height: `${event.detail.from}px` }, { height: `${to}px` }], { duration: 420 });
      if (animation) {
        resizeRuns.set(field, animation);
        const cleanup = () => { if (resizeRuns.get(field) === animation) resizeRuns.delete(field); };
        animation.finished.then(cleanup, cleanup);
      }
    }
    function syncPreference(forceReduced = false) {
      reduced = forceReduced === true || preference.matches || !supported;
      root.dataset.pageMotion = reduced ? 'reduced' : 'full';
      observer?.disconnect();
      if (reduced) {
        for (const [details, run] of faqRuns) {
          faqRuns.delete(details);
          run.animation.cancel();
          details.open = run.opening;
          delete details.dataset.faqTarget;
        }
        for (const animation of active.keys()) animation.cancel();
        active.clear();
        return;
      }
      observer = new IntersectionObserver(records => {
        for (const record of records) if (record.isIntersecting) {
          reveal(record.target, entries.get(record.target));
          observer.unobserve(record.target);
        }
      }, { threshold: .08 });
      for (const [element] of entries) if (!seen.has(element)) observer.observe(element);
    }
    listen(preference, 'change', syncPreference);
    listen(window, 'beforeprint', () => syncPreference(true));
    listen(window, 'afterprint', () => syncPreference());
    listen(document, 'pointerdown', () => { pointerFocusUntil = performance.now() + 250; }, { capture: true, passive: true });
    listen(document, 'keydown', () => { pointerFocusUntil = 0; }, { capture: true });
    listen(document, 'focusin', event => {
      // A pointer's focus event is between down/up: moving its target here loses clicks.
      if (performance.now() >= pointerFocusUntil || event.target.matches('textarea')) finishRelated(event.target);
    });
    listen(document, 'click', onDisclosure);
    listen(document, 'themis:tab-change', onTab);
    listen(document, 'themis:prompt-resize', onPromptResize);
    listen(window, 'scroll', scheduleProgress, { passive: true });
    listen(window, 'resize', () => { updateTabs(); scheduleProgress(); });
    listen(window, 'hashchange', () => {
      let target;
      try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (_) { return; }
      if (target) {
        finishRelated(target);
        for (const [element] of entries) if (target.contains(element)) { seen.add(element); observer?.unobserve(element); }
      }
    });
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleProgress) : null;
    resizeObserver?.observe(document.querySelector('main'));
    syncPreference();
    updateTabs();
    updateProgress();
    return () => {
      alive = false;
      observer?.disconnect();
      resizeObserver?.disconnect();
      cancelAnimationFrame(frame);
      for (const [details, run] of faqRuns) { details.open = run.opening; delete details.dataset.faqTarget; }
      faqRuns.clear();
      for (const animation of active.keys()) animation.cancel();
      active.clear();
      for (const remove of listeners) remove();
      root.dataset.pageMotion = 'reduced';
    };
  }
  function initialize() { if (!dispose) dispose = mountMotion(); }
  initialize();
  window.addEventListener('pagehide', () => { dispose?.(); dispose = null; });
  window.addEventListener('pageshow', initialize);
})();
