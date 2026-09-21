import * as THREE from "three";

/** Maximum column height in meters — reached by the fastest cell of the session. */
export const MAX_HEIGHT = 2;
/** Grid cell size in meters. */
export const CELL_SIZE = 1;
/** T-Mobile magenta — the three fastest cells of the session wear it. */
export const MAGENTA = 0xe20074;
/** Column footprint in meters (10 × 10 cm pillar centered in its cell). */
const FOOTPRINT = 0.1;
const MIN_HEIGHT = 0.06;
/** How many of the fastest cells are highlighted in brand magenta. */
const TOP_MAGENTA = 3;
/**
 * Samples kept per cell. A cell reports the mean of its last RECENT_SAMPLES
 * transfers, never a single one: throughput over a wireless link bursts, and a
 * lone lucky transfer — or a loopback-fast one in the browser simulation —
 * would otherwise make one square metre look permanently better than the room
 * around it. Averaging also lets a spot recover its true value if the first
 * reading there happened to be bad.
 */
const RECENT_SAMPLES = 5;
/**
 * Second line of defence for the rendering scale. Averaging cannot help a cell
 * the customer only walked through once, and that cell still sets the top of
 * the height/color scale — squashing every other cell into an identical nub,
 * which is exactly when the map stops being usable. So once there are enough
 * cells to say what "typical" looks like, the normalization reference is
 * capped at OUTLIER_FACTOR x the median cell: the record holder still tops out
 * at MAX_HEIGHT, but the rest of the room keeps its contrast.
 */
const OUTLIER_FACTOR = 2.5;
const MIN_CELLS_FOR_MEDIAN = 4;

export interface CellStats {
  key: string;
  ix: number;
  iz: number;
  /** Mean throughput of the cell's last RECENT_SAMPLES samples, in Mbit/s. */
  mbps: number;
  /** Total samples ever recorded in this cell. */
  samples: number;
}

/** Slow → fast gradient (red → amber → lime → green). */
const STOPS: Array<[number, number, number, number]> = [
  [0.0, 0xef, 0x44, 0x44],
  [0.35, 0xf5, 0x9e, 0x0b],
  [0.7, 0xa3, 0xe6, 0x35],
  [1.0, 0x22, 0xc5, 0x5e],
];

export function speedColor(t: number, out = new THREE.Color()): THREE.Color {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, r0, g0, b0] = STOPS[i - 1];
      const [t1, r1, g1, b1] = STOPS[i];
      const f = (x - t0) / (t1 - t0);
      return out.setRGB(
        (r0 + (r1 - r0) * f) / 255,
        (g0 + (g1 - g0) * f) / 255,
        (b0 + (b1 - b0) * f) / 255
      );
    }
  }
  return out.setRGB(STOPS[STOPS.length - 1][1] / 255, STOPS[STOPS.length - 1][2] / 255, STOPS[STOPS.length - 1][3] / 255);
}

/** Grid indices of the cell containing world position (x, z). */
export function cellIndex(x: number, z: number): { ix: number; iz: number } {
  return { ix: Math.floor(x / CELL_SIZE), iz: Math.floor(z / CELL_SIZE) };
}

interface Cell extends CellStats {
  /** Rolling window of the most recent samples, newest last. */
  recent: number[];
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  cap: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  height: number;
  targetHeight: number;
  /** Rendered color, eased toward targetColor so re-normalization is not a jump cut. */
  color: THREE.Color;
  targetColor: THREE.Color;
}

/**
 * Floor beacon marking the fastest cell of the session: a magenta ring with a
 * second ring pulsing outward from it. In a room full of similar-looking
 * pillars this is what actually tells the customer where to stand, so it is
 * drawn on top of everything else rather than depth-sorted with the columns.
 */
class BestSpotMarker {
  readonly group = new THREE.Group();
  private ringGeo = new THREE.RingGeometry(0.34, 0.42, 48);
  private pulseGeo = new THREE.RingGeometry(0.4, 0.44, 48);
  private ringMat: THREE.MeshBasicMaterial;
  private pulseMat: THREE.MeshBasicMaterial;
  private pulse: THREE.Mesh;
  private phase = 0;

