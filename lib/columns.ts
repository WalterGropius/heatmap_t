import * as THREE from "three";
import { GUIDE_MIN_DISTANCE } from "./hud";

/** Maximum column height in meters — reached by the fastest cell of the session. */
export const MAX_HEIGHT = 2;
/** Grid cell size in meters. */
export const CELL_SIZE = 1;
/** T-Mobile magenta — the strong end of the signal ramp, the best-spot pin and the guide arrow. */
export const MAGENTA = 0xe20074;
/** Column footprint in meters (10 × 10 cm pillar centered in its cell). */
const FOOTPRINT = 0.1;
const MIN_HEIGHT = 0.06;
/** Floor tile edge in meters — a little short of the cell so neighbours read as separate squares. */
const TILE = 0.94;
/** Height of the best-spot label above the floor: about chest height, so it is in view while walking. */
const PIN_HEIGHT = 1.15;
/** Pin label height as a share of the view (sizeAttenuation off): ~6 % of the screen height. */
const LABEL_SIZE = 0.065;

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

/**
 * Weak → strong ramp: pale pink to T-Mobile magenta, the same shading the
 * operator's coverage map uses — "the more magenta, the stronger". A single
 * hue ramp also stays readable for the one in twelve men who cannot tell the
 * old red → green gradient apart. Mirrors --signal-0/1/2 in globals.css.
 */
const STOPS: Array<[number, number, number, number]> = [
  [0.0, 0xf7, 0xd4, 0xe6],
  [0.5, 0xf0, 0x7c, 0xb6],
  [1.0, 0xe2, 0x00, 0x74],
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

/** Weak cells stay a faint wash, strong ones read as solid paint on the floor. */
function tileOpacityFor(t: number): number {
  return 0.3 + 0.42 * Math.min(1, Math.max(0, t));
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
  /** Soft-edged square painted on the floor, so the room itself reads as a heat map. */
  tile: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Tile opacity, eased with the color: weak cells stay faint, strong ones solid. */
  tileOpacity: number;
  targetTileOpacity: number;
  height: number;
  targetHeight: number;
  /** Rendered color, eased toward targetColor so re-normalization is not a jump cut. */
  color: THREE.Color;
  targetColor: THREE.Color;
}

/** Rounded square with feathered edges, white, for tinting per tile. */
function makeTileTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.roundRect(16, 16, size - 32, size - 32, 18);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Magenta pill reading "Nejsilnější signál", with a pointer toward the floor. */
function drawPinLabel(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const pillH = h * 0.74;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#e20074";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, pillH - 12, (pillH - 12) / 2);
  ctx.moveTo(w / 2 - 26, pillH - 8);
  ctx.lineTo(w / 2, h - 6);
  ctx.lineTo(w / 2 + 26, pillH - 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // cover the stroke where the pointer joins the pill
  ctx.fillRect(w / 2 - 22, pillH - 16, 44, 14);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(pillH * 0.42)}px TeleNeo, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Nejsilnější signál", w / 2, pillH / 2 + 1);
}

/**
 * Marks the fastest cell of the session like a map pin standing in the room:
 * a magenta ring on the floor with a second ring pulsing outward, a thin stem,
 * and a label at chest height. In a room full of similar-looking pillars this
 * is what actually tells the customer where to stand, so it is drawn on top of
 * everything else rather than depth-sorted with the columns.
 */
class BestSpotMarker {
  readonly group = new THREE.Group();
  private ringGeo = new THREE.RingGeometry(0.34, 0.42, 48);
  private pulseGeo = new THREE.RingGeometry(0.4, 0.44, 48);
  private stemGeo = new THREE.CylinderGeometry(0.008, 0.008, PIN_HEIGHT, 8);
  private ringMat: THREE.MeshBasicMaterial;
  private pulseMat: THREE.MeshBasicMaterial;
  private stemMat: THREE.MeshBasicMaterial;
  private labelMat: THREE.SpriteMaterial;
  private labelTex: THREE.CanvasTexture | null = null;
  private label: THREE.Sprite;
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
    this.stemMat = new THREE.MeshBasicMaterial({ ...common, opacity: 0.8 });

    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.pulse = new THREE.Mesh(this.pulseGeo, this.pulseMat);
    for (const m of [ring, this.pulse]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 10;
    }
    const stem = new THREE.Mesh(this.stemGeo, this.stemMat);
    stem.position.y = PIN_HEIGHT / 2;
    stem.renderOrder = 10;

    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 160;
      drawPinLabel(canvas);
      this.labelTex = new THREE.CanvasTexture(canvas);
      this.labelTex.colorSpace = THREE.SRGBColorSpace;
      // redraw once TeleNeo has loaded; the first pass may use the fallback face
      document.fonts?.load('800 48px "TeleNeo"').then(() => {
        drawPinLabel(canvas);
        if (this.labelTex) this.labelTex.needsUpdate = true;
      }).catch(() => {});
    }
    // Constant on-screen size: readable from across the room and from the
    // simulation's overview camera alike, never filling the view up close.
    this.labelMat = new THREE.SpriteMaterial({
      map: this.labelTex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
    });
    this.label = new THREE.Sprite(this.labelMat);
    this.label.center.set(0.5, 0);
    this.label.scale.set(LABEL_SIZE * (512 / 160), LABEL_SIZE, 1);
    this.label.position.y = PIN_HEIGHT;
    this.label.renderOrder = 12;

    this.group.visible = false;
    this.group.add(ring, this.pulse, stem, this.label);
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
    // a gentle bob keeps the label reading as "live" without drifting off the spot
    this.label.position.y = PIN_HEIGHT + Math.sin(this.phase * Math.PI * 2) * 0.03;
  }

  dispose() {
    this.ringGeo.dispose();
    this.pulseGeo.dispose();
    this.stemGeo.dispose();
    this.ringMat.dispose();
    this.pulseMat.dispose();
    this.stemMat.dispose();
    this.labelMat.dispose();
    this.labelTex?.dispose();
  }
}

