/**
 * A buffer that stores snapshots of game states (or any generic state) keyed by tick numbers.
 * Useful for rewinding, replaying, or tracking historical states in simulations or multiplayer games.
 *
 * @template T The type of state stored in the buffer.
 */
export class SnapshotBuffer<T = any> {
  private buffer = new Map<number, T>();
  private _earliestTick?: number;
  private _latestTick?: number;

  /**
   * Creates a new SnapshotBuffer.
   *
   * @param maxSize Maximum number of snapshots to keep. Oldest snapshots are discarded when exceeded.
   * @param cloneFn Function to clone a state before storing. Defaults to `structuredClone`.
   */
  constructor(
    private maxSize = 100,
    private cloneFn: (state: T) => T = structuredClone
  ) {}

  /**
   * Stores a snapshot of the state at a given tick.
   * Automatically clones the state and manages buffer size.
   *
   * @param tick Tick number at which the state occurs.
   * @param state The state to store.
   */
  store(tick: number, state: T) {
    const snapshot = this.cloneFn(state);
    this.buffer.set(tick, snapshot);

    if (!this._earliestTick || tick < this._earliestTick) this._earliestTick = tick;
    if (!this._latestTick || tick > this._latestTick) this._latestTick = tick;

    if (this.buffer.size > this.maxSize) {
      const oldest = this._earliestTick!;
      this.buffer.delete(oldest);
      this.updateEarliestTick();
    }
  }

  /**
   * Retrieves the snapshot stored at a specific tick.
   *
   * @param tick Tick number to retrieve.
   * @returns The state at the given tick, or undefined if not found.
   */
  at(tick: number): T | undefined {
    return this.buffer.get(tick);
  }

  /**
   * Returns the latest snapshot stored in the buffer.
   *
   * @returns An object containing `tick` and `state` of the latest snapshot, or undefined if empty.
   */
  get latest(): { tick: number; state: T } | undefined {
    if (this._latestTick === undefined) return undefined;
    return { tick: this._latestTick, state: this.buffer.get(this._latestTick)! };
  }

  /**
   * Returns the earliest tick currently stored in the buffer.
   *
   * @returns Earliest tick number, or undefined if the buffer is empty.
   */
  get earliest(): number | undefined {
    return this._earliestTick;
  }

  /**
   * Returns the number of snapshots currently stored in the buffer.
   */
  get size(): number {
    return this.buffer.size;
  }

  /**
   * Discards all snapshots up to and including a specified tick.
   *
   * @param tick Tick number up to which snapshots will be removed.
   */
  discardUntil(tick: number) {
    const keysToDelete = [...this.buffer.keys()].filter(k => k <= tick);
    for (const k of keysToDelete) this.buffer.delete(k);
    this.updateEarliestTick();
  }

  /**
   * Iterates over stored snapshots in tick order, calling a callback for each.
   *
   * @param fn Callback function invoked with `(state, tick)` for each snapshot.
   * @param fromTick Optional starting tick (inclusive). Defaults to earliest tick.
   * @param toTick Optional ending tick (inclusive). Defaults to latest tick.
   */
  replay(fn: (state: T, tick: number) => void, fromTick?: number, toTick?: number) {
    const ticks = [...this.buffer.keys()].sort((a, b) => a - b);
    if (!ticks.length) return;

    const start = fromTick ?? ticks[0];
    const end = toTick ?? ticks[ticks.length - 1];

    for (const tick of ticks) {
      if (tick >= start && tick <= end) {
        fn(this.buffer.get(tick)!, tick);
      }
    }
  }

  /**
   * Updates the earliest and latest tick references after modifications to the buffer.
   */
  private updateEarliestTick() {
    const ticks = [...this.buffer.keys()];
    this._earliestTick = ticks.length ? Math.min(...ticks) : undefined;
    this._latestTick = ticks.length ? Math.max(...ticks) : undefined;
  }
}
