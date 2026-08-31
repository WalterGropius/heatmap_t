import * as THREE from "three";
import { ColumnField } from "./columns";
import { SpeedTester, type SpeedSample } from "./speedtest";
import { PositionTrail, type HudState } from "./hud";

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

  const field = new ColumnField();
  scene.add(field.group);

  const trail = new PositionTrail();
  const hud: HudState = {
    mbps: 0,
    latencyMs: 0,
    bestMbps: 0,
    cells: 0,
    samples: 0,
    tracking: false,
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
    opts.onHud({ ...hud });
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
        }
      }
    }
    if (tracking !== hud.tracking) {
      hud.tracking = tracking;
      opts.onHud({ ...hud });
    }

    // keep the trail alive even without a fresh XRFrame pose (fallback)
    if (!tracking) {
      camera.getWorldPosition(camPos);
      trail.push(performance.now(), camPos.x, camPos.z);
    }

    field.update(dt);
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
