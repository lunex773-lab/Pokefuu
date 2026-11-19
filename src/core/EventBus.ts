/**
 * 型付きイベントバス。
 * システム間の直接依存を避け、イベント駆動で疎結合に連携させる。
 */
export type Listener<T> = (payload: T) => void;

export class EventBus<M extends object> {
  private listeners = new Map<keyof M, Set<Listener<never>>>();

  on<K extends keyof M>(event: K, fn: Listener<M[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(event, fn);
  }

  once<K extends keyof M>(event: K, fn: Listener<M[K]>): () => void {
    const off = this.on(event, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof M>(event: K, fn: Listener<M[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // 発火中の購読解除に耐えるようコピーしてから回す
    for (const fn of [...set]) {
      try {
        (fn as Listener<M[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] listener error on "${String(event)}"`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
