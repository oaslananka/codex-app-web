import type { RuntimeState } from './types';

type Listener = (snapshot: RuntimeState) => void;

export class RuntimeStore {
  private state: RuntimeState;

  private readonly listeners = new Set<Listener>();

  private notifyScheduled = false;

  constructor(initialState: RuntimeState) {
    this.state = initialState;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setState(next: RuntimeState | ((current: RuntimeState) => RuntimeState)) {
    const resolved = typeof next === 'function' ? next(this.state) : next;
    this.state = resolved;
    if (!this.notifyScheduled) {
      this.notifyScheduled = true;
      queueMicrotask(() => {
        this.notifyScheduled = false;
        this.listeners.forEach((listener) => listener(this.state));
      });
    }
  }

  patch(partial: Partial<RuntimeState> | ((current: RuntimeState) => Partial<RuntimeState>)) {
    const resolved = typeof partial === 'function' ? partial(this.state) : partial;
    this.setState({
      ...this.state,
      ...resolved,
    });
  }
}
