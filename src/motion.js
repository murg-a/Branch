// Transient visual elements only. The document transaction is committed before motion.
export function ghost(text, rect, typography, branch = false) {
  const node = document.createElement('div');
  node.className = 'transfer-ghost';
  node.setAttribute('aria-hidden', 'true');
  node.textContent = text;
  Object.assign(node.style, {
    left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px',
    fontFamily: typography.fontFamily, fontWeight: typography.fontWeight, fontSize: typography.fontSize, lineHeight: typography.lineHeight,
    backgroundColor: branch ? 'var(--card)' : 'var(--bg)',
    borderColor: branch ? 'var(--acc)' : 'transparent', borderRadius: branch ? '5px' : '0',
  });
  document.body.append(node);
  return node;
}

export function fly(node, destination, typography, toBranch) {
  return node.animate([
    {},
    {
      left: destination.left + 'px', top: destination.top + 'px',
      width: destination.width + 'px', height: destination.height + 'px',
      fontSize: typography.fontSize, lineHeight: typography.lineHeight, fontWeight: typography.fontWeight,
      borderRadius: toBranch ? '5px' : '0',
      backgroundColor: toBranch ? 'var(--card)' : 'var(--bg)',
      borderColor: toBranch ? 'var(--acc)' : 'transparent',
    },
  ], { duration: 420, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'forwards' });
}

let mapMotion = null;
export function cancelMapReorder() {
  if (!mapMotion) return;
  cancelAnimationFrame(mapMotion.frame);
  for (const animation of mapMotion.animations) animation.cancel();
  mapMotion.container.classList.remove('is-reordering');
  mapMotion = null;
}
export function captureMapPositions(container) {
  return new Map([...container.children].map(row => [row.dataset.id, row.getBoundingClientRect().top]));
}
export function animateMapReorder(container, previous, destination) {
  cancelMapReorder();
  const target = Math.max(0, Math.min(destination, document.documentElement.scrollHeight - innerHeight));
  if (matchMedia('(prefers-reduced-motion:reduce)').matches || typeof Element.prototype.animate !== 'function') {
    window.scrollTo({ top: target, behavior: 'instant' });
    return;
  }
  const duration = 280, start = performance.now(), origin = scrollY;
  const motion = { container, animations: [], frame: 0 };
  mapMotion = motion;
  container.classList.add('is-reordering');
  for (const row of container.children) {
    const oldTop = previous.get(row.dataset.id), rect = row.getBoundingClientRect();
    if (oldTop == null || Math.abs(oldTop - rect.top) < .5) continue;
    if (Math.max(oldTop, rect.top) < -rect.height || Math.min(oldTop, rect.top) > innerHeight) continue;
    motion.animations.push(row.animate([
      { transform: 'translateY(' + (oldTop - rect.top) + 'px)' }, { transform: 'translateY(0)' },
    ], { duration, easing: 'cubic-bezier(.2,.7,.2,1)' }));
  }
  const tick = now => {
    if (mapMotion !== motion) return;
    const progress = Math.min(1, (now - start) / duration), eased = 1 - (1 - progress) ** 3;
    window.scrollTo({ top: origin + (target - origin) * eased, behavior: 'instant' });
    if (progress < 1) motion.frame = requestAnimationFrame(tick);
    else cancelMapReorder();
  };
  motion.frame = requestAnimationFrame(tick);
}
