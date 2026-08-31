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

export interface CellStats {
  key: string;
  ix: number;
  iz: number;
  bestMbps: number;
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

interface Cell extends CellStats {
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  cap: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  height: number;
  targetHeight: number;
}

/**
 * The AR heatmap itself: one 10 × 10 cm pillar per 1 m × 1 m floor cell.
 * Each cell remembers the best throughput measured inside it; heights and
 * colors are normalized against the session-wide best, so the fastest cell
 * always stands MAX_HEIGHT tall — and the TOP_MAGENTA fastest cells are
 * rendered in T-Mobile magenta instead of the gradient.
 */
export class ColumnField {
  readonly group = new THREE.Group();
  private cells = new Map<string, Cell>();
  private bodyGeo: THREE.BoxGeometry;
  private edgesGeo: THREE.EdgesGeometry;
  private capGeo: THREE.BoxGeometry;
  sessionBestMbps = 0;

  constructor() {
    // unit-height box with its origin at the bottom, so scale.y == height
    this.bodyGeo = new THREE.BoxGeometry(FOOTPRINT, 1, FOOTPRINT);
    this.bodyGeo.translate(0, 0.5, 0);
    this.edgesGeo = new THREE.EdgesGeometry(this.bodyGeo);
    this.capGeo = new THREE.BoxGeometry(FOOTPRINT, 0.02, FOOTPRINT);
  }

  get cellCount() {
    return this.cells.size;
  }

  /** Record a throughput sample taken at world position (x, z) on the floor plane. */
  addSample(x: number, z: number, mbps: number) {
    const ix = Math.floor(x / CELL_SIZE);
    const iz = Math.floor(z / CELL_SIZE);
    const key = `${ix},${iz}`;

    let cell = this.cells.get(key);
    if (!cell) {
      cell = this.createCell(key, ix, iz);
      this.cells.set(key, cell);
    }
    cell.samples += 1;
    if (mbps > cell.bestMbps) cell.bestMbps = mbps;

    if (mbps > this.sessionBestMbps) this.sessionBestMbps = mbps;
    // Normalization target moved — restyle every column, not just this one.
    this.restyleAll();
  }

  /** Animate columns toward their target heights. Call once per frame. */
  update(dt: number) {
    const k = Math.min(1, dt * 5);
    for (const cell of this.cells.values()) {
      cell.height += (cell.targetHeight - cell.height) * k;
      cell.body.scale.y = Math.max(cell.height, 0.001);
      cell.cap.position.y = cell.height + 0.01;
    }
  }

  stats(): { cells: CellStats[]; bestMbps: number } {
    return {
      cells: [...this.cells.values()].map(({ key, ix, iz, bestMbps, samples }) => ({
        key,
        ix,
        iz,
        bestMbps,
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
    this.cells.clear();
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
      bestMbps: 0,
      samples: 0,
      body,
      edges,
      cap,
      height: 0,
      targetHeight: MIN_HEIGHT,
    };
  }

  private restyleAll() {
    const best = Math.max(this.sessionBestMbps, 0.001);
    const magentaKeys = new Set(
      [...this.cells.values()]
        .sort((a, b) => b.bestMbps - a.bestMbps)
        .slice(0, TOP_MAGENTA)
        .map((c) => c.key)
    );
    const c = new THREE.Color();
    for (const cell of this.cells.values()) {
      const t = cell.bestMbps / best;
      cell.targetHeight = Math.max(MIN_HEIGHT, t * MAX_HEIGHT);
      if (magentaKeys.has(cell.key)) c.setHex(MAGENTA);
      else speedColor(t, c);
      cell.body.material.color.copy(c);
      cell.body.material.emissive.copy(c);
      cell.cap.material.color.copy(c);
    }
  }
}