/**
 * Flat arrow on the floor just ahead of the customer's feet, pointing at the
 * best spot — "go this way" without having to read the distance in the HUD.
 * White outline under a magenta fill so it shows on light and dark floors.
 */
class GuideArrow {
  readonly group = new THREE.Group();
  private fillGeo: THREE.ShapeGeometry;
  private edgeGeo: THREE.ShapeGeometry;
  private fillMat: THREE.MeshBasicMaterial;
  private edgeMat: THREE.MeshBasicMaterial;
  private phase = 0;
  private active = false;

  constructor() {
    const arrow = (k: number) => {
      // pointing along +x, centred on the origin, ~0.5 m long
      const shape = new THREE.Shape();
      shape.moveTo(0.26 * k, 0);
      shape.lineTo(0.02 * k, 0.2 * k);
      shape.lineTo(0.02 * k, 0.08 * k);
      shape.lineTo(-0.24 * k, 0.08 * k);
      shape.lineTo(-0.24 * k, -0.08 * k);
      shape.lineTo(0.02 * k, -0.08 * k);
      shape.lineTo(0.02 * k, -0.2 * k);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    };
    this.fillGeo = arrow(1);
    this.edgeGeo = arrow(1.18);
    const common = { transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide } as const;
    this.fillMat = new THREE.MeshBasicMaterial({ ...common, color: MAGENTA, opacity: 0.9 });
    this.edgeMat = new THREE.MeshBasicMaterial({ ...common, color: 0xffffff, opacity: 0.9 });
    const edge = new THREE.Mesh(this.edgeGeo, this.edgeMat);
    const fill = new THREE.Mesh(this.fillGeo, this.fillMat);
    edge.renderOrder = 11;
    fill.renderOrder = 12;
    // lie flat: shape x → world x, shape y → world -z
    for (const m of [edge, fill]) m.rotation.x = -Math.PI / 2;
    fill.position.y = 0.001;
    this.group.add(edge, fill);
    this.group.visible = false;
  }

