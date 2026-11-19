/** A small message at the bottom of the screen, with an optional action button. */
export function toast(message: string, action?: { label: string; run: () => void }, ms = 6000): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.run();
      el.remove();
    });
    el.appendChild(b);
  }
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(el);
  if (!action) setTimeout(() => el.remove(), ms);
}
