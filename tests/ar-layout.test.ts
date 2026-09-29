/**
 * Callout layout checked against every labelled router part in the
 * WhiteModemFeatures fixtures, at the screen sizes the harness uses.
 * Ground-truth boxes stand in for detections, so this runs in milliseconds
 * and without the model: `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CALLOUT, coverView, intersectionArea, layoutCallout, mapBox, visibleRegion } from "../lib/ar-layout.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures/whitemodem");
const NAMES = ["lan", "modem", "off", "on", "onbutton", "orange", "pow", "powcab", "sim", "siminside", "simopen"];
/** Parts that get a callout in the tour, with their artwork's aspect ratio. */
const ART: Record<string, number> = {
  pow: 166 / 74,
  sim: 592 / 370,
  simopen: 270 / 144,
  siminside: 270 / 144,
  onbutton: 200 / 90,
  on: 220 / 140,
};

/** Stage size, camera frame (after the 4:3 camera is rotated to the screen) and chrome, as ArScreen measures them. */
const SCREENS = [
  { name: "phone", stage: { w: 390, h: 844 }, cam: { w: 480, h: 640 }, insets: { top: 72, right: 0, bottom: 226, left: 0 } },
  { name: "small phone", stage: { w: 360, h: 640 }, cam: { w: 480, h: 640 }, insets: { top: 72, right: 0, bottom: 240, left: 0 } },
  { name: "landscape", stage: { w: 844, h: 390 }, cam: { w: 640, h: 480 }, insets: { top: 64, right: 360, bottom: 0, left: 0 } },
  { name: "tablet", stage: { w: 820, h: 1180 }, cam: { w: 480, h: 640 }, insets: { top: 72, right: 0, bottom: 214, left: 0 } },
];
const OVERLAP = 24;

const labels = ["test", "valid"].flatMap((split) => {
  const dir = path.join(FIXTURES, split, "labels");
  return fs.readdirSync(dir).flatMap((file) =>
    fs
      .readFileSync(path.join(dir, file), "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        const [c, cx, cy, w, h] = l.trim().split(/\s+/).map(Number);
        return { file, cls: NAMES[c], cx, cy, w, h };
      })
      .filter((b) => b.cls in ART)
  );
});

test("fixtures contain parts for every callout", () => {
  for (const cls of Object.keys(ART)) assert.ok(labels.some((b) => b.cls === cls), `no ${cls} labels`);
});

for (const screen of SCREENS) {
  test(`callout stays visible and off its target — ${screen.name}`, () => {
    const frame = {
      w: screen.stage.w - (screen.insets.right ? screen.insets.right - OVERLAP : 0),
      h: screen.stage.h - (screen.insets.bottom ? screen.insets.bottom - OVERLAP : 0),
    };
    const view = coverView(screen.cam, frame);
    const vis = visibleRegion(screen.stage, screen.insets);
    let placed = 0;
    let docked = 0;
    for (const b of labels) {
      const box = [(b.cx - b.w / 2) * screen.cam.w, (b.cy - b.h / 2) * screen.cam.h, b.w * screen.cam.w, b.h * screen.cam.h] as const;
      const target = mapBox(box, view);
      const cx = target.x + target.w / 2;
      const cy = target.y + target.h / 2;
      // off-screen targets get an edge arrow instead of a callout
      if (cx < vis.x || cx > vis.x + vis.w || cy < vis.y || cy > vis.y + vis.h) continue;

      const { plate, side } = layoutCallout({ target, stage: screen.stage, insets: screen.insets, aspect: ART[b.cls] });
      const where = `${b.file} ${b.cls} → ${side} ${JSON.stringify(plate)}`;
      assert.ok(plate.x >= vis.x - 0.5 && plate.x + plate.w <= vis.x + vis.w + 0.5, `off-screen horizontally: ${where}`);
      assert.ok(plate.y >= vis.y - 0.5 && plate.y + plate.h <= vis.y + vis.h + 0.5, `off-screen vertically: ${where}`);
      const art = plate.h - 2 * CALLOUT.pad;
      assert.ok(art >= CALLOUT.minArt - 0.5 && art <= CALLOUT.maxArt + 0.5, `art height ${art} out of bounds: ${where}`);
      if (side === "dock") {
        docked++;
        continue;
      }
      placed++;
      assert.equal(intersectionArea(plate, target), 0, `covers its target: ${where}`);
    }
    assert.ok(placed > 0, "nothing was placed");
    console.log(`${screen.name}: ${placed} placed, ${docked} docked of ${labels.length} labelled parts`);
    // docking is the last resort for frame-filling parts, not the norm
    assert.ok(docked <= placed * 0.1, `${docked} docked vs ${placed} placed`);
  });
}