  /** Aim from the viewer's floor position toward `target`; hides when close or unknown. */
  aim(viewer: { x: number; z: number } | null, target: { x: number; z: number } | null) {
    if (!viewer || !target) {
      this.active = false;
      return;
    }
    const dx = target.x - viewer.x;
    const dz = target.z - viewer.z;
    const d = Math.hypot(dx, dz);
    this.active = d >= GUIDE_MIN_DISTANCE;
    if (!this.active) return;
    const ux = dx / d;
    const uz = dz / d;
    const ahead = 0.85 + Math.sin(this.phase * Math.PI * 2) * 0.12;
    this.group.position.set(viewer.x + ux * ahead, 0.02, viewer.z + uz * ahead);
    this.group.rotation.y = Math.atan2(-uz, ux);
  }

  update(dt: number) {
    this.phase = (this.phase + dt / 1.4) % 1;
    this.group.visible = this.active;
  }

  dispose() {
    this.fillGeo.dispose();
    this.edgeGeo.dispose();
    this.fillMat.dispose();
    this.edgeMat.dispose();
  }
}

/**
 * The AR heatmap itself: every measured 1 m × 1 m floor cell gets a tinted
 * floor tile and a 10 × 10 cm wireframe pillar. Each cell reports the mean of
 * its last RECENT_SAMPLES measurements; heights, colors and tile opacity are
 * normalized against an outlier-resistant reference (see OUTLIER_FACTOR), so
 * the fastest cell always stands MAX_HEIGHT tall without a single lucky sample
 * flattening the rest. The fastest cell also gets a pin (BestSpotMarker) and,
 * once the viewer's position is known, a floor arrow points the way to it —
 * so the spot is findable at a glance rather than by comparing pillars.
 */
export class ColumnField {
  readonly group = new THREE.Group();
  private cells = new Map<string, Cell>();
  private bodyGeo: THREE.BoxGeometry;
  private edgesGeo: THREE.EdgesGeometry;
  private capGeo: THREE.BoxGeometry;
  private tileGeo = new THREE.PlaneGeometry(TILE, TILE);
  private tileTex = makeTileTexture();
  private marker = new BestSpotMarker();
  private guide = new GuideArrow();
  private viewer: { x: number; z: number } | null = null;
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
    this.group.add(this.marker.group, this.guide.group);
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

  /** Where the customer (or the simulated phone) stands, for the guide arrow. Call once per frame. */
  setViewer(x: number, z: number) {
    this.viewer = { x, z };
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
      cell.tileOpacity += (cell.targetTileOpacity - cell.tileOpacity) * k;
      cell.tile.material.color.copy(cell.color);
      cell.tile.material.opacity = cell.tileOpacity;
    }
    this.marker.update(dt);
    this.guide.aim(this.viewer, this.bestCellCenter());
    this.guide.update(dt);
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
      cell.tile.material.dispose();
    }
    this.bodyGeo.dispose();
    this.edgesGeo.dispose();
    this.capGeo.dispose();
    this.tileGeo.dispose();
    this.tileTex?.dispose();
    this.marker.dispose();
    this.guide.dispose();
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

    const tile = new THREE.Mesh(
      this.tileGeo,
      new THREE.MeshBasicMaterial({
        map: this.tileTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    tile.rotation.x = -Math.PI / 2;
    tile.renderOrder = 1;

    const cx = (ix + 0.5) * CELL_SIZE;
    const cz = (iz + 0.5) * CELL_SIZE;
    body.position.set(cx, 0, cz);
    cap.position.set(cx, 0, cz);
    tile.position.set(cx, 0.004, cz);
    this.group.add(tile, body, cap);

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
      tile,
      tileOpacity: 0,
      targetTileOpacity: tileOpacityFor(0),
      height: 0,
      targetHeight: MIN_HEIGHT,
      color: speedColor(0),
      targetColor: speedColor(0),
    };
  }

  private restyleAll() {
    const ranked = [...this.cells.values()].sort((a, b) => b.mbps - a.mbps);
    this.normRef = this.referenceSpeed(ranked);

    for (const cell of this.cells.values()) {
      const t = Math.min(1, cell.mbps / this.normRef);
      cell.targetHeight = Math.max(MIN_HEIGHT, t * MAX_HEIGHT);
      speedColor(t, cell.targetColor);
      cell.targetTileOpacity = tileOpacityFor(t);
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
