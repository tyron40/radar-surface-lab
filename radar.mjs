export const MAX_SIDE = 768;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

export function validateScene(scene) {
  if (!scene || scene.schemaVersion !== 1 || scene.units !== 'dB') {
    throw new Error('Expected a version 1 radar scene in dB.');
  }
  const { width, height, before, after, title, synthetic } = scene;
  if (![width, height].every(size => Number.isInteger(size) && size > 0 && size <= MAX_SIDE)) {
    throw new Error(`Scene dimensions must be between 1 and ${MAX_SIDE} pixels per side.`);
  }
  if (typeof title !== 'string' || !title.trim() || title.length > 160 || typeof synthetic !== 'boolean') {
    throw new Error('A scene needs a title of up to 160 characters and a synthetic flag.');
  }
  for (const grid of [before, after]) {
    if (!Array.isArray(grid) || grid.length !== width * height ||
        !grid.every(value => value === null || (Number.isFinite(value) && Math.abs(value) <= 1000))) {
      throw new Error('Each grid must contain one finite dB value or null per pixel.');
    }
  }
  return scene;
}

export function analyze(scene, minimumDrop, darkCutoff) {
  const mask = new Uint8Array(scene.before.length);
  let comparable = 0;
  let candidates = 0;
  for (let index = 0; index < mask.length; index++) {
    const before = scene.before[index];
    const after = scene.after[index];
    if (before === null || after === null) continue;
    comparable++;
    mask[index] = 1;
    if (before > darkCutoff && after <= darkCutoff && before - after >= minimumDrop) {
      mask[index] = 2;
      candidates++;
    }
  }
  return { mask, comparable, candidates, share: comparable ? candidates / comparable : null };
}

export function sampleScene() {
  const width = 256;
  const height = 160;
  const before = [];
  const after = [];
  for (let y = 0; y < height; y++) {
    const river = 100 + 27 * Math.sin(y / 28) + 13 * Math.sin(y / 15);
    for (let x = 0; x < width; x++) {
      const noise = (((x * 761 + y * 433 + x * y * 19) % 251) / 250 - .5) * 5;
      const land = -11 + 2.6 * Math.sin(x / 8 + y / 21) * Math.cos(y / 8) + noise;
      const distance = Math.abs(x - river);
      const water = -23 + noise;
      const baseline = distance < 6 ? water : land;
      const flooded = distance < 13 + 7 * Math.sin(y / 35) || Math.hypot((x - 148) / 1.6, y - 102) < 13;
      before.push(baseline);
      after.push(flooded ? water : baseline + .8 * Math.sin((x + y) / 8));
    }
  }
  return { schemaVersion: 1, units: 'dB', width, height, title: 'River plain training scene', synthetic: true, before, after };
}
