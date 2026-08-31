import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ColumnField, MAGENTA } from "./columns";
import { SpeedTester, type SpeedSample } from "./speedtest";
import { PositionTrail, type HudState } from "./hud";

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
}): SimHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(opts.container.clientWidth, opts.container.clientHeight);
  renderer.domElement.style.display = "block";
  opts.container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121212);
  scene.fog = new THREE.Fog(0x121212, 22, 42);

  const camera = new THREE.PerspectiveCamera(
    55,
    opts.container.clientWidth / opts.container.clientHeight,
    0.1,
    100
  );
  camera.position.set(10, 9, 12);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.8, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 4;
  controls.maxDistance = 32;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.3));
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(6, 10, 4);
  scene.add(dir);

  const grid = new THREE.GridHelper(16, 16, 0xffffff, 0xffffff);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
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

  // the wandering "phone"
  const walker = new THREE.Group();
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 24, 24),
    new THREE.MeshBasicMaterial({ color: MAGENTA })
  );
  orb.position.y = 1.5;
  const halo = new THREE.PointLight(MAGENTA, 3, 4);
  halo.position.y = 1.5;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8),
    new THREE.MeshBasicMaterial({ color: MAGENTA, transparent: true, opacity: 0.35 })
  );
  beam.position.y = 0.75;
  walker.add(orb, halo, beam);
  scene.add(walker);

  // synthetic coverage field in [0.25, 1]: smooth blobs across the room
  const coverage = (x: number, z: number) => {
    const a = Math.sin(x * 0.55 + 1.7) * Math.cos(z * 0.45 - 0.6);
    const b = Math.sin(x * 0.21 - 0.4 + z * 0.33);
    const t = 0.5 + 0.25 * a + 0.25 * b;
    return 0.25 + 0.75 * Math.min(1, Math.max(0, t));
  };

  const trail = new PositionTrail();
  const hud: HudState = {
    mbps: 0,
    latencyMs: 0,
    bestMbps: 0,
    cells: 0,
    samples: 0,
    tracking: true,
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
    opts.onHud({ ...hud });
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
  let raf = 0;
  let alive = true;

  const onResize = () => {
    const w = opts.container.clientWidth;
    const h = opts.container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", onResize);

  const tick = () => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);

    const toTarget = target.clone().sub(pos);
    if (toTarget.length() < 0.3) pickTarget();
    else pos.add(toTarget.normalize().multiplyScalar(WALK_SPEED * dt));

    walker.position.set(pos.x, 0, pos.y);
    trail.push(performance.now(), pos.x, pos.y);

    field.update(dt);
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
    field.dispose();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    opts.onEnd();
  };

  return { end };
}
