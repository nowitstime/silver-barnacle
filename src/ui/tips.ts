/** One-time tips, shown at the top of the screen one after another. Tap to dismiss. */
export class Tips {
  private el: HTMLElement;
  private queue: string[] = [];
  private timer = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tip';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.next();
    });
    root.appendChild(this.el);
  }

  show(text: string): void {
    if (this.queue.includes(text)) return;
    this.queue.push(text);
    if (this.el.hidden) this.next();
  }

  clear(): void {
    this.queue = [];
    this.el.hidden = true;
    clearTimeout(this.timer);
  }

  private next(): void {
    clearTimeout(this.timer);
    const text = this.queue.shift();
    if (!text) {
      this.el.hidden = true;
      return;
    }
    this.el.innerHTML = `<b>Tip</b> ${text}<small>Tap to dismiss</small>`;
    this.el.hidden = false;
    this.timer = window.setTimeout(() => this.next(), 6500);
  }
}
