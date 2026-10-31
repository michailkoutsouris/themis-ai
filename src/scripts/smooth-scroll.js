import Lenis from 'lenis';

// Keep touch and keyboard scrolling native; ease wheel input only.
const preference = matchMedia('(prefers-reduced-motion: reduce)');
let instances = [];
let frame = 0;
let suspended = false;

function tick(time) {
  frame = 0;
  for (const instance of instances) instance.raf(time);
  if (!document.hidden && instances.some(instance => instance.isScrolling === 'smooth')) frame = requestAnimationFrame(tick);
}
function wake() {
  if (!frame && !document.hidden && instances.length) {
    // Reset the clock after idle time before a new wheel animation starts.
    for (const instance of instances) instance.raf(performance.now());
    frame = requestAnimationFrame(tick);
  }
}
function destroy() {
  cancelAnimationFrame(frame);
  frame = 0;
  for (const instance of instances) instance.destroy();
  instances = [];
}
function stopInertia() {
  for (const instance of instances) instance.reset();
  cancelAnimationFrame(frame);
  frame = 0;
}
function initialize() {
  destroy();
  if (suspended || preference.matches) return;
  const options = { lerp: 0.14, smoothWheel: true, syncTouch: false, naiveDimensions: true };
  instances = [
    new Lenis({ ...options, allowNestedScroll: true, prevent: node => node.matches('.prompt-text') }),
    ...Array.from(document.querySelectorAll('.prompt-text'), field => new Lenis({
      ...options, wrapper: field, content: field, overscroll: false,
    })),
  ];
  for (const instance of instances) instance.on('virtual-scroll', wake);
}
preference.addEventListener('change', initialize);
window.addEventListener('pagehide', () => { suspended = true; destroy(); });
window.addEventListener('pageshow', () => { suspended = false; initialize(); });
// Let focus, keyboard scrolling, selection, and scrollbar dragging take over.
document.addEventListener('keydown', stopInertia);
document.addEventListener('pointerdown', stopInertia, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopInertia();
});
initialize();
