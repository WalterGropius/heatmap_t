import * as THREE from "three";
import { ColumnField } from "./columns";
import { SpeedTester, type SpeedSample } from "./speedtest";
import { HudEmitter, PositionTrail, EMPTY_HUD, type HudState } from "./hud";

export interface ARHandle {
  end: () => void;
}

/**
 * Runs the immersive-ar session: world tracking via the `local-floor`
 * reference space (y = 0 is the real floor, origin where the session began),
 * continuous speed testing, and a growing field of heatmap columns anchored
 * to the room.
 */
export async function startAR(opts: {
  overlay: HTMLElement;
  onHud: (h: HudState) => void;
  onEnd: () => void;
}): Promise<ARHandle> {
  const xr = navigator.xr;
  if (!xr) throw new Error("WebXR is not available in this browser.");

  const session = await xr.requestSession("immersive-ar", {
    requiredFeatures: ["local-floor"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: opts.overlay },
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 4, 1);
  scene.add(dir);

  // faint white 1 m grid on the real floor, aligned with the heatmap cells —
  // the tinted tiles carry the map, the grid only hints at the squares
  const grid = new THREE.GridHelper(30, 30, 0xffffff, 0xffffff);
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.2;
  gridMat.depthWrite = false;
  scene.add(grid);

  const field = new ColumnField();
  scene.add(field.group);

  const trail = new PositionTrail();
  const hud: HudState = { ...EMPTY_HUD };
  const emitter = new HudEmitter(opts.onHud);

  /** Recompute the "where you are standing" readouts from the latest pose. */
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
    if (mid) {
      field.addSample(mid.x, mid.z, s.mbps);
    }
    hud.mbps = s.mbps;
    hud.latencyMs = s.latencyMs;
    hud.bestMbps = field.sessionBestMbps;
    hud.cells = field.cellCount;
    hud.samples += 1;
    refreshGuidance();
    emitter.emit(hud, true);
  });

  const clock = new THREE.Clock();
  const camPos = new THREE.Vector3();

  renderer.setAnimationLoop((_time: number, frame?: XRFrame) => {
    const dt = clock.getDelta();

    let tracking = false;
    if (frame) {
      const ref = renderer.xr.getReferenceSpace();
      if (ref) {
        const pose = frame.getViewerPose(ref);
        if (pose) {
          tracking = true;
          const p = pose.transform.position;
          trail.push(performance.now(), p.x, p.z);
          field.setViewer(p.x, p.z);
        }
      }
    }
    const trackingChanged = tracking !== hud.tracking;
    hud.tracking = tracking;

    // keep the trail alive even without a fresh XRFrame pose (fallback)
    if (!tracking) {
      camera.getWorldPosition(camPos);
      trail.push(performance.now(), camPos.x, camPos.z);
    }

    field.update(dt);
    refreshGuidance();
    emitter.emit(hud, trackingChanged);
    renderer.render(scene, camera);
  });

  const cleanup = () => {
    tester.stop();
    renderer.setAnimationLoop(null);
    field.dispose();
    renderer.dispose();
    opts.onEnd();
  };
  session.addEventListener("end", cleanup);

  await renderer.xr.setSession(session);
  tester.start();

  return {
    end: () => {
      void session.end().catch(() => cleanup());
    },
  };
}
