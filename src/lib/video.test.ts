import { test } from "node:test";
import assert from "node:assert/strict";
import { videoTarget } from "./video.ts";

test("vídeo: 4K desce para 1080p a 6 Mbps; vertical mantém a orientação", () => {
  assert.deepEqual(videoTarget(3840, 2160), { width: 1920, height: 1080, bitrate: 6_000_000, resize: true });
  assert.deepEqual(videoTarget(2160, 3840), { width: 1080, height: 1920, bitrate: 6_000_000, resize: true });
  assert.deepEqual(videoTarget(1920, 1080), { width: 1920, height: 1080, bitrate: 6_000_000, resize: false });
});

test("vídeo: resolução menor não aumenta e bitrate é proporcional (mínimo 1,5 Mbps)", () => {
  const t = videoTarget(1280, 720);
  assert.equal(t.resize, false); assert.equal(t.width, 1280);
  assert.equal(t.bitrate, Math.round(6_000_000 * (1280 * 720) / (1920 * 1080)));
  assert.equal(videoTarget(640, 360).bitrate, 1_500_000);
});
