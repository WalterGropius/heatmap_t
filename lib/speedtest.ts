export interface SpeedSample {
  /** Measured downlink throughput in Mbit/s */
  mbps: number;
  /** Time to first byte in ms */
  latencyMs: number;
  /** Payload size used for this sample in bytes */
  bytes: number;
  /** performance.now() timestamps bracketing the transfer */
  startedAt: number;
  finishedAt: number;
}

const MIN_BYTES = 32 * 1024;
const MAX_BYTES = 4 * 1024 * 1024;
const START_BYTES = 128 * 1024;
/** Target duration for a single transfer — long enough to be meaningful,
 *  short enough that a sample maps to roughly one spot on the floor. */
const TARGET_MS = 700;

/**
 * Continuously measures downlink throughput by streaming incompressible
 * payloads from /api/payload. Payload size adapts so each transfer takes
 * about TARGET_MS regardless of link speed.
 */
export class SpeedTester {
  private bytes = START_BYTES;
  private running = false;
  private abort: AbortController | null = null;

  constructor(private onSample: (s: SpeedSample) => void) {}

  start() {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop() {
    this.running = false;
    this.abort?.abort();
  }

  private async loop() {
    while (this.running) {
      try {
        const sample = await this.measureOnce();
        if (!this.running) break;
        this.onSample(sample);
        this.adapt(sample);
      } catch {
        if (!this.running) break;
        // transient network error — back off briefly and keep sampling
        await new Promise((r) => setTimeout(r, 800));
      }
      // small breather so we do not saturate the link permanently
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  private async measureOnce(): Promise<SpeedSample> {
    this.abort = new AbortController();
    const startedAt = performance.now();
    const res = await fetch(
      `/api/payload?bytes=${this.bytes}&t=${startedAt}-${Math.random()}`,
      { cache: "no-store", signal: this.abort.signal }
    );
    if (!res.ok || !res.body) throw new Error(`payload ${res.status}`);

    const reader = res.body.getReader();
    let received = 0;
    let firstByteAt = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        if (firstByteAt === 0) firstByteAt = performance.now();
        received += value.byteLength;
      }
      if (done) break;
    }
    const finishedAt = performance.now();

    // Throughput over the body transfer itself; latency = time to first byte.
    const latencyMs = (firstByteAt || finishedAt) - startedAt;
    const bodyMs = Math.max(finishedAt - (firstByteAt || startedAt), 1);
    const mbps = (received * 8) / (bodyMs / 1000) / 1_000_000;
    return { mbps, latencyMs, bytes: received, startedAt, finishedAt };
  }

  private adapt(s: SpeedSample) {
    const bodyMs = Math.max(s.finishedAt - s.startedAt - s.latencyMs, 1);
    if (bodyMs < TARGET_MS * 0.5) {
      this.bytes = Math.min(this.bytes * 2, MAX_BYTES);
    } else if (bodyMs > TARGET_MS * 2) {
      this.bytes = Math.max(Math.floor(this.bytes / 2), MIN_BYTES);
    }
  }
}
