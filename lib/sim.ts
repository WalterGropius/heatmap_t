import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ColumnField } from "./columns";
import { SpeedTester, type SpeedSample } from "./speedtest";
import { HudEmitter, PositionTrail, EMPTY_HUD, type HudState } from "./hud";

export interface SimHandle {
  end: () => void;
}

/**
 * Desktop preview: the same column field and the same real speed tests,
 * but instead of you walking, a virtual "phone" wanders a 16 m × 16 m room.
 * Because a desktop link is spatially uniform, measured throughput is
 * modulated by a smooth synthetic coverage field so the heatmap shows the
 * kind of variation you would see walking a real building.
 */
export function startSim(opts: {
  container: HTMLElement;
  onHud: (h: HudState) => void;
  onEnd: () => void;
  /** The HUD card drawn over the scene; the view is centred in the space it leaves free. */
  occluder?: () => DOMRect | null | undefined;
}): SimHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(opts.container.clientWidth, opts.container.clientHeight);
  renderer.domElement.style.display = "block";
  opts.container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121212);
  scene.fog = new THREE.Fog(0x121212, 22, 42);

  const FOV = 55;
  const camera = new THREE.PerspectiveCamera(
    FOV,
    opts.container.clientWidth / opts.container.clientHeight,
    0.1,
    100
  );
  // The camera follows the simulated phone (see tick), keeping this offset
  // unless the user orbits or zooms — like looking over the customer's shoulder.
  camera.position.set(6.5, 9, 9.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 4;
  controls.maxDistance = 30;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.3));
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(6, 10, 4);
  scene.add(dir);

  const grid = new THREE.GridHelper(16, 16, 0xffffff, 0xffffff);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.14;
  scene.add(grid);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  const field = new ColumnField();
  scene.add(field.group);

  // the wandering "phone": white, so it never blends into the magenta map
  const walker = new THREE.Group();
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  orb.position.y = 1.4;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.4, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
  );
  beam.position.y = 0.7;
  const feet = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.22, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
  );
  feet.rotation.x = -Math.PI / 2;
  feet.position.y = 0.01;
  walker.add(orb, beam, feet);
  scene.add(walker);

  // synthetic coverage field in [0.25, 1]: smooth blobs across the room
  const coverage = (x: number, z: number) => {
    const a = Math.sin(x * 0.55 + 1.7) * Math.cos(z * 0.45 - 0.6);
    const b = Math.sin(x * 0.21 - 0.4 + z * 0.33);
    const t = 0.5 + 0.25 * a + 0.25 * b;
    return 0.25 + 0.75 * Math.min(1, Math.max(0, t));
  };

  const trail = new PositionTrail();
  const hud: HudState = { ...EMPTY_HUD, tracking: true };
  const emitter = new HudEmitter(opts.onHud);

  /** Recompute the "where the phone is standing" readouts. */
  const refreshGuidance = () => {
    const at = trail.latest();
    const center = field.bestCellCenter();
    if (!at) return;
    const here = field.cellAt(at.x, at.z);
    // a square walked into but not measured yet shows the latest reading,
    // taken a moment ago a step away, rather than blinking to "unmeasured"
    hud.hereMbps = here?.mbps ?? hud.mbps;
    hud.hereScore = field.scoreFor(hud.hereMbps);
    hud.distanceToBestM = center ? Math.hypot(center.x - at.x, center.z - at.z) : null;
    hud.onBestSpot = field.bestCellKey !== null && field.keyAt(at.x, at.z) === field.bestCellKey;
  };

  const tester = new SpeedTester((s: SpeedSample) => {
    const mid = trail.at((s.startedAt + s.finishedAt) / 2);
    if (!mid) return;
    const mbps = s.mbps * coverage(mid.x, mid.z);
    field.addSample(mid.x, mid.z, mbps);
    hud.mbps = mbps;
    hud.latencyMs = s.latencyMs;
    hud.bestMbps = field.sessionBestMbps;
    hud.cells = field.cellCount;
    hud.samples += 1;
    refreshGuidance();
    emitter.emit(hud, true);
  });

  // waypoint wandering
  const pos = new THREE.Vector2(0, 0);
  let target = new THREE.Vector2();
  const pickTarget = () => {
    target = new THREE.Vector2(
      (Math.random() * 2 - 1) * 7.5,
      (Math.random() * 2 - 1) * 7.5
    );
  };
  pickTarget();
  const WALK_SPEED = 1.6; // m/s

  const clock = new THREE.Clock();
  const follow = new THREE.Vector3();
  let sinceCentre = Infinity;

  /**
   * Shift the projection centre into the part of the screen the HUD card
   * leaves free — above a bottom card in portrait, left of a side panel in
   * landscape — so the followed phone is never drawn underneath it.
   */
  const centreInFreeArea = () => {
    const w = opts.container.clientWidth;
    const h = opts.container.clientHeight;
    const card = opts.occluder?.();
    if (!w || !h) return;
    let dx = 0;
    let dy = 0;
    if (card && card.width > 0) {
      const box = opts.container.getBoundingClientRect();
      // a horizontally centred card sits at the bottom (full width on phones,
      // 440 px on desktops); otherwise it is the landscape side panel
      const centred = Math.abs(card.left + card.width / 2 - (box.left + w / 2)) < w * 0.1;
      if (centred) dy = (card.top - box.top) / 2 - h / 2;
      else dx = (card.left - box.left) / 2 - w / 2;
    }
    const fullH = h + 2 * Math.abs(dy);
    // the field of view spans the virtual full height; widen it so the
    // visible window keeps the scene at the same scale
    camera.fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * (fullH / h)) * 180) / Math.PI;
    // setViewOffset overwrites aspect with the virtual view's; clearing does not restore it
    camera.aspect = w / h;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) camera.clearViewOffset();
    else camera.setViewOffset(w + 2 * Math.abs(dx), fullH, Math.abs(dx) - dx, Math.abs(dy) - dy, w, h);
  };
  let raf = 0;
  let alive = true;

  const onResize = () => {
    const w = opts.container.clientWidth;
    const h = opts.container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    renderer.setSize(w, h);
    centreInFreeArea();
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);
  // the stage also changes size when the surrounding chrome reflows (mobile
  // browser bars, the HUD card growing), which no window resize reports
  const resizeObserver =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  resizeObserver?.observe(opts.container);

  const tick = () => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);

    const toTarget = target.clone().sub(pos);
    if (toTarget.length() < 0.3) pickTarget();
    else pos.add(toTarget.normalize().multiplyScalar(WALK_SPEED * dt));

    walker.position.set(pos.x, 0, pos.y);
    trail.push(performance.now(), pos.x, pos.y);
    field.setViewer(pos.x, pos.y);

    // ease the orbit centre toward the phone, carrying the camera along
    follow.set(pos.x, 0.6, pos.y).sub(controls.target).multiplyScalar(Math.min(1, dt * 1.5));
    controls.target.add(follow);
    camera.position.add(follow);

    // the card changes height as the HUD fills in; re-centre twice a second
    sinceCentre += dt;
    if (sinceCentre > 0.5) {
      sinceCentre = 0;
      centreInFreeArea();
    }

    field.update(dt);
    refreshGuidance();
    emitter.emit(hud);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();
  tester.start();

  const end = () => {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    tester.stop();
    window.removeEventListener("resize", onResize);
    resizeObserver?.disconnect();
    field.dispose();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    opts.onEnd();
  };

  return { end };
}
