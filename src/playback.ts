/** Pull one worker step at a time, so pausing never builds up a replay queue. */
export class StepPlayback<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: T | undefined;
  private waiting: 'step' | 'removal' | undefined;
  private paused = false;
  private stopped = false;
  private delayMs: number;
  private show: (message: T) => 'step' | 'removal' | 'done';
  private next: () => void;

  constructor(delayMs: number, show: (message: T) => 'step' | 'removal' | 'done', next: () => void) {
    this.delayMs = delayMs;
    this.show = show;
    this.next = next;
  }

  receive(message: T) {
    if (this.stopped) return;
    if (this.paused) { this.pending = message; return; }
    const kind = this.show(message);
    if (kind === 'done') { this.dispose(); return; }
    this.waiting = kind;
    this.schedule();
  }

  pause() {
    this.paused = true;
    this.clearTimer();
  }

  resume() {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    if (this.pending !== undefined) {
      const message = this.pending;
      this.pending = undefined;
      this.receive(message);
    } else this.schedule();
  }

  setDelay(delayMs: number) {
    this.delayMs = delayMs;
    this.clearTimer();
    this.schedule();
  }

  dispose() {
    this.stopped = true;
    this.clearTimer();
    this.pending = undefined;
    this.waiting = undefined;
  }

  private clearTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule() {
    if (this.stopped || this.paused || !this.waiting || this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.waiting = undefined;
      this.next();
    }, this.waiting === 'removal' ? this.delayMs : 0);
  }
}
