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