  constructor() {
    const common = {
      color: MAGENTA,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    } as const;
    this.ringMat = new THREE.MeshBasicMaterial({ ...common, opacity: 0.95 });
    this.pulseMat = new THREE.MeshBasicMaterial({ ...common, opacity: 0.5 });

    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.pulse = new THREE.Mesh(this.pulseGeo, this.pulseMat);
    for (const m of [ring, this.pulse]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 10;
    }
    this.group.position.y = 0.012;
    this.group.visible = false;
    this.group.add(ring, this.pulse);
  }

  moveTo(x: number, z: number) {
    this.group.position.set(x, 0.012, z);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  update(dt: number) {
    if (!this.group.visible) return;
    this.phase = (this.phase + dt / 1.8) % 1;
    const s = 1 + this.phase * 1.6;
    this.pulse.scale.set(s, s, s);
    this.pulseMat.opacity = 0.5 * (1 - this.phase);
  }

  dispose() {
    this.ringGeo.dispose();
    this.pulseGeo.dispose();
    this.ringMat.dispose();
    this.pulseMat.dispose();
  }
}

/**
 * The AR heatmap itself: one 10 × 10 cm pillar per 1 m × 1 m floor cell.
 * Each cell reports the mean of its last RECENT_SAMPLES measurements; heights
 * and colors are normalized against an outlier-resistant reference (see
 * OUTLIER_FACTOR), so the fastest cell always stands MAX_HEIGHT tall without
 * a single lucky sample flattening the rest — and the TOP_MAGENTA fastest
 * cells are rendered in T-Mobile magenta instead of the gradient. The single
 * fastest cell also gets a floor beacon (BestSpotMarker) so it is findable at
 * a glance rather than by comparing pillar heights.
 */
export class ColumnField {
  readonly group = new THREE.Group();
  private cells = new Map<string, Cell>();
  private bodyGeo: THREE.BoxGeometry;
  private edgesGeo: THREE.EdgesGeometry;
  private capGeo: THREE.BoxGeometry;
  private marker = new BestSpotMarker();
  /** Set by addSample, consumed once per frame — a restyle per sample would
   *  re-sort every cell several times a second for no visible benefit. */
  private needsRestyle = false;
  private best: Cell | null = null;
  /** Speed that renders as a full-height column — see OUTLIER_FACTOR. */
  private normRef = 0.001;
  /** Averaged throughput of the best cell in the session, in Mbit/s. */
  sessionBestMbps = 0;

  constructor() {
    // unit-height box with its origin at the bottom, so scale.y == height
    this.bodyGeo = new THREE.BoxGeometry(FOOTPRINT, 1, FOOTPRINT);
    this.bodyGeo.translate(0, 0.5, 0);
    this.edgesGeo = new THREE.EdgesGeometry(this.bodyGeo);
    this.capGeo = new THREE.BoxGeometry(FOOTPRINT, 0.02, FOOTPRINT);
    this.group.add(this.marker.group);
  }

  get cellCount() {
    return this.cells.size;
  }

  /** Grid key of the cell containing world position (x, z). */
  keyAt(x: number, z: number): string {
    const { ix, iz } = cellIndex(x, z);
    return `${ix},${iz}`;
  }

  /** Stats for the cell containing (x, z), or null if it was never measured. */
  cellAt(x: number, z: number): CellStats | null {
    const cell = this.cells.get(this.keyAt(x, z));
    if (!cell) return null;
    const { key, ix, iz, mbps, samples } = cell;
    return { key, ix, iz, mbps, samples };
  }

  /**
   * Where `mbps` falls on the rendered scale, 0…1 — the same normalization the
   * columns use, so the HUD meter and the pillars always agree.
   */
  scoreFor(mbps: number): number {
    return Math.min(1, Math.max(0, mbps / this.normRef));
  }

  /** Grid key of the cell with the highest average, or null before the first sample. */
  get bestCellKey(): string | null {
    return this.best?.key ?? null;
  }

  /** Floor centre of the cell with the highest average, or null before the first sample. */
  bestCellCenter(): { x: number; z: number } | null {
    if (!this.best) return null;
    return { x: (this.best.ix + 0.5) * CELL_SIZE, z: (this.best.iz + 0.5) * CELL_SIZE };
  }

