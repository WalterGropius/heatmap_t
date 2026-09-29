/** The floor guide arrow shows — and the HUD mentions it — while the best spot is at least this far away, in meters. */
export const GUIDE_MIN_DISTANCE = 1.2;

export interface HudState {
  /** Most recent throughput sample in Mbit/s */
  mbps: number;
  /** Most recent round-trip-ish latency (time to first byte) in ms */
  latencyMs: number;
  /** Best throughput seen this session in Mbit/s */
  bestMbps: number;
  /** Number of 1 m² cells mapped so far */
  cells: number;
  /** Total samples taken */
  samples: number;
  /** Whether world tracking currently has a pose */
  tracking: boolean;
  /** Best throughput measured in the cell the user is standing in right now */
  hereMbps: number;
  /** hereMbps relative to the session best, 0…1 — drives the quality meter */
  hereScore: number;
  /** Metres from the user to the centre of the best cell, or null if nothing mapped yet */
  distanceToBestM: number | null;
  /** Whether the user is standing in the best cell of the session */
  onBestSpot: boolean;
}

export const EMPTY_HUD: HudState = {
  mbps: 0,
  latencyMs: 0,
  bestMbps: 0,
  cells: 0,
  samples: 0,
  tracking: false,
  hereMbps: 0,
  hereScore: 0,
  distanceToBestM: null,
  onBestSpot: false,
};

/**
 * Both scenes render at display refresh rate, but the HUD lives in React —
 * pushing a new state object every frame would re-render the overlay 60× a
 * second for numbers that only change a few times a second. This drops
 * updates that arrive too soon, unless they are marked important (a finished
 * speed sample, a tracking change) in which case they go through immediately.
 */
export class HudEmitter {
  private lastAt = 0;

  constructor(
    private readonly sink: (h: HudState) => void,
    private readonly intervalMs = 180
  ) {}

  emit(state: HudState, important = false) {
    const now = performance.now();
    if (!important && now - this.lastAt < this.intervalMs) return;
    this.lastAt = now;
    this.sink({ ...state });
  }
}

/** Buffers recent head positions so a speed sample (which spans ~1 s) can be
 *  attributed to where the user actually was mid-transfer. */
export class PositionTrail {
  private times: number[] = [];
  private xs: number[] = [];
  private zs: number[] = [];

  push(time: number, x: number, z: number) {
    this.times.push(time);
    this.xs.push(x);
    this.zs.push(z);
    if (this.times.length > 900) {
      this.times.splice(0, 300);
      this.xs.splice(0, 300);
      this.zs.splice(0, 300);
    }
  }

  /** Most recently pushed position, or null if empty. */
  latest(): { x: number; z: number } | null {
    const n = this.times.length;
    if (n === 0) return null;
    return { x: this.xs[n - 1], z: this.zs[n - 1] };
  }

  /** Position closest in time to `t` (performance.now() ms), or null if empty. */
  at(t: number): { x: number; z: number } | null {
    const n = this.times.length;
    if (n === 0) return null;
    // binary search for nearest timestamp
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    const i =
      lo > 0 && t - this.times[lo - 1] < this.times[lo] - t ? lo - 1 : lo;
    return { x: this.xs[i], z: this.zs[i] };
  }
}