  /** Record a throughput sample taken at world position (x, z) on the floor plane. */
  addSample(x: number, z: number, mbps: number) {
    const { ix, iz } = cellIndex(x, z);
    const key = `${ix},${iz}`;

    let cell = this.cells.get(key);
    if (!cell) {
      cell = this.createCell(key, ix, iz);
      this.cells.set(key, cell);
    }
    cell.samples += 1;
    cell.recent.push(mbps);
    if (cell.recent.length > RECENT_SAMPLES) cell.recent.shift();
    cell.mbps = cell.recent.reduce((sum, v) => sum + v, 0) / cell.recent.length;

    // A cell's average can fall as well as rise, so the leader is rescanned
    // rather than only ever replaced. The HUD reads this synchronously.
    this.refreshBest();
    // Normalization target may have moved — restyle every column next frame.
    this.needsRestyle = true;
  }

  /** Animate columns toward their target heights and colors. Call once per frame. */
  update(dt: number) {
    if (this.needsRestyle) {
      this.restyleAll();
      this.needsRestyle = false;
    }
    const k = Math.min(1, dt * 5);
    for (const cell of this.cells.values()) {
      cell.height += (cell.targetHeight - cell.height) * k;
      cell.color.lerp(cell.targetColor, k);
      cell.body.scale.y = Math.max(cell.height, 0.001);
      cell.body.material.color.copy(cell.color);
      cell.body.material.emissive.copy(cell.color);
      cell.cap.material.color.copy(cell.color);
      cell.cap.position.y = cell.height + 0.01;
    }
    this.marker.update(dt);
  }

  stats(): { cells: CellStats[]; bestMbps: number } {
    return {
      cells: [...this.cells.values()].map(({ key, ix, iz, mbps, samples }) => ({
        key,
        ix,
        iz,
        mbps,
        samples,
      })),
      bestMbps: this.sessionBestMbps,
    };
  }

  dispose() {
    for (const cell of this.cells.values()) {
      cell.body.material.dispose();
      cell.edges.material.dispose();
      cell.cap.material.dispose();
    }
    this.bodyGeo.dispose();
    this.edgesGeo.dispose();
    this.capGeo.dispose();
    this.marker.dispose();
    this.cells.clear();
    this.best = null;
  }

  private createCell(key: string, ix: number, iz: number): Cell {
    const bodyMat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.85,
      roughness: 0.3,
      metalness: 0.1,
      emissiveIntensity: 0.45,
      depthWrite: false,
    });
    const body = new THREE.Mesh(this.bodyGeo, bodyMat);
    // white wireframe over the shaded fill; inherits the body's height scale
    const edges = new THREE.LineSegments(
      this.edgesGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    body.add(edges);
    const capMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 });
    const cap = new THREE.Mesh(this.capGeo, capMat);

    const cx = (ix + 0.5) * CELL_SIZE;
    const cz = (iz + 0.5) * CELL_SIZE;
    body.position.set(cx, 0, cz);
    cap.position.set(cx, 0, cz);
    this.group.add(body, cap);

    return {
      key,
      ix,
      iz,
      mbps: 0,
      samples: 0,
      recent: [],
      body,
      edges,
      cap,
      height: 0,
      targetHeight: MIN_HEIGHT,
      color: speedColor(0),
      targetColor: speedColor(0),
    };
  }

  private restyleAll() {
    const ranked = [...this.cells.values()].sort((a, b) => b.mbps - a.mbps);
    const magentaKeys = new Set(ranked.slice(0, TOP_MAGENTA).map((c) => c.key));
    this.normRef = this.referenceSpeed(ranked);

    for (const cell of this.cells.values()) {
      const t = Math.min(1, cell.mbps / this.normRef);
      cell.targetHeight = Math.max(MIN_HEIGHT, t * MAX_HEIGHT);
      if (magentaKeys.has(cell.key)) cell.targetColor.setHex(MAGENTA);
      else speedColor(t, cell.targetColor);
    }

    const center = this.bestCellCenter();
    if (center) this.marker.moveTo(center.x, center.z);
    else this.marker.hide();
  }

  /** @param ranked cells sorted by averaged throughput, fastest first. */
  private referenceSpeed(ranked: Cell[]): number {
    const best = Math.max(this.sessionBestMbps, 0.001);
    if (ranked.length < MIN_CELLS_FOR_MEDIAN) return best;
    const median = ranked[ranked.length >> 1].mbps;
    if (median <= 0) return best;
    return Math.max(Math.min(best, median * OUTLIER_FACTOR), 0.001);
  }

  private refreshBest() {
    let best: Cell | null = null;
    for (const cell of this.cells.values()) {
      if (!best || cell.mbps > best.mbps) best = cell;
    }
    this.best = best;
    this.sessionBestMbps = best?.mbps ?? 0;
  }
}
